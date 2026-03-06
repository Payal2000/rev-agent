"use client";

import { ChatMessage as ChatMessageType } from "@/lib/api";
import StreamingSteps from "@/components/ui/StreamingSteps";
import ApprovalCard from "@/components/ApprovalCard";
import { CircleCheck, CircleX, Bot } from "lucide-react";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  onApprovalDecision?: (approved: boolean) => void;
}

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
    if (line.startsWith("[status:approved]")) {
      nodes.push(
        <div key={nodes.length} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          padding: "4px 9px",
          borderRadius: 999,
          background: "var(--success-soft)",
          border: "1px solid color-mix(in oklab, var(--success) 35%, var(--border))",
          fontSize: 11.5,
          color: "var(--success)",
          fontWeight: 600,
        }}>
          <CircleCheck size={13} />
          {line.replace("[status:approved]", "").trim()}
        </div>
      );
      continue;
    }

    if (line.startsWith("[status:rejected]")) {
      nodes.push(
        <div key={nodes.length} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          padding: "4px 9px",
          borderRadius: 999,
          background: "var(--danger-soft)",
          border: "1px solid color-mix(in oklab, var(--danger) 34%, var(--border))",
          fontSize: 11.5,
          color: "var(--danger)",
          fontWeight: 600,
        }}>
          <CircleX size={13} />
          {line.replace("[status:rejected]", "").trim()}
        </div>
      );
      continue;
    }

    if (line.startsWith("|")) {
      inTable = true;
      tableBuffer.push(line);
    } else {
      if (inTable) flushTable();
      if (!line.trim()) {
        nodes.push(<br key={nodes.length} />);
      } else {
        nodes.push(
          <p
            key={nodes.length}
            className="prose"
            style={{ margin: "3px 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-primary)" }}
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
            background: "color-mix(in oklab, var(--accent) 85%, #dbe8dd)",
            borderRadius: "14px 14px 4px 14px",
            padding: "10px 15px",
            fontSize: 13.5,
            color: "var(--accent-ink)",
            lineHeight: 1.55,
            boxShadow: "0 5px 16px rgba(45, 58, 50, 0.16)",
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

  const activeIndex = isStreaming ? (message.steps?.length ?? 0) - 1 : undefined;

  return (
    <div className="animate-fade-up" style={{ display: "flex", gap: 12, marginBottom: 16, opacity: 0 }}>
      <div style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        flexShrink: 0,
        marginTop: 2,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--accent)",
      }}>
        <Bot size={14} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {message.steps && message.steps.length > 0 && (
          <StreamingSteps steps={message.steps} activeIndex={activeIndex} />
        )}

        {(message.content || isStreaming) && (
          <div style={{
            background: "#ffffff",
            border: "1px solid #e4e0f0",
            borderRadius: "4px 14px 14px 14px",
            padding: "12px 14px",
            maxWidth: "100%",
          }}>
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span
                className="cursor-blink"
                style={{
                  display: "inline-block",
                  width: 2,
                  height: 14,
                  background: "var(--accent)",
                  marginLeft: 2,
                  verticalAlign: "middle",
                }}
              />
            )}
          </div>
        )}

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
