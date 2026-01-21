#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { configCommand } from './commands/config';
import { uploadCommand } from './commands/upload';
import { downloadCommand } from './commands/download';
import { listCommand } from './commands/list';
import { deleteCommand } from './commands/delete';
import { copyCommand } from './commands/copy';
import { tasksListCommand, taskRunCommand, taskStopCommand, taskDeleteCommand, taskEnableCommand } from './commands/tasks';
const pkg = require('../package.json');

const program = new Command();

program
  .name('d-drive')
  .description('D-Drive CLI - Discord-based cloud storage for developers')
  .version(pkg.version || '0.0.0');

// Config command
program
  .command('config')
  .description('Configure D-Drive CLI')
  .option('-k, --key <apiKey>', 'Set API key')
  .option('-u, --url <url>', 'Set API URL')
  .option('-l, --list', 'List current configuration')
  .action(configCommand);

// Upload command
program
  .command('upload <source> [destination]')
  .description('Upload a file or directory to D-Drive')
  .option('-r, --recursive', 'Upload directory recursively')
  .option('--no-progress', 'Disable progress bar')
  .action(uploadCommand);

// Download command
program
  .command('download <source> [destination]')
  .description('Download a file from D-Drive')
  .option('--no-progress', 'Disable progress bar')
  .action(downloadCommand);

// List command
program
  .command('list [path]')
  .alias('ls')
  .description('List files in D-Drive')
  .option('-l, --long', 'Use long listing format')
  .action(listCommand);

// Delete command
program
  .command('delete <path>')
  .alias('rm')
  .description('Delete a file or directory from D-Drive')
  .option('-r, --recursive', 'Delete directory recursively')
  .option('-f, --force', 'Force deletion without confirmation')
  .action(deleteCommand);

// Copy command
program
  .command('copy <path>')
  .description('Make a copy of a file in-place (auto-numbered)')
  .action(copyCommand);

// Tasks commands
const tasks = program
  .command('tasks')
  .description('Manage backup tasks');

tasks
  .command('list')
  .alias('ls')
  .description('List all backup tasks')
  .action(tasksListCommand);

tasks
  .command('run <taskId>')
  .description('Run a task immediately')
  .action(taskRunCommand);

tasks
  .command('stop <taskId>')
  .description('Stop a running task')
  .action(taskStopCommand);

tasks
  .command('delete <taskId>')
  .alias('rm')
  .description('Delete a task')
  .option('-f, --force', 'Force deletion without confirmation')
  .action(taskDeleteCommand);

tasks
  .command('enable <taskId>')
  .description('Enable a task')
  .action((taskId: string) => taskEnableCommand(taskId, true));

tasks
  .command('disable <taskId>')
  .description('Disable a task')
  .action((taskId: string) => taskEnableCommand(taskId, false));

// Help command
program.on('--help', () => {
  console.log('');
  console.log(chalk.bold('Examples:'));
  console.log('  $ d-drive config --key YOUR_API_KEY');
  console.log('  $ d-drive upload ./file.txt /backups/');
  console.log('  $ d-drive upload ./myproject /backups/projects/ -r');
  console.log('  $ d-drive download /backups/file.txt ./restored.txt');
  console.log('  $ d-drive list /backups');
  console.log('  $ d-drive delete /backups/old-file.txt');
  console.log('');
  console.log(chalk.bold('Task Commands:'));
  console.log('  $ d-drive tasks list              List all backup tasks');
  console.log('  $ d-drive tasks run <taskId>      Run a task immediately');
  console.log('  $ d-drive tasks stop <taskId>     Stop a running task');
  console.log('  $ d-drive tasks enable <taskId>   Enable a task');
  console.log('  $ d-drive tasks disable <taskId>  Disable a task');
  console.log('  $ d-drive tasks delete <taskId>   Delete a task');
});

program.parse();
