import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../api';

export async function copyCommand(remotePath: string) {
  const spinner = ora('Finding file...').start();

  try {
    const api = createApiClient();

    // Find file by path
    const filesResponse = await api.get('/files', { params: { path: remotePath } });
    const files = filesResponse.data;
    if (files.length === 0) {
      spinner.fail(chalk.red(`File not found: ${remotePath}`));
      process.exit(1);
    }

    const file = files[0];
    spinner.text = 'Creating copy...';

    const resp = await api.post(`/files/${file.id}/copy`);

    spinner.succeed(chalk.green('Copy created'));
    const created = resp.data;
    console.log(chalk.gray(`Created: ${created.path || `/${created.name}`}`));
  } catch (error: any) {
    spinner.fail(chalk.red('Copy failed'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}
