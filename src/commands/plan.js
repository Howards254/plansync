const path = require('path');
const fs = require('fs');
const readline = require('readline');
const config = require('../lib/config');
const llm = require('../lib/llm');
const { validate } = require('../lib/planSchema');

function rl() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const i = rl();
    i.question(question, (answer) => {
      i.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function displayPlan(currentPlan) {
  console.log('\n========================================');
  console.log('  %s', currentPlan.title);
  console.log('========================================');
  console.log('  %s\n', currentPlan.description);
  console.log('  Tasks:');
  for (const task of currentPlan.tasks) {
    console.log('    %s - %s', task.id, task.title);
    if (task.dependencies.length > 0) {
      console.log('        Depends on: %s', task.dependencies.join(', '));
    }
    console.log('        Scope: %s', task.scope.join(', '));
    console.log('        Acceptance:');
    for (const ac of task.acceptanceCriteria) {
      console.log('          - %s', ac);
    }
    console.log();
  }
}

async function plan(description) {
  const root = config.findRoot();

  try {
    llm.getApiKey();
  } catch (err) {
    console.error(err.message);
    console.error('Set it with: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  let currentPlan = null;
  let pendingFeedback = '';
  let mode = 'generate'; // 'generate' | 'revise' | 'display'

  while (true) {
    if (mode === 'generate') {
      console.log('\nGenerating plan from scratch...');
      try {
        currentPlan = await llm.generatePlan(description);
        currentPlan = validate(currentPlan);
        mode = 'display';
      } catch (err) {
        console.error('Failed to generate plan: %s', err.message);
        const retry = await ask('Retry? (y/n): ');
        if (retry !== 'y') process.exit(1);
        continue;
      }
    }

    if (mode === 'revise' && pendingFeedback) {
      console.log('\nRevising plan based on feedback...');
      try {
        currentPlan = await llm.revisePlan(description, currentPlan, pendingFeedback);
        currentPlan = validate(currentPlan);
        pendingFeedback = '';
        mode = 'display';
      } catch (err) {
        console.error('Revision failed: %s', err.message);
        const retry = await ask('Try again? (y/n): ');
        if (retry !== 'y') process.exit(1);
        continue;
      }
    }

    // Display the plan
    displayPlan(currentPlan);

    // Ask for action
    const answer = await ask(
      '\nWhat would you like to do?\n' +
      '  [a] Approve and save this plan\n' +
      '  [e] Edit — provide feedback for revision\n' +
      '  [r] Regenerate from scratch\n' +
      '  [c] Cancel\n' +
      'Choice: '
    );

    if (answer === 'a') {
      break;
    }

    if (answer === 'e') {
      pendingFeedback = await ask('Describe what you want changed: ');
      if (!pendingFeedback) {
        console.log('No feedback given.');
        continue;
      }
      mode = 'revise';
      continue;
    }

    if (answer === 'r') {
      mode = 'generate';
      continue;
    }

    if (answer === 'c') {
      console.log('Cancelled.');
      process.exit(0);
    }

    console.log('Invalid choice.');
  }

  // Save to .plansync/plan.json
  const planPath = path.join(root, '.plansync', 'plan.json');
  fs.writeFileSync(planPath, JSON.stringify(currentPlan, null, 2));
  console.log('\nPlan saved to .plansync/plan.json');
  console.log('Ready for `plansync delegate`.');
}

module.exports = plan;
