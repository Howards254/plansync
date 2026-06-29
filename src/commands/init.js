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

  // --- Authentication ---
  const clientId = github.getClientId(cfg);

  console.log('PlanSync needs permission to manage your repo on GitHub.');
  console.log();

  const answer = await ask('Press Enter to authenticate in your browser, or paste a Personal Access Token: ');

  let token;
  let username;

  if (answer) {
    // PAT flow
    token = answer;
    console.log('\nVerifying token...');
    try {
      username = await github.verifyPAT(token);
      console.log('Authenticated as: %s', username);
    } catch (err) {
      console.error('Invalid token: %s', err.message);
      console.error('Generate a new token at https://github.com/settings/tokens/new');
      process.exit(1);
    }
  } else {
    // Device flow
    if (!clientId) {
      console.error('No Client ID available. Create one at https://github.com/settings/developers');
      console.error('or paste a Personal Access Token instead.');
      process.exit(1);
    }

    console.log();
    try {
      token = await github.authenticate(clientId, (verification) => {
        console.log('1. Visit %s', verification.verification_uri);
        console.log('2. Enter code: %s', verification.user_code);
        console.log('3. Authorize PlanSync');
        console.log();
      });
      username = await github.verifyPAT(token);
      console.log('Authenticated as: %s', username);
    } catch (err) {
      if (err.status === 404) {
        console.error('Authentication failed: invalid Client ID.');
      } else if (err.status === 401) {
        console.error('Authentication failed: the code was denied or expired.');
      } else {
        console.error('Authentication failed: %s', err.message);
      }
      console.error('Run `plansync init` again or paste a Personal Access Token instead.');
      process.exit(1);
    }
  }

  console.log('Authentication successful.\n');

  cfg.githubToken = token;
  cfg.owner = remote.owner;
  cfg.repo = remote.repo;
  config.write(root, cfg);
  console.log('Saved credentials to .plansync/config.json');

  // --- Ensure .plansync/config.json is gitignored ---
  const gitignorePath = path.join(root, '.gitignore');
  const gitignoreEntry = '.plansync/config.json';
  let gitignore = '';
  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  }
  if (!gitignore.split('\n').map(l => l.trim()).includes(gitignoreEntry)) {
    fs.appendFileSync(gitignorePath, '\n' + gitignoreEntry + '\n');
    console.log('Added %s to .gitignore', gitignoreEntry);
  }

  // --- Scaffold workflows ---
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
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, content);
      console.log('Created .github/workflows/%s', targetName);
    } else {
      console.log('Skipped existing .github/workflows/%s', targetName);
    }
  }

  // --- Install post-merge hook ---
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

  // --- Write admin agent context ---
  const agentsPath = path.join(root, 'AGENTS.md');
  const adminContent = renderAdminContext(remote.owner, remote.repo);
  const merged = mergeOrWrite(agentsPath, adminContent);
  fs.writeFileSync(agentsPath, merged);
  console.log('Added PlanSync planning instructions to AGENTS.md');

  console.log('\nPlansync initialized for %s/%s', remote.owner, remote.repo);
}

module.exports = init;
