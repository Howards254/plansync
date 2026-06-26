const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../lib/config');
const github = require('../lib/github');
const { validate } = require('../lib/planSchema');
const { writeAll } = require('../lib/contextFiles');
const llm = require('../lib/llm');

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(question) {
  return new Promise((resolve) => {
    const i = rl();
    i.question(question, (answer) => {
      i.close();
      resolve(answer.trim());
    });
  });
}

function displayPlan(plan) {
  console.log('\nProject: %s', plan.title);
  console.log('Tasks:');
  for (const t of plan.tasks) {
    console.log('  %s - %s [%s]', t.id, t.title, t.status);
    if (t.dependencies.length) console.log('      depends on: %s', t.dependencies.join(', '));
    console.log('      scope: %s', t.scope.join(', '));
  }
}

async function getAssignments(plan, octokit, owner, repo) {
  console.log('\nFetching repo collaborators...');
  let collaborators;
  try {
    const { data } = await octokit.repos.listCollaborators({ owner, repo, affiliation: 'all' });
    collaborators = data.filter(c => c.permissions && c.permissions.push);
  } catch (err) {
    console.error('Failed to fetch collaborators:', err.message);
    console.log('Continuing without collaborator list — you can type GitHub usernames manually.');
    collaborators = [];
  }

  if (collaborators.length > 0) {
    console.log('Collaborators with push access:');
    for (const c of collaborators) {
      console.log('  %s', c.login);
    }
  }

  console.log('\nTask assignments:');
  const assignments = {};

  for (const task of plan.tasks) {
    const answer = await ask(`Assign ${task.id} (${task.title}) to which GitHub user? [type username or 'auto']: `);
    if (answer.toLowerCase() === 'auto' && collaborators.length > 0) {
      const existing = Object.values(assignments);
      const unassigned = collaborators.find(c => !existing.includes(c.login));
      assignments[task.id] = unassigned ? unassigned.login : collaborators[0].login;
      console.log('  → %s auto-assigned to %s', task.id, assignments[task.id]);
    } else if (answer.trim()) {
      assignments[task.id] = answer.trim();
      console.log('  → %s assigned to %s', task.id, answer.trim());
    } else {
      assignments[task.id] = '';
      console.log('  → %s left unassigned', task.id);
    }
  }

  return assignments;
}

async function createIssues(plan, assignments, octokit, owner, repo) {
  const issues = {};
  const taskIds = plan.tasks.map(t => t.id);

  for (const task of plan.tasks) {
    const bodyParts = [
      `## Description\n${task.description}`,
      `## Scope\n${task.scope.map(s => `- \`${s}\``).join('\n')}`,
      `## Acceptance Criteria\n${task.acceptanceCriteria.map(a => `- [ ] ${a}`).join('\n')}`,
    ];

    if (task.dependencies.length > 0) {
      bodyParts.push(`## Dependencies\nDepends on: ${task.dependencies.join(', ')}`);
    }

    const assignee = assignments[task.id] || undefined;

    try {
      const { data: issue } = await octokit.issues.create({
        owner,
        repo,
        title: `[${task.id}] ${task.title}`,
        body: bodyParts.join('\n\n'),
        assignee: assignee || undefined,
        labels: ['plansync-task'],
      });
      issues[task.id] = issue.number;
      console.log('  Created issue #%d for %s', issue.number, task.id);

      // Link dependencies in issue body
      for (const dep of task.dependencies) {
        if (issues[dep]) {
          await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issue.number,
            body: `Depends on: #${issues[dep]}`,
          });
        }
      }
    } catch (err) {
      console.error('  Failed to create issue for %s: %s', task.id, err.message);
    }
  }

  return issues;
}

async function createProjectBoard(plan, assignments, issues, octokit, owner, repo) {
  console.log('\nCreating GitHub Project board...');

  try {
    // GraphQL mutation to create a project
    const projectName = `${plan.title} — PlanSync`;

    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const repoNodeId = repoData.node_id;

    const createMutation = `
      mutation($input: CreateProjectV2Input!) {
        createProjectV2(input: $input) {
          projectV2 {
            id
            number
            title
          }
        }
      }
    `;

    const createResult = await octokit.graphql(createMutation, {
      input: {
        ownerId: repoNodeId,
        title: projectName,
      },
    });

    const projectId = createResult.createProjectV2.projectV2.id;
    const projectNumber = createResult.createProjectV2.projectV2.number;
    console.log('  Created project #%d: %s', projectNumber, projectName);

    // Add items (issues) to the project
    for (const [taskId, issueNumber] of Object.entries(issues)) {
      const addItemMutation = `
        mutation($input: AddProjectV2ItemByIdInput!) {
          addProjectV2ItemById(input: $input) {
            item {
              id
            }
          }
        }
      `;

      const { data: issueData } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });
      const contentId = issueData.node_id;

      try {
        await octokit.graphql(addItemMutation, {
          input: {
            projectId,
            contentId,
          },
        });
        console.log('  Added issue #%d to project board', issueNumber);
      } catch (err) {
        console.log('  Could not add issue #%d to project (may need project write scope): %s', issueNumber, err.message);
      }
    }

    return projectNumber;
  } catch (err) {
    console.log('  Project board creation skipped (requires GraphQL project write scope): %s', err.message);
    return null;
  }
}

