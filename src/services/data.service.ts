import { api } from './api';
import type { ChatMessage, JsonFile } from '../types/chat.types';

export const dataService = {
    async uploadJsonFile(file: File): Promise<{ fileId: string; message: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await api.post('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return {
            fileId: response.data.file_id,
            message: response.data.message,
        };
    },

    async getMessages(): Promise<ChatMessage[]> {
        // For now, return mock data since backend endpoint doesn't exist yet
        // This will be replaced with actual API call
        return [];
    },

    async getJsonFiles(): Promise<JsonFile[]> {
        // Mock data - will be replaced with actual API
        return [];
    },
};
