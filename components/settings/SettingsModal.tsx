"use client";

import React, { useState } from "react";
import {
  X,
  Sliders,
  Sun,
  Moon,
  Laptop,
  MessageSquare,
  User,
  Info,
  Check,
  CheckCircle,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { AppSettings, ThemePreference } from "@/types/chat";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onThemeChange: (theme: ThemePreference) => void;
}

type TabKey = "appearance" | "general" | "chat" | "account" | "about";

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onThemeChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("appearance");
  const [formData, setFormData] = useState<AppSettings>(settings);
  const [prevSettings, setPrevSettings] = useState<AppSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDeletingData, setIsDeletingData] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  const handleDeleteMyData = async () => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete all your uploaded documents and conversation history? This cannot be undone."
      )
    ) {
      return;
    }
    setIsDeletingData(true);
    try {
      const res = await fetch("/api/session", { method: "DELETE" });
      if (res.ok) {
        setDeleteMessage("All session data permanently deleted. Reloading...");
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        setDeleteMessage("Failed to delete data. Please try again.");
      }
    } catch {
      setDeleteMessage("Network error attempting to delete data.");
    } finally {
      setIsDeletingData(false);
    }
  };

  // Sync state if settings prop updates externally
  if (settings !== prevSettings) {
    setPrevSettings(settings);
    setFormData(settings);
  }

  if (!isOpen) return null;

  const handleSelectTheme = (newTheme: ThemePreference) => {
    const updated = { ...formData, theme: newTheme };
    setFormData(updated);
    onThemeChange(newTheme);
    onUpdateSettings(updated);
  };

  const handleSave = () => {
    onUpdateSettings(formData);
    onThemeChange(formData.theme);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 500);
  };

  const navItems = [
    { key: "appearance", label: "Appearance", icon: Sun },
    { key: "general", label: "General", icon: Sliders },
    { key: "chat", label: "Chat & Retrieval", icon: MessageSquare },
    { key: "account", label: "Account Profile", icon: User },
    { key: "about", label: "About", icon: Info },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full h-[540px] max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* MODAL HEADER */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-6 shrink-0">
          <h2 className="font-semibold text-base text-zinc-950 dark:text-zinc-50">
            Settings & Preferences
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
          {/* TABS SIDEBAR */}
          <div className="w-full sm:w-48 border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-zinc-800 p-2 sm:p-3 space-y-1 bg-zinc-50/50 dark:bg-zinc-950/40 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveTab(item.key as TabKey)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                    isActive
                      ? "bg-zinc-200/80 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB CONTENT AREA */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5 text-xs text-zinc-700 dark:text-zinc-300">
            {/* APPEARANCE TAB */}
            {activeTab === "appearance" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-1">
                    Interface Appearance
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Switch between Light and Dark mode. Changes take effect immediately across all panels.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { key: "light", label: "Light", icon: Sun, desc: "Crisp white styling" },
                    { key: "dark", label: "Dark", icon: Moon, desc: "ChatGPT-style dark neutral" },
                    { key: "system", label: "System", icon: Laptop, desc: "Follow OS preference" },
                  ].map((themeOpt) => {
                    const Icon = themeOpt.icon;
                    const isSelected = formData.theme === themeOpt.key;
                    return (
                      <button
                        key={themeOpt.key}
                        onClick={() => handleSelectTheme(themeOpt.key as ThemePreference)}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all text-center relative ${
                          isSelected
                            ? "border-zinc-950 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white font-medium ring-2 ring-zinc-950/20 dark:ring-zinc-200/20 shadow-xs"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-950/40 text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2 right-2 text-zinc-900 dark:text-zinc-100">
                            <CheckCircle className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <Icon className="w-6 h-6 mb-2" />
                        <span className="text-xs">{themeOpt.label}</span>
                        <span className="text-[10px] text-zinc-400 mt-0.5">{themeOpt.desc}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 text-[11px] text-zinc-500">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">Active Theme: </span>
                  <span className="capitalize font-mono text-zinc-900 dark:text-zinc-100">{formData.theme}</span>
                  {formData.theme === "system" && " (synchronizes with your computer's OS dark mode setting)"}
                </div>
              </div>
            )}

            {/* GENERAL TAB */}
            {activeTab === "general" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-1">
                    General Preferences
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Customize your baseline workspace behavior and system prompt.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
                    <div>
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">
                        Automatic Scroll
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Automatically follow assistant stream tokens to the bottom.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.autoScroll}
                      onChange={(e) =>
                        setFormData({ ...formData, autoScroll: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-zinc-900 focus:ring-0 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1.5">
                      System Grounding Prompt
                    </label>
                    <textarea
                      value={formData.systemPrompt}
                      onChange={(e) =>
                        setFormData({ ...formData, systemPrompt: e.target.value })
                      }
                      rows={4}
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600 leading-relaxed resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* CHAT PREFERENCES TAB */}
            {activeTab === "chat" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-1">
                    Chat & Vector Retrieval
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Tune how the RAG pipeline indexes chunks and synthesizes responses.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1.5">
                      Vector Search Depth
                    </label>
                    <select
                      value={formData.searchDepth}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          searchDepth: e.target.value as "fast" | "balanced" | "deep",
                        })
                      }
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    >
                      <option value="fast">Fast (Top 3 chunks, lowest latency)</option>
                      <option value="balanced">Balanced (Top 6 chunks, hybrid search)</option>
                      <option value="deep">Deep (Top 12 chunks + cross-encoder rerank)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1.5">
                      Simulation Stream Speed
                    </label>
                    <select
                      value={formData.streamingSpeed}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          streamingSpeed: e.target.value as "normal" | "fast" | "instant",
                        })
                      }
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    >
                      <option value="normal">Normal (Realistic token cadence)</option>
                      <option value="fast">Fast (Turbo stream)</option>
                      <option value="instant">Instant (Immediate full render)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ACCOUNT TAB */}
            {activeTab === "account" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-1">
                    Account Information
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Update profile credentials and permissions.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.user.name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          user: { ...formData.user, name: e.target.value },
                        })
                      }
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={formData.user.email}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          user: { ...formData.user, email: e.target.value },
                        })
                      }
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                      Workspace Role
                    </label>
                    <input
                      type="text"
                      value={formData.user.role}
                      disabled
                      className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-xs text-zinc-500 outline-none cursor-not-allowed"
                    />
                  </div>

                  {/* PRIVACY & DATA PURGE */}
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 mb-1.5 text-red-600 dark:text-red-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold">Privacy & Data Purge</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3 leading-relaxed">
                      Permanently wipe all documents, embeddings, and conversation records associated with your anonymous session.
                    </p>
                    {deleteMessage && (
                      <div className="mb-2.5 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                        {deleteMessage}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteMyData}
                      disabled={isDeletingData}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 border border-red-200 dark:border-red-900/50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isDeletingData ? "Purging Session Data..." : "Delete My Data"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ABOUT TAB */}
            {activeTab === "about" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 mb-1">
                    About Knowbase AI
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Enterprise Retrieval-Augmented Generation Architecture.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Application Version</span>
                    <span className="font-mono text-xs">v2.5.0</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Framework</span>
                    <span className="font-mono text-xs">Next.js 16 + React 19</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Styling Engine</span>
                    <span className="font-mono text-xs">Tailwind CSS v4</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Target Vector Store</span>
                    <span className="font-mono text-xs">Neon PostgreSQL (pgvector)</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-xs leading-relaxed">
                  Theme switching, knowledge indexing, and chat UI are fully synchronized.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="h-14 border-t border-zinc-200 dark:border-zinc-800 px-6 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/40 shrink-0">
          <span className="text-[11px] text-zinc-400">
            {saveSuccess ? (
              <span className="text-emerald-500 font-medium inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Preferences saved
              </span>
            ) : (
              "Theme changes apply instantly."
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
            >
              Save Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
