import { api } from './api';

export interface JsonFile {
    name: string;
    path: string;
    size_mb: number;
    record_count: number;
    type: 'original' | 'processed';
    parent_file?: string | null;
}

export interface EmbeddingRequest {
    file_path: string;
    collection_name: string;
    chunking_strategy: string;
}

export interface OriginalMessage {
    user_id: string;
    user_name: string;
    date: string;
    chat_history: Array<{
        question: string;
        answer: string;
        timestamp: string;
        memory_type: string;
        importance: number;
        emotion?: number;
    }>;
}

export const filesService = {
    async listFiles() {
        const response = await api.get<{ files: JsonFile[] }>('/files/list');
        return response.data;
    },

    async getFileContent(filePath: string) {
        // Updated to use the 'path' query parameter to support nested structures
        const response = await api.get<{ filename: string; content: any[]; total_records: number }>(
            '/files/content',
            { params: { path: filePath } }
        );
        return response.data;
    },

    async startEmbedding(filename: string, collectionName: string, chunkingStrategy: string, messageCount?: number) {
        const response = await api.post<{ job_id: string; message: string }>('/embed/process', {
            file_path: filename,
            collection_name: collectionName,
            chunking_strategy: chunkingStrategy,
            message_count: messageCount
        });
        return response.data;
    },

    async getEmbeddingStatus(jobId: string) {
        const response = await api.get<{
            job_id: string;
            status: string;
            progress: number;
            total_records: number;
            processed: number;
            collection_name?: string;
            error?: string;
        }>(`/embed/status/${jobId}`);
        return response.data;
    },
};
