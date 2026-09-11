import React from 'react';
import type { Message } from '../../services/collections.service';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Calendar, MessageCircle, Loader2 } from 'lucide-react';

interface MessagesByDay {
    user_name: string;
    user_uuid: string;
    date: string;
    messages: Message[];
    totalMessages: number;
    groupId: string;
}

interface MessageGridProps {
    messages: Message[];
    onMessageClick: (messages: Message[], user: string, date: string) => void;
    onLoadMore?: () => void;
    loading?: boolean;
    hasMore?: boolean;
    total?: number;
    isSearchMode?: boolean;
    selectedId?: string | null;
}

/**
 * Internal function to group messages for the grid view.
 * For daily chunks, we bypass grouping and treat each chunk as a unique card.
 */
const groupMessagesByDay = (messages: Message[], isSearchMode: boolean): MessagesByDay[] => {
    const groups = new Map<string, MessagesByDay>();

    messages.forEach((message) => {
        // Recognition logic for consolidated daily records
        const isDailyChunk =
            message.metadata.memory_type === 'day-wise-chunk' ||
            !!message.metadata.message_count ||
            (message.question_text && message.question_text.includes('Summary'));

        let dateDisplay = message.created_at || 'No Date';
        // Clean up ISO or space-separated dates
        if (dateDisplay.includes('T')) dateDisplay = dateDisplay.split('T')[0];
        if (dateDisplay.includes(' ')) dateDisplay = dateDisplay.split(' ')[0];

        /**
         * KEY LOGIC: For 'day-wise-chunks', use the message.id as the unique key.
         * This prevents 31 daily chunks from being grouped into one card.
         */
        const key = isDailyChunk ? message.id : `${message.user_uuid}_${dateDisplay}`;

        if (!groups.has(key)) {
            groups.set(key, {
                user_name: message.user_name || 'User',
                user_uuid: message.user_uuid || 'unknown',
                date: dateDisplay,
                messages: [],
                totalMessages: isDailyChunk ? (message.metadata.message_count || 1) : 0,
                groupId: key
            });
        }

        const group = groups.get(key)!;
        group.messages.push(message);
        if (!isDailyChunk) {
            group.totalMessages = group.messages.length;
        }
    });

    // Return as array. Soft by date ONLY if not in search mode.
    const results = Array.from(groups.values());

    if (!isSearchMode) {
        return results.sort((a, b) => {
            try {
                const dateA = new Date(a.messages[0].created_at).getTime();
                const dateB = new Date(b.messages[0].created_at).getTime();
                return dateA - dateB;
            } catch { return 0; }
        });
    }

    return results;
};

/**
 * MessageGrid Component
 * Displays messages or grouped daily cards.
 */
