import React from 'react';
import { Database } from 'lucide-react';

interface HeaderProps {
    children?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ children }) => {
    return (
        <header className="bg-white border-b border-neutral-200">
            <div className="px-6 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-shrink-0 w-64">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary-600 to-primary-700 rounded flex items-center justify-center">
                        <Database className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="text-lg font-bold text-neutral-900">RAG Search</h1>
                </div>

                <div className="flex-1 flex justify-center px-8">
                    {children}
                </div>

                <div className="w-64 flex-shrink-0"></div>
            </div>
        </header>
    );
};
