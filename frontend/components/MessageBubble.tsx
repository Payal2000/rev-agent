"use client";

import { Bot, User, Loader2 } from "lucide-react";
import { ChatMessage } from "@/lib/api";
import ApprovalCard from "./ApprovalCard";

interface Props {
  message: ChatMessage;
  isStreaming?: boolean;
  onApprovalDecision?: (approved: boolean) => void;
}

export default function MessageBubble({ message, isStreaming, onApprovalDecision }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot size={16} className="text-white" />
        </div>
      )}

      <div className={`max-w-[80%] space-y-2 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {/* Step indicators */}
        {!isUser && message.steps && message.steps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.steps.map((step, i) => (
              <span
                key={i}
                className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700"
              >
                {step.label}
              </span>
            ))}
          </div>
        )}

        {/* Message content */}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-violet-600 text-white rounded-tr-sm"
              : "bg-zinc-800 text-zinc-100 rounded-tl-sm"
          }`}
        >
          {message.content}
          {isStreaming && (
            <span className="inline-block w-1 h-4 bg-violet-400 ml-0.5 animate-pulse" />
          )}
        </div>

        {/* Approval card */}
        {!isUser && message.approvalContext && message.sessionId && (
          <ApprovalCard
            sessionId={message.sessionId}
            context={message.approvalContext}
            onDecision={onApprovalDecision || (() => {})}
          />
        )}

        <span className="text-xs text-zinc-600">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 mt-1">
          <User size={16} className="text-zinc-300" />
        </div>
      )}
    </div>
  );
}
