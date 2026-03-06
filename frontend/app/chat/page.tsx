"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, SSEEvent, streamChat } from "@/lib/api";
import { streamMockResponse } from "@/lib/mockResponses";
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
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [backendLive, setBackendLive] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { isBackendReachable().then(setBackendLive); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = (text: string) => {
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
          case "error": return { ...m, content: `Error: ${event.message}` };
          default: return m;
        }
      }));
    };

    const handleDone = () => setIsLoading(false);

    if (backendLive) streamChat(text.trim(), sessionId, handleEvent, handleDone);
    else streamMockResponse(text.trim(), handleEvent, handleDone);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="flex gap-4 p-4 lg:p-6 h-full overflow-hidden">
      {/* Main chat area */}
      <div className={`${CARD} flex flex-1 flex-col overflow-hidden min-w-0`}>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {messages.length === 0 ? (
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
                  background: "var(--accent-soft)",
                  border: "1px solid var(--border-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 14px",
                }}>
                  <Sparkles size={21} color="var(--accent-ink)" />
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
                  onApprovalDecision={(approved) => {
                    setMessages(prev => prev.map(m =>
                      m.id === msg.id
                        ? {
                            ...m,
                            content: m.content + (approved
                              ? "\n\n[status:approved] Approved and queued for execution."
                              : "\n\n[status:rejected] Rejected by operator."),
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
                  e.target.style.boxShadow = "0 0 0 3px color-mix(in oklab, var(--primary) 20%, transparent)";
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
                background: input.trim() && !isLoading ? "var(--primary)" : "var(--bg-elevated)",
                border: `1px solid ${input.trim() && !isLoading ? "var(--primary)" : "var(--border)"}`,
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

      {/* Context sidebar */}
      <div className={`${CARD} hidden lg:flex w-72 xl:w-80 flex-shrink-0 flex-col gap-5 p-5 overflow-y-auto`}>
        <div>
          <h3 style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
            Quick context
          </h3>
          {[
            { label: "Current MRR", value: "$423.8K", color: "var(--success)" },
            { label: "Active subs", value: "1,284", color: "var(--text-primary)" },
            { label: "Churn rate", value: "2.1%", color: "var(--warning)" },
            { label: "NRR", value: "108.4%", color: "var(--success)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{value}</span>
            </div>
          ))}
        </div>

        <div>
          <h3 style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
            Active alerts
          </h3>
          {[
            { dot: "var(--danger)", text: "Enterprise churn spiked 42%" },
            { dot: "var(--warning)", text: "Payment failure rate at 3.4%" },
          ].map(({ dot, text }) => (
            <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, marginTop: 5, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
