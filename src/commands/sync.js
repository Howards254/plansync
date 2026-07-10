const path = require('path');
const fs = require('fs');
const config = require('../lib/config');
const github = require('../lib/github');
const { applyScope, clearScope, getCurrentUsername } = require('../lib/permissions');
const { validate } = require('../lib/planSchema');
const { generateForUser, generateAdminView } = require('../lib/contextFiles');

function listValidAssignees(plan) {
  const assignees = new Set(
    plan.tasks.filter(t => t.assignedTo).map(t => t.assignedTo)
  );
  return [...assignees];
}

function printAssignees(plan) {
  console.log('Assignees found in this plan:');
  for (const t of plan.tasks) {
    if (t.assignedTo) {
      console.log('  %s  \u2014 %s: %s', t.assignedTo, t.id, t.title);
    }
  }
}

async function sync() {
  const root = config.findRoot();
  const cfg = config.read(root);

  const planPath = path.join(root, '.plansync', 'plan.json');
  if (!fs.existsSync(planPath)) {
    console.error('No plan found at %s.', planPath);
    console.error('If you are a collaborator, ask the repo admin to run `plansync delegate` first.');
    console.error('If you are the admin, have your coding agent read AGENTS.md and write the plan.');
    process.exit(1);
  }

  let rawPlan;
  try {
    rawPlan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
  } catch (err) {
    console.error('Failed to read plan: %s', err.message);
    process.exit(1);
  }

  let plan;
  try {
    plan = validate(rawPlan);
  } catch (err) {
    console.error('Invalid plan: %s', err.message);
    process.exit(1);
  }

  // Handle --reset: clear all permissions, no username needed
  if (process.env.PLANSYNC_RESET) {
    console.log('Resetting all files to writable...');
    const result = clearScope(root);
    console.log('  Reset %d files to writable (0o644).', result.reset);
    return;
  }

  // Resolve username: --user flag > PLANSYNC_USER env > GitHub API (requires token)
  let username = process.env.PLANSYNC_USER || null;

  if (!username && cfg.githubToken) {
    try {
      username = await getCurrentUsername(cfg.githubToken);
      console.log('  Authenticated as: %s', username);
    } catch (err) {
      console.error('  Failed to get username from GitHub: %s', err.message);
    }
  }

  if (!username) {
    console.error('\nCould not determine your GitHub username.');
    console.error('To sync scope permissions, pass your GitHub username:');
    console.error('  plansync sync --user your_github_username');
    console.error('');
    printAssignees(plan);
    process.exit(1);
  }

  // Validate username against the plan (now assignments are written to plan.json by delegate)
  const validAssignees = listValidAssignees(plan);
  if (validAssignees.length > 0 && !validAssignees.includes(username)) {
    console.error('\n"%s" does not match any assigned task in the plan.', username);
    console.error('Valid assignees:');
    printAssignees(plan);
    console.error('');
    console.error('Run again with the correct username:');
    console.error('  plansync sync --user <username>');
    console.error('If you locked yourself out, reset permissions first:');
    console.error('  plansync sync --reset');
    process.exit(1);
  }

  // Detect if user is the repo admin
  const supervisorMode = process.env.PLANSYNC_SUPERVISOR === '1';
  let isAdmin = false;

  if (!supervisorMode && cfg.githubToken && cfg.owner && cfg.repo) {
    try {
      const octokit = github.createOctokit(cfg.githubToken);
      const { data: repoData } = await octokit.repos.get({ owner: cfg.owner, repo: cfg.repo });
      isAdmin = repoData.permissions && repoData.permissions.admin;
    } catch {
      // Can't check admin status — treat as collaborator
    }
  }

  // Apply scope permissions based on mode
  if (isAdmin) {
    console.log('\nAdmin detected — keeping all files writable for %s.', username);
    try {
      const result = clearScope(root);
      console.log('  Reset %d files to writable (0o644).', result.reset);
    } catch (err) {
      console.error('Failed to reset permissions: %s', err.message);
    }
  } else if (supervisorMode) {
    console.log('\nSupervisor mode: keeping all files writable for %s.', username);
    try {
      const result = clearScope(root);
      console.log('  Reset %d files to writable (0o644).', result.reset);
    } catch (err) {
      console.error('Failed to reset permissions: %s', err.message);
    }
  } else {
    console.log('\nApplying scope permissions for %s...', username);
    try {
      const result = applyScope(root, username, plan);
      console.log('\nPermission Summary:');
      console.log('  Total files examined: %d', result.total);
      console.log('  Writable (in scope):  %d', result.writable);
      console.log('  Read-only (out of scope): %d', result.readonly);
      console.log('\nPermissions synced.');
    } catch (err) {
      console.error('Failed to apply permissions: %s', err.message);
      process.exit(1);
    }
  }

  // Generate context files based on mode
  console.log('\nGenerating context files for %s...', username);

  if (isAdmin) {
    try {
      const adminFiles = generateAdminView(root, plan, username, cfg.owner, cfg.repo);
      const userTaskCount = plan.tasks.filter(t => t.assignedTo === username).length;
      console.log('  Wrote admin context to root AGENTS.md');
      console.log('  Includes: planning instructions, %d assigned task(s), and all-tasks overview table', userTaskCount);
      console.log('  Full context in .plansync/context/%s/', username);
    } catch (err) {
      console.error('  Failed to generate admin context: %s', err.message);
    }
  } else if (supervisorMode) {
    try {
      const contextFiles = generateForUser(root, plan, username, true);
      const userTaskCount = plan.tasks.filter(t => t.assignedTo === username).length;
      if (Object.keys(contextFiles).length > 0) {
        console.log('  Wrote %d context file(s) to .plansync/context/%s/ (root untouched)', Object.keys(contextFiles).length, username);
      } else {
        console.log('  No tasks assigned to %s — context files skipped.', username);
      }
    } catch (err) {
      console.error('  Failed to generate context files: %s', err.message);
    }
  } else {
    try {
      const contextFiles = generateForUser(root, plan, username);
      const userTaskCount = plan.tasks.filter(t => t.assignedTo === username).length;
      if (Object.keys(contextFiles).length > 0) {
        console.log('  Wrote %d context file(s) to .plansync/context/%s/', Object.keys(contextFiles).length, username);
        console.log('  Your agent will read these tasks from AGENTS.md at the project root.');
        for (const [filename] of Object.entries(contextFiles)) {
          console.log('    %s', filename);
        }
      } else {
        console.log('  No tasks assigned to %s — context files skipped.', username);
      }
    } catch (err) {
      console.error('  Failed to generate context files: %s', err.message);
    }
  }
}

module.exports = sync;
