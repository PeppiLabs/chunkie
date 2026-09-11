export interface ChatMessage {
    id: string;
    user_uuid: string;
    buddies_id: string;
    question_text: string;
    question_img: string | null;
    answer_text: string;
    is_assistant_msg: string;
    is_set_for_sms: string;
    created_at: string;
    updated_at: string;
}

export type ChunkingStrategy = 'day-wise' | 'message-wise' | 'message-count';

export interface ChunkingConfig {
    strategy: ChunkingStrategy;
    messageCount?: number;
}

export interface MessageChunk {
    id: string;
    messages: ChatMessage[];
    startDate: string;
    endDate: string;
    messageCount: number;
    metadata?: {
        user_uuid: string;
        buddies_id: string;
    };
}

export interface JsonFile {
    id: string;
    name: string;
    uploadedAt: string;
    messageCount: number;
    userCount: number;
}
