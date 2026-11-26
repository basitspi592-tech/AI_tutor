"use client";

import { useRef } from "react";

const LENGTH = 6;

export function CodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, char: string) {
    const next = value.padEnd(LENGTH, " ").split("");
    next[index] = char;
    onChange(next.join("").slice(0, LENGTH).trimEnd());
  }

  function handleChange(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");

    if (!digits) {
      const next = value.split("");
      next[index] = " ";
      onChange(next.join("").trimEnd());
      return;
    }

    if (raw.length > 1) {
      const merged = (value.slice(0, index) + digits).slice(0, LENGTH);
      onChange(merged);
      refs.current[Math.min(index + digits.length, LENGTH - 1)]?.focus();
      return;
    }

    setDigit(index, digits);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-between gap-2" dir="ltr">
      {Array.from({ length: LENGTH }).map((_, i) => {
        const filled = Boolean(value[i]);
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={value[i] ?? ""}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={LENGTH}
            aria-label={`Digit ${i + 1}`}
            className="input w-full aspect-square text-center text-xl font-bold"
            style={{
              background: filled ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
              borderColor: filled ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.09)",
              color: "#f1f5f9",
              boxShadow: filled ? "0 0 0 3px rgba(99,102,241,0.12)" : "none",
              opacity: disabled ? 0.5 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
