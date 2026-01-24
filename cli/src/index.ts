#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { configCommand } from './commands/config';
import { uploadCommand } from './commands/upload';
import { downloadCommand } from './commands/download';
import { listCommand } from './commands/list';
import { deleteCommand } from './commands/delete';
import { copyCommand } from './commands/copy';
import { tasksListCommand, taskRunCommand, taskStopCommand, taskDeleteCommand, taskEnableCommand } from './commands/tasks';
import { getConfig } from './config';
const pkg = require('../package.json');

const program = new Command();

// ASCII art banner
const banner = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold.white('D-Drive CLI')} ${chalk.gray('v' + (pkg.version || '2.2.0'))}              ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.gray('Discord-based cloud storage')}         ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`;

program
  .name('d-drive')
  .description('D-Drive CLI - Discord-based cloud storage')
  .version(pkg.version || '2.2.0')
  .hook('preAction', (thisCommand) => {
    // Show banner only for main commands, not subcommands
    if (thisCommand.name() === 'd-drive' && !process.argv.includes('--help') && !process.argv.includes('-h')) {
      // Don't show banner for quick commands
    }
  });

// Interactive mode when no command is provided
program
  .command('interactive', { isDefault: false })
  .alias('i')
  .description('Start interactive mode')
  .action(async () => {
    console.log(banner);
    await interactiveMode();
  });

// Config command with interactive setup
program
  .command('config')
  .description('Configure D-Drive CLI')
  .option('-k, --key <apiKey>', 'Set API key')
  .option('-u, --url <url>', 'Set API URL')
  .option('-l, --list', 'List current configuration')
  .option('-i, --interactive', 'Interactive configuration')
  .action(async (options) => {
    if (options.interactive || (!options.key && !options.url && !options.list)) {
      await interactiveConfig();
    } else {
      await configCommand(options);
    }
  });

// Upload command
program
  .command('upload <source> [destination]')
  .alias('up')
  .description('Upload a file or directory to D-Drive')
  .option('-r, --recursive', 'Upload directory recursively')
  .option('-e, --encrypt', 'Encrypt the file')
  .option('--no-progress', 'Disable progress bar')
  .action(uploadCommand);

// Download command
program
  .command('download <source> [destination]')
  .alias('dl')
  .description('Download a file from D-Drive')
  .option('--no-progress', 'Disable progress bar')
  .action(downloadCommand);

// List command
program
  .command('list [path]')
  .alias('ls')
  .description('List files in D-Drive')
  .option('-l, --long', 'Use long listing format')
  .option('-a, --all', 'Include hidden files')
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
  .alias('cp')
  .description('Make a copy of a file in-place (auto-numbered)')
  .action(copyCommand);

// Info command
program
  .command('info')
  .description('Show D-Drive connection info and status')
  .action(async () => {
    const config = getConfig();
    console.log(banner);
    console.log(chalk.bold('Connection Status:'));
    console.log(chalk.gray('─────────────────────────────────'));
    console.log(`${chalk.gray('API URL:')}   ${config.apiUrl ? chalk.cyan(config.apiUrl) : chalk.red('Not configured')}`);
    console.log(`${chalk.gray('API Key:')}   ${config.apiKey ? chalk.green('✓ Configured') : chalk.red('✗ Not configured')}`);
    
    if (config.apiKey && config.apiUrl) {
      const axios = require('axios');
      try {
        const response = await axios.get(`${config.apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
          timeout: 5000,
        });
        console.log(`${chalk.gray('Status:')}    ${chalk.green('✓ Connected')}`);
        console.log(`${chalk.gray('User:')}      ${chalk.white(response.data.username || response.data.id)}`);
      } catch (e: any) {
        if (e.code === 'ECONNREFUSED') {
          console.log(`${chalk.gray('Status:')}    ${chalk.red('✗ Cannot connect to server')}`);
        } else if (e.response?.status === 401) {
          console.log(`${chalk.gray('Status:')}    ${chalk.red('✗ Invalid API key')}`);
        } else {
          console.log(`${chalk.gray('Status:')}    ${chalk.yellow('? Unable to verify')}`);
        }
      }
    }
    console.log(chalk.gray('─────────────────────────────────'));
    console.log(chalk.gray(`Run ${chalk.white('drive config')} to configure`));
  });

// Tasks commands
const tasks = program
  .command('tasks')
  .description('Manage SFTP backup tasks');

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

