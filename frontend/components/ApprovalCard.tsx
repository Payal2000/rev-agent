"use client";

import { useState } from "react";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { ApprovalContext, Recommendation, submitApproval } from "@/lib/api";

interface Props {
  sessionId: string;
  context: ApprovalContext;
  onDecision: (approved: boolean) => void;
}

export default function ApprovalCard({ sessionId, context, onDecision }: Props) {
  const [loading, setLoading] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await submitApproval(sessionId, true);
      onDecision(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!showRejectInput) {
      setShowRejectInput(true);
      return;
    }
    setLoading(true);
    try {
      await submitApproval(sessionId, false, undefined, rejectionReason);
      onDecision(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (s: string) =>
    s === "critical" ? "text-red-500" : s === "high" ? "text-orange-500" : "text-yellow-500";

  return (
    <div className="border border-orange-400 rounded-lg p-4 bg-orange-950/20 space-y-4 my-3">
      <div className="flex items-center gap-2 text-orange-400 font-semibold">
        <AlertTriangle size={18} />
        <span>Human Approval Required</span>
      </div>

      {/* Anomaly summary */}
      {context.anomaly_summary?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-400 uppercase tracking-wide">Anomalies Detected</p>
          {context.anomaly_summary.map((a, i) => (
            <p key={i} className={`text-sm ${severityColor(a.severity)}`}>
              {a.metric.replace(/_/g, " ")} — z={a.z_score.toFixed(1)}σ ({a.severity})
            </p>
          ))}
        </div>
      )}

      {/* Recommendations */}
      <div className="space-y-3">
        <p className="text-xs text-zinc-400 uppercase tracking-wide">Proposed Actions</p>
        {context.recommendations?.map((rec: Recommendation) => (
          <div key={rec.rank} className="bg-zinc-800/60 rounded p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-white">
                {rec.rank}. {rec.title}
              </span>
              <span className="text-xs text-emerald-400 whitespace-nowrap">{rec.estimated_impact}</span>
            </div>
            <p className="text-xs text-zinc-400">{rec.description}</p>
          </div>
        ))}
      </div>

      {/* Rejection reason input */}
      {showRejectInput && (
        <textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Reason for rejection (optional)..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 resize-none h-16"
        />
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded transition disabled:opacity-50"
        >
          <CheckCircle size={15} />
          Approve
        </button>
        <button
          onClick={handleReject}
          disabled={loading}
          className="flex items-center gap-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded transition disabled:opacity-50"
        >
          <XCircle size={15} />
          {showRejectInput ? "Confirm Reject" : "Reject"}
        </button>
      </div>
    </div>
  );
}
