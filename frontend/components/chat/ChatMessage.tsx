"use client";

import { ChatMessage as ChatMessageType } from "@/lib/api";
import AgentBadge from "@/components/ui/AgentBadge";
import StreamingSteps from "@/components/ui/StreamingSteps";
import ApprovalCard from "@/components/ApprovalCard";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  onApprovalDecision?: (approved: boolean) => void;
}

// Minimal markdown renderer — handles bold, tables, code
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  const flushTable = () => {
    if (tableBuffer.length < 2) { tableBuffer = []; return; }
    const rows = tableBuffer.map(l => l.split("|").map(c => c.trim()).filter(Boolean));
    const header = rows[0];
    const body = rows.slice(2);
    nodes.push(
      <div className="prose" key={`tbl-${nodes.length}`} style={{ overflowX: "auto", marginTop: 8 }}>
        <table>
          <thead>
            <tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j} dangerouslySetInnerHTML={{ __html: boldify(c) }} />)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
    inTable = false;
  };

  const boldify = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  for (const line of lines) {
    if (line.startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable) flushTable();
      if (!line.trim()) {
        nodes.push(<br key={nodes.length} />);
      } else {
        nodes.push(
          <p key={nodes.length} className="prose" style={{ margin: "3px 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-primary)" }}
            dangerouslySetInnerHTML={{ __html: boldify(line) }}
          />
        );
      }
    }
  }
  if (inTable) flushTable();
  return nodes;
}

export default function ChatMessage({ message, isStreaming, onApprovalDecision }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="animate-fade-up" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, opacity: 0 }}>
        <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{
            background: "linear-gradient(135deg, #6366f1, #818cf8)",
            borderRadius: "14px 14px 3px 14px",
            padding: "10px 16px",
            fontSize: 13.5,
            color: "white",
            lineHeight: 1.55,
            boxShadow: "0 2px 12px rgba(99,102,241,0.25)",
          }}>
            {message.content}
          </div>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>
    );
  }

  // Determine active step for streaming
  const activeIndex = isStreaming ? (message.steps?.length ?? 0) - 1 : undefined;

  return (
    <div className="animate-fade-up" style={{ display: "flex", gap: 12, marginBottom: 16, opacity: 0 }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginTop: 2,
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 10px rgba(99,102,241,0.2)",
        fontSize: 11, fontWeight: 700, color: "white",
      }}>
        R
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Agent steps */}
        {message.steps && message.steps.length > 0 && (
          <StreamingSteps steps={message.steps} activeIndex={activeIndex} />
        )}

        {/* Message bubble */}
        {(message.content || isStreaming) && (
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "3px 14px 14px 14px",
            padding: "12px 16px",
            maxWidth: "100%",
          }}>
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span
                className="cursor-blink"
                style={{
                  display: "inline-block", width: 2, height: 14,
                  background: "#6366f1", marginLeft: 2, verticalAlign: "middle",
                }}
              />
            )}
          </div>
        )}

        {/* Approval card */}
        {message.approvalContext && message.sessionId && (
          <ApprovalCard
            sessionId={message.sessionId}
            context={message.approvalContext}
            onDecision={onApprovalDecision ?? (() => {})}
          />
        )}

        <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
