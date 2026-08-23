"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconButton, SendIcon, StopIcon } from "@/components/atoms";

export interface ChatInputProps {
  onSend: (question: string) => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string;
}

// Textarea composer. Enter sends; Shift+Enter inserts a newline. While a stream
// is in flight the send button becomes a stop (abort) button. Draft text is
// local UI state.
export function ChatInput({
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    const q = value.trim();
    if (!q || streaming || disabled) return;
    onSend(q);
    setValue("");
    // Reset autosize.
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-lg border bg-surface p-2",
        disabled ? "border-navy-100 opacity-70" : "border-navy-200",
      )}
    >
      <textarea
        ref={taRef}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? "Ask a question about your documents…"}
        onChange={(e) => {
          setValue(e.target.value);
          autosize();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none disabled:cursor-not-allowed"
      />
      {streaming ? (
        <IconButton
          label="Stop generating"
          size="sm"
          onClick={onStop}
          className="bg-navy-50 text-navy-700 hover:bg-navy-100"
        >
          <StopIcon />
        </IconButton>
      ) : (
        <IconButton
          label="Send"
          size="sm"
          onClick={send}
          disabled={disabled || value.trim().length === 0}
          className="bg-navy-900 text-white hover:bg-navy-800 disabled:bg-navy-200 disabled:text-navy-400"
        >
          <SendIcon />
        </IconButton>
      )}
    </div>
  );
}
