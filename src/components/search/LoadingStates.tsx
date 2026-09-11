import React, { useEffect, useState } from 'react';
import { Loader2, Search as SearchIcon, CheckCircle2 } from 'lucide-react';
import type { SearchStage } from '../../types/search.types';

interface LoadingStatesProps {
    stage: SearchStage;
    query?: string;
    resultsCount?: number;
}

export const LoadingStates: React.FC<LoadingStatesProps> = ({ stage, query, resultsCount }) => {
    const [dots, setDots] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
        }, 500);
        return () => clearInterval(interval);
    }, []);

    const stages = [
        { key: 'embedding', label: 'Generating embeddings', icon: Loader2 },
        { key: 'searching', label: 'Searching vector database', icon: SearchIcon },
        { key: 'found', label: `Found ${resultsCount || 0} results`, icon: CheckCircle2 },
        { key: 'ranking', label: 'Ranking and matching results', icon: Loader2 },
    ];

    const currentStageIndex = stages.findIndex((s) => s.key === stage);

    return (
        <div className="bg-white rounded-lg shadow-sm border border-primary-200 p-6">
            <div className="space-y-4">
                {/* Query Display */}
                {query && (
                    <div className="mb-6">
                        <p className="text-sm text-neutral-600 mb-1">Searching for:</p>
                        <p className="text-lg font-medium text-primary-700 italic">"{query}"</p>
                    </div>
                )}

                {/* Progress Stages */}
                <div className="space-y-3">
                    {stages.map((stageItem, index) => {
                        const Icon = stageItem.icon;
                        const isActive = index === currentStageIndex;
                        const isComplete = index < currentStageIndex;

                        return (
                            <div
                                key={stageItem.key}
                                className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${isActive
                                    ? 'bg-primary-50 border border-primary-200'
                                    : isComplete
                                        ? 'bg-green-50 border border-green-200'
                                        : 'bg-neutral-50 border border-neutral-200'
                                    }`}
                            >
                                <div className="flex-shrink-0">
                                    {isActive ? (
                                        <Icon className="w-5 h-5 text-primary-600 animate-spin" />
                                    ) : isComplete ? (
                                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                                    )}
                                </div>

                                <div className="flex-1">
                                    <p
                                        className={`text-sm font-medium ${isActive
                                            ? 'text-primary-700'
                                            : isComplete
                                                ? 'text-green-700'
                                                : 'text-neutral-500'
                                            }`}
                                    >
                                        {stageItem.label}
                                        {isActive && dots}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Progress Bar */}
                <div className="mt-6">
                    <div className="w-full bg-neutral-200 rounded-full h-2">
                        <div
                            className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                            style={{
                                width: `${((currentStageIndex + 1) / stages.length) * 100}%`,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
