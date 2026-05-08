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
  Trash2,
  Loader2,
  Gauge
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

interface IngestionProgress {
  current_stage?: string;
  chunks_count?: number;
  load_split_seconds?: number;
  embedding_seconds?: number;
  embedding_batches?: Array<{ batch_index: number; batch_size: number; seconds: number }>;
  db_save_seconds?: number;
  total_seconds?: number;
  embedding_model?: string;
  error?: string;
  can_resume_with_local?: boolean;
  user_message?: string;
}

interface UploadProgressState {
  documentId: string;
  filename: string;
  uploadSeconds?: number;
  status: string;
  progress?: IngestionProgress;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function HybridRAGDashboard() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isResumingWithLocal, setIsResumingWithLocal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isBackendLoading, setIsBackendLoading] = useState(true);
  const [mode, setMode] = useState<"strict" | "hybrid">("strict");
  const [activeCitation, setActiveCitation] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Bulletproof Global Mouse Watcher to prevent "sticky" tooltips
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!activeCitation) return;
      
      // Check if the element under the mouse is a citation circle
      const target = e.target as HTMLElement;
      const isOverCircle = target.closest('.citation-circle');
      
      if (!isOverCircle) {
        setActiveCitation(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, [activeCitation]);

  // Helper to parse citations from text
  const parseCitations = (children: any, sources?: any[]) => {
    return React.Children.map(children, (child) => {
      if (typeof child === "string") {
        const parts = child.split(/(\[[\w\d\._-]+\])/g);
        return parts.map((part, i) => {
          const citationMatch = part.match(/^\[(.*)\]$/);
          if (citationMatch) {
            const inner = citationMatch[1];
            let index = -1;
            if (/^\d+$/.test(inner)) {
              index = parseInt(inner) - 1;
            } else if (sources) {
              index = sources.findIndex(s => s.filename === inner || s.filename?.includes(inner));
            }

            if (index !== -1 && sources && sources[index]) {
              return (
                <span 
                  key={i}
                  onMouseEnter={(e) => {
                    setMousePos({ x: e.clientX, y: e.clientY });
                    setActiveCitation(sources[index]);
                  }}
                  className="citation-circle inline-flex items-center justify-center mx-1 cursor-help hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors duration-100"
                >
                  {index + 1}
                </span>
              );
            }
          }
          return part;
        });
      }
      return child;
    });
  };

  const [sidebarWidthRem, setSidebarWidthRem] = useState(22);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  
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

  // Load workspaces on mount with health check
  useEffect(() => {
    const loadWorkspaces = async () => {
      setIsBackendLoading(true);
      try {
        // Try to fetch with a timeout
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch("http://localhost:8000/v1/workspaces", { signal: controller.signal });
        clearTimeout(id);
        
        if (!res.ok) throw new Error("Failed to fetch workspaces");
        const data = await res.json();
        setWorkspaces(data);
        if (data.length > 0 && !activeWorkspace) {
          setActiveWorkspace(data[0].id);
        }
        setApiError(null);
        setIsBackendLoading(false);
      } catch (err) {
        console.error("API Connection Error:", err);
        // If it's a timeout or connection refused, it might be spinning up
        setApiError("Backend API is offline or warming up.");
        // We keep isBackendLoading true if we want to keep showing the animation, 
        // but let's allow it to show the error after a few retries.
        setTimeout(loadWorkspaces, 5000); // Retry every 5s
      }
    };
    loadWorkspaces();
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!rootRef.current) return;
      const rootLeft = rootRef.current.getBoundingClientRect().left;
      const widthPx = event.clientX - rootLeft;
      const widthRem = widthPx / 16;
      const clampedWidth = Math.min(28, Math.max(16, widthRem));
      setSidebarWidthRem(clampedWidth);
    };

    const handlePointerUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSidebar]);

  // Load documents for active workspace — clear first to prevent cross-vault bleed
  useEffect(() => {
    setDocuments([]);
    setUploadProgress(null);
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
      if (!response.ok) {
        let details = "Request failed.";
        try {
          const errorPayload = await response.json();
          details = errorPayload.detail || JSON.stringify(errorPayload);
        } catch {
          // Keep fallback message if response is not JSON
        }
        throw new Error(`Chat request failed (${response.status}): ${details}`);
      }
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
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "ai",
        content: `I ran into an error while generating the reply. ${err instanceof Error ? err.message : "Please try again."}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;

    setIsIngesting(true);
    setUploadProgress(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("owner_id", "web_user");

    try {
      const uploadStart = performance.now();
      const response = await fetch(`http://localhost:8000/v1/ingest?workspace_id=${activeWorkspace}`, {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      const uploadSeconds = (performance.now() - uploadStart) / 1000;
      const documentId = data.document_id;

      if (!documentId) {
        throw new Error("Upload succeeded but no document id was returned.");
      }

      setUploadProgress({
        documentId,
        filename: file.name,
        uploadSeconds,
        status: "processing",
      });

      const pollForProgress = async (targetDocumentId: string) => {
        for (let i = 0; i < 300; i += 1) {
          const docsRes = await fetch(`http://localhost:8000/v1/documents?workspace_id=${activeWorkspace}`);
          const docsData = await docsRes.json();
          setDocuments(docsData);

          const currentDoc = docsData.find((doc: any) => doc.id === targetDocumentId);
          if (!currentDoc) {
            await sleep(1000);
            continue;
          }

          const progress = currentDoc.doc_metadata?.ingestion_progress;
          setUploadProgress(prev => prev ? {
            ...prev,
            status: currentDoc.status,
            progress,
          } : null);

          if (currentDoc.status === "processed") return;
          if (progress?.current_stage === "awaiting_local_fallback_confirmation") return;
          if (currentDoc.status === "failed" && !progress?.can_resume_with_local) return;

          await sleep(1000);
        }
      };

      await pollForProgress(documentId);
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

  const handleResumeWithLocalEmbeddings = async () => {
    if (!activeWorkspace || !uploadProgress) return;
    setIsResumingWithLocal(true);
    try {
      const resumeRes = await fetch(`http://localhost:8000/v1/documents/${uploadProgress.documentId}/resume-local`, {
        method: "POST",
      });
      if (!resumeRes.ok) {
        const payload = await resumeRes.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to resume with local embeddings.");
      }

      setUploadProgress(prev => prev ? {
        ...prev,
        status: "processing",
        progress: {
          ...(prev.progress || {}),
          current_stage: "local_fallback_queued",
          user_message: "Continuing ingestion with local embeddings.",
        },
      } : null);

      for (let i = 0; i < 300; i += 1) {
        const docsRes = await fetch(`http://localhost:8000/v1/documents?workspace_id=${activeWorkspace}`);
        const docsData = await docsRes.json();
        setDocuments(docsData);

        const currentDoc = docsData.find((doc: any) => doc.id === uploadProgress.documentId);
        if (!currentDoc) {
          await sleep(1000);
          continue;
        }

        const progress = currentDoc.doc_metadata?.ingestion_progress;
        setUploadProgress(prev => prev ? {
          ...prev,
          status: currentDoc.status,
          progress,
        } : null);

        if (currentDoc.status === "processed") return;
        if (currentDoc.status === "failed" && !progress?.can_resume_with_local) return;
        await sleep(1000);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not resume with local embeddings.");
    } finally {
      setIsResumingWithLocal(false);
    }
  };

  const handleDismissLocalFallback = () => {
    setUploadProgress(null);
    setIsIngesting(false);
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
    <div
      ref={rootRef}
      className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] selection:bg-blue-500/30"
    >
      <div className="noise-bg" />
      
      {/* Backend Warming Up Overlay */}
      {isBackendLoading && !apiError && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl transition-all duration-1000">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-white/10 animate-ping absolute inset-0" />
            <div className="w-32 h-32 rounded-full border border-white/20 flex items-center justify-center relative bg-black/40 backdrop-blur-md">
              <Cpu className="w-12 h-12 text-white animate-pulse" />
            </div>
          </div>
          <div className="mt-12 text-center space-y-4 max-w-md px-6">
            <h2 className="text-2xl font-black uppercase tracking-[0.2em] bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
              Warming Up Engines
            </h2>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 animate-pulse">
              Initializing Hybrid RAG Stack • Node 01
            </p>
            <div className="h-1 w-48 bg-white/5 rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-white animate-loading-bar shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
            </div>
            <p className="text-[10px] text-[var(--muted)] font-medium italic opacity-60">
              Free-tier servers spin down after inactivity. <br/> This usually takes 30-45 seconds.
            </p>
          </div>
        </div>
      )}

      {/* Persistent Error Overlay */}
      {apiError && (
        <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl px-8">
          <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-8 shadow-2xl shadow-red-500/20">
            <Shield className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-black uppercase tracking-widest mb-2 text-red-500">System Connection Lost</h2>
          <p className="text-sm text-[var(--muted)] text-center max-w-sm font-medium mb-8">
            {apiError}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all active:scale-95 shadow-2xl shadow-white/10"
          >
            Retry Connection
          </button>
        </div>
      )}
      
      {/* Sidebar - Flexible Width */}
      <aside
        className={`border-r border-[var(--border)] flex flex-col sidebar-gradient z-20 shrink-0 ${
          isResizingSidebar ? "transition-none" : "transition-all duration-500"
        }`}
        style={{ width: `${sidebarWidthRem}rem`, minWidth: "16rem", maxWidth: "28rem" }}
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-10 group cursor-default">
            <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-2xl shadow-white/20 group-hover:scale-105 transition-transform duration-500">
              <Database className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight leading-none mb-1.5">Hybrid RAG</h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${apiError ? 'bg-red-500' : 'bg-white animate-pulse'}`} />
                <span className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-[0.15em]">
                  {apiError ? 'Offline' : 'Engine Ready'}
                </span>
              </div>
            </div>
          </div>

          <button 
            onClick={handleCreateWorkspace}
            className="w-full py-3.5 px-4 rounded-2xl bg-[var(--secondary)] text-[var(--foreground)] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2.5 hover:opacity-80 hover:scale-[0.98] transition-all active:scale-95 border border-[var(--border)] mb-8 shadow-xl"
          >
            <Plus className="w-5 h-5" />
            New Vault
          </button>

          {/* Mode Switcher - Segmented Control */}
          <div className="bg-[var(--secondary)] p-1.5 rounded-2xl mb-10 border border-[var(--border)]">
            <div className="flex relative">
              <div 
                className={`absolute top-0 bottom-0 w-1/2 bg-[var(--background)] rounded-xl shadow-lg transition-all duration-300 ease-out border border-[var(--border)] ${mode === 'hybrid' ? 'translate-x-full' : 'translate-x-0'}`}
              />
              <button 
                onClick={() => setMode("strict")}
                className={`relative z-10 flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors duration-300 ${mode === 'strict' ? 'text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
              >
                Strict
              </button>
              <button 
                onClick={() => setMode("hybrid")}
                className={`relative z-10 flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors duration-300 ${mode === 'hybrid' ? 'text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
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
                      ? 'bg-[var(--secondary)] ring-1 ring-[var(--border)] text-[var(--foreground)] shadow-lg' 
                      : 'hover:bg-white/5 opacity-60 hover:opacity-100'
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
                </div>
                
                <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                  {uploadProgress && (
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-3 mb-3 animate-slide-up shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Loader2 className={`w-4 h-4 text-[var(--foreground)] ${
                          uploadProgress.status === "processed" ||
                          (uploadProgress.status === "failed" && uploadProgress.progress?.current_stage !== "awaiting_local_fallback_confirmation")
                            ? ""
                            : "animate-spin"
                        }`} />
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--foreground)]">
                          {uploadProgress.status === "processed"
                            ? "Ingestion Complete"
                            : uploadProgress.progress?.current_stage === "awaiting_local_fallback_confirmation"
                              ? "Action Needed"
                              : uploadProgress.status === "failed"
                                ? "Ingestion Failed"
                                : "Ingestion In Progress"}
                        </p>
                      </div>
                      <p className="text-[11px] font-bold truncate opacity-80 mb-2">{uploadProgress.filename}</p>
                      <div className="space-y-1 text-[10px] opacity-80">
                        <div className="flex items-center justify-between">
                          <span>Upload</span>
                          <span>{uploadProgress.uploadSeconds?.toFixed(2)}s</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Load + Split</span>
                          <span>{uploadProgress.progress?.load_split_seconds?.toFixed(2) ?? "--"}s</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Embed</span>
                          <span>{uploadProgress.progress?.embedding_seconds?.toFixed(2) ?? "--"}s</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Save DB</span>
                          <span>{uploadProgress.progress?.db_save_seconds?.toFixed(2) ?? "--"}s</span>
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-blue-500/20">
                          <span className="font-extrabold">Total</span>
                          <span className="font-extrabold">{uploadProgress.progress?.total_seconds?.toFixed(2) ?? "--"}s</span>
                        </div>
                        <div className="flex items-center gap-1 pt-1 text-blue-500">
                          <Gauge className="w-3 h-3" />
                          <span className="font-semibold">
                            Stage: {uploadProgress.progress?.current_stage ?? uploadProgress.status}
                          </span>
                        </div>
                        {uploadProgress.progress?.user_message && (
                          <p className="pt-2 text-[10px] text-blue-600 dark:text-blue-300 font-semibold">
                            {uploadProgress.progress.user_message}
                          </p>
                        )}
                        {uploadProgress.progress?.current_stage === "awaiting_local_fallback_confirmation" && (
                          <div className="flex gap-2 mt-2">
                            <button
                              type="button"
                              onClick={handleResumeWithLocalEmbeddings}
                              disabled={isResumingWithLocal}
                              className="flex-1 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-[10px] font-black uppercase tracking-wide py-2 disabled:opacity-50 hover:opacity-80 transition-all"
                            >
                              {isResumingWithLocal ? "Starting..." : "Use Local"}
                            </button>
                            <button
                              type="button"
                              onClick={handleDismissLocalFallback}
                              disabled={isResumingWithLocal}
                              className="flex-1 rounded-lg bg-transparent border border-[var(--border)] text-[var(--muted)] text-[10px] font-bold uppercase tracking-wide py-2 hover:bg-[var(--secondary)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                            >
                              No Thanks
                            </button>
                          </div>
                        )}
                        {uploadProgress.progress?.current_stage === "failed" && uploadProgress.progress?.error && (
                          <p className="pt-2 text-[10px] text-red-500 break-words">{uploadProgress.progress.error}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-[var(--secondary)] transition-all group">
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
                  
                  {documents.length === 0 ? (
                    <label className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-[var(--border)] rounded-3xl cursor-pointer hover:bg-[var(--secondary)] hover:border-[var(--muted)] transition-all group animate-pulse-subtle">
                      <FileUp className="w-8 h-8 mb-3 text-[var(--muted)] group-hover:text-[var(--foreground)] group-hover:scale-110 transition-all duration-300" />
                      <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--muted)] group-hover:text-[var(--foreground)]">Click to Upload</p>
                      <p className="text-[9px] opacity-40 mt-1">PDF, DOCX, TXT, or Markdown</p>
                      <input type="file" className="hidden" onChange={handleUpload} disabled={isIngesting} />
                    </label>
                  ) : (
                    <label className="flex items-center justify-center py-3 border border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:bg-white/5 transition-all group mt-2">
                      <Plus className="w-4 h-4 text-[var(--muted)] group-hover:text-white mr-2" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] group-hover:text-white">Add Source</span>
                      <input type="file" className="hidden" onChange={handleUpload} disabled={isIngesting} />
                    </label>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Security Footnote */}
        <div className="p-6 border-t border-[var(--border)]">
          <div className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white">
            <Shield className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest leading-none mb-1">Encrypted</p>
              <p className="text-[11px] font-bold opacity-80">Local Security Active</p>
            </div>
          </div>
        </div>
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={(e) => {
          e.preventDefault();
          setIsResizingSidebar(true);
        }}
        className={`relative z-30 w-1 cursor-col-resize group ${
          isResizingSidebar ? "bg-blue-500/50" : "bg-transparent"
        }`}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-blue-500/25 transition-colors" />
      </div>

      {/* Main Chat Area - Flexible */}
      <main
        className={`flex-1 flex flex-col relative bg-white/40 dark:bg-black/20 min-w-0 ${
          isResizingSidebar ? "transition-none" : "transition-all duration-500"
        }`}
      >
        <header className="h-20 flex items-center justify-between px-10 border-b border-[var(--border)] backdrop-blur-xl bg-[var(--background)]/60 z-10">
          <div className="flex items-center gap-5">
            <div className="p-2.5 bg-white/5 rounded-xl border border-white/10">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-xl tracking-tight leading-none mb-1.5">
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
            <div className="flex items-center gap-3 glass-panel px-4 py-2.5 rounded-2xl shadow-none border-white/10">
              <Cpu className="w-4 h-4 text-white" />
              <span className="text-[11px] font-bold uppercase tracking-widest opacity-60">LLM Instance: Flash-Pro</span>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-10 pt-10 pb-10 space-y-10 custom-scrollbar scroll-smooth"
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
                <div className={`${
                  msg.role === 'user' 
                    ? 'p-6 rounded-3xl bg-[var(--secondary)] text-[var(--foreground)] font-medium shadow-xl border border-white/5' 
                    : 'py-2 px-0'
                }`}>
                  <div className={`text-[16px] leading-relaxed prose dark:prose-invert max-w-none ${msg.role === 'ai' ? 'prose-p:mt-0' : ''}`}>
                    <ReactMarkdown
                      components={{
                        // Shared parser function for citations
                        p: ({ children }) => <p>{parseCitations(children, msg.sources)}</p>,
                        li: ({ children }) => <li>{parseCitations(children, msg.sources)}</li>,
                        h1: ({ children }) => <h1>{parseCitations(children, msg.sources)}</h1>,
                        h2: ({ children }) => <h2>{parseCitations(children, msg.sources)}</h2>,
                        h3: ({ children }) => <h3>{parseCitations(children, msg.sources)}</h3>,
                        a: ({ node, ...props }) => {
                          const content = props.children?.toString() || "";
                          const isCitation = /^\[\d+\]$/.test(content);
                          if (isCitation) {
                            const index = parseInt(content.replace(/[\[\]]/g, "")) - 1;
                            return (
                              <span 
                                onClick={() => setActiveCitation(msg.sources?.[index])}
                                className="citation-circle"
                              >
                                {index + 1}
                              </span>
                            );
                          }
                          return <a {...props} className="text-white underline" />;
                        }
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-[var(--border)]">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--muted)] mb-4">Context Sources</p>
                      <div className="flex flex-wrap gap-2.5">
                        {msg.sources.map((source, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setActiveCitation(source)}
                            className="px-3.5 py-2 rounded-xl bg-white/5 border border-[var(--border)] flex items-center gap-3 hover:bg-white/10 transition-all cursor-pointer group"
                          >
                            <span className="text-[11px] font-black text-white">#{idx + 1}</span>
                            <span className="text-[11px] font-bold opacity-70 truncate max-w-[180px]">{source.filename || `Chunk ${source.chunk_index}`}</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {messages.length > 0 && <div className="h-10" />}
        </div>

        {/* Gradient Fade + Floating Input Area */}
        <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/90 to-transparent pointer-events-none z-20" />
        
        <div className="absolute bottom-10 inset-x-0 flex justify-center px-10 z-30">
          <form 
            onSubmit={handleAsk} 
            className="w-full max-w-5xl bg-[var(--background)] p-2 rounded-[2rem] shadow-2xl flex items-center gap-4 border border-[var(--border)] focus-within:ring-1 ring-[var(--foreground)]/20 transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-full bg-[var(--foreground)]/5 flex items-center justify-center shrink-0">
              <Search className="w-4 h-4 text-[var(--foreground)] opacity-40" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeWorkspace ? "Ask your documents anything..." : "Select a vault to start"}
              disabled={!activeWorkspace}
              className="flex-1 bg-transparent border-none outline-none text-[16px] font-medium text-[var(--foreground)] placeholder:text-[var(--foreground)] placeholder:opacity-20 py-2"
            />
            <button 
              type="submit"
              disabled={!query || !activeWorkspace}
              className="w-11 h-11 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center hover:opacity-80 active:scale-95 disabled:opacity-10 transition-all shadow-lg"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Floating Source Evidence Tooltip */}
        {activeCitation && (
          <div 
            style={{ 
              top: mousePos.y + 20, 
              left: Math.min(mousePos.x, typeof window !== 'undefined' ? window.innerWidth - 380 : 0) 
            }}
            className="fixed w-80 bg-[var(--background)] backdrop-blur-3xl border border-[var(--border)] z-[100] p-6 rounded-2xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-200 pointer-events-none"
          >
            <header className="flex items-center justify-between mb-4">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Evidence Chunk</span>
              <span className="text-[10px] font-black text-[var(--foreground)] px-2 py-0.5 rounded-md bg-[var(--secondary)] border border-[var(--border)]">
                {(activeCitation.score * 100).toFixed(0)}% Match
              </span>
            </header>
            
            <p className="text-xs leading-relaxed italic text-[var(--foreground)] opacity-80 mb-5 border-l-2 border-[var(--border)] pl-4">
              "{activeCitation.text}"
            </p>

            <footer className="pt-4 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-[10px] font-bold text-[var(--muted)] truncate max-w-[150px]">
                {activeCitation.filename}
              </span>
              <span className="text-[9px] font-black text-[var(--muted)] uppercase tracking-tighter">
                Ref: #{activeCitation.chunk_index}
              </span>
            </footer>
          </div>
        )}
      </main>
    </div>
  );
}
