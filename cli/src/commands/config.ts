import chalk from 'chalk';
import ora from 'ora';
import axios from 'axios';
import { getConfig, setConfig, getAllConfig } from '../config';

interface ConfigOptions {
  key?: string;
  url?: string;
  list?: boolean;
}

export async function configCommand(options: ConfigOptions) {
  if (options.list) {
    const config = getAllConfig();
    console.log(chalk.bold('Current Configuration:'));
    console.log(chalk.gray('────────────────────────────────'));
    console.log(`API Key: ${config.apiKey ? chalk.green('✓ Set') : chalk.red('✗ Not set')}`);
    console.log(`API URL: ${chalk.cyan(config.apiUrl || 'Not set')}`);
    return;
  }

  if (options.key) {
    const spinner = ora('Validating API key...').start();
    
    try {
      // Normalize and test the API key by calling the /auth/me endpoint
      const config = getConfig();
      const apiUrl = options.url || config.apiUrl || 'http://localhost:5000/api';

      // Accept keys entered with or without the `dd_` prefix, and strip any accidental "Bearer " prefix
      const rawKey = options.key.replace(/^Bearer\s+/i, '').trim();
      const normalizedKey = rawKey.startsWith('dd_') ? rawKey : `dd_${rawKey}`;

      const response = await axios.get(`${apiUrl}/auth/me`, {
        headers: {
          Authorization: `Bearer ${normalizedKey}`,
        },
        timeout: 10000,
      });

      if (response.status === 200 && response.data) {
        setConfig('apiKey', normalizedKey);
        if (options.url) {
          setConfig('apiUrl', options.url);
        }
        spinner.succeed(chalk.green(`✓ API key validated and saved! Authenticated as: ${response.data.user?.discordUsername || 'User'}`));
      } else {
        spinner.fail(chalk.red('✗ Invalid API key'));
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail(chalk.red('✗ Failed to validate API key'));
      if (error.response?.status === 401) {
        console.error(chalk.red('Invalid authentication. Please check your API key.'));
      } else if (error.code === 'ECONNREFUSED') {
        console.error(chalk.red('Cannot connect to API server. Is it running?'));
        console.error(chalk.gray(`Tried connecting to: ${options.url || getConfig().apiUrl}`));
      } else {
        console.error(chalk.red(error.message));
      }
      process.exit(1);
    }
  } else if (options.url) {
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
