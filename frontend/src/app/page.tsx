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
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-500/30">
      <div className="noise-bg" />
      
      {/* Sidebar */}
      <aside className="w-80 border-r border-[var(--border)] flex flex-col sidebar-gradient z-20">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-10 group cursor-default">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-2xl shadow-blue-500/40 group-hover:scale-105 transition-transform duration-500">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight leading-none mb-1.5">Hybrid RAG</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${apiError ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-[0.15em]">
                  {apiError ? 'Offline' : 'Engine Ready'}
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleCreateWorkspace}
            className="w-full py-3.5 px-4 rounded-2xl bg-[var(--primary)] text-white font-bold text-sm flex items-center justify-center gap-2.5 hover:opacity-90 hover:scale-[0.98] transition-all active:scale-95 shadow-lg shadow-blue-500/25 mb-8"
          >
            <Plus className="w-5 h-5" />
            New Vault
          </button>

          {/* Mode Switcher - Segmented Control */}
          <div className="glass-panel p-1.5 rounded-2xl mb-10">
            <div className="flex relative">
              <div 
                className={`absolute top-0 bottom-0 w-1/2 bg-white dark:bg-blue-600 rounded-xl shadow-sm transition-all duration-300 ease-out ${mode === 'hybrid' ? 'translate-x-full' : 'translate-x-0'}`}
              />
              <button 
                onClick={() => setMode("strict")}
                className={`relative z-10 flex-1 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-widest transition-colors duration-300 ${mode === 'strict' ? 'text-blue-600 dark:text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
              >
                Strict
              </button>
              <button 
                onClick={() => setMode("hybrid")}
                className={`relative z-10 flex-1 py-2.5 rounded-xl text-[11px] font-extrabold uppercase tracking-widest transition-colors duration-300 ${mode === 'hybrid' ? 'text-blue-600 dark:text-white' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
              >
                Hybrid
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 space-y-10 custom-scrollbar pb-10">
          {/* Vaults */}
          <section>
            <p className="text-[11px] font-extrabold text-[var(--muted)] uppercase tracking-[0.2em] mb-5 px-2">Knowledge Vaults</p>
            <div className="space-y-2">
              {workspaces.map(ws => (
                <div key={ws.id} className="group relative">
                  <button
                    onClick={() => setActiveWorkspace(ws.id)}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                      activeWorkspace === ws.id 
                      ? 'premium-card ring-1 ring-blue-500/20 text-[var(--primary)] bg-blue-500/5' 
                      : 'hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <LayoutDashboard className={`w-4 h-4 ${activeWorkspace === ws.id ? 'text-[var(--primary)]' : 'text-[var(--muted)]'}`} />
                    <span className="text-sm font-bold tracking-tight">{ws.name}</span>
                  </button>
                  <button 
                    onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-red-500/60 hover:text-red-500 transition-all hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Active Vault Sources */}
          {activeWorkspace && (
            <section className="animate-slide-up">
              <div className="glass-panel p-5 rounded-3xl">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-[11px] font-extrabold text-[var(--muted)] uppercase tracking-[0.2em]">Sources ({documents.length})</p>
                  <label className="p-1.5 hover:bg-blue-500/10 rounded-lg cursor-pointer transition-colors text-blue-500">
                    <FileUp className="w-4 h-4" />
                    <input type="file" className="hidden" onChange={handleUpload} disabled={isIngesting} />
                  </label>
                </div>
                
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-white/5 transition-all group">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${doc.status === 'processed' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                      <span className="text-xs font-medium truncate flex-1 opacity-70 group-hover:opacity-100">{doc.filename}</span>
                      <button 
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {documents.length === 0 && (
                    <div className="py-8 flex flex-col items-center justify-center opacity-30 text-center">
                      <FileUp className="w-8 h-8 mb-2" />
                      <p className="text-[10px] uppercase font-bold tracking-widest">No Documents</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Security Footnote */}
        <div className="p-6 border-t border-[var(--border)]">
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Shield className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1">Encrypted</p>
              <p className="text-[11px] font-bold opacity-80">Local Security Active</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative bg-white/40 dark:bg-black/20">
        <header className="h-24 flex items-center justify-between px-10 border-b border-[var(--border)] backdrop-blur-xl bg-[var(--background)]/60 z-10">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-blue-500/5 rounded-2xl border border-blue-500/10">
              <LayoutDashboard className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="font-bold text-2xl tracking-tight leading-none mb-1.5">
                {activeWorkspace 
                  ? workspaces.find(w => w.id === activeWorkspace)?.name 
                  : "Select a Vault"}
              </h2>
              <div className="flex items-center gap-2 opacity-60">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{mode === 'strict' ? 'Fortress Mode' : 'Genius Mode'}</span>
                <span className="w-1 h-1 rounded-full bg-[var(--muted)]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Workspace Active</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 glass-panel px-4 py-2.5 rounded-2xl shadow-none">
              <Cpu className="w-4 h-4 text-violet-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">LLM Instance: Flash-Pro</span>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-10 pt-10 pb-32 space-y-10 custom-scrollbar scroll-smooth"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
              <Database className="w-20 h-20 mb-6" />
              <h3 className="text-3xl font-bold tracking-tighter">Your Knowledge Assistant</h3>
              <p className="text-lg font-medium">Upload documents to build your local brain.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-3xl relative group ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                <div className={`p-6 rounded-3xl ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/20' 
                    : 'bg-[var(--card-bg)] border border-[var(--border)] shadow-sm'
                }`}>
                  <div className="text-[16px] leading-relaxed prose dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-[var(--border)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--muted)] mb-4">Context Citations</p>
                      <div className="flex flex-wrap gap-2.5">
                        {msg.sources.map((source, idx) => (
                          <div 
                            key={idx} 
                            title={source.text}
                            className="px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-[var(--border)] flex items-center gap-3 hover:scale-[1.02] transition-all cursor-default"
                          >
                            <span className="text-[11px] font-bold text-blue-500">#{Math.round(source.score * 100)}</span>
                            <span className="text-[11px] font-bold opacity-70 truncate max-w-[180px]">{source.filename || `Chunk ${source.chunk_index}`}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-30" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Floating Input Area */}
        <div className="absolute bottom-10 inset-x-0 flex justify-center px-10 z-20">
          <form 
            onSubmit={handleAsk} 
            className="w-full max-w-4xl glass-panel p-2.5 rounded-[2.5rem] shadow-2xl flex items-center gap-4 focus-within:ring-2 ring-blue-500/50 transition-all duration-500"
          >
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
              <Search className="w-5 h-5 text-blue-500" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeWorkspace ? "Ask your documents anything..." : "Select a vault to start"}
              disabled={!activeWorkspace}
              className="flex-1 bg-transparent border-none outline-none text-[16px] font-medium placeholder:text-[var(--muted)]"
            />
            <button 
              type="submit"
              disabled={!query || !activeWorkspace}
              className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 transition-all shadow-lg shadow-blue-500/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
