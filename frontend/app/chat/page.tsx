"use client";

import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, SSEEvent, streamChat } from "@/lib/api";
import { streamMockResponse } from "@/lib/mockResponses";
import ChatMessageComponent from "@/components/chat/ChatMessage";
import { Send, Sparkles } from "lucide-react";

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
          case "step":  return { ...m, steps: [...(m.steps || []), { agent: event.agent!, label: event.label! }] };
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
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Chat panel */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--border)",
        overflow: "hidden",
      }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {messages.length === 0 ? (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 28,
              maxWidth: 520, margin: "0 auto",
            }}>
              {/* Hero */}
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                  boxShadow: "0 0 24px rgba(99,102,241,0.3)",
                }}>
                  <Sparkles size={22} color="white" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
                  Ask about your revenue
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                  Query, analyze, forecast, and act on your SaaS metrics
                </p>
              </div>

              {/* Suggested queries */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
                {SUGGESTED.map(q => (
                  <button key={q} onClick={() => sendMessage(q)} style={{
                    textAlign: "left", padding: "10px 14px",
                    background: "var(--bg-surface)", border: "1px solid var(--border)",
                    borderRadius: 10, cursor: "pointer", color: "var(--text-secondary)",
                    fontSize: 12.5, lineHeight: 1.4, transition: "all 150ms",
                  }}
                    onMouseEnter={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "rgba(99,102,241,0.4)";
                      el.style.color = "var(--text-primary)";
                      el.style.background = "rgba(99,102,241,0.06)";
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.borderColor = "var(--border)";
                      el.style.color = "var(--text-secondary)";
                      el.style.background = "var(--bg-surface)";
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                LangGraph · GPT-4o · PostgreSQL + pgvector
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 720, margin: "0 auto" }}>
              {messages.map((msg, i) => (
                <ChatMessageComponent
                  key={msg.id}
                  message={msg}
                  isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"}
                  onApprovalDecision={(approved) => {
                    setMessages(prev => prev.map(m =>
                      m.id === msg.id
                        ? { ...m, content: m.content + (approved ? "\n\n✅ Approved and queued for execution." : "\n\n❌ Rejected."), approvalContext: undefined }
                        : m
                    ));
                  }}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "16px 24px",
          background: "var(--bg-surface)",
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about MRR, churn, forecasts, anomalies..."
                rows={1}
                style={{
                  width: "100%", background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 10, padding: "12px 16px",
                  fontSize: 13.5, color: "var(--text-primary)",
                  resize: "none", outline: "none",
                  fontFamily: "var(--font-sans)",
                  minHeight: 48, maxHeight: 160,
                  lineHeight: 1.5,
                  transition: "border-color 150ms",
                  boxSizing: "border-box",
                }}
                onFocus={e => (e.target.style.borderColor = "rgba(99,102,241,0.5)")}
                onBlur={e => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={isLoading || !input.trim()}
              style={{
                width: 46, height: 46,
                background: input.trim() && !isLoading ? "#6366f1" : "var(--bg-elevated)",
                border: `1px solid ${input.trim() && !isLoading ? "#6366f1" : "var(--border)"}`,
                borderRadius: 10, cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "all 150ms",
              }}
            >
              <Send size={16} color={input.trim() && !isLoading ? "white" : "var(--text-muted)"} />
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
            ↵ Send · ⇧↵ New line · {backendLive === true ? "● Live backend" : backendLive === false ? "○ Demo mode" : ""}
          </p>
        </div>
      </div>

      {/* Context panel — hidden on tablet/mobile via CSS */}
      <div className="chat-context">
        <div>
          <h3 style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>
            Quick context
          </h3>
          {[
            { label: "Current MRR",  value: "$423.8K", color: "#10b981" },
            { label: "Active subs",  value: "1,284",   color: "var(--text-primary)" },
            { label: "Churn rate",   value: "2.1%",    color: "#f59e0b" },
            { label: "NRR",          value: "108.4%",  color: "#10b981" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)" }}>
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
            { dot: "#f43f5e", text: "Enterprise churn spiked 42%" },
            { dot: "#f59e0b", text: "Payment failure rate at 3.4%" },
          ].map(({ dot, text }) => (
            <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, marginTop: 5, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
