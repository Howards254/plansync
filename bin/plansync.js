#!/usr/bin/env node
const { Command } = require('commander');

const initCmd = require('../src/commands/init');
const planCmd = require('../src/commands/plan');
const delegateCmd = require('../src/commands/delegate');
const statusCmd = require('../src/commands/status');
const syncCmd = require('../src/commands/sync');
const cleanCmd = require('../src/commands/clean');

const program = new Command();

program
  .name('plansync')
  .description('Coordination and accountability layer for AI-assisted development teams')
  .version('0.1.0');

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
  .command('sync')
  .description('Recompute and reapply read-only file permissions for your assigned scope')
  .option('--user <username>', 'GitHub username (auto-detected if omitted)')
  .option('--reset', 'Reset all files to writable (undo previous sync)')
  .action((opts) => {
    if (opts.user) process.env.PLANSYNC_USER = opts.user;
    if (opts.reset) process.env.PLANSYNC_RESET = '1';
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

program.parse(process.argv);
