import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
    description?: string;
}

interface SelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

export const Select: React.FC<SelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select option...',
    label,
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {label && (
                <label className="block text-xs font-semibold text-neutral-500 uppercase mb-1.5 ml-1">
                    {label}
                </label>
            )}

            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-4 py-2.5 bg-neutral-50 border transition-all duration-200 text-sm rounded-xl hover:bg-white hover:shadow-md ${isOpen
                    ? 'border-primary-500 ring-2 ring-primary-500/10 bg-white shadow-md'
                    : 'border-neutral-200'
                    }`}
            >
                <span className={`block truncate ${!selectedOption ? 'text-neutral-400' : 'text-neutral-900 font-medium'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-primary-500' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white border border-neutral-100 rounded-2xl shadow-2xl py-2 animate-in fade-in zoom-in duration-200 origin-top overflow-hidden">
                    <div className="max-h-60 overflow-y-auto overflow-x-hidden">
                        {options.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-neutral-400 italic text-center">
                                No options available
                            </div>
                        ) : (
                            options.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option.value)}
                                    className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-primary-50 group ${option.value === value ? 'bg-primary-50/50 text-primary-700' : 'text-neutral-700'
                                        }`}
                                >
                                    <div className="flex flex-col items-start text-left">
                                        <span className={`block font-medium ${option.value === value ? 'text-primary-700' : 'text-neutral-900'}`}>
                                            {option.label}
                                        </span>
                                        {option.description && (
                                            <span className="block text-[10px] text-neutral-400 mt-0.5 group-hover:text-primary-400 transition-colors">
                                                {option.description}
                                            </span>
                                        )}
                                    </div>
                                    {option.value === value && (
                                        <Check className="w-4 h-4 text-primary-600" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
