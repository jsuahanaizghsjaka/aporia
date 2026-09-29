"use client";
import { useEffect, useRef } from "react";
// Observational telemetry is best effort; it never blocks learning or logs payloads.
export function ObservedEvent({
  name,
  reviewId,
  disabled = false,
}: {
  name: "onboarding_started" | "weekly_review_opened";
  reviewId?: string;
  disabled?: boolean;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (disabled || !anchor.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, reviewId }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {});
    });
    observer.observe(anchor.current);
    return () => observer.disconnect();
  }, [name, reviewId, disabled]);
  return (
    <span
      ref={anchor}
      aria-hidden="true"
      style={{ display: "block", height: 1, width: 1 }}
    />
  );
}
