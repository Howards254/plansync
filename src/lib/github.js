const { Octokit } = require('@octokit/rest');
const { createOAuthDeviceAuth } = require('@octokit/auth-oauth-device');
const { execSync } = require('child_process');
const readline = require('readline');

const FALLBACK_CLIENT_ID = 'Ov23lizP5Fqo2bK78rbN';

function getClientId(config = {}) {
  return process.env.PLANSYNC_GITHUB_CLIENT_ID || config.githubClientId || FALLBACK_CLIENT_ID;
}

async function verifyPAT(token) {
  const octokit = createOctokit(token);
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

function createOctokit(token) {
  return new Octokit({
    auth: token,
    request: { headers: { 'X-GitHub-Api-Version': '2022-11-28' } },
  });
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
  execSync(`${cmd} '${url}'`, { stdio: 'pipe' });
}

function copyToClipboard(text) {
  const cmd = process.platform === 'darwin'
    ? 'pbcopy'
    : 'xclip -selection clipboard';
  execSync(`echo -n '${text}' | ${cmd}`, { stdio: 'pipe' });
}

async function authenticateWithDialog(clientId) {
  let verificationInfo;

  const auth = createOAuthDeviceAuth({
    clientType: 'oauth-app',
    clientId,
    scopes: ['repo', 'project'],
    onVerification: (v) => { verificationInfo = v; },
  });

  const tokenPromise = auth({});
  while (!verificationInfo) await sleep(10);

  console.log();
  console.log(`  To authorize PlanSync:\n`);
  console.log(`    1. Visit ${verificationInfo.verification_uri}`);
  console.log(`    2. Enter code: ${verificationInfo.user_code}`);
  console.log(`    3. Click Authorize\n`);

  // Countdown then auto-open browser
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`  Opening browser in ${i}s...        \r`);
    await sleep(1000);
  }
  process.stdout.write(`  Opening browser now...               \n`);

  try {
    openBrowser(verificationInfo.verification_uri);
    console.log('  ✓ Browser opened.\n');
  } catch {
    console.log('  (could not open browser automatically)\n');
  }

  // Interactive dialog while waiting for auth
  while (true) {
    const cmd = await ask('[Enter] Done  [o] Open browser  [c] Copy URL  [q] Cancel: ');
    if (cmd === 'q') throw new Error('Authentication cancelled.');
    if (cmd === 'o') {
      try { openBrowser(verificationInfo.verification_uri); } catch {}
      continue;
    }
    if (cmd === 'c') {
      try {
        copyToClipboard(verificationInfo.verification_uri);
        console.log('  ✓ URL copied to clipboard.');
      } catch {
        console.log(`  ${verificationInfo.verification_uri}`);
      }
      continue;
    }
    if (cmd === '') break;
    console.log('  Press Enter after authorizing, or type a command above.');
  }

  return await tokenPromise;
}

function getGitHubRemote(root) {
  try {
    const remoteUrl = execSync('git remote get-url origin', { cwd: root }).toString().trim();
    let match;
    if (remoteUrl.startsWith('https://')) {
      match = remoteUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    } else if (remoteUrl.startsWith('git@')) {
      match = remoteUrl.match(/github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
    }
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

function checkRemote(root) {
  try {
    execSync('git remote get-url origin', { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  authenticateWithDialog, createOctokit, getGitHubRemote,
  checkRemote, getClientId, verifyPAT,
};
