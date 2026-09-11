import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Calendar, User } from 'lucide-react';
import type { SearchResult } from '../../types/search.types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface ResultCardProps {
    result: SearchResult;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const scorePercentage = Math.round(result.score);
    const scoreColor =
        scorePercentage >= 80 ? 'bg-green-500' :
            scorePercentage >= 60 ? 'bg-primary-500' :
                scorePercentage >= 40 ? 'bg-yellow-500' :
                    'bg-orange-500';

    return (
        <Card hover className="transition-all">
            <div className="space-y-3">
                {/* Header with Score */}
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                            <div className="flex items-center space-x-2">
                                <div className="w-16 h-16 rounded-lg bg-neutral-100 flex items-center justify-center">
                                    <span className="text-2xl font-bold text-primary-600">
                                        {scorePercentage}%
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-neutral-500">Relevance Score</p>
                                    <div className="w-24 h-2 bg-neutral-200 rounded-full mt-1">
                                        <div
                                            className={`h-2 rounded-full ${scoreColor} transition-all`}
                                            style={{ width: `${scorePercentage}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="text-neutral-400 hover:text-primary-600 transition-colors"
                    >
                        {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                </div>

                {/* Content Preview */}
                <div>
                    <p className={`text-neutral-700 ${isExpanded ? '' : 'line-clamp-3'}`}>
                        {result.content}
                    </p>
                </div>

                {/* Metadata */}
                <div className="flex items-center space-x-4 text-xs text-neutral-500">
                    <div className="flex items-center space-x-1">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(result.metadata.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                        <User className="w-3 h-3" />
                        <span>User: {result.metadata.user_uuid.substring(0, 8)}...</span>
                    </div>
                    <span>Chunk: {result.metadata.chunkId.substring(0, 8)}...</span>
                </div>

                {/* Expanded View */}
                {isExpanded && result.messages.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">
                            Full Context ({result.messages.length} messages)
                        </h4>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {result.messages.map((msg) => (
                                <div key={msg.id} className="text-sm">
                                    {msg.question_text && (
                                        <div className="bg-primary-50 rounded-lg p-2 mb-1">
                                            <p className="text-primary-900">{msg.question_text}</p>
                                        </div>
                                    )}
                                    {msg.answer_text && (
                                        <div className="bg-neutral-50 rounded-lg p-2">
                                            <p className="text-neutral-700">{msg.answer_text}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions */}
                {!isExpanded && (
                    <div className="flex items-center space-x-2 pt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsExpanded(true)}
                        >
                            View Full Context
                        </Button>
                    </div>
                )}
            </div>
        </Card>
    );
};
