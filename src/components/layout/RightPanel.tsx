import React, { useState } from 'react';
import type { Message } from '../../services/collections.service';
import { X, Calendar, User as UserIcon } from 'lucide-react';

interface RightPanelProps {
    messages: Message[] | null;
    userName: string;
    date: string;
    onClose: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({ messages, userName, date, onClose }) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'json' | 'metadata'>('chat');

    if (!messages || messages.length === 0) {
        return null;
    }

    // Parse day-wise chunk_text into individual Q&A pairs
    const parseDaywiseChat = (chunkText: string): Array<{ question: string, answer: string }> => {
        if (!chunkText) return [];
        const pairs: Array<{ question: string, answer: string }> = [];

        // Split by "Q:" (case insensitive)
        const segments = chunkText.split(/Q:\s*/i);

        segments.forEach(segment => {
            if (!segment.trim()) return;

            // Split each segment by "A:" (case insensitive)
            const parts = segment.split(/A:\s*/i);
            if (parts.length >= 2) {
                const question = parts[0].trim();
                const answer = parts[1].trim();
                pairs.push({ question, answer });
            } else if (parts.length === 1 && parts[0].trim()) {
                // Just in case it's only a single part
                pairs.push({ question: 'Instruction/Observation', answer: parts[0].trim() });
            }
        });

        return pairs;
    };

    // Robust check for consolidated chunks
    const firstMsg = messages[0];
    const isDaywiseChunk = (firstMsg.metadata.memory_type === 'day-wise-chunk') ||
        (firstMsg.answer_text && firstMsg.answer_text.includes('Q:'));

    const needsParsing = messages.length === 1 && isDaywiseChunk;

    // Parse messages for display
    const displayMessages = needsParsing
        ? parseDaywiseChat(firstMsg.answer_text).map((pair, idx) => ({
            id: `${firstMsg.id}_${idx}`,
            user_uuid: firstMsg.user_uuid,
            user_name: firstMsg.user_name,
            question_text: pair.question,
            answer_text: pair.answer,
            created_at: firstMsg.created_at,
            metadata: firstMsg.metadata
        }))
        : messages;

    const metadataSource = displayMessages[0];

    return (
        <div className="w-80 bg-white border-l border-neutral-200 flex flex-col h-full shrink-0 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 p-3 border-b border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-sm font-semibold text-neutral-900">
                        {needsParsing ? 'Daily Summary' : 'Chat Detail'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-neutral-700 p-1 rounded-md hover:bg-neutral-200 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex flex-col space-y-0.5">
                    <div className="flex items-center space-x-1.5 text-xs text-neutral-600">
                        <UserIcon className="w-3.5 h-3.5 text-primary-500" />
                        <span className="font-medium text-neutral-800">{userName}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 text-xs text-neutral-600">
                        <Calendar className="w-3.5 h-3.5 text-primary-500" />
                        <span>{date}</span>
                    </div>
                </div>
                <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest mt-2">
                    {displayMessages.length} {displayMessages.length === 1 ? 'Exchange' : 'Exchanges'}
                </p>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 flex border-b border-neutral-200 bg-white">
                <button
                    onClick={() => setActiveTab('chat')}
                    className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'chat'
                        ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/30'
                        : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                >
                    Chat
                </button>
                <button
                    onClick={() => setActiveTab('json')}
                    className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'json'
                        ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/30'
                        : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                >
                    JSON
                </button>
                <button
                    onClick={() => setActiveTab('metadata')}
                    className={`flex-1 px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'metadata'
                        ? 'text-primary-600 border-b-2 border-primary-600 bg-primary-50/30'
                        : 'text-neutral-400 hover:text-neutral-600'
                        }`}
                >
                    Meta
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
                {activeTab === 'chat' && (
                    <div className="space-y-4">
                        {displayMessages.map((msg, idx) => (
                            <div key={idx} className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                {/* User Message */}
                                <div className="flex justify-end">
                                    <div className="bg-primary-600 text-white rounded-xl rounded-tr-none px-3 py-1.5 max-w-[90%] shadow-sm">
                                        <p className="text-[13px] leading-snug">{msg.question_text}</p>
                                    </div>
                                </div>

                                {/* AI Message */}
                                <div className="flex justify-start">
                                    <div className="bg-neutral-100 border border-neutral-200 text-neutral-800 rounded-xl rounded-tl-none px-3 py-1.5 max-w-[90%] shadow-sm">
                                        <p className="text-[13px] leading-snug whitespace-pre-wrap">{msg.answer_text}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'json' && (
                    <div className="rounded-xl overflow-hidden border border-neutral-200">
                        <pre className="text-[11px] leading-relaxed bg-neutral-900 text-emerald-400 p-4 overflow-x-auto font-mono">
                            {JSON.stringify(messages, null, 2)}
                        </pre>
                    </div>
                )}

                {activeTab === 'metadata' && (
                    <div className="space-y-6">
                        <section>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Identities</label>
                            <div className="mt-2 p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                                <p className="text-sm text-neutral-900 font-semibold">{metadataSource.user_name}</p>
                                <p className="text-[11px] text-neutral-400 font-mono mt-1 truncate">{metadataSource.user_uuid}</p>
                            </div>
                        </section>

                        <section>
                            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Context</label>
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                                    <p className="text-[10px] text-neutral-400 uppercase">Memory</p>
                                    <p className="text-xs font-bold text-neutral-700 mt-1">{metadataSource.metadata.memory_type}</p>
                                </div>
                                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                                    <p className="text-[10px] text-neutral-400 uppercase">Importance</p>
                                    <p className="text-xs font-bold text-neutral-700 mt-1">{(metadataSource.metadata.importance * 100).toFixed(0)}%</p>
                                </div>
                            </div>
                        </section>

                        {metadataSource.metadata.message_count !== undefined && (
                            <section>
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Statistics</label>
                                <div className="mt-2 p-3 bg-neutral-50 rounded-lg border border-neutral-100">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-neutral-600">Total Day Count</span>
                                        <span className="text-sm font-bold text-primary-600">{metadataSource.metadata.message_count}</span>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom White Block - acts as a footer to prevent "sticking to ground" */}
            <div className="flex-shrink-0 h-20 bg-white border-t border-neutral-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"></div>
        </div>
    );
};
