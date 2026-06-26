const path = require('path');
const fs = require('fs');
const config = require('../lib/config');
const { applyScope, clearScope, getCurrentUsername } = require('../lib/permissions');
const { validate } = require('../lib/planSchema');

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
    console.error('No plan found at %s. Run `plansync plan` first.', planPath);
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

  // Validate username against the plan
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

  console.log('\nApplying scope permissions for %s...', username);
  try {
    const result = applyScope(root, username, plan);
    console.log('\nSummary:');
    console.log('  Total files examined: %d', result.total);
    console.log('  Writable (in scope):  %d', result.writable);
    console.log('  Read-only (out of scope): %d', result.readonly);
    if (result.assignedGlobs.length > 0) {
      console.log('  Your scope globs:');
      for (const glob of result.assignedGlobs) {
        console.log('    - %s', glob);
      }
    } else {
      console.log('  No assigned tasks \u2014 all project files are read-only for you.');
    }
    console.log('\nPermissions synced.');
  } catch (err) {
    console.error('Failed to apply permissions: %s', err.message);
    process.exit(1);
  }
}

module.exports = sync;
