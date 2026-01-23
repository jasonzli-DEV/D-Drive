import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import FormData from 'form-data';
import ProgressBar from 'progress';
import { createApiClient } from '../api';
import { glob } from 'glob';

interface UploadOptions {
  recursive?: boolean;
  progress?: boolean;
}

export async function uploadCommand(
  source: string,
  destination: string = '/',
  options: UploadOptions
) {
  const spinner = ora('Preparing upload...').start();

  try {
    const api = createApiClient();
    const sourcePath = path.resolve(source);

    // Check if source exists
    if (!await fs.pathExists(sourcePath)) {
      spinner.fail(chalk.red(`Source not found: ${source}`));
      return;
    }

    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      if (!options.recursive) {
        spinner.fail(chalk.red('Use -r flag to upload directories'));
        return;
      }

      spinner.text = 'Finding files...';
      const files = await glob('**/*', {
        cwd: sourcePath,
        nodir: true,
      });

      spinner.succeed(chalk.green(`Found ${files.length} files to upload`));

      for (const file of files) {
        await uploadSingleFile(
          api,
          path.join(sourcePath, file),
          path.join(destination, file),
          options.progress !== false
        );
      }

      console.log(chalk.green(`\n✓ Uploaded ${files.length} files successfully`));
    } else {
      spinner.stop();
      const fileName = path.basename(sourcePath);
      const destPath = destination.endsWith('/') 
        ? path.join(destination, fileName)
        : destination;

      await uploadSingleFile(api, sourcePath, destPath, options.progress !== false);
      console.log(chalk.green('✓ File uploaded successfully'));
    }
  } catch (error: any) {
    spinner.fail(chalk.red('Upload failed'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

async function uploadSingleFile(
  api: any,
  filePath: string,
  destination: string,
  showProgress: boolean
): Promise<void> {
  const fileName = path.basename(filePath);
  const fileSize = (await fs.stat(filePath)).size;

  console.log(chalk.cyan(`\nUploading: ${fileName}`));
  console.log(chalk.gray(`Size: ${formatFileSize(fileSize)}`));

  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('path', destination);
  // Ensure CLI uploads follow frontend behavior and request server-side encryption by default
  formData.append('encrypt', 'true');

  let progressBar: ProgressBar | null = null;

  if (showProgress) {
    progressBar = new ProgressBar('[:bar] :percent :etas', {
      complete: '█',
      incomplete: '░',
      width: 40,
      total: fileSize,
    });
  }

  await api.post('/files/upload', formData, {
    headers: formData.getHeaders(),
    onUploadProgress: (progressEvent: any) => {
      if (progressBar && progressEvent.loaded) {
        progressBar.update(progressEvent.loaded / fileSize);
      }
    },
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
