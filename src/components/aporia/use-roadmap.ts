"use client";

import { useCallback, useEffect, useState } from "react";
import { defaultRoadmap } from "@/lib/roadmaps/derive";
import { roadmapDraftSchema, roadmapRecordSchema, type RoadmapDraft, type RoadmapRecord } from "@/lib/roadmaps/schema";
import { newRequestId } from "@/lib/request-id";
import { useProfile } from "./profile-provider";

const key = "aporia:preview:roadmap:v1";

export function useRoadmap() {
  const { preview } = useProfile();
  const [roadmap, setRoadmap] = useState<RoadmapRecord | null>(null);
  const [candidate, setCandidate] = useState<RoadmapDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (preview) {
        const raw = localStorage.getItem(key);
        setRoadmap(raw ? roadmapRecordSchema.parse(JSON.parse(raw)) : null);
      } else {
        const response = await fetch("/api/roadmap", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setRoadmap(data.roadmap ? roadmapRecordSchema.parse(data.roadmap) : null);
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить маршрут.");
    } finally {
      setLoading(false);
    }
  }, [preview]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  const propose = useCallback(async () => {
    setBusy(true); setError("");
    try {
      if (preview) {
        setCandidate(defaultRoadmap());
        return true;
      }
      const response = await fetch("/api/roadmap/propose", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCandidate(roadmapDraftSchema.parse(data.candidate));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось предложить маршрут.");
      return false;
    } finally { setBusy(false); }
  }, [preview]);
  const save = useCallback(async () => {
    if (!candidate) return false;
    setBusy(true); setError("");
    try {
      if (preview) {
        const now = new Date().toISOString();
        const saved: RoadmapRecord = {
          id: newRequestId(), goal_id: newRequestId(), version: (roadmap?.version ?? 0) + 1, updated_at: now,
          items: candidate.items.map((item, index) => ({ ...item, position: index + 1 })),
        };
        localStorage.setItem(key, JSON.stringify(saved)); setRoadmap(saved); setCandidate(null); return true;
      }
      const response = await fetch("/api/roadmap", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...candidate, version: roadmap?.version ?? 0, requestId: newRequestId() }),
      });
      const data = await response.json();
      if (!response.ok) { if (data.roadmap) setRoadmap(data.roadmap); throw new Error(data.error); }
      setRoadmap(data.roadmap); setCandidate(null); return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить маршрут."); return false;
    } finally { setBusy(false); }
  }, [candidate, preview, roadmap]);
  return { roadmap, candidate, loading, busy, error, propose, save, refresh };
}
