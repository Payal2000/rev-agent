"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, ShieldCheck } from "lucide-react";
import ApprovalCard from "@/components/ApprovalCard";
import { ApprovalContext } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Session {
  session_id: string;
  title: string;
  updated_at: string;
}

interface PendingApproval {
  session_id: string;
  title: string;
  updated_at: string;
  context: ApprovalContext;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const loadPending = useCallback(async () => {
    setLoading(true);
    try {
      const sessRes = await fetch(`${API_BASE}/api/chat/sessions`);
      if (!sessRes.ok) { setLoading(false); return; }
      const sessions: Session[] = await sessRes.json();

      const checks = await Promise.allSettled(
        sessions.map(async (s) => {
          const r = await fetch(`${API_BASE}/api/approval/${s.session_id}/status`);
          if (!r.ok) return null;
          const data = await r.json();
          if (!data.awaiting_approval || !data.approval_context) return null;
          return {
            session_id: s.session_id,
            title: s.title,
            updated_at: s.updated_at,
            context: data.approval_context as ApprovalContext,
          } satisfies PendingApproval;
        })
      );

      const found = checks
        .filter((c): c is PromiseFulfilledResult<PendingApproval | null> => c.status === "fulfilled")
        .map(c => c.value)
        .filter((v): v is PendingApproval => v !== null);

      setPending(found);
    } catch { /* backend unreachable */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);

  const handleDecision = (sessionId: string) => {
    setDismissed(prev => new Set([...prev, sessionId]));
  };

  const visible = pending.filter(p => !dismissed.has(p.session_id));

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-5 md:py-6">
      {/* Header */}
      <div className="mx-4 lg:mx-6 rounded-2xl bg-white/65 backdrop-blur-sm border-[3px] border-white shadow-sm">
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Approvals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Review and approve AI-recommended revenue actions before execution.
            </p>
          </div>
          <button
            onClick={loadPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              background: "#18181b",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Status bar */}
        <div style={{
          borderTop: "1px solid var(--border)",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <Clock size={12} />
            Auto-refreshes when you revisit this page
          </span>
          {!loading && (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: visible.length > 0 ? "var(--warning)" : "var(--success)",
              }} />
              {visible.length > 0
                ? `${visible.length} pending approval${visible.length > 1 ? "s" : ""}`
                : "All clear"}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-4 lg:mx-6">
        {loading ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 0",
            gap: 12,
            color: "var(--text-muted)",
            fontSize: 13,
          }}>
            <RefreshCw size={20} style={{ animation: "spin 1s linear infinite" }} />
            Checking for pending approvals…
          </div>
        ) : visible.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 0",
            gap: 16,
            textAlign: "center",
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "#f4f4f5",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <ShieldCheck size={24} color="#3f3f46" />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                No pending approvals
              </p>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
                AI-recommended actions will appear here when they require your sign-off.
              </p>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--success)",
              background: "var(--success-soft)",
              border: "1px solid color-mix(in oklab, var(--success) 30%, var(--border))",
              padding: "6px 14px",
              borderRadius: 999,
              fontWeight: 600,
            }}>
              <CheckCircle2 size={13} />
              All actions are up to date
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
            {visible.map(p => (
              <div key={p.session_id} style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 16,
                overflow: "hidden",
              }}>
                {/* Session context header */}
                <div style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {p.title}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={10} />
                      {formatTime(p.updated_at)}
                    </p>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                  }}>
                    {p.session_id.slice(0, 8)}…
                  </span>
                </div>

                {/* Approval card */}
                <div style={{ padding: "14px 16px" }}>
                  <ApprovalCard
                    sessionId={p.session_id}
                    context={p.context}
                    onDecision={(approved, message) => {
                      handleDecision(p.session_id);
                      console.log(`[Approvals] ${approved ? "Approved" : "Rejected"} ${p.session_id}:`, message);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
