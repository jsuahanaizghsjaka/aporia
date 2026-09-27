"use client";
import { dayNames } from "@/lib/profile/schedule";
import type { ProfileView } from "@/lib/profile/schema";
export function PersonalSchedule({
  value,
  onChange,
}: {
  value: ProfileView;
  onChange: (value: ProfileView) => void;
}) {
  const schedule = value.schedule;
  return (
    <fieldset className="form-field full-width schedule-editor">
      <legend>Твой ритм недели</legend>
      <label className="schedule-toggle">
        <input
          type="checkbox"
          name="customSchedule"
          checked={!!schedule}
          onChange={(e) =>
            onChange({
              ...value,
              schedule: e.target.checked
                ? {
                    timeZone:
                      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    days: Array(7).fill(value.dailyMinutes),
                  }
                : null,
            })
          }
        />
        Настроить время по дням
      </label>
      <p className="quiet-copy">
        0 — выходной, от 5 до 120 минут — доступное окно. Без настройки
        используем обычную длительность занятия. Изменения вступят в силу после
        сохранения профиля.
      </p>
      {schedule && (
        <>
          <label>
            Часовой пояс (IANA)
            <input
              name="scheduleTimeZone"
              autoComplete="off"
              maxLength={80}
              value={schedule.timeZone}
              placeholder="Europe/Moscow"
              onChange={(e) =>
                onChange({
                  ...value,
                  schedule: { ...schedule, timeZone: e.target.value },
                })
              }
            />
          </label>
          <div className="schedule-days">
            {dayNames.map((day, index) => (
              <label key={day}>
                {day}
                <input
                  aria-label={`${day}, минут`}
                  type="number"
                  name={`scheduleDay${index}`}
                  autoComplete="off"
                  min={0}
                  max={120}
                  step={1}
                  required
                  value={schedule.days[index]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      schedule: {
                        ...schedule,
                        days: schedule.days.map((n, i) =>
                          i === index ? Number(e.target.value) : n,
                        ),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="quiet-copy">
            Всего: {schedule.days.reduce((a, b) => a + b, 0)} мин в неделю. Без
            синхронизации с календарём.
          </p>
        </>
      )}
    </fieldset>
  );
}
