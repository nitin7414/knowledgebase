"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  FileStack,
  SlidersHorizontal,
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Database,
  User,
  LogOut,
  MessageSquareText,
  X,
  Compass,
} from "lucide-react";
import { Conversation, ViewMode, AppSettings } from "@/types/chat";
import { KnowbaseIcon } from "@/components/ui/KnowbaseIcon";

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  currentView: ViewMode;
  onNavigateView: (view: ViewMode) => void;
  onOpenSettings: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  settings: AppSettings;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  currentView,
  onNavigateView,
  onOpenSettings,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  settings,
}: SidebarProps) {
  // Menu dropdown state for three-dot menus
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
    setOpenMenuId(null);
  };

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDownRename = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") {
      handleSaveRename(id);
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  };

  // Group conversations by time category
  const categorized = groupConversations(conversations);

  const content = (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 border-r border-zinc-800/80 select-none">
      {/* TOP SECTION */}
      <div className="p-3 pb-2 space-y-2 border-b border-zinc-800/60">
        {/* Brand header */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-100 shadow-sm shrink-0">
              <KnowbaseIcon size={17} className="text-zinc-100" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm tracking-tight text-zinc-100 truncate">
                  NITGPT
                </span>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">
                  Enterprise RAG
                </span>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <div className="hidden md:flex items-center">
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Mobile close toggle */}
          <div className="flex md:hidden">
            <button
              onClick={onCloseMobile}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-1 pt-1">
          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              onNavigateView("chat");
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-100 bg-zinc-800/90 hover:bg-zinc-800 hover:text-white border border-zinc-700/60 shadow-sm transition-all duration-150 ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
            title="New Chat"
          >
            <Plus className="w-4 h-4 shrink-0 text-zinc-200 stroke-[2.2]" />
            {!isCollapsed && <span>New Chat</span>}
          </button>

          {/* Uploaded Documents Button */}
          <button
            onClick={() => {
              onNavigateView("documents");
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
              currentView === "documents"
                ? "bg-zinc-800 text-zinc-100 border border-zinc-700/60"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
            } ${isCollapsed ? "justify-center px-0" : ""}`}
            title="Uploaded Documents"
          >
            <FileStack className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Uploaded Documents</span>}
          </button>

          {/* Settings Button */}
          <button
            onClick={() => {
              onOpenSettings();
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors duration-150 ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
            title="Settings"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Settings</span>}
          </button>
        </div>
      </div>

      {/* MIDDLE SECTION: CHAT HISTORY */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 scrollbar-thin scrollbar-thumb-zinc-800">
        {!isCollapsed ? (
          <>
            <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Chat History
            </div>

            {conversations.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No conversations yet. Start a new chat to begin.
              </div>
            ) : (
              categorized.map((category) => {
                if (category.items.length === 0) return null;
                return (
                  <div key={category.label} className="space-y-0.5">
                    <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-zinc-500">
                      {category.label}
                    </div>
                    {category.items.map((conv) => {
                      const isActive =
                        currentView === "chat" && conv.id === activeConversationId;
                      const isMenuOpen = openMenuId === conv.id;
                      const isEditing = editingId === conv.id;

                      return (
                        <div
                          key={conv.id}
                          className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors duration-150 ${
                            isActive
                              ? "bg-zinc-800 text-zinc-100 font-medium"
                              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80"
                          }`}
                          onClick={() => {
                            if (!isEditing) {
                              onSelectConversation(conv.id);
                              onNavigateView("chat");
                              onCloseMobile();
                            }
                          }}
                        >
                          <MessageSquareText className="w-3.5 h-3.5 shrink-0 opacity-70" />

                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => handleKeyDownRename(e, conv.id)}
                              onBlur={() => handleSaveRename(conv.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-zinc-900 text-zinc-100 px-1 py-0.5 rounded border border-zinc-700 outline-none text-xs"
                            />
                          ) : (
                            <span className="truncate flex-1 text-left">
                              {conv.title}
                            </span>
                          )}

                          {/* Three-dot context menu button */}
                          {!isEditing && (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(isMenuOpen ? null : conv.id);
                                }}
                                className={`p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60 transition-opacity ${
                                  isActive || isMenuOpen
                                    ? "opacity-100"
                                    : "opacity-0 group-hover:opacity-100"
                                }`}
                                title="Conversation options"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {/* Dropdown popover */}
                              {isMenuOpen && (
                                <div
                                  ref={menuRef}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 top-full mt-1 w-32 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 z-30 text-xs"
                                >
                                  <button
                                    onClick={() => handleStartRename(conv)}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors text-left"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>Rename</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      onDeleteConversation(conv.id);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors text-left"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </>
        ) : (
          /* Collapsed view icons */
          <div className="flex flex-col items-center gap-2 pt-2">
            {conversations.slice(0, 8).map((conv) => {
              const isActive =
                currentView === "chat" && conv.id === activeConversationId;
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelectConversation(conv.id);
                    onNavigateView("chat");
                  }}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                  }`}
                  title={conv.title}
                >
                  <Compass className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* BOTTOM SECTION: USER PROFILE & ACCOUNT */}
      <div className="p-3 border-t border-zinc-800/80 relative">
        <button
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className={`w-full flex items-center gap-3 p-1.5 rounded-lg text-left hover:bg-zinc-900 transition-colors duration-150 ${
            isCollapsed ? "justify-center p-0" : ""
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200 text-xs font-semibold ring-1 ring-zinc-800 shrink-0">
            {settings.user.name.split(" ").map((n) => n[0]).join("")}
          </div>

          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-zinc-200 truncate">
                {settings.user.name}
              </div>
              <div className="text-[11px] text-zinc-500 truncate">
                {settings.user.email}
              </div>
            </div>
          )}
        </button>

        {/* Profile Popover Menu */}
        {showProfileMenu && (
          <div
            ref={profileMenuRef}
            className={`absolute bottom-full mb-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl py-1.5 z-40 text-xs ${
              isCollapsed ? "left-12 w-48" : "left-3 right-3"
            }`}
          >
            <div className="px-3 py-2 border-b border-zinc-800/60">
              <div className="font-medium text-zinc-200">{settings.user.name}</div>
              <div className="text-[11px] text-zinc-500 truncate">{settings.user.email}</div>
              <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {settings.user.role}
              </div>
            </div>

            <div className="py-1">
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <User className="w-3.5 h-3.5 text-zinc-400" />
                <span>Account Profile</span>
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onNavigateView("documents");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-zinc-400" />
                <span>Knowledge Base Stats</span>
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" />
                <span>Preferences</span>
              </button>
            </div>

            <div className="pt-1 border-t border-zinc-800/60">
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  alert("Sign-out demo: In production this will clear active auth session.");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside
        className={`hidden md:block shrink-0 h-screen transition-all duration-200 ease-in-out ${
          isCollapsed ? "w-16" : "w-64"
        }`}
      >
        {content}
      </aside>

      {/* MOBILE DRAWER */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Drawer content */}
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

// Category grouping helper
interface CategoryGroup {
  label: string;
  items: Conversation[];
}

function groupConversations(conversations: Conversation[]): CategoryGroup[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const groups: Record<"today" | "yesterday" | "previous7Days" | "older", Conversation[]> = {
    today: [],
    yesterday: [],
    previous7Days: [],
    older: [],
  };

  conversations.forEach((conv) => {
    const d = new Date(conv.updatedAt || conv.createdAt);
    if (d >= today) {
      groups.today.push(conv);
    } else if (d >= yesterday) {
      groups.yesterday.push(conv);
    } else if (d >= sevenDaysAgo) {
      groups.previous7Days.push(conv);
    } else {
      groups.older.push(conv);
    }
  });

  return [
    { label: "Today", items: groups.today },
    { label: "Yesterday", items: groups.yesterday },
    { label: "Previous 7 Days", items: groups.previous7Days },
    { label: "Older", items: groups.older },
  ];
}
