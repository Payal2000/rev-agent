"use client";

import { useState } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ApprovalContext, Recommendation, submitApproval } from "@/lib/api";

interface Props {
  sessionId: string;
  context: ApprovalContext;
  onDecision: (approved: boolean, message?: string) => void;
}

export default function ApprovalCard({ sessionId, context, onDecision }: Props) {
  const [loading, setLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const isMock = sessionId.startsWith("mock-");

  const handleApprove = async () => {
    setLoading(true);
    try {
      const result = isMock ? {} : await submitApproval(sessionId, true);
      onDecision(true, result.message);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleReject = async () => {
    if (!showRejectInput) { setShowRejectInput(true); return; }
    setLoading(true);
    try {
      const result = isMock ? {} : await submitApproval(sessionId, false, undefined, rejectionReason);
      onDecision(false, result.message);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e4e0f0",
      borderRadius: 12,
      padding: "14px",
      marginTop: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)" }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--warning)", letterSpacing: "0.04em" }}>RECOMMENDED ACTION</span>
        <span style={{
          marginLeft: "auto",
          fontSize: 10.5,
          color: "#0369a1",
          background: "#e0f2fe",
          padding: "2px 8px",
          borderRadius: 999,
          fontWeight: 400,
        }}>
          Awaiting approval
        </span>
      </div>

      {context.anomaly_summary?.length > 0 && (
        <div style={{ background: "var(--danger-soft)", border: "1px solid color-mix(in oklab, var(--danger) 30%, var(--border))", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
          {context.anomaly_summary.map((a, i) => (
            <span key={i} style={{ fontSize: 11.5, marginRight: 12 }}>
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>{a.metric.replace(/_/g, " ")}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginLeft: 4 }}>z={a.z_score.toFixed(1)}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {context.recommendations?.map((rec: Recommendation) => (
          <div key={rec.rank} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#e0f2fe",
                  border: "1px solid #bae6fd",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#0369a1",
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {rec.rank}
                </span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{rec.title}</p>
                  <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: "3px 0 0", lineHeight: 1.45 }}>{rec.description}</p>
                </div>
              </div>
              <span style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--success)",
                background: "var(--success-soft)",
                border: "1px solid color-mix(in oklab, var(--success) 30%, var(--border))",
                padding: "2px 8px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontFamily: "var(--font-mono)",
              }}>
                {rec.estimated_impact}
              </span>
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => setShowReasoning(s => !s)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10, padding: 0 }}>
        {showReasoning ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        View reasoning
      </button>

      {showReasoning && (
        <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          These recommendations were generated by searching the RevAgent playbook for strategies matching
          the detected anomaly pattern. Past similar executions recovered an average of 68% of at-risk ARR within 30 days.
        </div>
      )}

      {showRejectInput && (
        <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
          placeholder="Reason for rejection (optional)..."
          style={{ width: "100%", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "var(--text-primary)", resize: "none", height: 60, fontFamily: "var(--font-sans)", outline: "none", marginBottom: 8, display: "block" }}
        />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleApprove} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--success)", color: "#f6faf6", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
          <CheckCircle size={14} /> Approve
        </button>
        <button onClick={handleReject} disabled={loading}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
          <XCircle size={14} /> {showRejectInput ? "Confirm Reject" : "Reject"}
        </button>
      </div>
    </div>
  );
}
