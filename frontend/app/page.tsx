"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, BarChart2, Wifi, WifiOff } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { ChatMessage, SSEEvent, streamChat } from "@/lib/api";
import { streamMockResponse } from "@/lib/mockResponses";
import MessageBubble from "@/components/MessageBubble";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const EXAMPLE_QUERIES = [
  "What is our MRR by plan tier this month?",
  "Why did Enterprise churn spike last month?",
  "What will our MRR be next quarter?",
  "Show me payment failure rate for the last 30 days",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => uuidv4());
  const [backendLive, setBackendLive] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isBackendReachable().then(setBackendLive);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    const assistantMsg: ChatMessage = {
      id: uuidv4(),
      role: "assistant",
      content: "",
      steps: [],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    const assistantId = assistantMsg.id;

    const handleEvent = (event: SSEEvent) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          switch (event.type) {
            case "token":
              return { ...m, content: m.content + (event.content || "") };
            case "step":
              return { ...m, steps: [...(m.steps || []), { agent: event.agent!, label: event.label! }] };
            case "approval_required":
              return { ...m, approvalContext: event.context, sessionId: event.session_id };
            case "error":
              return { ...m, content: `Error: ${event.message}` };
            default:
              return m;
          }
        })
      );
    };

    const handleDone = () => setIsLoading(false);

    if (backendLive) {
      streamChat(text.trim(), sessionId, handleEvent, handleDone);
    } else {
      streamMockResponse(text.trim(), handleEvent, handleDone);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-white">RevAgent</h1>
            <p className="text-xs text-zinc-500">Revenue Intelligence · Multi-Agent AI</p>
          </div>
        </div>
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <a href="/dashboard" className="flex items-center gap-1.5 hover:text-white transition">
            <BarChart2 size={15} />
            Dashboard
          </a>
          {backendLive !== null && (
            <span
              className={`flex items-center gap-1.5 text-xs ${backendLive ? "text-emerald-400" : "text-zinc-500"}`}
              title={backendLive ? "Backend connected" : "Demo mode — backend not running"}
            >
              {backendLive ? <Wifi size={13} /> : <WifiOff size={13} />}
              {backendLive ? "Live" : "Demo"}
            </span>
          )}
        </nav>
      </header>

      {/* Demo mode banner */}
      {backendLive === false && (
        <div className="bg-zinc-800/60 border-b border-zinc-700 px-6 py-2 text-xs text-zinc-400 text-center">
          Running in demo mode — start the backend to connect live data.{" "}
          <code className="text-zinc-300 bg-zinc-900 px-1.5 py-0.5 rounded">
            uvicorn api.main:app --reload
          </code>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 pb-20">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-white">Ask about your revenue</h2>
              <p className="text-zinc-500 text-sm">
                Query, analyze, forecast, and act on your SaaS metrics with natural language.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-300 hover:text-white transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isLoading && i === messages.length - 1 && msg.role === "assistant"}
                onApprovalDecision={(approved) => {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === msg.id
                        ? {
                            ...m,
                            content:
                              m.content +
                              (approved
                                ? "\n\n✅ Recommendations approved and queued for execution."
                                : "\n\n❌ Recommendations rejected."),
                            approvalContext: undefined,
                          }
                        : m
                    )
                  );
                }}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {/* Input */}
      <div className="border-t border-zinc-800 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about MRR, churn, forecasts, anomalies..."
            rows={1}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none focus:border-violet-500 transition"
            style={{ minHeight: "48px", maxHeight: "160px" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className="w-11 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition flex-shrink-0"
          >
            <Send size={16} className="text-white" />
          </button>
        </div>
        <p className="text-center text-xs text-zinc-600 mt-2">
          Powered by LangGraph · GPT-4o · PostgreSQL + pgvector
        </p>
      </div>
    </div>
  );
}
