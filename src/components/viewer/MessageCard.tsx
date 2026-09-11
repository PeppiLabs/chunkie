import React, { useState } from 'react';
import { ChevronDown, ChevronUp, User, Bot } from 'lucide-react';
import type { ChatMessage } from '../../types/chat.types';
import { Card } from '../common/Card';

interface MessageCardProps {
    messages: ChatMessage[];
    onClick?: () => void;
}

export const MessageCard: React.FC<MessageCardProps> = ({ messages, onClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const firstMessage = messages[0];
    const messageCount = messages.length;
    const date = new Date(firstMessage.created_at).toLocaleDateString();

    const handleClick = () => {
        setIsExpanded(!isExpanded);
        onClick?.();
    };

    return (
        <Card hover className="cursor-pointer" onClick={handleClick}>
            {/* Compact View */}
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                        <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-1 rounded">
                            {messageCount} message{messageCount > 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-neutral-500">{date}</span>
                    </div>

                    <p className="text-sm text-neutral-700 line-clamp-2">
                        {firstMessage.question_text || firstMessage.answer_text}
                    </p>

                    <div className="flex items-center space-x-4 mt-3 text-xs text-neutral-500">
                        <span>User: {firstMessage.user_uuid.substring(0, 8)}...</span>
                        <span>Buddy: {firstMessage.buddies_id}</span>
                    </div>
                </div>

                <button className="ml-4 text-neutral-400 hover:text-primary-600 transition-colors">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
            </div>

            {/* Expanded Chat View */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-neutral-200 space-y-3 max-h-96 overflow-y-auto">
                    {messages.map((msg) => (
                        <div key={msg.id}>
                            {/* User Message */}
                            {msg.question_text && (
                                <div className="flex items-start space-x-2 justify-end mb-2">
                                    <div className="bg-primary-600 text-white rounded-lg px-4 py-2 max-w-[80%]">
                                        <p className="text-sm">{msg.question_text}</p>
                                        <span className="text-xs opacity-75 mt-1 block">
                                            {new Date(msg.created_at).toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <User className="w-6 h-6 text-primary-600 flex-shrink-0" />
                                </div>
                            )}

                            {/* AI Message */}
                            {msg.answer_text && (
                                <div className="flex items-start space-x-2 mb-2">
                                    <Bot className="w-6 h-6 text-neutral-600 flex-shrink-0" />
                                    <div className="bg-white border border-neutral-200 rounded-lg px-4 py-2 max-w-[80%]">
                                        <p className="text-sm text-neutral-700">{msg.answer_text}</p>
                                        <span className="text-xs text-neutral-500 mt-1 block">
                                            {new Date(msg.updated_at).toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};
