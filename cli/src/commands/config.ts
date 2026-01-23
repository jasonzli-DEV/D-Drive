import chalk from 'chalk';
import { getConfig, setConfig, getAllConfig } from '../config';

interface ConfigOptions {
  key?: string;
  url?: string;
  list?: boolean;
}

export function configCommand(options: ConfigOptions) {
  if (options.list) {
    const config = getAllConfig();
    console.log(chalk.bold('Current Configuration:'));
    console.log(chalk.gray('────────────────────────────────'));
    console.log(`API Key: ${config.apiKey ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
    console.log(`API URL: ${chalk.cyan(config.apiUrl || 'Not set')}`);
    return;
  }

  if (options.key) {
    setConfig('apiKey', options.key);
    console.log(chalk.green('✓ API key configured successfully'));
  }

  if (options.url) {
    setConfig('apiUrl', options.url);
    console.log(chalk.green('✓ API URL configured successfully'));
  }

  if (!options.key && !options.url) {
    console.log(chalk.yellow('No configuration options provided.'));
    console.log('Use: d-drive config --key YOUR_API_KEY');
    console.log('     d-drive config --url https://api.example.com');
    console.log('     d-drive config --list');
  }
}
