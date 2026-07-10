const config = require('../lib/config');
const { getCurrentUsername } = require('../lib/permissions');

function printHelp() {
  console.log('\nCould not determine your GitHub username.');
  console.log('  plansync whoami --user your_github_username');
  console.log('  export PLANSYNC_USER=your_github_username');
  console.log('  Run `plansync init` to authenticate with GitHub\n');
}

async function whoami() {
  let username = process.env.PLANSYNC_USER || null;

  if (!username) {
    const root = config.findRoot();
    const cfg = config.read(root);
    if (cfg.githubToken) {
      try {
        username = await getCurrentUsername(cfg.githubToken);
      } catch {}
    }
  }

  if (username) {
    console.log(username);
  } else {
    printHelp();
    process.exit(1);
  }
}

module.exports = whoami;
