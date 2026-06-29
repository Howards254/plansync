const path = require('path');
const fs = require('fs');
const readline = require('readline');
const config = require('../lib/config');
const github = require('../lib/github');

const CONTEXT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  'GEMINI.md',
  '.continue/rules/00-plansync.md',
];

const WORKFLOW_FILES = [
  'publish.yml',
  'scope-check.yml',
  'silence-detection.yml',
];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function removePlansyncBlocks(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  const startMarker = '<!-- plansync -->';
  const endMarker = '<!-- end-plansync -->';
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return false;
  const cleaned = content.slice(0, startIdx) + content.slice(endIdx + endMarker.length);
  fs.writeFileSync(filePath, cleaned.trimEnd() + '\n');
  return true;
}

async function clean() {
  const root = config.findRoot();

  const answer = await ask(
    'This will remove all PlanSync files and markers from this project.\n' +
    'Continue? (y/n): '
  );
  if (answer !== 'y') {
    console.log('Cancelled.');
    return;
  }

  let removed = 0;

  // Remove context file blocks
  for (const file of CONTEXT_FILES) {
    const filePath = path.join(root, file);
    if (removePlansyncBlocks(filePath)) {
      console.log('  Removed PlanSync block from %s', file);
      removed++;
    }
  }

  // Remove .plansync directory
  const plansyncDir = path.join(root, '.plansync');
  if (fs.existsSync(plansyncDir)) {
    fs.rmSync(plansyncDir, { recursive: true, force: true });
    console.log('  Removed .plansync/ directory');
    removed++;
  }

  // Remove workflow files
  const workflowsDir = path.join(root, '.github', 'workflows');
  if (fs.existsSync(workflowsDir)) {
    for (const file of WORKFLOW_FILES) {
      const filePath = path.join(workflowsDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('  Removed .github/workflows/%s', file);
        removed++;
      }
    }
  }

  // Remove post-merge hook
  const hookPath = path.join(root, '.git', 'hooks', 'post-merge');
  if (fs.existsSync(hookPath)) {
    const content = fs.readFileSync(hookPath, 'utf-8');
    if (content.includes('plansync sync')) {
      fs.unlinkSync(hookPath);
      console.log('  Removed post-merge git hook');
      removed++;
    }
  }

  // Remove .plansync/config.json from .gitignore
  const gitignorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = gitignore.split('\n').filter(l => l.trim() !== '.plansync/config.json');
    if (lines.length !== gitignore.split('\n').length) {
      fs.writeFileSync(gitignorePath, lines.join('\n'));
      console.log('  Removed .plansync/config.json from .gitignore');
      removed++;
    }
  }

  // Remove PROJECT_PLAN.md if it exists and contains plansync markers
  const planPath = path.join(root, 'PROJECT_PLAN.md');
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf-8');
    if (content.includes('Plansync')) {
      fs.unlinkSync(planPath);
      console.log('  Removed PROJECT_PLAN.md');
      removed++;
    }
  }

  if (removed > 0) {
    console.log('\nPlanSync files removed. You can run `plansync init` to start fresh.');
  } else {
    console.log('\nNo PlanSync files found. Nothing to clean.');
  }
}

module.exports = clean;
