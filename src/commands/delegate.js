const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../lib/config');
const github = require('../lib/github');
const { validate } = require('../lib/planSchema');
const { clearScope } = require('../lib/permissions');

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

  const preAssigned = plan.tasks.length > 0 && plan.tasks.every(t => t.assignedTo);
  let assignments = {};

  if (preAssigned) {
    for (const task of plan.tasks) assignments[task.id] = task.assignedTo;
    printAssignmentsSummary(plan, assignments);
    const ok = await ask('\nUse these plan assignments? (Y/n): ');
    if (ok.toLowerCase() !== 'n') return assignments;
  }

  if (collaborators && collaborators.length > 0) {
    let idx = 0;
    for (const task of plan.tasks) {
      assignments[task.id] = collaborators[idx % collaborators.length].login;
      idx++;
    }
  } else {
    for (const task of plan.tasks) assignments[task.id] = authUsername;
  }

  if (autoMode) {
    printAssignmentsSummary(plan, assignments);
    const ok = await ask('\nApprove these assignments? (Y/n): ');
    if (ok.toLowerCase() !== 'n') return assignments;
  }

  while (true) {
    printNumberedMenu(plan, collaborators, assignments);
    const input = await ask('\nReassign (e.g. "1=b" or "1,3=b" or "all=a"), or Enter to approve: ');
    if (!input) return assignments;

    if (parseReassignment(input, plan, collaborators, assignments)) {
      console.log('  Updated.');
    }
  }
}

async function fetchExistingIssues(octokit, owner, repo) {
  const existing = {};
  try {
    let page = 1;
    while (true) {
      const { data } = await octokit.issues.listForRepo({
        owner,
        repo,
        labels: 'plansync-task',
        state: 'all',
        per_page: 100,
        page,
      });
      if (data.length === 0) break;
      for (const issue of data) {
        const match = issue.title.match(/^\[(T\d+)\]/);
        if (match) {
          existing[match[1]] = { number: issue.number, state: issue.state, assignee: issue.assignee?.login };
        }
      }
      if (data.length < 100) break;
      page++;
    }
  } catch {
  }
  return existing;
}

function buildIssueBody(task) {
  const bodyParts = [
    `## Description\n${task.description}`,
    `## Scope\n${task.scope.map(s => `- \`${s}\``).join('\n')}`,
    `## Acceptance Criteria\n${task.acceptanceCriteria.map(a => `- [ ] ${a}`).join('\n')}`,
  ];
  if (task.dependencies.length > 0) {
    bodyParts.push(`## Dependencies\nDepends on: ${task.dependencies.join(', ')}`);
  }
  return bodyParts.join('\n\n');
}

async function createOrUpdateIssues(plan, assignments, octokit, owner, repo) {
  const issues = {};
  console.log('  Fetching existing issues...');
  const existingIssues = await fetchExistingIssues(octokit, owner, repo);

  for (const task of plan.tasks) {
    const body = buildIssueBody(task);
    const assignee = assignments[task.id] || undefined;

    if (existingIssues[task.id]) {
      const existing = existingIssues[task.id];
      try {
        await octokit.issues.update({
          owner,
          repo,
          issue_number: existing.number,
          body,
          assignee: assignee || undefined,
        });
        if (existing.state === 'closed') {
          await octokit.issues.update({
            owner,
            repo,
            issue_number: existing.number,
            state: 'open',
          });
        }
        issues[task.id] = existing.number;
        console.log('  Updated issue #%d for %s', existing.number, task.id);
      } catch (err) {
        console.error('  Failed to update issue for %s: %s', task.id, err.message);
      }
    } else {
      try {
        const { data: issue } = await octokit.issues.create({
          owner,
          repo,
          title: `[${task.id}] ${task.title}`,
          body,
          assignee: assignee || undefined,
          labels: ['plansync-task'],
        });
        issues[task.id] = issue.number;
        console.log('  Created issue #%d for %s', issue.number, task.id);

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
        if (err.status === 422 && assignee) {
          console.log('  Could not assign @%s (not a collaborator). Creating issue without assignee...', assignee);
          try {
            const { data: issue } = await octokit.issues.create({
              owner,
              repo,
              title: `[${task.id}] ${task.title}`,
              body,
              labels: ['plansync-task'],
            });
            issues[task.id] = issue.number;
            console.log('  Created issue #%d for %s (unassigned)', issue.number, task.id);

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
  }

  // Close issues for tasks removed from the plan
  for (const [taskId, existing] of Object.entries(existingIssues)) {
    if (!plan.tasks.find(t => t.id === taskId) && existing.state === 'open') {
      try {
        await octokit.issues.update({
          owner,
          repo,
          issue_number: existing.number,
          state: 'closed',
        });
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: existing.number,
          body: 'Task removed from plan during re-delegate.',
        });
        console.log('  Closed issue #%d for removed task %s', existing.number, taskId);
      } catch (err) {
        console.error('  Failed to close removed issue #%d: %s', existing.number, err.message);
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
    console.log('  Wrote %s', path.relative(root, manifestPath));
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
    try {
      execSync('git rm --cached --ignore-unmatch .plansync/config.json', { cwd: root, stdio: 'pipe' });
    } catch {
    }
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

  // Fix D: Owner-only guard — check if user is admin
  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    if (!repoData.permissions || !repoData.permissions.admin) {
      console.error('\nOnly the repository admin can delegate plans.');
      console.error('Current user: %s — ask the repo owner to run delegate.', authUsername);
      process.exit(1);
    }
  } catch (err) {
    console.log('  Could not verify admin status — proceeding anyway.');
  }

  // Get assignments
  const assignments = await getAssignments(plan, octokit, owner, repo, authUsername, autoMode);

  // Create or update GitHub Issues (always deduplicates — no more duplicate issues)
  console.log('\nSyncing plan to GitHub Issues...');
  const issues = await createOrUpdateIssues(plan, assignments, octokit, owner, repo);

  // Create Project board
  await createProjectBoard(plan, assignments, issues, octokit, owner, repo);

  // Fix B: Write assignments to plan.json FIRST (before any file writes)
  console.log('\nSaving assignments to plan.json...');
  try {
    writePlanAssignments(root, plan, assignments);
  } catch (err) {
    console.error('  WARNING: Could not save assignments: %s', err.message);
  }

  // Fix A: Reset read-only files before writing
  console.log('\nResetting file permissions...');
  try {
    const result = clearScope(root);
    console.log('  Reset %d files to writable.', result.reset);
  } catch (err) {
    console.log('  Could not reset permissions: %s', err.message);
  }

  // Fix C: Wrap each file write in try/catch
  console.log('\nWriting scope manifests...');
  try {
    writeScopeManifests(root, plan, assignments);
  } catch (err) {
    console.error('  Warning: could not write scope manifests: %s', err.message);
  }

  console.log('\nWriting PROJECT_PLAN.md...');
  try {
    writeProjectPlan(root, plan, assignments, issues);
  } catch (err) {
    console.error('  Warning: could not write PROJECT_PLAN.md: %s', err.message);
    console.error('  Run "plansync sync --reset" to restore file permissions and try again.');
  }

  // Commit and push
  commitAndPush(root, `plansync: delegate plan — ${plan.title}`, false);

  console.log('\nDone! Plan delegated to %s/%s.', owner, repo);
  console.log('Collaborators: run `plansync sync --user <username>` to generate context files and apply scope permissions.');
}

module.exports = delegate;
