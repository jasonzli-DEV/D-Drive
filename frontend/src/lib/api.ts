import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Only set Content-Type for non-FormData payloads. Let the browser
  // set the multipart boundary when sending FormData.
  const isFormData = config.data && typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (!isFormData) {
    if (!config.headers) config.headers = {} as any;
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json';
    }
  } else {
    // ensure multipart requests don't include a fixed Content-Type
    if (config.headers) delete config.headers['Content-Type'];
  }

  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // Avoid redirecting during the OAuth callback or if already on the login page
      const path = window.location.pathname || '';
      if (!path.startsWith('/auth') && path !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
