const path = require('path');
const fs = require('fs');
const config = require('../lib/config');
const github = require('../lib/github');

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

  let clientId = github.getClientId();
  if (!clientId) {
    console.error('PLANSYNC_GITHUB_CLIENT_ID environment variable is not set.');
    console.error();
    console.error('To use plansync, you need a GitHub OAuth App:');
    console.error('  1. Go to https://github.com/settings/developers');
    console.error('  2. Create a new OAuth App (no callback URL needed for device flow)');
    console.error('  3. Copy the Client ID and set it:');
    console.error('     export PLANSYNC_GITHUB_CLIENT_ID=your_client_id_here');
    process.exit(1);
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

  const cfg = config.read(root);
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

  console.log('\nPlansync initialized for %s/%s', remote.owner, remote.repo);
}

module.exports = init;
