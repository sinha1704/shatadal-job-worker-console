'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { fetchAIResponse } from './utils/api';

type Message = { 
  role: 'user' | 'ai'; 
  content: string; 
  timestamp: string;
};

const SUGGESTIONS = [
  { text: "Who is Shatadal Sundar Sinha?", icon: "👤", category: "About" },
  { text: "Summarize his professional expertise & skills.", icon: "💼", category: "Technical" },
  { text: "Tell me about the Qpulse AI Resume Builder.", icon: "🚀", category: "Projects" },
  { text: "What is his B.Tech CGPA and education?", icon: "🎓", category: "About" },
  { text: "What is the secret behind antigravity?", icon: "🌌", category: "General" },
  { text: "Explain Next.js App Router in simple terms.", icon: "💻", category: "Technical" }
];

const getTimestamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const staggerClass = (i: number) => {
  const delays = ['msg-0','msg-1','msg-2','msg-3','msg-4','msg-5'];
  return delays[Math.min(i, delays.length - 1)];
};

export default function ChatPage() {
  const [input, setInput] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasLoadedHistory, setHasLoadedHistory] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Online');
  const [statusColor, setStatusColor] = useState<string>('bg-emerald-500');
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [kbEntries, setKbEntries] = useState<any[]>([]);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [sendAnimating, setSendAnimating] = useState<boolean>(false);
  
  // Sidebar states
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('aetheris_chat_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved chat history:", e);
        setMessages([{ role: 'ai', content: "Hello! I am Shatadal's Personal Assistant. How can I assist you today?", timestamp: getTimestamp() }]);
      }
    } else {
      setMessages([{ role: 'ai', content: "Hello! I am Shatadal's Personal Assistant. How can I assist you today?", timestamp: getTimestamp() }]);
    }
    setHasLoadedHistory(true);

    // Default sidebar to collapsed on smaller desktop screens
    if (window.innerWidth < 1280) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (hasLoadedHistory) {
      localStorage.setItem('aetheris_chat_history', JSON.stringify(messages));
    }
  }, [messages, hasLoadedHistory]);

  // Load knowledge base entries on mount
  useEffect(() => {
    fetch('/api/upload')
      .then(r => r.json())
      .then(d => setKbEntries(d.entries || []))
      .catch(() => {});
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textAreaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  const handleSend = useCallback(async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading) return;

    setSendAnimating(true);
    setTimeout(() => setSendAnimating(false), 350);

    const timestamp = getTimestamp();
    const userMsg: Message = { role: 'user', content: trimmed, timestamp };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setStatusText('Thinking...');
    setStatusColor('bg-amber-500');

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const data = await fetchAIResponse(trimmed, history);
      const aiTimestamp = getTimestamp();
      setMessages(prev => [...prev, { role: 'ai', content: data.reply, timestamp: aiTimestamp }]);
      if (data.isFallback) {
        setApiWarning(data.errorDetails || "API connection warning");
        setStatusText('Fallback');
        setStatusColor('bg-amber-500');
      } else {
        setApiWarning(null);
        setStatusText('Online');
        setStatusColor('bg-emerald-500');
      }
    } catch (error) {
      console.error("Error fetching response:", error);
      const aiTimestamp = getTimestamp();
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I couldn't reach the backend API. Please make sure the server is running.", timestamp: aiTimestamp }]);
      setStatusText('Error');
      setStatusColor('bg-rose-500');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(input);
    }
  };

  const handleNewChat = () => {
    setMessages([{ role: 'ai', content: "Hello! I am Shatadal's Personal Assistant. How can I assist you today?", timestamp: getTimestamp() }]);
    setInput('');
    setIsLoading(false);
    setApiWarning(null);
    setStatusText('Online');
    setStatusColor('bg-emerald-500');
    setIsMobileSidebarOpen(false);
    setTimeout(() => textAreaRef.current?.focus(), 150);
  };

  const clearChat = () => setShowClearConfirm(true);

  const handleConfirmClear = () => {
    setMessages([{ role: 'ai', content: "Chat history cleared. How can I assist you now?", timestamp: getTimestamp() }]);
    setShowClearConfirm(false);
    setIsMobileSidebarOpen(false);
    setTimeout(() => {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = 0;
      }
      textAreaRef.current?.focus();
    }, 150);
  };

  const handleCancelClear = () => setShowClearConfirm(false);

  const uploadFile = async (file: File) => {
    const allowed = ['.txt', '.md', '.json', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadStatus(`❌ Unsupported type. Allowed: ${allowed.join(', ')}`);
      return;
    }
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    const isPDF = ext === '.pdf';
    setUploading(true);
    setUploadStatus(isImage ? '🔍 Analyzing image with AI vision...' : isPDF ? '📄 Extracting PDF text...' : 'Uploading...');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (data.success) {
        setKbEntries(prev => [...prev.filter(e => e.filename !== file.name), data.entry]);
        setUploadStatus(`✅ "${file.name}" trained successfully!`);
      } else {
        setUploadStatus(`❌ ${data.error}`);
      }
    } catch {
      setUploadStatus('❌ Upload failed. Try again.');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const deleteKBEntry = async (id: string, filename: string) => {
    await fetch('/api/upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setKbEntries(prev => prev.filter(e => e.id !== id));
    setUploadStatus(`🗑️ "${filename}" removed.`);
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleCopyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Helper to format AI replies nicely with bullet lists and strong tags
  const formatMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Check if it's a list item
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const itemText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-slate-300 my-1 text-sm md:text-[15px] leading-relaxed">
            {parseInlineStyles(itemText)}
          </li>
        );
      }
      
      // Check if it's a numbered list
      const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        return (
          <li key={idx} className="ml-5 list-decimal text-slate-300 my-1 text-sm md:text-[15px] leading-relaxed">
            {parseInlineStyles(numMatch[2])}
          </li>
        );
      }

      // Empty line
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }

      // Standard paragraph
      return (
        <p key={idx} className="my-1.5 text-sm md:text-[15px] text-slate-200 leading-relaxed">
          {parseInlineStyles(line)}
        </p>
      );
    });
  };

  const parseInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Common Sidebar inner content
  const renderSidebarContent = (isCollapsed: boolean) => {
    if (isCollapsed) {
      return (
        <div className="flex flex-col items-center justify-between h-full py-5 w-full">
          <div className="flex flex-col items-center space-y-6">
            {/* Branding logo */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>

            {/* "+ New Chat" compact icon button */}
            <button
              onClick={handleNewChat}
              className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-550 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="New Chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Profile Avatar indicator */}
            <div className="relative group">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-slate-300 select-none cursor-pointer">
                S
              </div>
              <div className="absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full border border-slate-900 bg-emerald-500" />
            </div>

            {/* Fast Upload trigger */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl border border-slate-850 hover:border-indigo-500/30 bg-slate-950/40 text-slate-400 hover:text-white transition-all cursor-pointer relative"
              title="Quick Upload File"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {kbEntries.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-slate-900">
                  {kbEntries.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex flex-col items-center space-y-4">
            {/* Clear history */}
            <button
              onClick={clearChat}
              className="p-2.5 rounded-xl border border-slate-850 hover:border-rose-500/40 bg-slate-950/40 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
              title="Clear Conversation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>

            {/* Expand toggle */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 rounded-xl bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Expand Sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full">
        {/* Branding header */}
        <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <span className="text-[11px] uppercase font-bold tracking-widest text-indigo-400 leading-none">Aetheris twin</span>
              <h1 className="text-[14px] font-bold text-white tracking-tight mt-0.5">Shatadal AI Agent</h1>
            </div>
          </div>
          {/* Desktop collapse button */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="hidden md:flex p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 hover:bg-slate-800/50 text-slate-400 hover:text-white transition-all cursor-pointer"
            title="Collapse Sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Action Panel for New Chat */}
        <div className="px-5 pt-5 pb-2">
          <button
            onClick={handleNewChat}
            className="w-full group px-4 py-3 rounded-xl text-xs bg-indigo-600 hover:bg-indigo-550 text-white font-semibold flex items-center justify-center space-x-2 transition-all duration-200 cursor-pointer shadow-md shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98]"
          >
            <svg className="w-4 h-4 transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        {/* Profile Card component */}
        <div className="p-5 border-b border-slate-800/40">
          <div className="glass-card bg-slate-950/40 rounded-2xl p-4 border border-indigo-500/10">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-base select-none shadow-inner flex-shrink-0">
                S
              </div>
              <div className="overflow-hidden">
                <h3 className="text-xs font-bold text-slate-200 truncate">Shatadal Sundar Sinha</h3>
                <p className="text-[10px] text-indigo-400 font-semibold truncate mt-0.5">Senior Front-End Developer</p>
                <p className="text-[9px] text-slate-500 truncate">Kolkata, WB, India</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3.5">
              <span className="text-[8px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-md font-medium">React.js</span>
              <span className="text-[8px] bg-blue-500/10 border border-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-md font-medium">Next.js</span>
              <span className="text-[8px] bg-purple-500/10 border border-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-md font-medium">Node.js</span>
              <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-md font-medium">TypeScript</span>
            </div>
          </div>
        </div>

        {/* Scrollable middle portion for Files */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">AI Knowledge Base</span>
              <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold">{kbEntries.length} Files</span>
            </div>

            {/* Upload Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
                  : 'border-slate-800 bg-slate-950/20 hover:border-indigo-500/30 hover:bg-slate-950/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value=''; }}
              />
              {uploading ? (
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[9px] text-indigo-400 font-semibold animate-pulse">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-1 text-slate-500 hover:text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-[10px] font-medium"><span className="text-indigo-400 font-semibold">Upload document</span> or drop</p>
                  <p className="text-[8px] text-slate-600">PDF, TXT, MD, Images up to 5MB</p>
                </div>
              )}
            </div>

            {/* List of Files */}
            <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
              {kbEntries.length > 0 ? (
                kbEntries.map(entry => (
                  <div key={entry.id} className="group flex items-center justify-between bg-slate-950/30 border border-slate-900 hover:border-slate-800 rounded-xl p-2.5 transition-all">
                    <div className="flex items-center space-x-2.5 overflow-hidden pr-2">
                      {entry.type === 'image' && entry.imageUrl ? (
                        <img src={entry.imageUrl} alt={entry.filename} className="w-8 h-8 rounded-lg object-cover border border-slate-800 flex-shrink-0" />
                      ) : (
                        <span className="text-base select-none flex-shrink-0">
                          {entry.type === 'pdf' ? '📕' : entry.filename.endsWith('.txt') ? '📄' : entry.filename.endsWith('.md') ? '📝' : entry.filename.endsWith('.json') ? '🔧' : '📊'}
                        </span>
                      )}
                      <div className="overflow-hidden">
                        <p className="text-[11px] text-slate-300 font-medium truncate">{entry.filename}</p>
                        <p className="text-[8px] text-slate-500 mt-0.5 truncate uppercase">
                          {entry.type} · {(entry.charCount || 0).toLocaleString()} chars
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteKBEntry(entry.id, entry.filename)}
                      className="text-slate-600 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-950/20 opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-pointer"
                      title="Remove File"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 border border-dashed border-slate-800/40 rounded-xl">
                  <p className="text-[10px] text-slate-600">No trained files.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-5 border-t border-slate-800/60 space-y-4">
          {/* Status info */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium bg-slate-950/30 p-2.5 rounded-xl border border-slate-900">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} style={{ animation: 'statusPulse 2s ease-in-out infinite' }} />
              {statusText}
            </span>
            <span className="text-slate-600">Model: Llama 3.1</span>
          </div>

          {/* Quick Action buttons */}
          <button
            onClick={clearChat}
            className="w-full group px-4 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 hover:border-rose-950 hover:bg-rose-950/10 text-slate-400 hover:text-rose-400 transition-all flex items-center justify-center space-x-2 cursor-pointer font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Clear Conversation</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <main className="fixed inset-0 flex bg-slate-950 text-slate-100 font-sans overflow-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* ── Ambient gradient background glows ── */}
      <div className="absolute top-[-10%] left-[-5%] w-[45%] h-[45%] bg-indigo-600/5 rounded-full blur-[140px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[45%] h-[45%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none animate-float-delayed" />

      {/* ── Floating particles ── */}
      <div className="particle particle-1" />
      <div className="particle particle-2" />
      <div className="particle particle-3" />
      <div className="particle particle-4" />
      <div className="particle particle-5" />
      <div className="particle particle-6" />

      {/* ══════════════════════════════════════
          LEFT SIDEBAR (DESKTOP)
      ══════════════════════════════════════ */}
      <aside
        className={`hidden md:flex flex-col h-full bg-slate-900 border-r border-slate-800/80 sidebar-transition flex-shrink-0 z-20 ${
          isSidebarOpen ? 'w-80' : 'w-20'
        }`}
      >
        {renderSidebarContent(!isSidebarOpen)}
      </aside>

      {/* ══════════════════════════════════════
          MOBILE DRAWER SIDEBAR
      ══════════════════════════════════════ */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden animate-fadeIn"
        />
      )}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-80 bg-slate-900 border-r border-slate-850 z-50 md:hidden sidebar-transition flex flex-col shadow-2xl ${
          isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Mobile close button */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-rose-950/30 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {renderSidebarContent(false)}
      </aside>

      {/* ══════════════════════════════════════
          MAIN WORKSPACE AREA
      ══════════════════════════════════════ */}
      <section className="flex-1 h-full flex flex-col relative overflow-hidden min-w-0">
        
        {/* Workspace Header */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-slate-800/60 backdrop-blur-xl bg-slate-950/45 z-10 gap-2">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            {/* Hamburger for mobile, sidebar expand helper for desktop */}
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setIsMobileSidebarOpen(true);
                } else {
                  setIsSidebarOpen(!isSidebarOpen);
                }
              }}
              className="p-2 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-400 hover:text-white transition-all cursor-pointer flex-shrink-0"
              title="Toggle Menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center space-x-2 overflow-hidden">
              <h2 id="main-title" className="font-bold text-[14px] text-white tracking-tight truncate select-none">
                Shatadal Personal Assistant
              </h2>
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor} flex-shrink-0`} />
              <span className="hidden sm:inline text-[10px] text-slate-500 font-medium tracking-wide truncate">{statusText}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            {/* Header New Chat Button */}
            <button
              onClick={handleNewChat}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-400 hover:text-white transition-all cursor-pointer flex items-center space-x-1 text-[11px] font-bold"
              title="Start New Chat"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
              </svg>
              <span>New Chat</span>
            </button>

            {/* Model Badge */}
            <div className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold border border-slate-850 bg-slate-900/60 text-indigo-400 flex items-center space-x-1">
              <span>🧠</span>
              <span className="hidden sm:inline">Llama 3.1 8B</span>
              <span className="sm:hidden">Llama 3.1</span>
            </div>
          </div>
        </header>

        {/* ── API Warning Banner (mobile/fallback) ── */}
        {apiWarning && (
          <div className="bg-amber-500/8 border-b border-amber-500/15 px-5 py-2.5 flex items-center justify-between text-xs text-amber-400 backdrop-blur-sm animate-fadeIn flex-shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm">⚠️</span>
              <span><strong>Connection Fallback:</strong> Running in offline fallback.</span>
            </div>
            <button onClick={() => setApiWarning(null)} className="text-amber-400 hover:text-white transition-colors cursor-pointer font-semibold ml-4">Dismiss</button>
          </div>
        )}

        {/* Scrollable chat log viewport */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto w-full relative scroll-smooth bg-slate-950">
          <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 pb-20 w-full flex flex-col justify-start">
            
            {messages.length <= 1 ? (
              /* ── WELCOME HERO DASHBOARD ── */
              <div className="flex flex-col items-center text-center py-8 md:py-16 px-2 max-w-2xl mx-auto animate-fadeInUp select-none">
                
                {/* Brand emblem */}
                <div className="relative mb-6 group">
                  <div className="absolute inset-0 rounded-[24px] bg-gradient-to-tr from-indigo-500 via-purple-500 to-blue-600 blur-2xl opacity-20 group-hover:opacity-30 transition-all duration-700" />
                  
                  <div
                    className="relative w-24 h-24 rounded-[24px] flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(11,15,25,0.9), rgba(59,130,246,0.15))',
                      boxShadow: '0 0 0 1px rgba(99,102,241,0.18), 0 16px 40px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    <div className="absolute inset-1 rounded-[18px] bg-gradient-to-tr from-indigo-500/10 via-transparent to-blue-500/10" />
                    <div className="scan-line" />

                    <svg
                      className="relative w-11 h-11 text-indigo-400 group-hover:text-indigo-300 transition-colors animate-float-icon"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>

                    <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    <div className="absolute bottom-2 left-2 w-1 h-1 rounded-full bg-blue-400" />
                  </div>
                </div>

                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 rounded-full mb-3 shadow-sm">
                  Interactive Personal Twin
                </span>

                <h2 className="text-xl md:text-3xl font-extrabold tracking-tight text-white mb-3 leading-tight">
                  How can I help you learn about <span className="shimmer-text">Shatadal</span>?
                </h2>

                <p className="text-xs md:text-sm text-slate-400 max-w-md mb-8 leading-relaxed">
                  I am Shatadal's AI representative, trained on his senior software engineering resume, key portfolio achievements, and custom uploads. Ask me about his experience, core projects, or general web engineering!
                </p>

                {/* Suggestions Grid grouped by category */}
                <div className="w-full space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SUGGESTIONS.map((sug, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(sug.text)}
                        style={{ animationDelay: `${idx * 60}ms`, opacity: 0 }}
                        className="animate-fadeInUp text-left rounded-xl p-3 bg-slate-900/40 hover:bg-slate-900/95 border border-slate-900 hover:border-indigo-500/30 text-slate-300 hover:text-white transition-all text-xs flex items-center space-x-3 cursor-pointer hover:shadow-lg active:scale-[0.98]"
                      >
                        <span className="text-sm bg-slate-800/80 p-2 rounded-lg text-indigo-400 flex-shrink-0 font-bold select-none group-hover:scale-105">
                          {sug.icon}
                        </span>
                        <div className="overflow-hidden leading-snug">
                          <span className="text-[8px] uppercase font-bold text-slate-600 block mb-0.5 tracking-wider">{sug.category}</span>
                          <span className="font-semibold line-clamp-1 text-slate-300">{sug.text}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ── MESSAGES LIST VIEW ── */
              <div className="space-y-6 flex-1">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 md:gap-4 ${
                      msg.role === 'user'
                        ? `justify-end animate-slideInRight-msg ${staggerClass(index)}`
                        : `justify-start animate-slideInLeft ${staggerClass(index)}`
                    }`}
                    style={{ opacity: 0, animationFillMode: 'forwards' }}
                  >
                    {/* AI Avatar */}
                    {msg.role === 'ai' && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 shadow-md mb-2">
                        <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    )}

                    {/* Chat Bubble card */}
                    <div className={`flex flex-col group/msg max-w-[84%] sm:max-w-[76%]`}>
                      <div className={`px-4 py-3 rounded-2xl shadow-lg relative ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-sm shadow-indigo-950/20 border border-indigo-400/15'
                          : 'glass-card text-slate-200 rounded-tl-sm'
                      }`}>
                        
                        {/* Copy action on hover for AI responses */}
                        {msg.role === 'ai' && (
                          <div className="absolute right-2 top-2 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleCopyMessage(msg.content, index)}
                              className="p-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer shadow-sm animate-fadeIn"
                              title="Copy response"
                            >
                              {copiedIndex === index ? (
                                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3" />
                                </svg>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="pr-4">
                          {msg.role === 'user' ? (
                            <p className="whitespace-pre-line text-sm md:text-[15px] leading-relaxed">{msg.content}</p>
                          ) : (
                            <div className="prose prose-invert max-w-none">
                              {formatMessageContent(msg.content)}
                              
                              {/* RAG Context badge indicator for premium feel */}
                              {kbEntries.length > 0 && (
                                <div className="mt-3.5 pt-2 border-t border-indigo-500/10 flex items-center space-x-1.5 text-[9px] text-slate-500 select-none animate-fadeIn">
                                  <span className="flex items-center justify-center w-3 h-3 rounded-full bg-emerald-500/10 text-emerald-400 font-bold text-[8px]">✓</span>
                                  <span>Response verified with knowledge base</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-[9px] text-slate-600 mt-1 px-1 font-medium ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.timestamp}
                      </span>
                    </div>

                    {/* User Avatar */}
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center flex-shrink-0 font-bold text-xs text-indigo-400 shadow-md">
                        U
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading / Typing Indicator */}
                {isLoading && (
                  <div className="flex items-start gap-3 justify-start animate-fadeIn">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-600/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 shadow-md">
                      <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.21" />
                      </svg>
                    </div>
                    <div className="glass-card px-4 py-3 rounded-2xl rounded-tl-sm flex items-center space-x-1.5">
                      <span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════
            DOCKED BOTTOM INPUT PANEL
        ══════════════════════════════════════ */}
        <footer className="w-full border-t border-slate-800/60 bg-slate-950/80 backdrop-blur-xl py-4 flex-shrink-0 relative z-10">
          <div className="max-w-3xl mx-auto px-4 md:px-6 relative">
            
            {/* Upload loading/status feedback bubbles */}
            {uploading && (
              <div className="absolute top-[-44px] left-6 px-3.5 py-1.5 bg-slate-900 border border-indigo-500/25 rounded-xl text-[10px] flex items-center space-x-2 animate-pulse shadow-lg z-20">
                <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-indigo-300 font-semibold">{uploadStatus || 'Processing file...'}</span>
              </div>
            )}
            {uploadStatus && !uploading && (
              <div className="absolute top-[-44px] left-6 px-3.5 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-[10px] flex items-center justify-between shadow-lg animate-fadeIn z-20">
                <span className="text-slate-300 font-medium">{uploadStatus}</span>
                <button onClick={() => setUploadStatus(null)} className="text-slate-500 hover:text-white ml-2 text-[9px]">✕</button>
              </div>
            )}

            {/* Input Box */}
            <div className="neon-input-focus relative rounded-2xl border border-slate-850 bg-slate-900/40 shadow-xl p-2 transition-all flex items-end gap-1.5">
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-indigo-500/15 to-transparent" />

              {/* Attach File Button */}
              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                disabled={isLoading || uploading}
                className="p-2.5 text-slate-500 hover:text-indigo-400 transition-all rounded-xl hover:bg-slate-800/60 flex-shrink-0 disabled:opacity-40 cursor-pointer"
                title="Attach File to Knowledge Base"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input
                ref={chatFileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadFile(file); e.target.value = ''; }}
              />

              {/* Chat Textarea input */}
              <textarea
                ref={textAreaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                id="chat-input"
                className="flex-1 max-h-[140px] min-h-[40px] bg-transparent resize-none border-0 focus:ring-0 focus:outline-none outline-none placeholder:text-slate-650 text-slate-100 text-sm px-2 py-2 leading-relaxed"
                placeholder="Ask me anything about Shatadal's portfolio and skills..."
                rows={1}
                disabled={isLoading}
              />

              {/* Send Message Button */}
              <button
                onClick={() => handleSend(input)}
                id="btn-send-message"
                disabled={!input.trim() || isLoading}
                className={`p-2.5 rounded-xl transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ${
                  sendAnimating ? 'animate-send-pop' : ''
                } ${
                  input.trim() && !isLoading
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/15 hover:scale-105 active:scale-95'
                    : 'bg-slate-850 text-slate-700 border border-slate-800/60 cursor-not-allowed'
                }`}
              >
                <svg className="w-4 h-4 transform rotate-90" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                </svg>
              </button>
            </div>

            <p className="text-[9px] text-center text-slate-700 mt-2.5 tracking-wide leading-none select-none">
              Powered by Groq Llama 3.1 & Next.js · Designed with Glassmorphism
            </p>
          </div>
        </footer>
      </section>

      {/* ══════════════════════════════════════
          CLEAR CHAT CONFIRMATION MODAL
      ══════════════════════════════════════ */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl space-y-4 animate-fadeInUp relative">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />
            
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white">Clear Chat History</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to clear your entire chat history? This action cannot be undone and will delete local browser memory.
            </p>
            
            <div className="flex items-center justify-end space-x-2.5 pt-1">
              <button onClick={handleCancelClear} className="px-3.5 py-1.5 rounded-xl text-xs bg-slate-850 hover:bg-slate-800 text-slate-300 transition-all cursor-pointer font-semibold">
                Cancel
              </button>
              <button onClick={handleConfirmClear} className="px-3.5 py-1.5 rounded-xl text-xs bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all cursor-pointer font-semibold">
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}