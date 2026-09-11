import type { ChunkingConfig } from './chat.types';

export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EmbeddingJob {
    id: string;
    fileId: string;
    status: EmbeddingStatus;
    progress: number;
    config: ChunkingConfig;
    totalChunks?: number;
    processedChunks?: number;
    createdAt: string;
    completedAt?: string;
    error?: string;
}

export interface EmbeddingRequest {
    fileId: string;
    config: ChunkingConfig;
}

export interface EmbeddingResponse {
    jobId: string;
    status: EmbeddingStatus;
    message: string;
}