function writeScopeManifests(root, plan, assignments) {
  const scopesDir = path.join(root, '.plansync', 'scopes');
  if (!fs.existsSync(scopesDir)) {
    fs.mkdirSync(scopesDir, { recursive: true });
  }

  for (const task of plan.tasks) {
    const manifest = {
      taskId: task.id,
      title: task.title,
      assignedTo: assignments[task.id] || null,
      scope: task.scope,
      dependencies: task.dependencies,
      acceptanceCriteria: task.acceptanceCriteria,
      status: task.status,
    };

    const manifestPath = path.join(scopesDir, `${task.id}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('  Wrote %s', manifest.relative || manifestPath);
  }
}

function writeProjectPlan(root, plan, assignments, issues) {
  const lines = [];
  lines.push(`# ${plan.title}`);
  lines.push('');
  lines.push(plan.description);
  lines.push('');
  lines.push('## PlanSync Managed Plan');
  lines.push('');
  lines.push('| Task | Title | Assignee | Status | Issue |');
  lines.push('|------|-------|----------|--------|-------|');

  for (const task of plan.tasks) {
    const assignee = assignments[task.id] || '—';
    const issueLink = issues[task.id] ? `#${issues[task.id]}` : '—';
    lines.push(`| ${task.id} | ${task.title} | ${assignee} | ${task.status} | ${issueLink} |`);
  }

  lines.push('');
  lines.push('## Task Details');
  lines.push('');

  for (const task of plan.tasks) {
    lines.push(`### ${task.id}: ${task.title}`);
    lines.push('');
    lines.push(task.description);
    lines.push('');
    lines.push('**Scope:** ' + task.scope.join(', '));
    lines.push('');
    lines.push('**Acceptance Criteria:**');
    for (const ac of task.acceptanceCriteria) {
      lines.push(`- [ ] ${ac}`);
    }
    if (task.dependencies.length > 0) {
      lines.push('');
      lines.push('**Dependencies:** ' + task.dependencies.join(', '));
    }
    lines.push('');
  }

  const planPath = path.join(root, 'PROJECT_PLAN.md');
  fs.writeFileSync(planPath, lines.join('\n'));
  console.log('  Wrote PROJECT_PLAN.md');
}

function commitAndPush(root, message, usePr) {
  console.log('\nCommitting changes...');

  try {
    execSync('git add -A', { cwd: root, stdio: 'pipe' });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'pipe' });
    console.log('  Committed.');

    if (usePr) {
      const branch = `plansync/delegate-${Date.now()}`;
      execSync(`git checkout -b ${branch}`, { cwd: root, stdio: 'pipe' });
      execSync(`git push origin ${branch}`, { cwd: root, stdio: 'pipe' });
      console.log('  Pushed branch: %s', branch);
      console.log('  Create a PR on GitHub: https://github.com/%s/%s/pull/new/%s',
        config.read(root).owner, config.read(root).repo, branch);
    } else {
      execSync('git push origin HEAD', { cwd: root, stdio: 'pipe' });
      console.log('  Pushed directly to remote.');
    }
  } catch (err) {
    console.error('  Git operation failed: %s', err.message);
    console.error('  You may need to commit and push manually.');
  }
}

async function delegate(description) {
  const root = config.findRoot();
  const cfg = config.read(root);

  if (!cfg.githubToken) {
    console.error('Not authenticated. Run `plansync init` first.');
    process.exit(1);
  }

  const planPath = path.join(root, '.plansync', 'plan.json');
  if (!fs.existsSync(planPath)) {
    console.error('No plan found at %s. Run `plansync plan` first.', planPath);
    process.exit(1);
  }

  const rawPlan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  const plan = validate(rawPlan);

  displayPlan(plan);

  const proceed = await ask('\nProceed with delegation? (y/n): ');
  if (proceed.toLowerCase() !== 'y') {
    console.log('Cancelled.');
    return;
  }

  const octokit = github.createOctokit(cfg.githubToken);
  const { owner, repo } = cfg;

  // Phase 3a: Assign tasks
  const assignments = await getAssignments(plan, octokit, owner, repo);

  // Phase 3b: Create GitHub Issues
  console.log('\nCreating GitHub Issues...');
  const issues = await createIssues(plan, assignments, octokit, owner, repo);

  // Phase 3c: Create Project board
  await createProjectBoard(plan, assignments, issues, octokit, owner, repo);

  // Phase 3d: Write scope manifests
  console.log('\nWriting scope manifests...');
  writeScopeManifests(root, plan, assignments);

  // Phase 3e: Write context files
  console.log('\nWriting context files...');
  for (const task of plan.tasks) {
    writeAll(root, plan, task);
    console.log('  Wrote context files for %s (%s)', task.id, task.title);
  }

  // Phase 3f: Write PROJECT_PLAN.md
  console.log('\nWriting PROJECT_PLAN.md...');
  writeProjectPlan(root, plan, assignments, issues);

  // Phase 3g: Commit and push
  const usePr = description && description.includes('--pr');
  commitAndPush(root, `plansync: delegate plan — ${plan.title}`, usePr);

  console.log('\nDone! Plan delegated to %s/%s.', owner, repo);
}

module.exports = delegate;