// Help with examples
program.on('--help', () => {
  console.log('');
  console.log(chalk.bold('Quick Start:'));
  console.log(chalk.gray('────────────────────────────────────────'));
  console.log(`  ${chalk.cyan('$')} drive config              ${chalk.gray('# Interactive setup')}`);
  console.log(`  ${chalk.cyan('$')} drive config --key <KEY>  ${chalk.gray('# Set API key')}`);
  console.log('');
  console.log(chalk.bold('File Operations:'));
  console.log(chalk.gray('────────────────────────────────────────'));
  console.log(`  ${chalk.cyan('$')} drive upload ./file.txt`);
  console.log(`  ${chalk.cyan('$')} drive upload ./folder -r  ${chalk.gray('# Recursive')}`);
  console.log(`  ${chalk.cyan('$')} drive download /file.txt`);
  console.log(`  ${chalk.cyan('$')} drive ls /backups`);
  console.log(`  ${chalk.cyan('$')} drive rm /old-file.txt`);
  console.log('');
  console.log(chalk.bold('Task Management:'));
  console.log(chalk.gray('────────────────────────────────────────'));
  console.log(`  ${chalk.cyan('$')} drive tasks ls            ${chalk.gray('# List tasks')}`);
  console.log(`  ${chalk.cyan('$')} drive tasks run <id>      ${chalk.gray('# Run task')}`);
  console.log(`  ${chalk.cyan('$')} drive tasks stop <id>     ${chalk.gray('# Stop task')}`);
  console.log('');
  console.log(chalk.gray('Documentation: https://github.com/jasonzli-DEV/D-Drive'));
});

// Interactive mode function
async function interactiveMode() {
  const config = getConfig();
  
  if (!config.apiKey) {
    console.log(chalk.yellow('No API key configured. Let\'s set one up!\n'));
    await interactiveConfig();
    return;
  }

  const choices = [
    { name: '📂 List files', value: 'list' },
    { name: '⬆️  Upload file', value: 'upload' },
    { name: '⬇️  Download file', value: 'download' },
    { name: '🗑️  Delete file', value: 'delete' },
    { name: '📋 List tasks', value: 'tasks' },
    { name: '⚙️  Configuration', value: 'config' },
    { name: '❌ Exit', value: 'exit' },
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    },
  ]);

  switch (action) {
    case 'list':
      const { path } = await inquirer.prompt([
        { type: 'input', name: 'path', message: 'Path (leave empty for root):', default: '/' },
      ]);
      await listCommand(path === '/' ? undefined : path, { long: true });
      break;
    case 'upload':
      const { source, dest } = await inquirer.prompt([
        { type: 'input', name: 'source', message: 'Local file path:' },
        { type: 'input', name: 'dest', message: 'Remote destination (optional):' },
      ]);
      await uploadCommand(source, dest || undefined, { recursive: false, progress: true });
      break;
    case 'download':
      const { remotePath, localPath } = await inquirer.prompt([
        { type: 'input', name: 'remotePath', message: 'Remote file path:' },
        { type: 'input', name: 'localPath', message: 'Local destination (optional):' },
      ]);
      await downloadCommand(remotePath, localPath || undefined, { progress: true });
      break;
    case 'delete':
      const { deletePath, confirm } = await inquirer.prompt([
        { type: 'input', name: 'deletePath', message: 'Path to delete:' },
        { type: 'confirm', name: 'confirm', message: 'Are you sure?', default: false },
      ]);
      if (confirm) {
        await deleteCommand(deletePath, { recursive: false, force: true });
      }
      break;
    case 'tasks':
      await tasksListCommand();
      break;
    case 'config':
      await interactiveConfig();
      break;
    case 'exit':
      console.log(chalk.gray('Goodbye! 👋'));
      process.exit(0);
  }
}

// Interactive configuration
async function interactiveConfig() {
  const config = getConfig();
  
  console.log(chalk.bold('\n📋 D-Drive Configuration\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiUrl',
      message: 'API URL:',
      default: config.apiUrl || 'https://your-server/api',
      validate: (input: string) => {
        if (!input.startsWith('http://') && !input.startsWith('https://')) {
          return 'URL must start with http:// or https://';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'API Key (from Settings → API Keys):',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      },
    },
  ]);

  await configCommand({
    key: answers.apiKey,
    url: answers.apiUrl,
  });
}

// Handle no arguments - show help
if (process.argv.length === 2) {
  console.log(banner);
  program.outputHelp();
}

program.parse();
