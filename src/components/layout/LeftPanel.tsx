import React, { useState, useEffect } from 'react';
import { collectionsService, type Collection, type User } from '../../services/collections.service';
import { filesService, type JsonFile } from '../../services/files.service';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Loader2, Database, FileJson, Settings, Users, FileText, CheckCircle2 } from 'lucide-react';
import { Select } from '../common/Select';

interface LeftPanelProps {
    onCollectionSelect: (collectionName: string, userFilter?: string) => void;
    onFileSelect: (filename: string) => void;
    onEmbeddingStart: (jobId: string) => void;
    currentCollection: string;
    currentFile?: string;
    /** Bump to make the panel reload its file and collection lists. */
    refreshToken?: number;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({
    onCollectionSelect,
    onFileSelect,
    onEmbeddingStart,
    currentCollection,
    currentFile,
    refreshToken = 0
}) => {
    const [mode, setMode] = useState<'existing' | 'new'>('existing');
    const [collections, setCollections] = useState<Collection[]>([]);
    const [files, setFiles] = useState<JsonFile[]>([]);
    const [users, setUsers] = useState<User[]>([]);

    // UI Local State - store path for source selection
    const [selectedSourcePath, setSelectedSourcePath] = useState<string>('');
    const [selectedCollection, setSelectedCollection] = useState<string>('');
    const [selectedUser, setSelectedUser] = useState<string>('');

    // New Embedding state
    const [collectionName, setCollectionName] = useState<string>('');
    const [chunkingStrategy, setChunkingStrategy] = useState<'day-wise' | 'message-wise' | 'message-count'>('day-wise');
    const [messageCount, setMessageCount] = useState<number>(3);
    const [loading, setLoading] = useState(false);

    // Runs on mount and again whenever the app signals that the backend has
    // new data, such as when an embedding job finishes. Without the second
    // trigger a freshly built collection never appeared in the dropdown until
    // the page was reloaded.
    useEffect(() => {
        loadCollections();
        loadFiles();
    }, [refreshToken]);

    // Follow the collection the app is showing, so the user filter appears
    // right after a job redirects to its new collection.
    useEffect(() => {
        if (currentCollection && currentCollection !== selectedCollection) {
            setSelectedCollection(currentCollection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentCollection]);

    useEffect(() => {
        if (selectedCollection) {
            loadUsers(selectedCollection);
        }
    }, [selectedCollection]);

    // Update selectedSourcePath when currentFile changes (if it's an original)
    useEffect(() => {
        if (currentFile) {
            const file = files.find(f => f.path === currentFile);
            if (file && file.type === 'original') {
                setSelectedSourcePath(currentFile);
            } else if (file && file.type === 'processed' && file.parent_file) {
                // If it's a chunk, find its parent original
                const parent = files.find(f => f.name === file.parent_file);
                if (parent) setSelectedSourcePath(parent.path);
            }
        }
    }, [currentFile, files]);

    const loadCollections = async () => {
        try {
            const cols = await collectionsService.listCollections();
            setCollections(cols);
            setSelectedCollection(prev => (cols.some(c => c.name === prev) ? prev : ''));
        } catch (error) {
            console.error('Failed to load collections:', error);
        }
    };

    const loadUsers = async (collectionName: string) => {
        try {
            const usersList = await collectionsService.getUsers(collectionName);
            setUsers(usersList);
            setSelectedUser('');
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    };

    const loadFiles = async () => {
        try {
            const response = await filesService.listFiles();
            setFiles(response.files);
        } catch (error) {
            console.error('Failed to load files:', error);
        }
    };

    const handleLoadFile = () => {
        if (selectedSourcePath) {
            onFileSelect(selectedSourcePath);
        }
    };

    const handleChunkSelect = async (chunkPath: string) => {
        // First, ensure the parent source file is loaded
        if (selectedSourcePath) {
            await onFileSelect(selectedSourcePath);
            // Small delay to ensure source is loaded first
            setTimeout(() => {
                onFileSelect(chunkPath);
            }, 100);
        } else {
            // If no source selected, just load the chunk
            onFileSelect(chunkPath);
        }
    };

    const handleLoadCollection = () => {
        if (selectedCollection) {
            onCollectionSelect(selectedCollection, selectedUser || undefined);
        }
    };

    const handleUserChange = (userId: string) => {
        setSelectedUser(userId);
        if (currentCollection) {
            onCollectionSelect(currentCollection, userId || undefined);
        }
    };

    const handleStartEmbedding = async () => {
        if (!selectedSourcePath || !collectionName) return;

        setLoading(true);
        try {
            const response = await filesService.startEmbedding(
                selectedSourcePath,
                collectionName,
                chunkingStrategy,
                chunkingStrategy === 'message-count' ? messageCount : undefined
            );
            onEmbeddingStart(response.job_id);
            alert(`Embedding started! Job ID: ${response.job_id}`);
        } catch (error) {
            console.error('Failed to start embedding:', error);
            alert('Failed to start embedding job');
        } finally {
            setLoading(false);
        }
    };

    // Filter processed chunks based on selected original file
    const getRelatedProcessedChunks = () => {
        const sourceFile = files.find(f => f.path === selectedSourcePath);
        if (!sourceFile) return [];

        return files.filter(f => f.type === 'processed' && f.parent_file === sourceFile.name);
    };

    const relatedChunks = getRelatedProcessedChunks();

    return (
        <div className="w-72 h-full bg-white border-r border-neutral-200 flex flex-col shrink-0">
            <div className="p-4 border-b border-neutral-200">
                <h2 className="text-lg font-bold text-neutral-900 flex items-center">
                    <Settings className="w-5 h-5 mr-2 text-primary-600" />
                    Configuration
                </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'existing' ? 'primary' : 'outline'}
                            onClick={() => setMode('existing')}
                            className="flex-1 flex items-center justify-center h-9 text-xs"
                        >
                            <Database className="w-3.5 h-3.5 mr-1.5" />
                            Existing
                        </Button>
                        <Button
                            variant={mode === 'new' ? 'primary' : 'outline'}
                            onClick={() => setMode('new')}
                            className="flex-1 flex items-center justify-center h-9 text-xs"
                        >
                            <FileJson className="w-3.5 h-3.5 mr-1" />
                            New
                        </Button>
                    </div>
                </div>

                {mode === 'existing' && (
                    <div className="space-y-3">
                        {/* 1. ORIGINAL SOURCE */}
                        <Card className="border-primary-100 shadow-sm overflow-visible p-3">
                            <h3 className="text-xs font-bold text-neutral-900 mb-3 flex items-center">
                                <FileText className="w-4 h-4 mr-2 text-primary-600" />
                                1. Source JSON
                            </h3>

                            <Select
                                value={selectedSourcePath}
                                onChange={setSelectedSourcePath}
                                placeholder="Choose a source file..."
                                options={files.filter(f => f.type === 'original').map(f => ({
                                    value: f.path,
                                    label: f.name,
                                    description: `${f.record_count} users found`
                                }))}
                                className="mb-4"
                            />

                            <Button
                                onClick={handleLoadFile}
                                className="w-full py-2 text-xs font-bold uppercase tracking-wider"
                                disabled={!selectedSourcePath}
                                variant={currentFile === selectedSourcePath ? 'outline' : 'primary'}
                            >
                                {currentFile === selectedSourcePath ? 'Reload Data' : 'Load Source Data'}
                            </Button>
                        </Card>

                        {/* 2. PROCESSED CHUNKS */}
                        {selectedSourcePath && (
                            <Card className="border-emerald-100 shadow-sm overflow-visible p-3">
                                <h3 className="text-xs font-bold text-neutral-900 mb-3 flex items-center">
                                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" />
                                    2. Related Chunks
                                </h3>

                                {relatedChunks.length > 0 ? (
                                    <>
                                        <Select
                                            value={currentFile && currentFile.includes('processed') ? currentFile : ''}
                                            onChange={(path) => handleChunkSelect(path)}
                                            placeholder="Choose a chunk file..."
                                            options={relatedChunks.map(f => ({
                                                value: f.path,
                                                label: f.name,
                                                description: `${f.record_count} daily chunks`
                                            }))}
                                        />
                                        <p className="text-[10px] text-neutral-400 mt-3 italic text-center">Chunks load automatically on selection</p>
                                    </>
                                ) : (
                                    <div className="bg-neutral-50 rounded-xl p-4 text-center">
                                        <p className="text-xs text-neutral-500 italic">No processed chunks found.</p>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* 3. DATABASE COLLECTION */}
                        <Card className="border-indigo-100 shadow-sm overflow-visible p-3">
                            <h3 className="text-xs font-bold text-neutral-900 mb-3 flex items-center">
                                <Database className="w-4 h-4 mr-2 text-indigo-600" />
                                3. Final Collection
                            </h3>

                            <Select
                                value={selectedCollection}
                                onChange={setSelectedCollection}
                                placeholder="Choose a collection..."
                                options={collections.map(col => ({
                                    value: col.name,
                                    label: col.name,
                                    description: `${col.points_count} vectors stored`
                                }))}
                                className="mb-4"
                            />

                            <Button
                                onClick={handleLoadCollection}
                                className="w-full py-2 text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700"
                                disabled={!selectedCollection}
                            >
                                Load from Qdrant
                            </Button>
                        </Card>

                        {currentCollection && users.length > 0 && (
                            <Card className="bg-neutral-50 border-none shadow-sm overflow-visible p-3">
                                <h3 className="text-xs font-bold text-neutral-900 mb-3 flex items-center">
                                    <Users className="w-4 h-4 mr-2 text-neutral-600" />
                                    Filter by User
                                </h3>

                                <Select
                                    value={selectedUser}
                                    onChange={handleUserChange}
                                    placeholder="Filter by specific user..."
                                    options={[
                                        { value: '', label: `All Users (${users.length})` },
                                        ...users.map(u => ({
                                            value: u.user_id,
                                            label: u.user_name || `User ${u.user_id}`,
                                            description: `ID: ${u.user_id.slice(0, 8)}...`
                                        }))
                                    ]}
                                />
                            </Card>
                        )}
                    </div>
                )}

                {mode === 'new' && (
                    <div className="space-y-3">
                        <Card className="overflow-visible p-3">
                            <h3 className="text-xs font-semibold text-neutral-900 mb-2">Select Source File</h3>
                            <Select
                                value={selectedSourcePath}
                                onChange={(path) => {
                                    setSelectedSourcePath(path);
                                    if (path && path !== currentFile) onFileSelect(path);
                                }}
                                placeholder="Choose a source file..."
                                options={files.filter(f => f.type === 'original').map(f => ({
                                    value: f.path,
                                    label: f.name,
                                    description: `${f.record_count} users found`
                                }))}
                            />
                        </Card>

                        <Card className="p-3">
                            <h3 className="text-xs font-semibold text-neutral-900 mb-3 flex items-center">
                                <FileJson className="w-4 h-4 mr-2 text-primary-600" />
                                Processing Strategy
                            </h3>

                            <div className="grid grid-cols-1 gap-2 mb-4">
                                {[
                                    { id: 'day-wise', label: 'Day-wise', desc: 'Group messages by date' },
                                    { id: 'message-wise', label: 'Message-wise', desc: 'Each message is a vector' },
                                    { id: 'message-count', label: 'Message Count', desc: 'Fixed number of messages' }
                                ].map((strat) => (
                                    <label
                                        key={strat.id}
                                        className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all ${chunkingStrategy === strat.id
                                            ? 'border-primary-500 bg-primary-50/30 ring-1 ring-primary-500'
                                            : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50/50'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="chunking"
                                            value={strat.id}
                                            checked={chunkingStrategy === strat.id}
                                            onChange={(e) => setChunkingStrategy(e.target.value as any)}
                                            className="w-4 h-4 mt-0.5 text-primary-600 focus:ring-primary-500"
                                        />
                                        <div className="ml-2.5">
                                            <span className="block text-xs font-bold text-neutral-900">{strat.label}</span>
                                            <span className="block text-[9px] text-neutral-500 uppercase tracking-tighter leading-none mt-1">{strat.desc}</span>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            {chunkingStrategy === 'message-count' && (
                                <div className="mt-4 p-4 bg-primary-50/50 rounded-xl border border-primary-100">
                                    <Input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={messageCount}
                                        onChange={(e) => setMessageCount(parseInt(e.target.value) || 1)}
                                        label="Messages per chunk"
                                    />
                                </div>
                            )}
                        </Card>

                        <Card>
                            <h3 className="text-sm font-bold text-neutral-900 mb-3 flex items-center">
                                <Database className="w-4 h-4 mr-2 text-indigo-600" />
                                Collection Setup
                            </h3>
                            <Input
                                type="text"
                                value={collectionName}
                                onChange={(e) => setCollectionName(e.target.value)}
                                placeholder="Enter collection name (e.g. user_chat_2024)"
                                label="Qdrant Collection Name"
                            />
                        </Card>

                        <Button
                            onClick={handleStartEmbedding}
                            disabled={!selectedSourcePath || !collectionName || loading}
                            className="w-full py-3 h-auto flex-col gap-1 border-none shadow-lg shadow-primary-200"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-sm font-bold uppercase tracking-wider text-white">Start Processing</span>
                                    <span className="text-[10px] opacity-80 font-normal uppercase">Embed vectors into Qdrant</span>
                                </>
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};
