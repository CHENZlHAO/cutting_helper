import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8765';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error?.response?.status, error?.message);
    return Promise.reject(error);
  }
);

export default client;
export { API_BASE };
