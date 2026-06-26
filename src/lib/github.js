const { Octokit } = require('@octokit/rest');
const { createOAuthDeviceAuth } = require('@octokit/auth-oauth-device');
const { execSync } = require('child_process');

function getClientId() {
  return process.env.PLANSYNC_GITHUB_CLIENT_ID || null;
}

async function authenticate(clientId, onVerification) {
  const auth = createOAuthDeviceAuth({
    clientType: 'oauth-app',
    clientId,
    scopes: ['repo', 'issues', 'project'],
    onVerification,
  });
  const { token } = await auth({});
  return token;
}

function createOctokit(token) {
  return new Octokit({ auth: token });
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

module.exports = { authenticate, createOctokit, getGitHubRemote, checkRemote, getClientId };
