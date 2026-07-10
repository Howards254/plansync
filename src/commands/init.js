const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../lib/config');
const github = require('../lib/github');
const { renderAdminContext, mergeOrWrite, ROOT_CONTEXT_FILES } = require('../lib/contextFiles');

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

  let token;
  let username;

  // Check PLANSYNC_GITHUB_TOKEN env var first (for CI/non-interactive use)
  if (process.env.PLANSYNC_GITHUB_TOKEN) {
    token = process.env.PLANSYNC_GITHUB_TOKEN;
    console.log('\nVerifying token from PLANSYNC_GITHUB_TOKEN...');
    try {
      username = await github.verifyPAT(token);
      console.log(`Authenticated as: ${username}`);
    } catch (err) {
      console.error(`Invalid token: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('PlanSync needs permission to manage your repo on GitHub.');
    console.log();

    const answer = await ask('Press Enter to authenticate in your browser, or paste a Personal Access Token: ');

    if (answer) {
      // PAT flow
      token = answer;
      console.log('\nVerifying token...');
      try {
        username = await github.verifyPAT(token);
        console.log(`Authenticated as: ${username}`);
      } catch (err) {
        console.error(`Invalid token: ${err.message}`);
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

      try {
        token = await github.authenticateWithDialog(clientId);
        username = await github.verifyPAT(token);
        console.log(`Authenticated as: ${username}`);
      } catch (err) {
        if (err.message === 'Authentication cancelled.') {
          console.log('Cancelled.');
        } else if (err.status === 404) {
          console.error('Authentication failed: GitHub OAuth App not found.');
          console.error('The built-in Client ID may have been disabled. Set PLANSYNC_GITHUB_TOKEN or paste a PAT as a workaround.');
          console.error('Generate a PAT at https://github.com/settings/tokens/new (scopes: repo, project)');
        } else if (err.status === 401) {
          console.error('Authentication failed: the code was denied or expired.');
        } else {
          console.error(`Authentication failed: ${err.message}`);
        }
        process.exit(1);
      }
    }
  }

  console.log('Authentication successful.\n');

  cfg.githubToken = token;
  cfg.owner = remote.owner;
  cfg.repo = remote.repo;
  config.write(root, cfg);
  console.log('Saved credentials to .plansync/config.json');

  // --- Ensure .plansync/config.json, .plansync/context/, and root context files are gitignored ---
  const gitignorePath = path.join(root, '.gitignore');
  const gitignoreEntries = ['.plansync/config.json', '.plansync/context/', ...ROOT_CONTEXT_FILES];
  let gitignore = '';
  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  }
  for (const entry of gitignoreEntries) {
    if (!gitignore.split('\n').map(l => l.trim()).includes(entry)) {
      fs.appendFileSync(gitignorePath, '\n' + entry + '\n');
      console.log(`Added ${entry} to .gitignore`);
    }
    try {
      execSync(`git rm --cached ${entry}`, { cwd: root, stdio: 'pipe' });
    } catch {
      // Not tracked — nothing to untrack
    }
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
  const adminContent = renderAdminContext(remote.owner, remote.repo);

  // Write to root AGENTS.md (gitignored — local for admin's agent to read)
  const agentsPath = path.join(root, 'AGENTS.md');
  const merged = mergeOrWrite(agentsPath, adminContent);
  fs.writeFileSync(agentsPath, merged);
  console.log('Added PlanSync planning instructions to AGENTS.md');

  // Write to .plansync/admin-context.md (committed — for other clones to reference)
  const adminContextPath = path.join(root, '.plansync', 'admin-context.md');
  fs.writeFileSync(adminContextPath, adminContent.trimEnd() + '\n');
  console.log('Wrote admin context to .plansync/admin-context.md (committed)');

  console.log('\nPlansync initialized for %s/%s', remote.owner, remote.repo);
}

module.exports = init;
