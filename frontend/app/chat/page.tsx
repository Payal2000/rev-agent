"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, SSEEvent, streamChat } from "@/lib/api";
import ChatMessageComponent from "@/components/chat/ChatMessage";
import {
  Send,
  Sparkles,
  Circle,
  Server,
  Keyboard,
  CornerDownLeft,
  PenLine,
  CheckCircle2,
  Plus,
  MessageSquare,
  Clock,
  Trash2,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SESSION_KEY = "rev_chat_session_id";

async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch { return false; }
}

const SUGGESTED = [
  "What's our MRR by tier?",
  "Why did Enterprise churn spike last month?",
  "Forecast next quarter's revenue",
  "Which accounts are at risk?",
];

const CARD = "bg-white/65 backdrop-blur-sm dark:bg-white/6 border-[3px] border-white dark:border-white/10 shadow-sm rounded-2xl";

interface Session {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ChatInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("new") === "1") {
        const newId = uuidv4();
        localStorage.setItem(SESSION_KEY, newId);
        return newId;
      }
      return localStorage.getItem(SESSION_KEY) || uuidv4();
    }
    return uuidv4();
  });
  const [backendLive, setBackendLive] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoParamsRef = useRef<string>("");

  // Persist session_id to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(SESSION_KEY, sessionId);
  }, [sessionId]);

  useEffect(() => { isBackendReachable().then(setBackendLive); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Load sessions list from backend
  const loadSessions = useCallback(async () => {
    if (!backendLive) return;
    try {
      const r = await fetch(`${API_BASE}/api/chat/sessions`);
      if (r.ok) setSessions(await r.json());
    } catch { /* ignore */ }
  }, [backendLive]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Restore messages for current session on first load
  useEffect(() => {
    if (!backendLive || messages.length > 0) return;
    const restore = async () => {
      setLoadingHistory(true);
      try {
        const r = await fetch(`${API_BASE}/api/chat/sessions/${sessionId}/messages`);
        if (r.ok) {
          const data = await r.json();
          if (data.messages?.length) {
            setMessages(data.messages.map((m: { role: string; content: string }) => ({
              id: uuidv4(),
              role: m.role,
              content: m.content,
              timestamp: new Date(),
            })));
          }
        }
      } catch { /* ignore */ }
      setLoadingHistory(false);
    };
    restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendLive]);

  const startNewChat = () => {
    const newId = uuidv4();
    setSessionId(newId);
    setMessages([]);
  };

  const switchSession = async (sid: string) => {
    if (sid === sessionId) return;
    setSessionId(sid);
    setMessages([]);
    setLoadingHistory(true);
    try {
      const r = await fetch(`${API_BASE}/api/chat/sessions/${sid}/messages`);
      if (r.ok) {
        const data = await r.json();
        setMessages((data.messages || []).map((m: { role: string; content: string }) => ({
          id: uuidv4(),
          role: m.role,
          content: m.content,
          timestamp: new Date(),
        })));
      }
    } catch { /* ignore */ }
    setLoadingHistory(false);
  };

  const deleteSession = async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/chat/sessions/${sid}`, { method: "DELETE" });
    } catch { /* ignore */ }
    setSessions(prev => prev.filter(s => s.session_id !== sid));
    if (sid === sessionId) startNewChat();
  };

  const sendMessage = useCallback((text: string, targetSessionId?: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: uuidv4(), role: "user", content: text.trim(), timestamp: new Date() };
    const assistantMsg: ChatMessage = { id: uuidv4(), role: "assistant", content: "", steps: [], timestamp: new Date() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    const assistantId = assistantMsg.id;
    const handleEvent = (event: SSEEvent) => {
      setMessages(prev => prev.map(m => {
        if (m.id !== assistantId) return m;
        switch (event.type) {
          case "token": return { ...m, content: m.content + (event.content || "") };
          case "step": return { ...m, steps: [...(m.steps || []), { agent: event.agent!, label: event.label! }] };
          case "approval_required": return { ...m, approvalContext: event.context, sessionId: event.session_id };
          case "chart": return { ...m, chartData: { chartType: event.chartType!, data: event.data!, xKey: event.xKey!, yKeys: event.yKeys! } };
          case "error": return { ...m, content: `Error: ${event.message}` };
          default: return m;
        }
      }));
    };

    const handleDone = () => {
      setIsLoading(false);
      loadSessions(); // refresh sidebar after message completes
    };

    const effectiveSessionId = targetSessionId || sessionId;
    if (backendLive) {
      streamChat(text.trim(), effectiveSessionId, handleEvent, handleDone);
    } else {
      handleEvent({
        type: "error",
        message: "Backend is unreachable. Live mode requires backend connectivity.",
      });
      handleDone();
    }
  }, [backendLive, isLoading, loadSessions, sessionId]);

  // Auto-send ?q= and honor ?new=1 on each unique URL param change
  useEffect(() => {
    if (backendLive === null) return;
    const q = (searchParams.get("q") || "").trim();
    if (!q) return;

    const paramsKey = searchParams.toString();
    if (lastAutoParamsRef.current === paramsKey) return;
    lastAutoParamsRef.current = paramsKey;

    const forceNew = searchParams.get("new") === "1";
    if (forceNew) {
      const newId = uuidv4();
      setSessionId(newId);
      setMessages([]);
      localStorage.setItem(SESSION_KEY, newId);
      sendMessage(q, newId);
      return;
    }

    sendMessage(q);
  }, [backendLive, searchParams, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex gap-4 p-4 lg:p-6 h-full overflow-hidden">

      {/* Sessions sidebar */}
      <div className={`${CARD} hidden lg:flex w-60 xl:w-64 flex-shrink-0 flex-col overflow-hidden`}>
        {/* New chat button */}
        <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid var(--border)" }}>
          <button
            onClick={startNewChat}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 12px",
              background: "#18181b",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
            }}
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {/* Sessions list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          <p style={{
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            padding: "4px 8px 8px",
          }}>
            Recent chats
          </p>

          {sessions.length === 0 && !loadingHistory && (
            <div style={{ padding: "20px 8px", textAlign: "center" }}>
              <MessageSquare size={20} color="var(--text-muted)" style={{ margin: "0 auto 8px" }} />
              <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: 0 }}>No chats yet</p>
            </div>
          )}

          {sessions.map(s => (
            <div
              key={s.session_id}
              onClick={() => switchSession(s.session_id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "8px 6px 8px 10px",
                borderRadius: 8,
                background: s.session_id === sessionId ? "#f4f4f5" : "transparent",
                cursor: "pointer",
                marginBottom: 2,
                transition: "background 120ms",
              }}
              onMouseEnter={e => {
                if (s.session_id !== sessionId)
                  (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                const btn = (e.currentTarget as HTMLElement).querySelector(".del-btn") as HTMLElement;
                if (btn) btn.style.opacity = "1";
              }}
              onMouseLeave={e => {
                if (s.session_id !== sessionId)
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                const btn = (e.currentTarget as HTMLElement).querySelector(".del-btn") as HTMLElement;
                if (btn) btn.style.opacity = "0";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5,
                  color: s.session_id === sessionId ? "#18181b" : "var(--text-primary)",
                  fontWeight: s.session_id === sessionId ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.4,
                }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={9} />
                  {formatSessionTime(s.updated_at)}
                </div>
              </div>
              <button
                className="del-btn"
                onClick={(e) => deleteSession(e, s.session_id)}
                style={{
                  opacity: 0,
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 5,
                  transition: "opacity 120ms, background 120ms",
                  color: "var(--text-muted)",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--danger-soft)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                title="Delete chat"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className={`${CARD} flex flex-1 flex-col overflow-hidden min-w-0`}>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {loadingHistory ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Restoring conversation…</span>
            </div>
          ) : messages.length === 0 ? (
            <div style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              maxWidth: 560,
              margin: "0 auto",
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: "#f4f4f5",
                  border: "1px solid var(--border-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}>
                  <Sparkles size={21} color="#3f3f46" />
                </div>
                <h2 style={{
                  margin: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: 30,
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                }}>
                  Ask about your revenue
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
                  Query, analyze, forecast, and act on your SaaS metrics.
                </p>
              </div>

              <div className="suggested-grid">
                {SUGGESTED.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    style={{
                      textAlign: "left",
                      padding: "11px 13px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      fontSize: 12.5,
                      lineHeight: 1.45,
                      transition: "all 150ms",
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--border-strong)";
                      el.style.color = "var(--text-primary)";
                      el.style.background = "var(--bg-hover)";
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--border)";
                      el.style.color = "var(--text-secondary)";
                      el.style.background = "var(--bg-elevated)";
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <p style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}>
                <Server size={12} />
                LangGraph · GPT-4o · PostgreSQL + pgvector
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              {messages.map((msg, i) => (
                <ChatMessageComponent
                  key={msg.id}
                  message={msg}
                  isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"}
                  onApprovalDecision={(approved, agentMessage) => {
                    setMessages(prev => prev.map(m =>
                      m.id === msg.id
                        ? {
                            ...m,
                            content: m.content + (approved
                              ? `\n\n[status:approved] ${agentMessage || "Approved and queued for execution."}`
                              : `\n\n[status:rejected] ${agentMessage || "Rejected by operator."}`),
                            approvalContext: undefined,
                          }
                        : m
                    ));
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about MRR, churn, forecasts, anomalies..."
                rows={1}
                style={{
                  width: "100%",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 13.5,
                  color: "var(--text-primary)",
                  resize: "none",
                  outline: "none",
                  fontFamily: "var(--font-sans)",
                  minHeight: 48,
                  maxHeight: 160,
                  lineHeight: 1.5,
                  transition: "border-color 150ms, box-shadow 150ms",
                  boxSizing: "border-box",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "var(--border-strong)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(0,0,0,0.10)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "var(--border)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: 46,
                height: 46,
                background: input.trim() && !isLoading ? "#18181b" : "var(--bg-elevated)",
                border: `1px solid ${input.trim() && !isLoading ? "#18181b" : "var(--border)"}`,
                borderRadius: 12,
                cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 150ms",
              }}
            >
              <Send size={16} color={input.trim() && !isLoading ? "#ffffff" : "var(--text-muted)"} />
            </button>
          </div>
          <p style={{
            textAlign: "center",
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 8,
            marginBottom: 0,
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Keyboard size={12} /><CornerDownLeft size={12} /> Send</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Keyboard size={12} /><PenLine size={12} /> Shift+Enter new line</span>
            {backendLive !== null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {backendLive ? <CheckCircle2 size={12} color="var(--success)" /> : <Circle size={12} />}
                {backendLive ? "Live backend" : "Demo mode"}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <ChatInner />
    </Suspense>
  );
}
