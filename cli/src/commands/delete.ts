import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createApiClient } from '../api';

interface DeleteOptions {
  recursive?: boolean;
  force?: boolean;
}

export async function deleteCommand(remotePath: string, options: DeleteOptions) {
  const spinner = ora('Finding file...').start();

  try {
    const api = createApiClient();

    // Get file info
    const filesResponse = await api.get('/files', {
      params: { path: remotePath },
    });

    const files = filesResponse.data;
    if (files.length === 0) {
      spinner.fail(chalk.red(`File not found: ${remotePath}`));
      return;
    }

    const file = files[0];
    spinner.stop();

    // Warn if trying to delete a directory
    if (file.type === 'DIRECTORY') {
      console.log(chalk.yellow('Warning: This is a directory. All contents will be moved to recycle bin.'));
    }

    // Confirm deletion
    if (!options.force) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete ${chalk.cyan(file.name)}?`,
          default: false,
        },
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow('Deletion cancelled'));
        return;
      }
    }

    const deleteSpinner = ora('Deleting...').start();

    await api.delete(`/files/${file.id}`);

    deleteSpinner.succeed(chalk.green('File deleted successfully'));
  } catch (error: any) {
    spinner.fail(chalk.red('Delete failed'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}
