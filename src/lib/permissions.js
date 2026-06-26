const path = require('path');
const fs = require('fs');
const { minimatch } = require('minimatch');

const ALWAYS_WRITABLE = new Set([
  '.plansync',
  '.git',
  'node_modules',
]);

// Relative path patterns that should always stay writable
const ALWAYS_WRITABLE_PATTERNS = [
  '.plansync/**',
  '.git/**',
  'node_modules/**',
];

function isAlwaysWritable(relativePath) {
  return ALWAYS_WRITABLE_PATTERNS.some(pattern =>
    minimatch(relativePath, pattern, { dot: true, matchBase: false })
  );
}

function matchesScope(file, scopeGlobs) {
  return scopeGlobs.some(glob =>
    minimatch(file, glob, { dot: true, matchBase: false })
  );
}

function walkDir(dir, root, relativePath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

    if (isAlwaysWritable(relPath)) continue;

    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath, root, relPath));
    } else if (entry.isFile()) {
      files.push({ fullPath, relPath });
    }
  }

  return files;
}

function applyScope(root, username, plan) {
  if (!fs.existsSync(root)) {
    throw new Error(`Directory does not exist: ${root}`);
  }

  // Collect scope globs for this user's assigned tasks
  const userGlobs = [];
  for (const task of plan.tasks) {
    if (task.assignedTo === username) {
      userGlobs.push(...task.scope);
    }
  }

  const files = walkDir(root, root);
  let writable = 0;
  let readonly = 0;

  for (const { fullPath, relPath } of files) {
    const inScope = matchesScope(relPath, userGlobs);

    try {
      if (inScope) {
        fs.chmodSync(fullPath, 0o644);
        writable++;
      } else {
        fs.chmodSync(fullPath, 0o444);
        readonly++;
      }
    } catch (err) {
      // Skip files we can't chmod (permissions issues, etc.)
    }
  }

  return { writable, readonly, total: files.length, username, assignedGlobs: userGlobs };
}

function clearScope(root) {
  const files = walkDir(root, root);
  let reset = 0;

  for (const { fullPath } of files) {
    try {
      fs.chmodSync(fullPath, 0o644);
      reset++;
    } catch (err) {
      // Skip files we can't chmod
    }
  }

  return { reset, total: files.length };
}

async function getCurrentUsername(token) {
  if (process.env.PLANSYNC_USER) return process.env.PLANSYNC_USER;
  const { Octokit } = require('@octokit/rest');
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.users.getAuthenticated();
  return data.login;
}

module.exports = { applyScope, clearScope, getCurrentUsername };
