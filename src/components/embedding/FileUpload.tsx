import React, { useCallback } from 'react';
import { Upload, FileJson } from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    selectedFile?: File;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, selectedFile }) => {
    const [isDragging, setIsDragging] = React.useState(false);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setIsDragging(false);

            const files = Array.from(e.dataTransfer.files);
            const jsonFile = files.find((file) => file.name.endsWith('.json'));

            if (jsonFile) {
                onFileSelect(jsonFile);
            }
        },
        [onFileSelect]
    );

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleFileInput = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file && file.name.endsWith('.json')) {
                onFileSelect(file);
            }
        },
        [onFileSelect]
    );

    return (
        <Card>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Upload JSON File</h3>

            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${isDragging
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-neutral-300 hover:border-primary-400'
                    }`}
            >
                <Upload className="w-12 h-12 mx-auto text-neutral-400 mb-4" />

                {selectedFile ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-center space-x-2 text-primary-600">
                            <FileJson className="w-5 h-5" />
                            <span className="font-medium">{selectedFile.name}</span>
                        </div>
                        <p className="text-sm text-neutral-600">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('file-input')?.click()}
                        >
                            Choose Different File
                        </Button>
                    </div>
                ) : (
                    <>
                        <p className="text-neutral-700 mb-2">
                            Drag and drop your JSON file here, or
                        </p>
                        <Button
                            variant="secondary"
                            onClick={() => document.getElementById('file-input')?.click()}
                        >
                            Browse Files
                        </Button>
                    </>
                )}

                <input
                    id="file-input"
                    type="file"
                    accept=".json"
                    onChange={handleFileInput}
                    className="hidden"
                />
            </div>

            <p className="text-xs text-neutral-500 mt-3">
                Supported format: JSON files containing chat history data
            </p>
        </Card>
    );
};
