"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center p-6 bg-zinc-950 text-zinc-100 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-900 text-red-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-50">Critical System Error</h2>
          <p className="text-xs text-zinc-400">
            {error?.message || "A critical error occurred in the application shell."}
          </p>
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-zinc-100 text-zinc-900 hover:bg-zinc-200 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reload Shell
          </button>
        </div>
      </body>
    </html>
  );
}

