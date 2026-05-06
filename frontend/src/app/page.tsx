"use client";

import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { 
  Plus, 
  Search, 
  Send, 
  Database, 
  Shield, 
  Cpu, 
  FileUp, 
  History, 
  LayoutDashboard,
  ExternalLink,
  ChevronRight,
  Trash2
} from "lucide-react";

// Types
interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  sources?: any[];
}

interface Workspace {
  id: string;
  name: string;
}

export default function HybridRAGDashboard() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [mode, setMode] = useState<"strict" | "hybrid">("strict");
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`chat_${activeWorkspace || 'default'}`);
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
      setMessages([
        {
          id: "1",
          role: "ai",
          content: "Hello! I'm your Hybrid RAG assistant. Select a workspace or upload a document to get started."
        }
      ]);
    }
  }, [activeWorkspace]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat_${activeWorkspace || 'default'}`, JSON.stringify(messages));
    }
  }, [messages, activeWorkspace]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages]);

  // Load workspaces on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const res = await fetch("http://localhost:8000/v1/workspaces");
        if (!res.ok) throw new Error("Failed to fetch workspaces");
        const data = await res.json();
        setWorkspaces(data);
        if (data.length > 0 && !activeWorkspace) {
          setActiveWorkspace(data[0].id);
        }
        setApiError(null);
      } catch (err) {
        console.error("API Connection Error:", err);
        setApiError("Backend API is offline. Please start the server on port 8000.");
      }
    };
    loadWorkspaces();
  }, []);

  // Load documents for active workspace
  useEffect(() => {
    if (!activeWorkspace) return;
    const loadDocuments = async () => {
      try {
        const res = await fetch(`http://localhost:8000/v1/documents?workspace_id=${activeWorkspace}`);
        const data = await res.json();
        setDocuments(data);
      } catch (err) {
        console.error("Failed to load documents:", err);
      }
    };
    loadDocuments();
  }, [activeWorkspace]);

  const handleCreateWorkspace = async () => {
    const name = prompt("Enter a name for your new vault:");
    if (!name) return;

    try {
      const response = await fetch(`http://localhost:8000/v1/workspaces?name=${encodeURIComponent(name)}`, {
        method: "POST"
      });
      const newWs = await response.json();
      setWorkspaces(prev => [...prev, newWs]);
      setActiveWorkspace(newWs.id);
    } catch (err) {
      console.error("Failed to create workspace:", err);
      alert("Error creating vault.");
    }
  };

  const handleDeleteWorkspace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure? This will delete ALL documents and chat history for this vault.")) return;

    try {
      await fetch(`http://localhost:8000/v1/workspaces/${id}`, { method: "DELETE" });
      localStorage.removeItem(`chat_${id}`);
      setWorkspaces(prev => prev.filter(ws => ws.id !== id));
      if (activeWorkspace === id) setActiveWorkspace(null);
    } catch (err) {
      console.error("Delete vault failed:", err);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query || !activeWorkspace) return;

    const userMessage: Message = { id: Date.now().toString(), role: "user", content: query };
    setMessages(prev => [...prev, userMessage]);
    const currentQuery = query;
    setQuery("");

    try {
      const response = await fetch(`http://localhost:8000/v1/ask?workspace_id=${activeWorkspace}&query=${encodeURIComponent(currentQuery)}&mode=${mode}`, {
        method: "POST"
      });
      const data = await response.json();
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: data.answer || "I couldn't find any relevant information in your documents.",
        sources: data.results || []
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;

    setIsIngesting(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("owner_id", "web_user");

    try {
      const response = await fetch(`http://localhost:8000/v1/ingest?workspace_id=${activeWorkspace}`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      alert("Document uploaded! It is being processed in the background.");
      // Refetch documents
      const docsRes = await fetch(`http://localhost:8000/v1/documents?workspace_id=${activeWorkspace}`);
      const docsData = await docsRes.json();
      setDocuments(docsData);
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document? All AI chunks will be removed.")) return;

    try {
      await fetch(`http://localhost:8000/v1/documents/${docId}`, {
        method: "DELETE"
      });
      // Refresh documents
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Sidebar */}
      <aside className="w-72 border-r border-white/10 flex flex-col bg-[var(--sidebar-bg)] transition-colors duration-300">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">Hybrid RAG</h1>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${apiError ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
                <span className="text-[10px] font-medium opacity-40 uppercase tracking-widest">
                  {apiError ? 'Offline' : 'Dual-Engine Active'}
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleCreateWorkspace}
            className="w-full py-3 px-4 rounded-xl gradient-bg text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-4 h-4" />
            New Vault
          </button>

          <div className="mt-4 p-1 bg-black/10 dark:bg-white/5 rounded-xl">
            <div className="flex gap-1 mb-2">
              <button 
                onClick={() => setMode("strict")}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mode === 'strict' ? 'bg-blue-500 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
              >
                Strict
              </button>
              <button 
                onClick={() => setMode("hybrid")}
                className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${mode === 'hybrid' ? 'bg-purple-500 text-white shadow-lg' : 'opacity-40 hover:opacity-100'}`}
              >
                Hybrid
              </button>
            </div>
            <p className="text-[9px] px-2 pb-1 opacity-40 leading-tight">
              {mode === 'strict' 
                ? "Fortress Mode: AI is forbidden from using knowledge outside your documents." 
                : "Break-out Mode: AI combines your documents with its general intelligence."}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 space-y-8 custom-scrollbar">
          {/* Workspaces */}
          <div>
            <p className="text-xs font-semibold opacity-40 uppercase tracking-wider mb-4 px-2">Your Vaults</p>
            <div className="space-y-1">
              {workspaces.map(ws => (
                <div key={ws.id} className="group relative">
                  <button
                    onClick={() => setActiveWorkspace(ws.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                      activeWorkspace === ws.id 
                      ? 'bg-blue-500/10 text-[var(--primary)] border border-blue-500/20' 
                      : 'opacity-50 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-sm font-medium">{ws.name}</span>
                  </button>
                  <button 
                    onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1.5 text-red-500/50 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          {activeWorkspace && (
            <div className="animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="glass-panel p-4 mb-4">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wider mb-4">Sources ({documents.length})</p>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-1.5 rounded-lg opacity-60 hover:opacity-100 transition-all group relative">
                      <div className={`w-1.5 h-1.5 rounded-full ${doc.status === 'processed' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                      <span className="text-xs truncate flex-1">{doc.filename}</span>
                      <button 
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500/50 hover:text-red-500 transition-all p-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <p className="text-[10px] opacity-20 italic px-3">No documents yet</p>
                  )}
                </div>
              </div>

              <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-black/10 dark:border-white/10 rounded-2xl hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer group ${isIngesting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isIngesting ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs opacity-40">Ingesting...</p>
                    </div>
                  ) : (
                    <>
                      <FileUp className="w-6 h-6 opacity-20 group-hover:text-blue-500 transition-colors mb-2" />
                      <p className="text-xs opacity-40">Drop document or click</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" onChange={handleUpload} disabled={isIngesting} />
              </label>
            </div>
          )}
        </div>

        <div className="p-4 mt-auto border-t border-black/10 dark:border-white/10">
          <div className="glass-panel p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Encrypted</p>
              <p className="text-xs font-medium truncate">Privacy Shield Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative transition-colors duration-300">
        {/* Header */}
        <header className="h-20 border-b border-black/10 dark:border-white/10 flex items-center justify-between px-8 bg-[var(--background)]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <h2 className="font-bold text-xl tracking-tight">
              {activeWorkspace 
                ? workspaces.find(w => w.id === activeWorkspace)?.name 
                : "Select a Vault"}
            </h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 opacity-40">
              <Cpu className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">{mode === 'strict' ? 'Strict Source-First' : 'Hybrid Genius'} Mode</span>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar scroll-smooth"
        >
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
              <div className={`max-w-2xl p-6 rounded-2xl ${
                msg.role === 'user' 
                  ? 'gradient-bg text-white shadow-xl shadow-blue-500/10' 
                  : 'bg-[var(--secondary)] border border-black/5 dark:border-white/5'
              }`}>
                <div className="text-[15px] leading-relaxed opacity-90 prose dark:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
                
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-black/10 dark:border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3">Context Sources (RRF Score)</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, idx) => (
                        <div 
                          key={idx} 
                          title={source.text}
                          className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 flex items-center gap-2 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
                        >
                          <span className="text-[11px] font-mono text-blue-500">#{(source.score * 100).toFixed(1)}%</span>
                          <span className="text-[11px] opacity-60 truncate max-w-[150px]">{source.filename || `Chunk ${source.chunk_index}`}</span>
                          <ExternalLink className="w-3 h-3 opacity-20" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-8 pt-0">
          <form onSubmit={handleAsk} className="relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative flex items-center bg-[var(--secondary)] rounded-2xl overflow-hidden p-2 border border-black/10 dark:border-white/10 shadow-2xl">
              <div className="flex items-center justify-center w-12 h-12 opacity-20">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={activeWorkspace ? "Ask anything about your documents..." : "Select a workspace to start chatting"}
                disabled={!activeWorkspace}
                className="flex-1 bg-transparent border-none outline-none text-[15px] placeholder:opacity-20 py-4"
              />
              <button 
                type="submit"
                disabled={!activeWorkspace || !query}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-[var(--primary)] text-white hover:scale-95 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg shadow-blue-500/20"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
          <p className="text-center text-[10px] opacity-20 mt-4 tracking-widest uppercase">
            Hybrid RAG v1.0 • Gemini Flash • PostgreSQL Vectors
          </p>
        </div>
      </main>
    </div>
  );
}
