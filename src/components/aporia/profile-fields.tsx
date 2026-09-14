"use client";
import type { ProfileView } from "@/lib/profile/schema";
import { profileTextFields } from "@/lib/onboarding/lesson-zero";

export function ProfileFields({
  value,
  onChange,
  required = false,
  extended = false,
}: {
  value: ProfileView;
  onChange: (next: ProfileView) => void;
  required?: boolean;
  extended?: boolean;
}) {
  return (
    <div className="form-grid mt-6">
      {profileTextFields.map(({ key, label, limit }) => (
        <label
          className={`form-field ${key === "displayName" ? "" : "full-width"}`}
          key={key}
        >
          {extended && key === "goal" ? "Пожелание из знакомства" : label}
          {key === "displayName" ? (
            <input
              name={key}
              autoComplete="nickname"
              maxLength={limit}
              required={required}
              value={value[key]}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
            />
          ) : (
            <textarea
              name={key}
              maxLength={limit}
              required={required && key === "goal"}
              value={value[key]}
              onChange={(event) =>
                onChange({ ...value, [key]: event.target.value })
              }
            />
          )}
        </label>
      ))}
      {extended && (
        <>
          {(
            [
              ["occupation", "Работа", 500],
              ["education", "Образование", 500],
              ["notes", "Заметки для ментора", 2000],
            ] as const
          ).map(([key, label, limit]) => (
            <div className="form-field full-width" key={key}>
              <label>
                {label}
                <textarea
                  name={key}
                  autoComplete="off"
                  maxLength={limit}
                  value={value[key]}
                  onChange={(e) =>
                    onChange({ ...value, [key]: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="text-link"
                onClick={() => onChange({ ...value, [key]: "" })}
              >
                Очистить: {label.toLowerCase()}
              </button>
            </div>
          ))}
          <label className="form-field full-width">
            Часов на обучение в неделю — необязательно
            <input
              name="weeklyAvailableHours"
              autoComplete="off"
              type="number"
              min={0.5}
              max={80}
              step={0.5}
              value={value.weeklyAvailableHours ?? ""}
              onChange={(e) =>
                onChange({
                  ...value,
                  weeklyAvailableHours:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </>
      )}
      <label className="form-field full-width">
        Минут на занятие в учебный день
        <input
          name="dailyMinutes"
          type="number"
          min={10}
          max={120}
          step={1}
          required
          value={value.dailyMinutes}
          onChange={(event) =>
            onChange({ ...value, dailyMinutes: Number(event.target.value) })
          }
        />
      </label>
    </div>
  );
}
