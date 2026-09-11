import axios from 'axios';

// Overridable so the backend can live on any port or host. The default is
// 5050 rather than the original 5000: on macOS the AirPlay Receiver listens
// on 5000 by default, and the old value failed silently on every Mac.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor
api.interceptors.request.use(
    (config) => {
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor
api.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
    }
);
