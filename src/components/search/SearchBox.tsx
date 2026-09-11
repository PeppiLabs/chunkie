import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface SearchBoxProps {
    onSearch: (query: string) => void;
    isLoading?: boolean;
}

export const SearchBox: React.FC<SearchBoxProps> = ({ onSearch, isLoading = false }) => {
    const [query, setQuery] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim());
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <Card className="bg-gradient-to-r from-primary-50 to-white">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Enter a sample message to search for similar conversations..."
                        className="w-full px-6 py-4 pr-14 text-lg border-2 border-primary-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all resize-none"
                        rows={3}
                        disabled={isLoading}
                    />
                    <Search className="absolute right-4 top-4 w-6 h-6 text-primary-400" />
                </div>

                <div className="flex items-center justify-between">
                    <p className="text-sm text-neutral-600">
                        Press <kbd className="px-2 py-1 bg-neutral-100 rounded border border-neutral-300">Enter</kbd> to search
                    </p>

                    <Button
                        type="submit"
                        disabled={!query.trim() || isLoading}
                        className="min-w-[120px]"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Searching...
                            </>
                        ) : (
                            <>
                                <Search className="w-4 h-4 mr-2" />
                                Search
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </Card>
    );
};
