const path = require('path');
const fs = require('fs');

const CONFIG_DIR = '.plansync';
const CONFIG_FILE = 'config.json';

function configPath(root) {
  return path.join(root, CONFIG_DIR, CONFIG_FILE);
}

function findRoot() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error('Not inside a git repository');
}

function read(root) {
  const p = configPath(root);
  let cfg = {};
  if (fs.existsSync(p)) {
    cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  // PLANSYNC_GITHUB_TOKEN env var overrides file config
  if (process.env.PLANSYNC_GITHUB_TOKEN) {
    cfg.githubToken = process.env.PLANSYNC_GITHUB_TOKEN;
  }
  return cfg;
}

function write(root, data) {
  const p = configPath(root);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    // Create .gitkeep so the directory is tracked
    fs.writeFileSync(path.join(dir, '.gitkeep'), '');
  }
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

module.exports = { read, write, findRoot, CONFIG_DIR, CONFIG_FILE };
