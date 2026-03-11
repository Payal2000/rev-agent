"use client";

import { ChatMessage as ChatMessageType, ChartData } from "@/lib/api";
import StreamingSteps from "@/components/ui/StreamingSteps";
import ApprovalCard from "@/components/ApprovalCard";
import { CircleCheck, CircleX, Bot } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const CHART_COLORS = ["#7c6eaa", "#4e9e8f", "#e07b53", "#5b8dd9", "#c26eb4"];

function formatYAxis(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function InlineChart({ chart }: { chart: ChartData }) {
  const { chartType, data, xKey, yKeys } = chart;

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0edf8" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={v => String(v).slice(0, 7)} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatYAxis} width={56} />
          <Tooltip formatter={(v: number) => formatYAxis(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {yKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0edf8" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={formatYAxis} width={56} />
          <Tooltip formatter={(v: number) => formatYAxis(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {yKeys.map((k, i) => (
            <Bar key={k} dataKey={k} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "pie") {
    const yKey = yKeys[0];
    return (
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: number) => formatYAxis(v)} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  onApprovalDecision?: (approved: boolean, message?: string) => void;
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
              <tr key={i}>{r.map((c, j) => <td key={j} dangerouslySetInnerHTML={{ __html: inlineFormat(c) }} />)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
    inTable = false;
  };

  const inlineFormat = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/_(.+?)_/g, "<em>$1</em>");

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
        nodes.push(<div key={nodes.length} style={{ height: 6 }} />);
      } else if (/^#{1,3} /.test(line)) {
        const text = line.replace(/^#{1,3} /, "");
        nodes.push(
          <p key={nodes.length} style={{ margin: "8px 0 4px", fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(text) }} />
        );
      } else if (/^[-*] /.test(line)) {
        nodes.push(
          <div key={nodes.length} style={{ display: "flex", gap: 8, margin: "3px 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
            <span style={{ marginTop: 6, width: 5, height: 5, borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0 }} />
            <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^[-*] /, "")) }} />
          </div>
        );
      } else {
        nodes.push(
          <p
            key={nodes.length}
            style={{ margin: "3px 0", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-primary)" }}
            dangerouslySetInnerHTML={{ __html: inlineFormat(line) }}
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
            background: "#1a1a1a",
            borderRadius: "14px 14px 4px 14px",
            padding: "10px 15px",
            fontSize: 13.5,
            color: "#ffffff",
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
        color: "#71717a",
      }}>
        <Bot size={14} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        {message.steps && message.steps.length > 0 && (
          <StreamingSteps steps={message.steps} activeIndex={activeIndex} />
        )}

        {message.chartData && (
          <div style={{
            background: "#ffffff",
            border: "1px solid #e4e0f0",
            borderRadius: "4px 14px 14px 14px",
            padding: "14px 14px 8px",
            maxWidth: "100%",
          }}>
            <InlineChart chart={message.chartData} />
          </div>
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
                  background: "#71717a",
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
