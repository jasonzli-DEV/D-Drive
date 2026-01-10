import axios, { AxiosInstance } from 'axios';
import { getConfig } from './config';

export function createApiClient(): AxiosInstance {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error('API key not configured. Run: d-drive config --key YOUR_API_KEY');
  }

  const client = axios.create({
    baseURL: config.apiUrl,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return client;
}
