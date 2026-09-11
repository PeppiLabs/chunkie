import { api } from './api';

export interface Collection {
    name: string;
    points_count: number;
    chunking_strategy: string;
    description: string;
    vector_size: number;
}

export interface User {
    user_id: string;
    user_name: string;
}

export interface Message {
    id: string;
    user_uuid: string;
    user_name: string;
    question_text: string;
    answer_text: string;
    created_at: string;
    metadata: {
        memory_type: string;
        importance: number;
        emotion: number;
        is_raw_json?: boolean;
        date?: string;
        message_count?: number;
    };
}

export interface MessagesResponse {
    messages: Message[];
    total: number;
    collection: string;
    has_more: boolean;
}

export const collectionsService = {
    async listCollections(): Promise<Collection[]> {
        const response = await api.get<{ collections: Collection[] }>('/collections');
        return response.data.collections;
    },

    async getUsers(collectionName: string): Promise<User[]> {
        const response = await api.get<{ users: User[] }>(`/collections/${collectionName}/users`);
        return response.data.users;
    },

    async getMessages(
        collectionName: string,
        limit: number = 100,
        offset: number = 0,
        userUuid?: string
    ): Promise<MessagesResponse> {
        const params = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString(),
        });

        if (userUuid) {
            params.append('user_uuid', userUuid);
        }

        const response = await api.get<MessagesResponse>(
            `/collections/${collectionName}/messages?${params.toString()}`
        );
        return response.data;
    },
};
