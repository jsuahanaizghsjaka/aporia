"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Trash } from "@phosphor-icons/react";
import { validateAvatar, type ProfileView } from "@/lib/profile/schema";
import { ProfileAvatar } from "./identity";
import { useProfile } from "./profile-provider";
import { ProfileFields } from "./profile-fields";
import { GoalEditor } from "./goal-editor";
import { MemoryProposal } from "./memory-proposal";
import { profileFromMemory } from "@/lib/profile/memory";

const presets = [
  { value: "rune", label: "Руна" },
  { value: "stones", label: "Камни" },
  { value: "orbit", label: "Орбита" },
  { value: "initials", label: "Инициалы" },
] as const;
const colors = [
  { value: "violet", label: "Лавандовый", color: "#b997e7" },
  { value: "mint", label: "Мятный", color: "#9ee4cd" },
  { value: "rose", label: "Розовый", color: "#dda6ca" },
  { value: "blue", label: "Голубой", color: "#a0c8ef" },
] as const;

function CropDialog({
  source,
  onClose,
  onApply,
}: {
  source: { url: string; width: number; height: number };
  onClose: () => void;
  onApply: (blob: Blob, url: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const scale = (180 / Math.min(source.width, source.height)) * zoom;
  const width = source.width * scale,
    height = source.height * scale;
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  async function apply() {
    setBusy(true);
    try {
      const image = new Image();
      image.src = source.url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Редактор фото недоступен в этом браузере.");
      const crop = 180 / scale;
      context.drawImage(
        image,
        ((source.width - crop) * x) / 100,
        ((source.height - crop) * y) / 100,
        crop,
        crop,
        0,
        0,
        512,
        512,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Не удалось обработать фото.")),
          "image/webp",
          0.88,
        ),
      );
      if (blob.type !== "image/webp" || blob.size > 1024 * 1024)
        throw new Error(
          "Браузер не подготовил WebP-фото. Попробуй другое изображение или обнови браузер.",
        );
      onApply(blob, URL.createObjectURL(blob));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Выбери другое фото.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="crop-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="crop-title"
    >
      <h2 id="crop-title">Фото в твоём стиле</h2>
      <div className="crop-stage">
        {/* Local image dimensions drive the exact crop rectangle. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={source.url}
          alt="Предпросмотр кадрирования"
          width={source.width}
          height={source.height}
          style={{
            width,
            height,
            left: (-(width - 180) * x) / 100,
            top: (-(height - 180) * y) / 100,
            transform: "none",
          }}
        />
      </div>
      <div className="crop-controls">
        <label className="range-control">
          Масштаб <span>{zoom.toFixed(1)}×</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <label className="range-control">
          По горизонтали <span>{x}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={x}
            onChange={(event) => setX(Number(event.target.value))}
          />
        </label>
        <label className="range-control">
          По вертикали <span>{y}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={y}
            onChange={(event) => setY(Number(event.target.value))}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          disabled={busy}
        >
          Отмена
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={apply}
          disabled={busy}
        >
          {busy ? "Обработка…" : "Применить"}
          <Check size={16} />
        </button>
      </div>
    </dialog>
  );
}

function ProfileForm({
  initial,
  onSaved,
  onChanged,
}: {
  initial: ProfileView;
  onSaved: () => void;
  onChanged: () => void;
}) {
  const { saveProfile, preview } = useProfile();
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [source, setSource] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const objectUrls = useRef<string[]>([]);
  const selection = useRef(0);
  if (initial !== baseline) {
    setBaseline(initial);
    if (!changed && !busy) setDraft(initial);
  }
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => objectUrls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );
  function update<K extends keyof ProfileView>(key: K, value: ProfileView[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setChanged(true);
    onChanged();
  }
  async function selectPhoto(file?: File) {
    if (!file || busy) return;
    const selected = ++selection.current;
    const validation = validateAvatar(file);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (selection.current !== selected) return;
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 40_000_000
      )
        throw new Error(
          "Фото слишком большое или повреждено. Выбери изображение до 40 Мп.",
        );
      setSource({
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.includes("40")
          ? cause.message
          : "Не удалось открыть изображение. Попробуй другое фото.",
      );
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !changed) return;
    setBusy(true);
    setError("");
    try {
      const savedProfile = await saveProfile(draft, photo);
      setDraft(savedProfile);
      setChanged(false);
      setPhoto(undefined);
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить профиль.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  return (
    <form onSubmit={submit} className="profile-grid" aria-busy={busy}>
      <fieldset disabled={busy} className="contents">
        <section className="glass-panel profile-card">
          <h2 className="panel-heading">Твой образ</h2>
          <p className="panel-description">Добавь немного себя.</p>
          <div className="avatar-editor-top">
            <ProfileAvatar profile={draft} className="large-avatar" />
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Загрузить фото профиля"
              onChange={(event) => {
                selectPhoto(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="secondary-button"
              onClick={() => fileInput.current?.click()}
            >
              <Camera size={17} />
              Загрузить своё фото
            </button>
            <span className="control-label">JPG, PNG или WebP · до 5 МБ</span>
            {draft.avatarUrl && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  update("avatarUrl", null);
                  setPhoto(null);
                }}
              >
                <Trash size={14} />
                Убрать фото
              </button>
            )}
          </div>
          <div className="avatar-customization">
            <div>
              <span className="control-label">Или выбери символ</span>
              <div className="preset-options">
                {presets.map((preset) => (
                  <button
                    type="button"
                    key={preset.value}
                    className="preset-button"
                    aria-label={preset.label}
                    aria-pressed={
                      !draft.avatarUrl && draft.avatarPreset === preset.value
                    }
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        avatarPreset: preset.value,
                        avatarUrl: null,
                      }));
                      setPhoto(null);
                      setChanged(true);
                      onChanged();
                    }}
                  >
                    <ProfileAvatar
                      profile={{
                        ...draft,
                        avatarUrl: null,
                        avatarPreset: preset.value,
                      }}
                      className="size-10"
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="control-label">Цвет символа</span>
              <div className="color-options">
                {colors.map((color) => (
                  <button
                    type="button"
                    className="color-option"
                    key={color.value}
                    style={{ "--swatch": color.color } as React.CSSProperties}
                    aria-label={color.label}
                    aria-pressed={draft.avatarColor === color.value}
                    onClick={() => update("avatarColor", color.value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <span className="control-label">Форма</span>
              <div className="shape-options">
                <button
                  type="button"
                  aria-pressed={draft.avatarShape === "circle"}
                  onClick={() => update("avatarShape", "circle")}
                >
                  Круг
                </button>
                <button
                  type="button"
                  aria-pressed={draft.avatarShape === "rounded"}
                  onClick={() => update("avatarShape", "rounded")}
                >
                  Скруглённая
                </button>
              </div>
            </div>
          </div>
        </section>
        <div className="profile-details">
          <section className="glass-panel profile-card">
            <h2 className="panel-heading">Знакомимся ближе</h2>
            <p className="panel-description">
              Ты решаешь, что Aporia знает о тебе.
            </p>
            {!preview && (
              <MemoryProposal
                disabled={changed || busy}
                version={initial.version ?? 0}
                onApply={(candidate) => {
                  setDraft(profileFromMemory(draft, candidate));
                  setChanged(true);
                  onChanged();
                }}
              />
            )}
            <ProfileFields
              extended
              value={draft}
              onChange={(value) => {
                setDraft(value);
                setChanged(true);
                onChanged();
              }}
            />
          </section>
          <div className="form-actions">
            <button className="primary-button" disabled={busy || !changed}>
              {busy ? "Сохраняем…" : "Сохранить изменения"}
              <Check size={17} />
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy || !changed}
              onClick={() => {
                setDraft(initial);
                setPhoto(undefined);
                setError("");
                setChanged(false);
                onChanged();
              }}
            >
              Отменить
            </button>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
          </div>
        </div>
        {source && (
          <CropDialog
            source={source}
            onClose={() => setSource(null)}
            onApply={(blob, url) => {
              objectUrls.current.push(url);
              setPhoto(blob);
              update("avatarUrl", url);
              setSource(null);
            }}
          />
        )}
      </fieldset>
    </form>
  );
}

export function ProfileEditor() {
  const { profile, preview } = useProfile();
  const [saved, setSaved] = useState(false);
  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</p>
          <h1>Это всё ты.</h1>
          <p>Твой образ, твоя цель, твой темп.</p>
        </div>
      </div>
      {preview && (
        <p className="notice">
          Предпросмотр: настройки и фото сохраняются только в этом браузере. Для
          синхронизации между устройствами нужен аккаунт.
        </p>
      )}
      {saved && (
        <p className="status-message mb-5" role="status">
          Изменения сохранены{preview ? " в этом браузере" : " в твоём профиле"}
          .
        </p>
      )}
      <ProfileForm
        initial={profile}
        onSaved={() => setSaved(true)}
        onChanged={() => setSaved(false)}
      />
      <GoalEditor />
    </div>
  );
}
