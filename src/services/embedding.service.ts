import type { EmbeddingRequest, EmbeddingResponse, EmbeddingJob } from '../types/embedding.types';

export const embeddingService = {
    async generateEmbeddings(_request: EmbeddingRequest): Promise<EmbeddingResponse> {
        // This will be implemented when backend endpoint is ready
        // For now, return mock response
        return {
            jobId: 'mock-job-' + Date.now(),
            status: 'pending',
            message: 'Embedding generation started',
        };
    },

    async getEmbeddingStatus(jobId: string): Promise<EmbeddingJob> {
        // Mock implementation
        return {
            id: jobId,
            fileId: 'mock-file',
            status: 'completed',
            progress: 100,
            config: { strategy: 'day-wise' },
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
        };
    },
};
