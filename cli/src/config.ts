import Conf from 'conf';

interface Config {
  apiKey?: string;
  apiUrl?: string;
}

const config = new Conf<Config>({
  projectName: 'd-drive',
  defaults: {
    apiUrl: 'http://localhost:5000/api',
  },
});

export function getConfig(): Config {
  return {
    apiKey: config.get('apiKey'),
    apiUrl: config.get('apiUrl'),
  };
}

export function setConfig(key: keyof Config, value: string): void {
  config.set(key, value);
}

export function deleteConfig(key: keyof Config): void {
  config.delete(key);
}

export function getAllConfig(): Config {
  return config.store;
}
