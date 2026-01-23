#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { configCommand } from './commands/config';
import { uploadCommand } from './commands/upload';
import { downloadCommand } from './commands/download';
import { listCommand } from './commands/list';
import { deleteCommand } from './commands/delete';

const program = new Command();

program
  .name('d-drive')
  .description('D-Drive CLI - Discord-based cloud storage for developers')
  .version('1.0.0');

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
});

program.parse();
