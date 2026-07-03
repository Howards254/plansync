const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../lib/config');
const github = require('../lib/github');
const { validate } = require('../lib/planSchema');

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

function printAssignmentsSummary(plan, assignments) {
  console.log('\nTask assignments:');
  for (const task of plan.tasks) {
    const a = (assignments[task.id] || '(unassigned)').padEnd(22);
    console.log('  %s  →  %s  %s', task.id.padEnd(6), a, task.title);
  }
}

function printNumberedMenu(plan, collaborators, assignments) {
  console.log('\nTasks:');
  for (let i = 0; i < plan.tasks.length; i++) {
    const t = plan.tasks[i];
    const a = assignments[t.id] || '(unassigned)';
    console.log('  %d. %s  %s  (%s)', i + 1, t.id, t.title, a);
  }

  if (collaborators && collaborators.length > 0) {
    console.log('\nCollaborators:');
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < collaborators.length; i++) {
      console.log('  %s. %s', letters[i], collaborators[i].login);
    }
  }
}

function parseReassignment(input, plan, collaborators, assignments) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  if (input === 'all' && collaborators && collaborators.length === 1) {
    for (const task of plan.tasks) {
      assignments[task.id] = collaborators[0].login;
    }
    return true;
  }

  const singleMatch = input.match(/^(\d+)=([a-z])$/);
  if (singleMatch) {
    const taskIdx = parseInt(singleMatch[1]) - 1;
    const collabIdx = letters.indexOf(singleMatch[2]);
    if (taskIdx < 0 || taskIdx >= plan.tasks.length) { console.log('  Invalid task number: %d', singleMatch[1]); return false; }
    if (collabIdx < 0 || !collaborators || collabIdx >= collaborators.length) { console.log('  Invalid collaborator: %s', singleMatch[2]); return false; }
    assignments[plan.tasks[taskIdx].id] = collaborators[collabIdx].login;
    return true;
  }

  const bulkMatch = input.match(/^(\d+(?:,\d+)*)=([a-z])$/);
  if (bulkMatch) {
    const taskNums = bulkMatch[1].split(',').map(n => parseInt(n.trim()) - 1);
    const collabIdx = letters.indexOf(bulkMatch[2]);
    if (taskNums.some(n => n < 0 || n >= plan.tasks.length)) { console.log('  Invalid task number in list'); return false; }
    if (collabIdx < 0 || !collaborators || collabIdx >= collaborators.length) { console.log('  Invalid collaborator: %s', bulkMatch[2]); return false; }
    for (const n of taskNums) {
      assignments[plan.tasks[n].id] = collaborators[collabIdx].login;
    }
    return true;
  }

  const allMatch = input.match(/^all=([a-z])$/);
  if (allMatch) {
    const collabIdx = letters.indexOf(allMatch[1]);
    if (collabIdx < 0 || !collaborators || collabIdx >= collaborators.length) { console.log('  Invalid collaborator: %s', allMatch[1]); return false; }
    for (const task of plan.tasks) {
      assignments[task.id] = collaborators[collabIdx].login;
    }
    return true;
  }

  console.log('  Invalid input. Examples: "1=b", "1,3=b", "all=a", or Enter to approve.');
  return false;
}

async function getAssignments(plan, octokit, owner, repo, authUsername, autoMode) {
  console.log('\nFetching repo collaborators...');
  let collaborators;
  try {
    const { data } = await octokit.repos.listCollaborators({ owner, repo, affiliation: 'all' });
    collaborators = data.filter(c => c.permissions && c.permissions.push);
    if (collaborators.length > 0) {
      console.log('Collaborators with push access:');
      for (const c of collaborators) {
        console.log(`  ${c.login}${c.login === authUsername ? ' (you)' : ''}`);
      }
    }
  } catch (err) {
    console.log('  Could not fetch collaborator list — will assign all tasks to you.');
    collaborators = null;
  }

  // If plan tasks already have assignedTo set, use those
  const preAssigned = plan.tasks.length > 0 && plan.tasks.every(t => t.assignedTo);
  let assignments = {};

  if (preAssigned) {
    for (const task of plan.tasks) assignments[task.id] = task.assignedTo;
    printAssignmentsSummary(plan, assignments);
    const ok = await ask('\nUse these plan assignments? (Y/n): ');
    if (ok.toLowerCase() !== 'n') return assignments;
  }

  // Auto-distribute once
  if (collaborators && collaborators.length > 0) {
    let idx = 0;
    for (const task of plan.tasks) {
      assignments[task.id] = collaborators[idx % collaborators.length].login;
      idx++;
    }
  } else {
    for (const task of plan.tasks) assignments[task.id] = authUsername;
  }

  // In --auto mode, skip interactive reassignment but still show approval prompt
  if (autoMode) {
    printAssignmentsSummary(plan, assignments);
    const ok = await ask('\nApprove these assignments? (Y/n): ');
    if (ok.toLowerCase() !== 'n') return assignments;
    // If not approved, fall through to full interactive menu
  }

  // Interactive numbered menu
  while (true) {
    printNumberedMenu(plan, collaborators, assignments);
    const input = await ask('\nReassign (e.g. "1=b" or "1,3=b" or "all=a"), or Enter to approve: ');
    if (!input) return assignments;

    if (parseReassignment(input, plan, collaborators, assignments)) {
      console.log('  Updated.');
    }
  }
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
      // If assignee is invalid (not a collaborator), retry without assignee
      if (err.status === 422 && assignee) {
        console.log('  Could not assign @%s (not a collaborator). Creating issue without assignee...', assignee);
        try {
          const { data: issue } = await octokit.issues.create({
            owner,
            repo,
            title: `[${task.id}] ${task.title}`,
            body: bodyParts.join('\n\n'),
            labels: ['plansync-task'],
          });
          issues[task.id] = issue.number;
          console.log('  Created issue #%d for %s (unassigned)', issue.number, task.id);

          // Add comment noting the intended assignee
          if (assignee) {
            await octokit.issues.createComment({
              owner,
              repo,
              issue_number: issue.number,
              body: `Intended assignee: @${assignee} (not a collaborator at creation time). Please invite them or reassign.`,
            });
          }

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
        } catch (retryErr) {
          console.error('  Failed to create issue for %s: %s', task.id, retryErr.message);
        }
      } else {
        console.error('  Failed to create issue for %s: %s', task.id, err.message);
      }
    }
  }

  return issues;
}

