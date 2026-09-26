"use client";
export function ModeSwitch({
  mode,
  disabled,
  onChange,
  label = "Режим занятия",
}: {
  mode: "learn" | "help";
  disabled: boolean;
  onChange: (mode: "learn" | "help") => void;
  label?: string;
}) {
  return (
    <fieldset className="mode-choice" disabled={disabled}>
      <legend>{label}</legend>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={mode === "learn"}
        onClick={() => onChange("learn")}
      >
        Learn · понять
      </button>
      <button
        type="button"
        className="secondary-button"
        aria-pressed={mode === "help"}
        onClick={() => onChange("help")}
      >
        Help · решить
      </button>
      <p className="quiet-copy">
        {mode === "learn"
          ? "Двигаемся от вопроса к подсказкам."
          : "Прямой разбор доступен сразу по запросу."}{" "}
        Уже показанная помощь учитывается при оценке самостоятельности.
      </p>
    </fieldset>
  );
}
