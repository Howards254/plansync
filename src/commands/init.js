const path = require('path');
const fs = require('fs');
const readline = require('readline');
const config = require('../lib/config');
const github = require('../lib/github');
const { renderAdminContext, mergeOrWrite } = require('../lib/contextFiles');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function init() {
  const root = config.findRoot();

  if (!github.checkRemote(root)) {
    console.error('No git remote "origin" found. Push your repo to GitHub first.');
    process.exit(1);
  }

  const remote = github.getGitHubRemote(root);
  if (!remote) {
    console.error('Remote "origin" does not point to GitHub.');
    process.exit(1);
  }

  const cfg = config.read(root);
  let clientId = github.getClientId(cfg);
  if (!clientId) {
    console.log('PlanSync needs a GitHub OAuth App Client ID to authenticate with GitHub.');
    console.log('Create one at https://github.com/settings/developers (no callback URL needed).\n');
    clientId = await ask('Paste your GitHub OAuth App Client ID: ');
    if (!clientId) {
      console.error('No Client ID provided. Run `plansync init` again.');
      process.exit(1);
    }
  }

  console.log('Authenticating with GitHub...');
  let token;
  try {
    token = await github.authenticate(clientId, (verification) => {
      console.log();
      console.log('To authenticate, visit: %s', verification.verification_uri);
      console.log('And enter the code: %s', verification.user_code);
      console.log();
    });
  } catch (err) {
    if (err.status === 404) {
      console.error('Authentication failed: invalid GitHub OAuth App client ID.');
      console.error('Check that PLANSYNC_GITHUB_CLIENT_ID is correct and the OAuth App exists.');
    } else if (err.status === 401) {
      console.error('Authentication failed: the device code was denied or expired.');
      console.error('Run `plansync init` again to restart the authentication flow.');
    } else {
      console.error('Authentication failed: %s', err.message);
    }
    process.exit(1);
  }
  console.log('Authentication successful.\n');

  cfg.githubToken = token;
  cfg.githubClientId = clientId;
  cfg.owner = remote.owner;
  cfg.repo = remote.repo;
  config.write(root, cfg);
  console.log('Saved credentials to .plansync/config.json');

  const workflowsDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  const templateDir = path.join(__dirname, '..', 'templates', 'workflows');
  const templates = fs.readdirSync(templateDir).filter(f => f.endsWith('.tmpl'));
  for (const tmpl of templates) {
    const content = fs.readFileSync(path.join(templateDir, tmpl), 'utf-8');
    const targetName = tmpl.replace(/\.tmpl$/, '');
    const targetPath = path.join(workflowsDir, targetName);
    // Only write if not already present (don't overwrite user modifications)
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, content);
      console.log('Created .github/workflows/%s', targetName);
    } else {
      console.log('Skipped existing .github/workflows/%s', targetName);
    }
  }

  const hooksDir = path.join(root, '.git', 'hooks');
  const hookTmpl = path.join(__dirname, '..', 'templates', 'hooks', 'post-merge.tmpl');
  if (fs.existsSync(hookTmpl)) {
    const hookContent = fs.readFileSync(hookTmpl, 'utf-8');
    const hookPath = path.join(hooksDir, 'post-merge');
    if (!fs.existsSync(hookPath)) {
      fs.writeFileSync(hookPath, hookContent);
      fs.chmodSync(hookPath, 0o755);
      console.log('Installed post-merge git hook');
    } else {
      console.log('Skipped existing post-merge git hook');
    }
  }

  const planPath = path.join(root, 'PROJECT_PLAN.md');
  if (!fs.existsSync(planPath)) {
    fs.writeFileSync(planPath, '# Project Plan\n\nProject plan will be generated with `plansync plan`.\n');
    console.log('Created PROJECT_PLAN.md');
  }

  // Write admin context for the admin's coding agent
  const agentsPath = path.join(root, 'AGENTS.md');
  const adminContent = renderAdminContext(remote.owner, remote.repo);
  const merged = mergeOrWrite(agentsPath, adminContent);
  fs.writeFileSync(agentsPath, merged);
  console.log('Added PlanSync planning instructions to AGENTS.md');

  console.log('\nPlansync initialized for %s/%s', remote.owner, remote.repo);
}

module.exports = init;
