import React from 'react';
import type { ChunkingConfig, ChunkingStrategy } from '../../types/chat.types';
import { Card } from '../common/Card';
import { Input } from '../common/Input';

interface ChunkingConfigProps {
    config: ChunkingConfig;
    onChange: (config: ChunkingConfig) => void;
}

export const ChunkingConfigComponent: React.FC<ChunkingConfigProps> = ({ config, onChange }) => {
    const handleStrategyChange = (strategy: ChunkingStrategy) => {
        onChange({
            strategy,
            messageCount: strategy === 'message-count' ? config.messageCount || 2 : undefined,
        });
    };

    const handleMessageCountChange = (count: number) => {
        onChange({
            ...config,
            messageCount: count,
        });
    };

    return (
        <Card>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Chunking Configuration</h3>

            <div className="space-y-4">
                {/* Day-wise option */}
                <label className="flex items-start space-x-3 cursor-pointer group">
                    <input
                        type="radio"
                        name="chunking-strategy"
                        value="day-wise"
                        checked={config.strategy === 'day-wise'}
                        onChange={() => handleStrategyChange('day-wise')}
                        className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                        <div className="font-medium text-neutral-900 group-hover:text-primary-600 transition-colors">
                            Day-wise Chunking
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                            Groups all messages from the same day into a single chunk. Best for daily conversation summaries.
                        </p>
                    </div>
                </label>

                {/* Message-wise option */}
                <label className="flex items-start space-x-3 cursor-pointer group">
                    <input
                        type="radio"
                        name="chunking-strategy"
                        value="message-wise"
                        checked={config.strategy === 'message-wise'}
                        onChange={() => handleStrategyChange('message-wise')}
                        className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                        <div className="font-medium text-neutral-900 group-hover:text-primary-600 transition-colors">
                            Message-wise Chunking
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                            Each message becomes its own chunk. Provides finest granularity for search.
                        </p>
                    </div>
                </label>

                {/* Message count option */}
                <label className="flex items-start space-x-3 cursor-pointer group">
                    <input
                        type="radio"
                        name="chunking-strategy"
                        value="message-count"
                        checked={config.strategy === 'message-count'}
                        onChange={() => handleStrategyChange('message-count')}
                        className="mt-1 w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1">
                        <div className="font-medium text-neutral-900 group-hover:text-primary-600 transition-colors">
                            Message Count Chunking
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">
                            Groups a specific number of messages into each chunk. Balances context and granularity.
                        </p>

                        {config.strategy === 'message-count' && (
                            <div className="mt-3">
                                <Input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={config.messageCount || 2}
                                    onChange={(e) => handleMessageCountChange(parseInt(e.target.value) || 2)}
                                    label="Messages per chunk"
                                    className="max-w-xs"
                                />
                            </div>
                        )}
                    </div>
                </label>
            </div>

            {/* Configuration Summary */}
            <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
                <h4 className="text-sm font-semibold text-primary-900 mb-2">Current Configuration</h4>
                <div className="text-sm text-primary-700">
                    <p>
                        <span className="font-medium">Strategy:</span>{' '}
                        {config.strategy === 'day-wise' && 'Day-wise'}
                        {config.strategy === 'message-wise' && 'Message-wise'}
                        {config.strategy === 'message-count' && `${config.messageCount} messages per chunk`}
                    </p>
                </div>
            </div>
        </Card>
    );
};
