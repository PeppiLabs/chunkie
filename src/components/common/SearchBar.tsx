import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';

interface SearchBarProps {
    onSearch: (query: string) => void;
    totalResults?: number;
    disabled?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, disabled = false }) => {
    const [query, setQuery] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    const handleSearch = () => {
        if (query.trim() && !disabled) {
            onSearch(query.trim());
            setIsExpanded(true);
        }
    };

    const handleClear = () => {
        setQuery('');
        onSearch('');
        setIsExpanded(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !disabled) {
            handleSearch();
        }
    };

    return (
        <div className={`w-full max-w-2xl ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                    <Input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={disabled ? "Select a collection to search..." : "Search messages... (semantic search)"}
                        className="pr-10"
                        disabled={disabled}
                    />
                    <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
                </div>
                <Button onClick={handleSearch} disabled={!query.trim() || disabled}>
                    Search
                </Button>
                {isExpanded && (
                    <Button variant="outline" onClick={handleClear}>
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
};
