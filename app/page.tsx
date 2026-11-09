"use client";

import React, { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Conversation, ChatMessage, DocumentItem, AppSettings, ViewMode, ThemePreference } from "@/types/chat";
import {
  getStoredConversations,
  saveStoredConversations,
  getStoredActiveConvId,
  saveStoredActiveConvId,
  getStoredDocuments,
  saveStoredDocuments,
  getStoredSettings,
  saveStoredSettings,
  getStoredSidebarCollapsed,
  saveStoredSidebarCollapsed,
} from "@/lib/storage";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { SettingsModal } from "@/components/settings/SettingsModal";

// Helper hook for SSR-safe client mount detection
const emptySubscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export default function Home() {
  const isClient = useIsClient();

  const [conversations, setConversations] = useState<Conversation[]>(() => getStoredConversations());
  const [activeConvId, setActiveConvId] = useState<string>(() => getStoredActiveConvId());
  const [documents, setDocuments] = useState<DocumentItem[]>(() => getStoredDocuments());
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings());
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => getStoredSidebarCollapsed());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Theme apply function
  const applyTheme = useCallback((theme: ThemePreference) => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, []);

  // Sync theme when settings change or mount
  useEffect(() => {
    if (isClient) {
      applyTheme(settings.theme);
    }
  }, [isClient, settings.theme, applyTheme]);

  // Fetch initial documents & conversations from backend on mount
  useEffect(() => {
    if (!isClient) return;

    // 1. Fetch real documents from database
    fetch("/api/documents")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.documents && Array.isArray(data.documents) && data.documents.length > 0) {
          setDocuments(data.documents);
          saveStoredDocuments(data.documents);
        }
      })
      .catch((err) => console.warn("Could not sync documents from server:", err));

    // 2. Fetch conversations from database
    fetch("/api/conversations")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.conversations && Array.isArray(data.conversations) && data.conversations.length > 0) {
          setConversations(data.conversations);
          saveStoredConversations(data.conversations);
          if (!data.conversations.some((c: Conversation) => c.id === activeConvId)) {
            setActiveConvId(data.conversations[0].id);
            saveStoredActiveConvId(data.conversations[0].id);
          }
        }
      })
      .catch((err) => console.warn("Could not sync conversations from server:", err));
  }, [isClient]);

  // Sync state changes with persistence
  const updateConversations = (newConvs: Conversation[]) => {
    setConversations(newConvs);
    saveStoredConversations(newConvs);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConvId(id);
    saveStoredActiveConvId(id);
    setViewMode("chat");
  };

  const handleNewChat = () => {
    const newId = `conv-${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: "New Conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    const updated = [newConv, ...conversations];
    updateConversations(updated);
    setActiveConvId(newId);
    saveStoredActiveConvId(newId);
    setViewMode("chat");

    // Persist new conversation to backend
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Conversation" }),
    }).catch(() => {});
  };

  const handleRenameConversation = async (id: string, newTitle: string) => {
    const updated = conversations.map((c) =>
      c.id === id ? { ...c, title: newTitle, updatedAt: new Date().toISOString() } : c
    );
    updateConversations(updated);

    try {
      await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch (err) {
      console.warn("Failed to rename conversation on server:", err);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    updateConversations(updated);

    if (activeConvId === id) {
      if (updated.length > 0) {
        setActiveConvId(updated[0].id);
        saveStoredActiveConvId(updated[0].id);
      } else {
        handleNewChat();
      }
    }

    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Failed to delete conversation on server:", err);
    }
  };

  /**
   * Real streaming chat message handler using Server-Sent Events (SSE)
   */
  const streamChatResponse = async (
    targetConvId: string,
    userQuery: string,
    attachments?: string[]
  ) => {
    setIsLoading(true);
    const assistantMsgId = `msg-${Date.now()}-a`;
    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Initial placeholder assistant message in conversation
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: timeStr,
    };

    setConversations((currentConvs) =>
      currentConvs.map((conv) => {
        if (conv.id === targetConvId) {
          return {
            ...conv,
            updatedAt: new Date().toISOString(),
            messages: [...conv.messages, assistantPlaceholder],
          };
        }
        return conv;
      })
    );

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userQuery,
          conversationId: targetConvId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `Server returned error (${res.status})`);
      }

      if (!res.body) {
        throw new Error("No readable stream received from chat API");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";
      let parsedSources: ChatMessage["sources"] = undefined;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("event: token")) {
            const dataLine = lines[i + 1]?.trim();
            if (dataLine && dataLine.startsWith("data:")) {
              try {
                const parsed = JSON.parse(dataLine.slice(5));
                if (parsed.token) {
                  accumulatedContent += parsed.token;

                  setConversations((currentConvs) =>
                    currentConvs.map((conv) => {
                      if (conv.id === targetConvId) {
                        return {
                          ...conv,
                          messages: conv.messages.map((m) =>
                            m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
                          ),
                        };
                      }
                      return conv;
                    })
                  );
                }
              } catch {}
            }
          } else if (line.startsWith("event: done")) {
            const dataLine = lines[i + 1]?.trim();
            if (dataLine && dataLine.startsWith("data:")) {
              try {
                const parsed = JSON.parse(dataLine.slice(5));
                if (parsed.sources && Array.isArray(parsed.sources)) {
                  parsedSources = parsed.sources.map((s: { documentName?: string; pageOrSection?: string; confidence?: number }) => ({
                    documentName: s.documentName || "Document",
                    pageOrSection: s.pageOrSection || "Reference",
                    confidence: s.confidence ?? 0.9,
                  }));
                }
              } catch {}
            }
          } else if (line.startsWith("event: error")) {
            const dataLine = lines[i + 1]?.trim();
            if (dataLine && dataLine.startsWith("data:")) {
              try {
                const parsed = JSON.parse(dataLine.slice(5));
                accumulatedContent = `⚠️ ${parsed.message || "An error occurred while generating answer."}`;
              } catch {}
            }
          }
        }
      }

      // Finalize message with sources and persist
      setConversations((currentConvs) => {
        const finalized = currentConvs.map((conv) => {
          if (conv.id === targetConvId) {
            return {
              ...conv,
              updatedAt: new Date().toISOString(),
              messages: conv.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: accumulatedContent || "No response received.",
                      sources: parsedSources,
                    }
                  : m
              ),
            };
          }
          return conv;
        });
        saveStoredConversations(finalized);
        return finalized;
      });
    } catch (err: unknown) {
      console.error("Chat streaming error:", err);
      const errMsg = err instanceof Error ? err.message : "Error connecting to AI service";

      setConversations((currentConvs) => {
        const finalized = currentConvs.map((conv) => {
          if (conv.id === targetConvId) {
            return {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: `⚠️ ${errMsg}`,
                    }
                  : m
              ),
            };
          }
          return conv;
        });
        saveStoredConversations(finalized);
        return finalized;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (content: string, attachments?: string[]) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments,
    };

    let targetConv = conversations.find((c) => c.id === activeConvId);
    let isBrandNew = false;

    if (!targetConv) {
      targetConv = {
        id: activeConvId,
        title: content.slice(0, 32) + (content.length > 32 ? "..." : ""),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [userMsg],
      };
      isBrandNew = true;
    } else {
      const updatedMessages = [...targetConv.messages, userMsg];
      const updatedTitle =
        targetConv.messages.length === 0
          ? content.slice(0, 32) + (content.length > 32 ? "..." : "")
          : targetConv.title;

      targetConv = {
        ...targetConv,
        title: updatedTitle,
        updatedAt: new Date().toISOString(),
        messages: updatedMessages,
      };
    }

    const nextConvs = isBrandNew
      ? [targetConv, ...conversations]
      : conversations.map((c) => (c.id === targetConv!.id ? targetConv! : c));

    updateConversations(nextConvs);

    // Call real streaming RAG backend
    streamChatResponse(targetConv.id, content, attachments);
  };

  const handleRegenerateResponse = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv || conv.messages.length === 0) return;

    const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    const trimmedMessages =
      conv.messages[conv.messages.length - 1].role === "assistant"
        ? conv.messages.slice(0, -1)
        : conv.messages;

    const updatedConv = {
      ...conv,
      messages: trimmedMessages,
    };

    updateConversations(conversations.map((c) => (c.id === conversationId ? updatedConv : c)));

    // Re-stream last user prompt
    streamChatResponse(conversationId, lastUserMsg.content, lastUserMsg.attachments);
  };

  const handleAddDocument = (newDoc: DocumentItem) => {
    const exists = documents.some((d) => d.id === newDoc.id);
    let updatedDocs: DocumentItem[];
    if (exists) {
      updatedDocs = documents.map((d) => (d.id === newDoc.id ? newDoc : d));
    } else {
      updatedDocs = [newDoc, ...documents];
    }
    setDocuments(updatedDocs);
    saveStoredDocuments(updatedDocs);
  };

  const handleDeleteDocument = async (id: string) => {
    const updated = documents.filter((d) => d.id !== id);
    setDocuments(updated);
    saveStoredDocuments(updated);

    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Failed to delete document from server:", err);
    }
  };

  const handleToggleSidebar = () => {
    const nextVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextVal);
    saveStoredSidebarCollapsed(nextVal);
  };

  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  if (!isClient) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
          <span className="text-xs font-mono">Initializing Knowbase AI...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* LEFT SIDEBAR */}
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConvId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        currentView={viewMode}
        onNavigateView={(v) => setViewMode(v)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        settings={settings}
      />

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {viewMode === "chat" ? (
          <ChatArea
            conversation={activeConversation}
            onSendMessage={handleSendMessage}
            onRegenerateResponse={handleRegenerateResponse}
            isLoading={isLoading}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
            documents={documents}
            settings={settings}
          />
        ) : (
          <DocumentsView
            documents={documents}
            onAddDocument={handleAddDocument}
            onDeleteDocument={handleDeleteDocument}
            onBackToChat={() => setViewMode("chat")}
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(true)}
          />
        )}
      </div>

      {/* SETTINGS MODAL */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => {
          setSettings(newSettings);
          saveStoredSettings(newSettings);
        }}
        onThemeChange={applyTheme}
      />
    </div>
  );
}
