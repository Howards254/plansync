#!/usr/bin/env node
const { Command } = require('commander');

const initCmd = require('../src/commands/init');
const planCmd = require('../src/commands/plan');
const delegateCmd = require('../src/commands/delegate');
const statusCmd = require('../src/commands/status');
const syncCmd = require('../src/commands/sync');
const cleanCmd = require('../src/commands/clean');
const whoamiCmd = require('../src/commands/whoami');

const program = new Command();

program
  .name('plansync')
  .description('Coordination and accountability layer for AI-assisted development teams')
  .version('0.4.0');

program
  .command('init')
  .description('Authenticate with GitHub and scaffold the project brain')
  .action(() => {
    initCmd().catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('plan')
  .description('Generate a project plan from a description using an LLM')
  .argument('<description>', 'project description')
  .action((description) => {
    planCmd(description).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('delegate')
  .description('Write the approved plan to GitHub Issues and Projects')
  .option('--auto', 'Skip interactive reassignment, use round-robin defaults (still shows approval prompt)')
  .option('--update', '(Deprecated) Now the default — delegate always updates existing issues')
  .action((opts) => {
    delegateCmd(opts.auto || false).catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('status')
  .description('Print the current plan and live task states from GitHub')
  .action(() => {
    statusCmd().catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('sync [username]')
  .description('Recompute and reapply read-only file permissions for your assigned scope')
  .option('--user <username>', 'GitHub username (overrides positional argument)')
  .option('--reset', 'Reset all files to writable (undo previous sync)')
  .option('--supervisor', 'Supervisor mode: keep all files writable, only generate context files')
  .action((username, opts) => {
    if (opts.user) process.env.PLANSYNC_USER = opts.user;
    else if (username) process.env.PLANSYNC_USER = username;
    if (opts.reset) process.env.PLANSYNC_RESET = '1';
    if (opts.supervisor) process.env.PLANSYNC_SUPERVISOR = '1';
    syncCmd().catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('clean')
  .description('Remove all PlanSync files and markers from the project')
  .action(() => {
    cleanCmd().catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program
  .command('whoami')
  .description('Print your synced GitHub username')
  .option('--user <username>', 'Specify username directly')
  .action((opts) => {
    if (opts.user) process.env.PLANSYNC_USER = opts.user;
    whoamiCmd().catch(err => {
      console.error(err.message);
      process.exit(1);
    });
  });

program.parse(process.argv);
