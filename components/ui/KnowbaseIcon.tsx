import React from "react";

interface KnowbaseIconProps {
  className?: string;
  size?: number;
  variant?: "brand" | "assistant" | "hero";
}

/**
 * Custom proprietary brand emblem for Knowbase AI.
 * Replaces generic robot and sparkle icons with a sophisticated,
 * faceted geometric knowledge prism (intersection of structured data and neural intelligence).
 */
export function KnowbaseIcon({ className = "w-5 h-5", size, variant = "brand" }: KnowbaseIconProps) {
  const dimension = size || (variant === "hero" ? 36 : variant === "assistant" ? 18 : 20);

  return (
    <svg
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Knowbase AI Emblem"
    >
      <defs>
        <linearGradient id="kb-grad-1" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="currentColor" stopOpacity="0.75" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="kb-glow" x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {/* Central faceted rhombus prism */}
      <path
        d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5L12 2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-90"
      />

      {/* Isometric internal coordinate planes */}
      <path
        d="M12 2V12M12 12L21 7.5M12 12L3 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-75"
      />

      <path
        d="M12 12V22M12 12L21 16.5M12 12L3 16.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-50"
      />

      {/* Core nucleus diamond node */}
      <path
        d="M12 9.5L14.5 12L12 14.5L9.5 12L12 9.5Z"
        fill="currentColor"
        className="opacity-80"
      />
    </svg>
  );
}

/**
 * Editorial avatar tile for assistant responses
 */
export function AssistantAvatar({ isPulsing = false }: { isPulsing?: boolean }) {
  return (
    <div
      className={`w-8 h-8 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/10 dark:ring-white/10 transition-transform ${
        isPulsing ? "scale-95 animate-pulse" : ""
      }`}
    >
      <KnowbaseIcon size={16} variant="assistant" className="text-current" />
    </div>
  );
}

