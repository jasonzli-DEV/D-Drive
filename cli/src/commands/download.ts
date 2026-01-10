import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import ProgressBar from 'progress';
import { createApiClient } from '../api';

interface DownloadOptions {
  progress?: boolean;
}

export async function downloadCommand(
  source: string,
  destination: string = './',
  options: DownloadOptions
) {
  const spinner = ora('Finding file...').start();

  try {
    const api = createApiClient();

    // First, get file info
    const filesResponse = await api.get('/files', {
      params: { path: source },
    });

    const files = filesResponse.data;
    if (files.length === 0) {
      spinner.fail(chalk.red(`File not found: ${source}`));
      return;
    }

    const file = files[0];

    if (file.type === 'DIRECTORY') {
      spinner.fail(chalk.red('Cannot download directories yet'));
      return;
    }

    spinner.text = 'Downloading...';

    const destPath = path.resolve(destination);
    await fs.ensureDir(path.dirname(destPath));

    const response = await api.get(`/files/${file.id}/download`, {
      responseType: 'stream',
    });

    const fileSize = parseInt(response.headers['content-length'] || '0');
    const writer = fs.createWriteStream(destPath);

    let progressBar: ProgressBar | null = null;

    if (options.progress !== false && fileSize > 0) {
      spinner.stop();
      progressBar = new ProgressBar('[:bar] :percent :etas', {
        complete: '█',
        incomplete: '░',
        width: 40,
        total: fileSize,
      });
    }

    let downloadedBytes = 0;

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (progressBar) {
        progressBar.update(downloadedBytes / fileSize);
      }
    });

    response.data.pipe(writer);

    await new Promise<void>((resolve, reject) => {
      writer.on('finish', () => resolve());
      writer.on('error', reject);
    });

    if (progressBar) {
      console.log(chalk.green('\n✓ File downloaded successfully'));
    } else {
      spinner.succeed(chalk.green('File downloaded successfully'));
    }

    console.log(chalk.gray(`Saved to: ${destPath}`));
  } catch (error: any) {
    spinner.fail(chalk.red('Download failed'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}