export const MessageGrid: React.FC<MessageGridProps> = ({
    messages,
    onMessageClick,
    onLoadMore,
    loading,
    hasMore,
    total,
    isSearchMode = false,
    selectedId = null
}) => {
    // Initial loading state
    if (loading && messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12">
                <Loader2 className="w-10 h-10 animate-spin text-primary-600 mb-4 opacity-70" />
                <p className="text-neutral-500 font-medium animate-pulse">Initializing data stream...</p>
            </div>
        );
    }

    // Empty state
    if (!messages || messages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-neutral-400">
                <MessageCircle className="w-16 h-16 mb-4 opacity-10" />
                <p className="font-medium">The workbench is empty.</p>
                <p className="text-sm opacity-60">Select a source or collection to begin.</p>
            </div>
        );
    }

    // Process grouping
    const grouped = groupMessagesByDay(messages, isSearchMode);
    console.log('[MessageGrid] Rendering grouped items:', grouped.length);

    return (
        <div className="p-4 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {grouped.map((group, idx) => {
                    const isSelected = selectedId === group.groupId;

                    return (
                        <Card
                            key={`${group.groupId}_${idx}`}
                            onClick={() => onMessageClick(group.messages, group.user_name, group.date)}
                            className={`cursor-pointer h-72 flex flex-col transition-all duration-300 border-none shadow-md hover:shadow-xl ring-1 rounded-2xl overflow-hidden group/card ${isSelected ? 'ring-primary-600 ring-2 bg-gradient-to-br from-primary-50/50 to-white' : 'ring-neutral-200 bg-white'
                                }`}
                        >
                            {/* Card Header */}
                            <div className="px-4 py-3 border-b border-neutral-100 flex justify-between items-center bg-white">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-[10px] uppercase shadow-inner">
                                        {group.user_name.charAt(0)}
                                    </div>
                                    <div className="truncate max-w-[100px]">
                                        <h3 className="font-bold text-neutral-900 truncate text-[11px]">{group.user_name}</h3>
                                        <p className="text-[9px] text-neutral-400 font-mono tracking-tighter opacity-70">UID: {group.user_uuid.slice(0, 8)}</p>
                                    </div>
                                </div>
                                <div className="text-[10px] text-neutral-500 font-bold flex items-center bg-neutral-50 px-2 py-1 rounded-md shadow-sm">
                                    <Calendar className="w-3 h-3 mr-1 text-primary-500" />
                                    {group.date}
                                </div>
                            </div>

                            {/* Card Content - Previews */}
                            {/* Card Content - Previews */}
                            <div className="flex-1 p-4 space-y-3 overflow-hidden relative">
                                {group.messages.slice(0, 2).map((m, midx) => {
                                    // Robust preview extraction
                                    const isSummary = m.metadata.memory_type === 'day-wise-chunk' || m.question_text.includes('Summary');
                                    let q = m.question_text;
                                    let a = m.answer_text;

                                    if (isSummary) {
                                        // Parse multiple Q/A pairs for the "trail" effect
                                        const pairs: { q: string, a: string }[] = [];
                                        // Split by double newlines or "Q:" markers
                                        const blocks = (a || '').split(/(?=Q:)/i);

                                        for (const block of blocks) {
                                            const qMatch = block.match(/Q:\s*(.+?)(?:\n|$)/i);
                                            const aMatch = block.match(/A:\s*(.+?)(?:\n|$)/s);

                                            if (qMatch && aMatch) {
                                                pairs.push({
                                                    q: qMatch[1].trim(),
                                                    a: aMatch[1].trim()
                                                });
                                            }
                                        }

                                        // Fallback if parsing fails but we have content
                                        if (pairs.length === 0 && a) {
                                            pairs.push({ q: q || 'Summary', a: a });
                                        }

                                        // Render up to 3 pairs for the "trail" effect
                                        return (
                                            <React.Fragment key={midx}>
                                                {pairs.slice(0, 3).map((pair, pIdx) => (
                                                    <div key={`${midx}_${pIdx}`} className="space-y-1.5 group/msg">
                                                        {/* User Bubble */}
                                                        <div className="flex justify-end">
                                                            <div className="bg-primary-600 text-white text-[11px] font-medium px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm transform transition-transform group-hover/msg:-translate-x-1">
                                                                <p className="line-clamp-2 italic opacity-95">{pair.q}</p>
                                                            </div>
                                                        </div>
                                                        {/* AI Bubble */}
                                                        <div className="flex justify-start">
                                                            <div className="bg-neutral-50 border border-neutral-200 text-neutral-800 text-[11px] px-3 py-2 rounded-2xl rounded-tl-none max-w-[85%] shadow-sm transform transition-transform group-hover/msg:translate-x-1">
                                                                <p className="line-clamp-3 leading-relaxed">{pair.a}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </React.Fragment>
                                        );
                                    }

                                    // Standard rendering for non-summary messages
                                    if (m.answer_text && m.answer_text.includes('Q:')) {
                                        // Clean up legacy format if needed
                                        const cleanLines = m.answer_text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                                        const qLine = cleanLines.find(l => l.toUpperCase().startsWith('Q:'));
                                        const aLine = cleanLines.find(l => l.toUpperCase().startsWith('A:'));
                                        if (qLine) q = qLine.replace(/^Q:\s*/i, '').trim();
                                        if (aLine) a = aLine.replace(/^A:\s*/i, '').trim();
                                    }

                                    return (
                                        <div key={midx} className="space-y-1.5 group/msg">
                                            {/* User Bubble */}
                                            <div className="flex justify-end">
                                                <div className="bg-primary-600 text-white text-[11px] font-medium px-3 py-2 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm transform transition-transform group-hover/msg:-translate-x-1">
                                                    <p className="line-clamp-2 italic opacity-95">{q}</p>
                                                </div>
                                            </div>
                                            {/* AI Bubble */}
                                            <div className="flex justify-start">
                                                <div className="bg-neutral-50 border border-neutral-200 text-neutral-800 text-[11px] px-3 py-2 rounded-2xl rounded-tl-none max-w-[85%] shadow-sm transform transition-transform group-hover/msg:translate-x-1">
                                                    <p className="line-clamp-3 leading-relaxed">{a || 'Detail processing...'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* Subtle overlap fade */}
                                <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                            </div>

                            {/* Card Footer */}
                            <div className="p-3 bg-neutral-50/50 border-t border-neutral-100 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-[9px] font-black text-neutral-400 uppercase tracking-widest">
                                    <MessageCircle className="w-3 h-3 text-primary-400" />
                                    <span>{group.totalMessages} Exch.</span>
                                </div>
                                <div className="text-[9px] font-black text-primary-600 uppercase tracking-widest flex items-center group-hover/card:translate-x-1 transition-transform">
                                    Detailed Audit <span className="ml-1 opacity-60">→</span>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </div>

            {hasMore && (
                <div className="mt-12 mb-8 flex flex-col items-center">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4">
                        Analysis complete: {messages.length} / {total} records
                    </p>
                    <Button
                        onClick={onLoadMore}
                        disabled={loading}
                        variant="outline"
                        size="lg"
                        className="px-12 rounded-full border-neutral-300 hover:border-primary-500 hover:text-primary-600 transition-colors shadow-sm"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Fetch More Records'}
                    </Button>
                </div>
            )}
        </div>
    );
};
