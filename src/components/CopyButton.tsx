"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copy", className = "btn btn--ghost btn--sm" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Copy this:", value);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
