import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Khabri — Free-Tier Production RAG Engine",
  description:
    "Zero-cost, production-hardened Retrieval-Augmented Generation system with hybrid search, pgvector, multi-model resilience, and abuse mitigation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var raw = localStorage.getItem("knowbase_settings_v1");
                  var theme = "system";
                  if (raw) {
                    var parsed = JSON.parse(raw);
                    if (parsed && parsed.theme) theme = parsed.theme;
                  }
                  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
                  var isDark = theme === "dark" || (theme === "system" && prefersDark);
                  if (isDark) {
                    document.documentElement.classList.add("dark");
                    document.documentElement.classList.remove("light");
                  } else {
                    document.documentElement.classList.remove("dark");
                    document.documentElement.classList.add("light");
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
