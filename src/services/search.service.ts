import { api } from './api';
import type { SearchRequest, SearchResponse } from '../types/search.types';

export const searchService = {
    async semanticSearch(request: SearchRequest): Promise<SearchResponse> {
        const response = await api.post('/search', {
            query: request.query,
            collection_name: request.collectionName,
            user_uuid: request.userUuid,
            limit: Math.min(request.limit || 10, 20),
            // The original default of 0.5 dropped most genuine matches: with
            // this model a clearly relevant record scores around 0.4 to 0.55,
            // so a 0.5 floor left one result where there should be five.
            // 0.25 keeps unrelated records out and lets the ranking do its job.
            score_threshold: request.filters?.minScore ?? 0.25,
        });

        // Backend returns: { query, count, results: [{ score, question, answer, timestamp, ... }] }
        return {
            results: response.data.results.map((result: any) => ({
                id: result.timestamp || String(Date.now()),
                content: result.answer || result.question,
                score: result.score * 100,
                metadata: {
                    user_uuid: result.user_id || '',
                    buddies_id: result.user_name || 'User',
                    date: result.timestamp || new Date().toISOString(),
                    chunkId: result.timestamp || '',
                    question: result.question,
                    answer: result.answer,
                    memory_type: result.memory_type,
                    importance_score: result.importance_score
                },
                messages: [result],
            })),
            totalResults: response.data.count,
            searchTime: 0,
            query: response.data.query,
        };
    },
};
