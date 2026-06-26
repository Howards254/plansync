const path = require('path');
const fs = require('fs');
const config = require('../lib/config');
const github = require('../lib/github');
const { validate } = require('../lib/planSchema');

function fmt(s, len) {
  const str = String(s == null ? '' : s);
  return str.length > len ? str.substring(0, len - 1) + '…' : str.padEnd(len);
}

async function status() {
  const root = config.findRoot();
  const cfg = config.read(root);

  const planPath = path.join(root, '.plansync', 'plan.json');
  if (!fs.existsSync(planPath)) {
    console.error('No plan found. Run `plansync plan` first.');
    process.exit(1);
  }

  let plan;
  try {
    plan = validate(JSON.parse(fs.readFileSync(planPath, 'utf-8')));
  } catch (err) {
    console.error('Invalid plan: %s', err.message);
    process.exit(1);
  }

  console.log('\n%s', plan.title);
  console.log('%s\n', plan.description);

  // Fetch live issue states from GitHub
  const liveStates = {};
  if (cfg.githubToken) {
    try {
      const octokit = github.createOctokit(cfg.githubToken);
      const { data: issues } = await octokit.issues.listForRepo({
        owner: cfg.owner,
        repo: cfg.repo,
        labels: 'plansync-task',
        state: 'all',
        per_page: 100,
      });

      for (const issue of issues) {
        const match = issue.title.match(/^\[(T\d+)\]/);
        if (match) {
          liveStates[match[1]] = {
            number: issue.number,
            state: issue.state,
            updated: issue.updated_at,
            url: issue.html_url,
          };
        }
      }
    } catch (err) {
      console.log('(Could not fetch live issue states: %s)', err.message);
    }
  }

  // Print header
  console.log('Task      Status      Assignee      Scope');
  console.log('───      ──────      ────────      ─────');
  console.log();

  for (const task of plan.tasks) {
    const live = liveStates[task.id];
    const issueState = live ? (live.state === 'open' ? 'open' : 'closed') : '—';
    const statusStr = task.status === 'done' ? '✅ done' :
      task.status === 'in_progress' ? '▶ in_prog' :
      task.status === 'blocked' ? '⛔ blocked' :
      '◻ ready';

    const assignee = task.assignedTo || '—';
    const scopeStr = task.scope.join(', ');

    console.log('  %s  %s  %s  %s',
      fmt(task.id, 8),
      fmt(statusStr, 12),
      fmt(assignee, 14),
      scopeStr
    );

    if (live) {
      console.log('       └ Issue #%d (%s) — %s', live.number, live.state, live.url);
    }

    // Show blocking info
    if (task.status === 'blocked' && task.dependencies.length > 0) {
      const blockers = task.dependencies.filter(depId => {
        const depTask = plan.tasks.find(t => t.id === depId);
        return depTask && depTask.status !== 'done';
      });
      if (blockers.length > 0) {
        console.log('       └ Blocked by: %s', blockers.join(', '));
      }
    }

    console.log();
  }

  // Summary
  const total = plan.tasks.length;
  const done = plan.tasks.filter(t => t.status === 'done').length;
  const inProgress = plan.tasks.filter(t => t.status === 'in_progress').length;
  const blocked = plan.tasks.filter(t => t.status === 'blocked').length;
  const ready = plan.tasks.filter(t => t.status === 'ready').length;

  console.log('Summary: %d/%d done | %d in progress | %d blocked | %d ready',
    done, total, inProgress, blocked, ready);
}

module.exports = status;
