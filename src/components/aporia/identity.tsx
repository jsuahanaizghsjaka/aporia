"use client";

import Image from "next/image";
import type { ProfileView } from "@/lib/profile/schema";
import { cn } from "@/lib/utils";

export function Rune({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 40"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9 34V6l16 10M9 17l13 8"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfileAvatar({
  profile,
  className,
}: {
  profile: ProfileView;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "profile-avatar",
        `avatar-${profile.avatarColor}`,
        profile.avatarShape === "rounded" && "avatar-rounded",
        className,
      )}
    >
      {profile.avatarUrl ? (
        <Image
          src={profile.avatarUrl}
          alt="Фото профиля"
          width={256}
          height={256}
          unoptimized
        />
      ) : profile.avatarPreset === "stones" ? (
        <Image
          src="/media/aporia-stones.jpg"
          alt="Камни Aporia"
          width={128}
          height={128}
        />
      ) : profile.avatarPreset === "initials" ? (
        <span>
          {profile.displayName.trim().slice(0, 2).toLocaleUpperCase("ru") ||
            "A"}
        </span>
      ) : profile.avatarPreset === "orbit" ? (
        <svg aria-hidden="true" viewBox="0 0 50 50" fill="none">
          <circle cx="25" cy="25" r="7" fill="currentColor" />
          <ellipse
            cx="25"
            cy="25"
            rx="21"
            ry="9"
            transform="rotate(-35 25 25)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      ) : (
        <Rune />
      )}
    </span>
  );
}
