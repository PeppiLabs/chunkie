import { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { LeftPanel } from './components/layout/LeftPanel';
import { MessageGrid } from './components/layout/MessageGrid';
import { RightPanel } from './components/layout/RightPanel';
import { SearchBar } from './components/common/SearchBar';
import { collectionsService, type Message } from './services/collections.service';
import { filesService } from './services/files.service';
import { searchService } from './services/search.service';

/**
 * Main Application Component
 * Manages state for collections, files, and message displays.
 * Supports switching between original JSON data, processed chunks, and DB collections.
 */
function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [originalMessages, setOriginalMessages] = useState<Message[]>([]);
  const [processedMessages, setProcessedMessages] = useState<Message[]>([]);
  const [selectedMessages, setSelectedMessages] = useState<Message[] | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [currentCollection, setCurrentCollection] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [currentProcessedFile, setCurrentProcessedFile] = useState<string>('');
  const [currentUserFilter, setCurrentUserFilter] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'collection' | 'original' | 'processed'>('collection');

  /**
   * Selection handler for file dropdowns (Source JSON and Related Chunks)
   */
  const handleFileSelect = async (filePath: string) => {
    console.log('[App] handleFileSelect started:', filePath);
    setLoading(true);
    setSelectedConversationId(null);
    try {
      const response = await filesService.getFileContent(filePath);
      console.log('[App] Loaded file content. Type:', typeof response.content, 'Length:', Array.isArray(response.content) ? response.content.length : 'N/A');

      const allFiles = await filesService.listFiles();
      const fileInfo = allFiles.files.find(f => f.path === filePath);

      const isProcessed = fileInfo?.type === 'processed' ||
        filePath.includes('processed') ||
        filePath.includes('chunk');

      console.log('[App] Context detected - Is Processed File?', isProcessed);

      let rawRecords: any[] = [];
      if (Array.isArray(response.content)) {
        // PHPMyAdmin often wraps data in a table structure
        const tableObj = response.content.find((item: any) => item.type === 'table' && item.data);
        rawRecords = tableObj ? tableObj.data : response.content;
      } else if (response.content && typeof response.content === 'object') {
        // Handle single object or non-array root
        rawRecords = [response.content];
      }

      console.log('[App] Mapping records. Found:', rawRecords.length);
      const flatMessages: Message[] = [];

      rawRecords.forEach((record: any, recordIdx: number) => {
        try {
          // A: Handle 'chat_history' array (Original raw data format)
          if (record.chat_history && Array.isArray(record.chat_history)) {
            record.chat_history.forEach((chat: any, chatIdx: number) => {
              flatMessages.push({
                id: `raw_${recordIdx}_${chatIdx}`,
                user_uuid: record.user_id || record.user_uuid || 'unknown',
                user_name: record.user_name || 'User',
                question_text: chat.question || '',
                answer_text: chat.answer || '',
                created_at: chat.timestamp || record.date || new Date().toISOString(),
                metadata: {
                  memory_type: 'day-wise',
                  importance: chat.importance || 0.5,
                  emotion: chat.emotion || 0,
                  is_raw_json: true
                }
              });
            });
          }
          // B: Handle Processed Chunks (Daily summaries) or direct records
          else {
            const isChunk = !!(record.chunk_text || record.chunk || record.message_count);
            const rawDate = record.date || record.created_at || record.first_timestamp || new Date().toISOString();
            // Standardize to YYYY-MM-DD for grouping/sorting
            const cleanDate = typeof rawDate === 'string' ? rawDate.split(/[ T]/)[0] : 'No Date';

            flatMessages.push({
              id: isChunk ? `chunk_${recordIdx}_${record.user_uuid || 'u'}` : `flat_${recordIdx}`,
              user_uuid: record.user_uuid || record.user_id || 'unknown',
              user_name: record.user_name || 'User',
              question_text: isChunk ? `Day Summary: ${cleanDate}` : (record.question_text || record.question || 'Instruction'),
              answer_text: record.chunk_text || record.chunk || record.answer_text || record.answer || '',
              created_at: cleanDate,
              metadata: {
                memory_type: isChunk ? 'day-wise-chunk' : 'day-wise',
                importance: (record.importance || 0.8),
                emotion: (record.emotion || 0),
                is_raw_json: true,
                date: cleanDate,
                message_count: record.message_count || (isChunk ? 1 : 0)
              }
            });
          }
        } catch (err) {
          console.warn('[App] Error mapping record at index', recordIdx, err);
        }
      });

      // Update state based on file type
      setCurrentFile(filePath);

      if (isProcessed) {
        // PROCESSED FILE: Only update processed messages, don't touch original
        console.log('[App] Updating processed messages only');
        setProcessedMessages(flatMessages);
        setCurrentProcessedFile(filePath);
        setActiveTab('processed');
      } else {
        // ORIGINAL FILE: Set both original messages AND clear processed
        console.log('[App] Setting original messages (Raw View)');
        // Sanitize "Original" view to always look like standard chat messages
        const rawViewMessages = flatMessages.map(m => ({
          ...m,
          question_text: m.question_text.replace(/^Day Summary:/, 'Day Log:'),
          metadata: {
            ...m.metadata,
            memory_type: 'day-wise' // Force standard rendering (bubbles) instead of summary card
          }
        }));
        setOriginalMessages(rawViewMessages);
        setProcessedMessages([]); // Clear processed when loading new original
        setCurrentProcessedFile('');
        setActiveTab('original');
      }
      console.log('[App] Mapping success. Flat Messages mapped:', flatMessages.length);
    } catch (error) {
      console.error('[App] Fatal error in handleFileSelect:', error);
      alert('Error loading file. Check browser console for details.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Selection handler for database collections
   */
  const handleCollectionSelect = async (collectionName: string, userFilter?: string) => {
    setLoading(true);
    setSelectedConversationId(null);
    setCurrentCollection(collectionName);
    setCurrentUserFilter(userFilter);
    setActiveTab('collection');
    try {
      const resp = await collectionsService.getMessages(collectionName, 100, 0, userFilter);
      setMessages(resp.messages);
      setHasMore(resp.has_more);
      setTotal(resp.total);
    } catch (error) {
      console.error('[App] Collection Select Error:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Search handler
   */
  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      if (currentCollection) handleCollectionSelect(currentCollection, currentUserFilter);
      return;
    }

    if (!currentCollection) {
      alert("Please select a collection or load a file first to search.");
      return;
    }

    if (!currentUserFilter) {
      alert("Please select a user to search for their records.");
      return;
    }

    setLoading(true);
    setIsSearchMode(true);
    setActiveTab('collection');
    try {
      const resp = await searchService.semanticSearch({
        query: query.trim(),
        collectionName: currentCollection,
        userUuid: currentUserFilter,
        limit: 20,
        filters: {}
      });
      const searchMessages: Message[] = resp.results.map(r => ({
        id: r.id,
        user_uuid: r.metadata.user_uuid || '',
        user_name: r.metadata.buddies_id || 'Unknown',
        question_text: r.metadata.question || '',
        answer_text: r.metadata.answer || r.content,
        created_at: r.metadata.date || new Date().toISOString(),
        metadata: {
          memory_type: r.metadata.memory_type || 'search_result',
          importance: r.metadata.importance_score || (r.score / 100),
          emotion: 0
        }
      }));
      setMessages(searchMessages);
      setTotal(resp.totalResults);
      setHasMore(false);
    } catch (error) {
      console.error('[App] Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Load more handler for paginated collections
   */
  const handleLoadMore = async () => {
    if (!currentCollection || loading || isSearchMode || activeTab === 'original') return;
    setLoading(true);
    try {
      const resp = await collectionsService.getMessages(currentCollection, 100, messages.length, currentUserFilter);
      setMessages([...messages, ...resp.messages]);
      setHasMore(resp.has_more);
    } catch (error) {
      console.error('[App] Load More Error:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Card click handler - opens the detail panel
   */
  const handleMessageClick = (dayMessages: Message[], userName: string, date: string) => {
    setSelectedMessages(dayMessages);
    setSelectedUser(userName);
    setSelectedDate(date);
    setSelectedConversationId(dayMessages[0].id);
  };

  // Determine which data to display in the grid
  const displayMessages = (() => {
    const base = activeTab === 'original' ? originalMessages :
      activeTab === 'processed' ? processedMessages :
        messages;

    if (currentUserFilter && (activeTab === 'original' || activeTab === 'processed')) {
      return base.filter(m => m.user_uuid === currentUserFilter);
    }
    return base;
  })();

  const displayTotal = displayMessages.length;
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // Incremented when a job finishes so the left panel reloads its lists.
  const [refreshToken, setRefreshToken] = useState(0);

  // Poll for job status and auto-transition
  useEffect(() => {
    let interval: any;
    if (activeJobId) {
      interval = setInterval(async () => {
        try {
          const status = await filesService.getEmbeddingStatus(activeJobId);
          if (status.status === 'completed') {
            setActiveJobId(null);
            clearInterval(interval);
            setRefreshToken(t => t + 1);

            // 1. Switch to DASHBOARD if collection is ready
            if (status.collection_name) {
              handleCollectionSelect(status.collection_name);
            }

            // 2. Alert success
            alert("Processing Complete! Redirecting to Dashboard.");
          } else if (status.status === 'failed') {
            setActiveJobId(null);
            clearInterval(interval);
            alert(`Processing Failed: ${status.error}`);
          }
        } catch (e) {
          console.error("Status check failed", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [activeJobId]);

  return (
    <div className="h-screen flex flex-col antialiased font-sans bg-neutral-50 text-neutral-900">
      <Header>
        <SearchBar
          onSearch={handleSearch}
          totalResults={isSearchMode ? total : undefined}
          disabled={!currentCollection}
        />
      </Header>

      <div className="flex flex-1 overflow-hidden">
        <LeftPanel
          onCollectionSelect={handleCollectionSelect}
          onFileSelect={handleFileSelect}
          onEmbeddingStart={(jobId) => setActiveJobId(jobId)}
          currentCollection={currentCollection}
          currentFile={currentFile}
          refreshToken={refreshToken}
        />

        <main className="flex-1 overflow-y-auto flex flex-col relative">
          {(currentCollection || currentFile || currentProcessedFile) && (
            <div className="bg-white/80 backdrop-blur-md border-b border-neutral-200 sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between shadow-sm">
              <h2 className="text-xs font-bold text-neutral-900 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
                {activeTab === 'original' ? (currentFile ? `Source: ${currentFile.split('/').pop()}` : 'Original Data') :
                  activeTab === 'processed' ? `Processed Data` :
                    `DB: ${currentCollection}`}
              </h2>
              <div className="flex p-1 bg-neutral-100/80 rounded-lg space-x-1 border border-neutral-200">
                {(currentFile || originalMessages.length > 0) && (
                  <button
                    onClick={() => setActiveTab('original')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'original' ? 'bg-white text-primary-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    Original
                  </button>
                )}
                {(currentProcessedFile || processedMessages.length > 0) && (
                  <button
                    onClick={() => setActiveTab('processed')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'processed' ? 'bg-white text-primary-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    Processed
                  </button>
                )}
                {currentCollection && (
                  <button
                    onClick={() => setActiveTab('collection')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${activeTab === 'collection' ? 'bg-white text-primary-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
                  >
                    Dashboard
                  </button>
                )}
              </div>
            </div>
          )}


          <MessageGrid
            messages={displayMessages}
            onMessageClick={handleMessageClick}
            onLoadMore={handleLoadMore}
            loading={loading}
            hasMore={hasMore && !isSearchMode && activeTab === 'collection'}
            total={displayTotal}
            isSearchMode={isSearchMode}
            selectedId={selectedConversationId}
          />
        </main>

        {selectedMessages && (
          <RightPanel
            messages={selectedMessages}
            userName={selectedUser}
            date={selectedDate}
            onClose={() => setSelectedMessages(null)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
