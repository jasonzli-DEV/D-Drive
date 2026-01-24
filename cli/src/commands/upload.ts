import fs from 'fs-extra';
import path from 'path';
import { PassThrough } from 'stream';
import chalk from 'chalk';
import ora from 'ora';
import FormData from 'form-data';
import ProgressBar from 'progress';
import { createApiClient } from '../api';
import { glob } from 'glob';
import axios from 'axios';

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
  // Create a passthrough so we can monitor bytes read from disk
  const fileStream = fs.createReadStream(filePath);
  const pass = new PassThrough();
  // Pipe file stream into pass-through which is appended to form-data
  fileStream.pipe(pass);
  formData.append('file', pass, {
    filename: fileName,
    knownLength: fileSize,
  });
  // Resolve destination directory to a parentId and send parentId (server-authoritative)
  const parentDir = path.posix.dirname(destination || '/');
  let parentId: string | null = null;
  if (parentDir && parentDir !== '/' && parentDir !== '.') {
    parentId = await ensureFolderExists(api, parentDir);
  }
  if (parentId) {
    formData.append('parentId', parentId);
  }
  // Ensure CLI uploads follow frontend behavior and request server-side encryption by default
  formData.append('encrypt', 'true');

  let progressBar: ProgressBar | null = null;

  if (showProgress) {
    progressBar = new ProgressBar('[:bar] :percent :etas', {
      complete: '█',
      incomplete: '░',
      width: 40,
      total: 1,
    });

    // Track bytes read from disk and update progress bar as fraction [0..1]
    let uploaded = 0;
    fileStream.on('data', (chunk: Buffer | string) => {
      const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      uploaded += len;
      if (progressBar) {
        const ratio = Math.min(1, uploaded / fileSize);
        progressBar.update(ratio);
      }
    });
  }

  // Use streaming upload endpoint. Do not force Content-Length so the request
  // can stream large files without buffering the whole body in memory.
  const headers = formData.getHeaders();
  // axios in Node needs the adapter to handle stream form-data; use api (axios instance)
  await api.post('/files/upload/stream', formData, {
    headers,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    // Do not set a timeout for potentially long uploads
    timeout: 0,
    // Allow axios to stream the form-data
    transitional: { forcedJSONParsing: false },
  });
}

// Ensure the directory at `dirPath` exists. Returns the `id` of the directory or null for root.
async function ensureFolderExists(api: any, dirPath: string): Promise<string | null> {
  // Normalize and split
  const normalized = path.posix.normalize(dirPath);
  if (normalized === '/' || normalized === '.' || normalized === '') return null;

  const segments = normalized.split('/').filter(Boolean);
  let currentPath = '';
  let parentId: string | null = null;

  for (const seg of segments) {
    currentPath = `${currentPath}/${seg}`;
    try {
      const resp = await api.get('/files', { params: { path: currentPath } });
      const items = resp.data as any[];
      const dir = items.find(i => i.type === 'DIRECTORY');
      if (dir) {
        parentId = dir.id;
        continue;
      }
      // Not found — create it
      const createResp = await api.post('/files/directory', { name: seg, parentId: parentId || null, path: currentPath });
      parentId = createResp.data.id;
    } catch (err: any) {
      // If a 409 or other error occurs, try to re-query; otherwise rethrow
      if (axios.isAxiosError(err) && err.response) {
        // Retry by querying again in case of race
        const retry = await api.get('/files', { params: { path: currentPath } });
        const items = retry.data as any[];
        const dir = items.find(i => i.type === 'DIRECTORY');
        if (dir) {
          parentId = dir.id;
          continue;
        }
      }
      throw err;
    }
  }

  return parentId;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
