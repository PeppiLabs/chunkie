import React from 'react';
import { Settings, Search, Eye } from 'lucide-react';

type TabType = 'embedding' | 'viewer' | 'search';

interface SidebarProps {
    activeTab: TabType;
    onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'embedding' as TabType, label: 'Embedding Config', icon: Settings },
        { id: 'viewer' as TabType, label: 'Data Viewer', icon: Eye },
        { id: 'search' as TabType, label: 'Search & Retrieval', icon: Search },
    ];

    return (
        <aside className="w-64 bg-white border-r border-neutral-200 min-h-screen">
            <nav className="p-4 space-y-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${isActive
                                ? 'bg-primary-600 text-white shadow-md'
                                : 'text-neutral-700 hover:bg-neutral-100'
                                }`}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
};
