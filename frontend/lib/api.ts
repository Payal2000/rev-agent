const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type SSEEventType = "token" | "step" | "approval_required" | "done" | "error";

export interface SSEEvent {
  type: SSEEventType;
  content?: string;
  agent?: string;
  label?: string;
  session_id?: string;
  context?: ApprovalContext;
  message?: string;
}

export interface ApprovalContext {
  recommendations: Recommendation[];
  anomaly_summary: { metric: string; severity: string; z_score: number }[];
  forecast_summary?: { projection_30d: number; trend: string } | null;
}

export interface Recommendation {
  rank: number;
  title: string;
  description: string;
  estimated_impact: string;
  category: string;
  requires_approval: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: { agent: string; label: string }[];
  approvalContext?: ApprovalContext;
  sessionId?: string;
  timestamp: Date;
}

export function streamChat(
  message: string,
  sessionId: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as SSEEvent;
              onEvent(data);
              if (data.type === "done") onDone();
            } catch {}
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        onEvent({ type: "error", message: String(err) });
      }
      onDone();
    }
  })();

  return () => controller.abort();
}

export async function submitApproval(
  sessionId: string,
  approved: boolean,
  modifiedAction?: string,
  rejectionReason?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/approve/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved, modified_action: modifiedAction, rejection_reason: rejectionReason }),
  });
  if (!res.ok) throw new Error(`Approval failed: ${res.status}`);
}
