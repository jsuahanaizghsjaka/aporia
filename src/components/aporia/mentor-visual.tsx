"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { useProfile } from "./profile-provider";

export function MentorVisual({ compact = false }: { compact?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const { motion } = useProfile();
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let visible = false;
    const sync = () => {
      if (motion && !paused && visible && !document.hidden)
        element.play().catch(() => {});
      else element.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      element.pause();
    };
  }, [motion, paused]);
  return (
    <div className={`mentor-visual ${compact ? "mentor-compact" : ""}`}>
      <div className="mentor-halo" aria-hidden="true" />
      <video
        ref={video}
        src={failed ? undefined : "/media/mentor.mp4"}
        poster="/media/mentor-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Космический персонаж Aporia"
        onError={() => setFailed(true)}
      />
      {!compact && (
        <>
          <span className="mentor-caption">
            <span /> Твой AI-ментор
          </span>
          <button
            type="button"
            className="icon-button video-control"
            onClick={() => setPaused(!paused)}
            disabled={!motion || failed}
            aria-label={
              paused
                ? "Продолжить анимацию персонажа"
                : "Остановить анимацию персонажа"
            }
          >
            {paused || !motion ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </>
      )}
    </div>
  );
}
