"use client";
import { ArrowUp } from "@phosphor-icons/react";
import type { ReactNode, RefObject } from "react";

export function Message({
  role,
  children,
}: {
  role: "assistant" | "user";
  children: ReactNode;
}) {
  return (
    <div className={`chat-message ${role}`}>
      <span className="message-label">{role === "user" ? "ТЫ" : "APORIA"}</span>
      {children}
    </div>
  );
}
export function AIMessage({ children }: { children: ReactNode }) {
  return <Message role="assistant">{children}</Message>;
}
export function UserMessage({ children }: { children: ReactNode }) {
  return <Message role="user">{children}</Message>;
}
export function Typing({
  label = "Aporia готовит ответ…",
}: {
  label?: string;
}) {
  return (
    <p className="chat-typing" role="status">
      <span aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </p>
  );
}
export function SendButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="submit"
      className="primary-button"
      aria-label="Отправить сообщение"
      disabled={disabled}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}
export function ChatInput({
  id,
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Твой ответ…",
  maxLength = 4000,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        if (!value.trim()) {
          const input = event.currentTarget.querySelector("textarea");
          input?.setCustomValidity("Напиши сообщение перед отправкой.");
          input?.reportValidity();
          return;
        }
        onSend();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        Сообщение ментору
      </label>
      <textarea
        id={id}
        name="message"
        autoComplete="off"
        required
        ref={inputRef}
        value={value}
        onChange={(event) => {
          event.target.setCustomValidity("");
          onChange(event.target.value);
        }}
        maxLength={maxLength}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (!disabled) event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <SendButton disabled={disabled} />
    </form>
  );
}
