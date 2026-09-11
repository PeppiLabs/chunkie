import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
    hover?: boolean;
    onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', hover = false, onClick }) => {
    return (
        <div
            className={`bg-white rounded-lg shadow-sm border border-neutral-200 p-6 ${hover ? 'hover:shadow-md transition-shadow cursor-pointer' : ''
                } ${className}`}
            onClick={onClick}
        >
            {children}
        </div>
    );
};
