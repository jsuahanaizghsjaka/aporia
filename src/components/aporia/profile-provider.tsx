"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { commitPreview } from "@/lib/preview-storage";
import {
  emptyProfile,
  profileSchema,
  type ProfileView,
} from "@/lib/profile/schema";

type ProfileContextValue = {
  profile: ProfileView;
  preview: boolean;
  motion: boolean;
  setMotion: (value: boolean) => void;
  saveProfile: (
    profile: ProfileView,
    photo?: Blob | null,
  ) => Promise<ProfileView>;
  href: (path: string) => string;
};
const ProfileContext = createContext<ProfileContextValue | null>(null);
const storageKey = "aporia:preview:profile:v1";
const changeEvent = "aporia-preferences";
function readLocalProfile() {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}
function readMotion() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return localStorage.getItem("aporia:motion") !== "off";
  } catch {
    return true;
  }
}
function subscribePreferences(notify: () => void) {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  media.addEventListener("change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
    media.removeEventListener("change", notify);
  };
}
const serverProfile = () => null;
const serverMotion = () => false;

export function ProfileProvider({
  children,
  initialProfile = emptyProfile,
  preview = false,
}: {
  children: React.ReactNode;
  initialProfile?: ProfileView;
  preview?: boolean;
}) {
  const [cloudProfile, setCloudProfile] = useState(initialProfile);
  const stored = useSyncExternalStore(
    subscribePreferences,
    readLocalProfile,
    serverProfile,
  );
  const motion = useSyncExternalStore(
    subscribePreferences,
    readMotion,
    serverMotion,
  );
  const localProfile = useMemo(() => {
    try {
      const raw = JSON.parse(stored ?? "null");
      if (raw)
        return {
          ...profileSchema.parse(raw),
          version:
            Number.isSafeInteger(raw.version) && raw.version >= 0
              ? raw.version
              : 0,
          avatarUrl:
            typeof raw.avatarUrl === "string" &&
            raw.avatarUrl.startsWith("data:image/webp;base64,")
              ? raw.avatarUrl
              : null,
        };
    } catch {
      /* Ignore incompatible local preview data. */
    }
    return emptyProfile;
  }, [stored]);
  const profile = preview ? localProfile : cloudProfile;
  async function saveProfile(next: ProfileView, photo?: Blob | null) {
    const validated = profileSchema.parse(next);
    if (preview) {
      let avatarUrl = next.avatarUrl;
      if (photo)
        avatarUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("Не удалось обработать фото."));
          reader.readAsDataURL(photo);
        });
      if (photo === null) avatarUrl = null;
      const currentVersion = stored
        ? Number(JSON.parse(stored).version ?? 0)
        : 0;
      if (currentVersion !== (next.version ?? 0))
        throw new Error(
          "Профиль изменился в другой вкладке. Правки остались в форме. Скопируй нужный текст и обнови страницу.",
        );
      const saved = {
        ...validated,
        avatarUrl,
        version: (next.version ?? 0) + 1,
      };
      const perform = () =>
        commitPreview(localStorage, storageKey, stored, async () => ({
          value: JSON.stringify({
            ...validated,
            avatarUrl,
            version: (next.version ?? 0) + 1,
          }),
          result: saved,
        }));
      if (navigator.locks) await navigator.locks.request(storageKey, perform);
      else await perform();
      window.dispatchEvent(new Event(changeEvent));
      return saved;
    }
    const form = new FormData();
    form.set("profile", JSON.stringify(validated));
    form.set("version", String(next.version ?? 0));
    if (photo) form.set("photo", photo, "avatar.webp");
    if (photo === null) form.set("removePhoto", "true");
    const response = await fetch("/api/profile", {
      method: "PUT",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Не удалось сохранить профиль.");
    setCloudProfile(result.profile);
    return result.profile as ProfileView;
  }
  return (
    <ProfileContext.Provider
      value={{
        profile,
        preview,
        motion,
        saveProfile,
        href: (path) =>
          preview ? `/preview${path === "/dashboard" ? "" : path}` : path,
        setMotion: (value) => {
          try {
            localStorage.setItem("aporia:motion", value ? "on" : "off");
          } catch {
            return;
          }
          window.dispatchEvent(new Event(changeEvent));
        },
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("ProfileProvider is required");
  return value;
}
