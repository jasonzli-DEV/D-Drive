import chalk from 'chalk';
import ora from 'ora';
import { createApiClient } from '../api';

interface ListOptions {
  long?: boolean;
}

export async function listCommand(remotePath: string = '/', options: ListOptions) {
  const spinner = ora('Fetching files...').start();

  try {
    const api = createApiClient();
    
    // If path is root, don't send parentId (backend returns root-level files)
    // Otherwise, need to find the folder by path first
    let params: any = {};
    
    if (remotePath && remotePath !== '/') {
      // First, try to find the folder by path
      const allFilesRes = await api.get('/files');
      const targetFolder = findFolderByPath(allFilesRes.data, remotePath);
      
      if (targetFolder) {
        params.parentId = targetFolder.id;
      } else {
        spinner.fail(chalk.red(`Folder not found: ${remotePath}`));
        process.exit(1);
      }
    }
    
    const response = await api.get('/files', { params });

    const files = response.data;
    spinner.stop();

    if (files.length === 0) {
      console.log(chalk.yellow('No files found'));
      return;
    }

    console.log(chalk.bold(`\nFiles in ${remotePath}:`));
    console.log(chalk.gray('────────────────────────────────────────────────────'));

    if (options.long) {
      // Long format
      for (const file of files) {
        const icon = file.type === 'DIRECTORY' ? '📁' : '📄';
        const size = file.type === 'FILE' ? formatFileSize(Number(file.size)) : '-';
        const date = new Date(file.updatedAt).toLocaleString();
        
        console.log(
          `${icon} ${chalk.cyan(file.name.padEnd(30))} ${size.padEnd(10)} ${chalk.gray(date)}`
        );
      }
    } else {
      // Simple format
      for (const file of files) {
        const icon = file.type === 'DIRECTORY' ? '📁' : '📄';
        console.log(`${icon} ${chalk.cyan(file.name)}`);
      }
    }

    console.log(chalk.gray('────────────────────────────────────────────────────'));
    console.log(chalk.gray(`Total: ${files.length} items`));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to list files'));
    console.error(chalk.red(error.response?.data?.error || error.message));
    process.exit(1);
  }
}

function findFolderByPath(files: any[], targetPath: string): any | null {
  // Build full path for each file and match against target
  const normalizedTarget = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
  
  for (const file of files) {
    if (file.type === 'DIRECTORY' && file.path === normalizedTarget) {
      return file;
    }
  }
  
  // Fallback: try matching by name only (for root-level folders)
  const pathParts = targetPath.split('/').filter(p => p);
  if (pathParts.length === 1) {
    for (const file of files) {
      if (file.type === 'DIRECTORY' && file.name === pathParts[0]) {
        return file;
      }
    }
  }
  
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
