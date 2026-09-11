import type { ChatMessage } from './chat.types';

export interface SearchResult {
    id: string;
    content: string;
    score: number;
    metadata: {
        user_uuid: string;
        buddies_id: string;
        date: string;
        chunkId: string;
        question?: string;
        answer?: string;
        memory_type?: string;
        importance_score?: number;
    };
    messages: ChatMessage[];
    highlightedContent?: string;
}

export interface SearchFilters {
    minScore?: number;
    startDate?: string;
    endDate?: string;
    buddiesId?: string;
}

export interface SearchRequest {
    query: string;
    collectionName: string;
    userUuid: string;
    limit?: number;
    filters?: SearchFilters;
}

export interface SearchResponse {
    results: SearchResult[];
    totalResults: number;
    searchTime: number;
    query: string;
}

export type SearchStage =
    | 'idle'
    | 'embedding'
    | 'searching'
    | 'found'
    | 'ranking'
    | 'complete'
    | 'error';