async function createProjectBoard(plan, assignments, issues, octokit, owner, repo) {
  console.log('\nCreating GitHub Project board...');

  try {
    const projectName = `${plan.title} — PlanSync`;

    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const ownerNodeId = repoData.owner.node_id;

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
        ownerId: ownerNodeId,
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

      try {
        const { data: issueData } = await octokit.issues.get({ owner, repo, issue_number: issueNumber });

        await octokit.graphql(addItemMutation, {
          input: {
            projectId,
            contentId: issueData.node_id,
          },
        });
        console.log('  Added issue #%d to project board', issueNumber);
      } catch (err) {
        console.log('  Could not add issue #%d to project: %s', issueNumber, err.message);
      }
    }

    return projectNumber;
  } catch (err) {
    console.log('  Project board creation skipped: %s', err.message);
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
    console.log('  Wrote %s', manifestPath.replace(root, ''));
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

function writePlanAssignments(root, plan, assignments) {
  // Write the final assignments back to plan.json so sync can read them
  const planPath = path.join(root, '.plansync', 'plan.json');
  for (const task of plan.tasks) {
    task.assignedTo = assignments[task.id] || '';
  }
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  console.log('  Updated .plansync/plan.json with task assignments');
}

function commitAndPush(root, message, usePr) {
  console.log('\nCommitting changes...');

  try {
    execSync('git add -A', { cwd: root, stdio: 'pipe' });
    execSync('git rm --cached --ignore-unmatch .plansync/config.json 2>/dev/null || true', { cwd: root, stdio: 'pipe' });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'pipe' });
    console.log('  Committed.');

    if (usePr) {
      const branch = `plansync/delegate-${Date.now()}`;
      execSync(`git checkout -b ${branch}`, { cwd: root, stdio: 'pipe' });
      execSync(`git push origin ${branch}`, { cwd: root, stdio: 'pipe' });
      console.log('  Pushed branch: %s', branch);
    } else {
      execSync('git push origin HEAD', { cwd: root, stdio: 'pipe' });
      console.log('  Pushed directly to remote.');
    }
  } catch (err) {
    console.error('  Git operation failed: %s', err.message);
    console.error('  You may need to commit and push manually.');
  }
}

async function delegate(autoMode) {
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

  let authUsername;
  try {
    authUsername = await github.verifyPAT(cfg.githubToken);
  } catch {
    authUsername = owner;
  }

  // Get assignments
  const assignments = await getAssignments(plan, octokit, owner, repo, authUsername, autoMode);

  // Create GitHub Issues
  console.log('\nCreating GitHub Issues...');
  const issues = await createIssues(plan, assignments, octokit, owner, repo);

  // Create Project board
  await createProjectBoard(plan, assignments, issues, octokit, owner, repo);

  // Write scope manifests
  console.log('\nWriting scope manifests...');
  writeScopeManifests(root, plan, assignments);

  // Write PROJECT_PLAN.md
  console.log('\nWriting PROJECT_PLAN.md...');
  writeProjectPlan(root, plan, assignments, issues);

  // Write assignments back to plan.json
  console.log('\nUpdating plan.json with assignments...');
  writePlanAssignments(root, plan, assignments);

  // Commit and push
  commitAndPush(root, `plansync: delegate plan — ${plan.title}`, false);

  console.log('\nDone! Plan delegated to %s/%s.', owner, repo);
  console.log('Collaborators: run `plansync sync --user <username>` to generate context files and apply scope permissions.');
}

module.exports = delegate;
