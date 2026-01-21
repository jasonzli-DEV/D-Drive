import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../api';

interface Task {
  id: string;
  name: string;
  enabled: boolean;
  cron: string;
  sftpHost: string;
  sftpPort: number;
  sftpUser: string;
  sftpPath: string;
  destinationPath?: string;
  compress: string;
  maxFiles: number;
  lastRun?: string;
  lastStarted?: string;
  lastRuntime?: number;
}

export async function tasksListCommand() {
  const spinner = ora('Fetching tasks...').start();
  
  try {
    const client = createApiClient();
    const response = await client.get('/tasks');
    const tasks: Task[] = response.data;
    
    spinner.stop();
    
    if (tasks.length === 0) {
      console.log(chalk.yellow('No tasks found.'));
      return;
    }
    
    console.log(chalk.bold('\nBackup Tasks:\n'));
    console.log(chalk.gray('─'.repeat(80)));
    
    for (const task of tasks) {
      const status = task.enabled ? chalk.green('●') : chalk.red('○');
      const isRunning = task.lastStarted && (!task.lastRun || new Date(task.lastStarted) > new Date(task.lastRun));
      const runStatus = isRunning ? chalk.blue(' [RUNNING]') : '';
      
      console.log(`${status} ${chalk.bold(task.name)}${runStatus}`);
      console.log(`  ${chalk.gray('ID:')} ${task.id}`);
      console.log(`  ${chalk.gray('Schedule:')} ${task.cron}`);
      console.log(`  ${chalk.gray('SFTP:')} ${task.sftpUser}@${task.sftpHost}:${task.sftpPort}${task.sftpPath}`);
      console.log(`  ${chalk.gray('Destination:')} ${task.destinationPath || '/'}`);
      console.log(`  ${chalk.gray('Compress:')} ${task.compress} | ${chalk.gray('Max Files:')} ${task.maxFiles || 'unlimited'}`);
      
      if (task.lastRun) {
        const lastRun = new Date(task.lastRun).toLocaleString();
        const runtime = task.lastRuntime ? ` (${formatRuntime(task.lastRuntime)})` : '';
        console.log(`  ${chalk.gray('Last Run:')} ${lastRun}${runtime}`);
      }
      
      console.log(chalk.gray('─'.repeat(80)));
    }
    
    console.log(chalk.gray(`\nTotal: ${tasks.length} task(s)`));
    
  } catch (error: any) {
    spinner.fail('Failed to fetch tasks');
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

export async function taskRunCommand(taskId: string) {
  const spinner = ora('Starting task...').start();
  
  try {
    const client = createApiClient();
    const response = await client.post(`/tasks/${taskId}/run`);
    
    spinner.succeed(chalk.green('Task started successfully!'));
    console.log(chalk.gray(`Task ID: ${taskId}`));
    
  } catch (error: any) {
    if (error.response?.status === 409) {
      spinner.fail(chalk.yellow('Task is already running'));
    } else {
      spinner.fail('Failed to start task');
    }
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

export async function taskStopCommand(taskId: string) {
  const spinner = ora('Stopping task...').start();
  
  try {
    const client = createApiClient();
    await client.post(`/tasks/${taskId}/stop`);
    
    spinner.succeed(chalk.green('Task stopped successfully!'));
    
  } catch (error: any) {
    spinner.fail('Failed to stop task');
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

export async function taskDeleteCommand(taskId: string, options: { force?: boolean }) {
  try {
    if (!options.force) {
      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete task ${taskId}?`,
          default: false,
        },
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }
    
    const spinner = ora('Deleting task...').start();
    const client = createApiClient();
    await client.delete(`/tasks/${taskId}`);
    
    spinner.succeed(chalk.green('Task deleted successfully!'));
    
  } catch (error: any) {
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

export async function taskEnableCommand(taskId: string, enable: boolean) {
  const action = enable ? 'Enabling' : 'Disabling';
  const spinner = ora(`${action} task...`).start();
  
  try {
    const client = createApiClient();
    await client.patch(`/tasks/${taskId}`, { enabled: enable });
    
    spinner.succeed(chalk.green(`Task ${enable ? 'enabled' : 'disabled'} successfully!`));
    
  } catch (error: any) {
    spinner.fail(`Failed to ${enable ? 'enable' : 'disable'} task`);
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

function formatRuntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}
