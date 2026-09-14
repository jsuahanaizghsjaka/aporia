"use client";
import { useEffect, useState } from "react";
import {
  graphSchema,
  previewGraph,
  type SkillGraph,
} from "@/lib/learning/skill-graph";
import { useProfile } from "./profile-provider";
import { useLearning } from "./learning-provider";
export function useSkillGraph() {
  const { preview } = useProfile(),
    { view } = useLearning();
  const [data, setData] = useState<SkillGraph | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return;
    const c = new AbortController();
    async function read() {
      try {
        const r = await fetch("/api/skills", {
          cache: "no-store",
          signal: c.signal,
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        const parsed = graphSchema.parse(body);
        if (!c.signal.aborted) {
          setData(parsed);
          setError("");
        }
      } catch (cause) {
        if (!c.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Не удалось прочитать карту навыков.",
          );
      }
    }
    void read();
    return () => c.abort();
  }, [preview, view.version, retry]);
  return {
    data: preview ? previewGraph(view.state) : data,
    error,
    refresh: () => setRetry((v) => v + 1),
  };
}
