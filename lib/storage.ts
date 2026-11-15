import { Conversation, DocumentItem, AppSettings } from "@/types/chat";
import { INITIAL_CONVERSATIONS, INITIAL_DOCUMENTS, INITIAL_SETTINGS } from "./mock-data";

const STORAGE_KEYS = {
  CONVERSATIONS: "knowbase_conversations_v1",
  ACTIVE_CONVERSATION_ID: "knowbase_active_conv_id_v1",
  DOCUMENTS: "knowbase_documents_v1",
  SETTINGS: "knowbase_settings_v1",
  SIDEBAR_COLLAPSED: "knowbase_sidebar_collapsed_v1",
};

export const getStoredConversations = (): Conversation[] => {
  if (typeof window === "undefined") return INITIAL_CONVERSATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONVERSATIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(INITIAL_CONVERSATIONS));
      return INITIAL_CONVERSATIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_CONVERSATIONS;
  }
};

export const saveStoredConversations = (conversations: Conversation[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch (err) {
    console.error("Failed to save conversations to localStorage", err);
  }
};

export const getStoredActiveConvId = (): string => {
  if (typeof window === "undefined") return INITIAL_CONVERSATIONS[0].id;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
    return raw || INITIAL_CONVERSATIONS[0].id;
  } catch {
    return INITIAL_CONVERSATIONS[0].id;
  }
};

export const saveStoredActiveConvId = (id: string) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID, id);
  } catch (err) {
    console.error("Failed to save active conversation id", err);
  }
};

export const getStoredDocuments = (): DocumentItem[] => {
  if (typeof window === "undefined") return INITIAL_DOCUMENTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(INITIAL_DOCUMENTS));
      return INITIAL_DOCUMENTS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_DOCUMENTS;
  }
};

export const saveStoredDocuments = (docs: DocumentItem[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
  } catch (err) {
    console.error("Failed to save documents to localStorage", err);
  }
};

export const getStoredSettings = (): AppSettings => {
  if (typeof window === "undefined") return INITIAL_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return INITIAL_SETTINGS;
    return { ...INITIAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return INITIAL_SETTINGS;
  }
};

export const saveStoredSettings = (settings: AppSettings) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save settings", err);
  }
};

export const getStoredSidebarCollapsed = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
    return raw === "true";
  } catch {
    return false;
  }
};

export const saveStoredSidebarCollapsed = (collapsed: boolean) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, collapsed ? "true" : "false");
  } catch (err) {
    console.error("Failed to save sidebar state", err);
  }
};

/**
 * Data management utilities for Local-First and Ephemeral privacy modes
 */
export const clearStoredData = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS);
    localStorage.removeItem(STORAGE_KEYS.DOCUMENTS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_CONVERSATION_ID);
  } catch (err) {
    console.error("Failed to clear local storage", err);
  }
};

export const exportStoredData = (): string => {
  if (typeof window === "undefined") return "";
  const conversations = getStoredConversations();
  const documents = getStoredDocuments();
  const exportPayload = {
    app: "Khabri RAG",
    version: "1.0",
    exportedAt: new Date().toISOString(),
    conversations,
    documents,
  };
  return JSON.stringify(exportPayload, null, 2);
};

export const importStoredData = (
  rawJson: string
): { success: boolean; message: string; count?: { conversations: number; documents: number } } => {
  if (typeof window === "undefined") return { success: false, message: "Browser environment required." };
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || (typeof parsed !== "object")) {
      return { success: false, message: "Invalid JSON format." };
    }

    if (Array.isArray(parsed.conversations)) {
      saveStoredConversations(parsed.conversations);
    }
    if (Array.isArray(parsed.documents)) {
      saveStoredDocuments(parsed.documents);
    }

    return {
      success: true,
      message: "Data successfully restored to local browser storage.",
      count: {
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations.length : 0,
        documents: Array.isArray(parsed.documents) ? parsed.documents.length : 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to parse JSON backup file.",
    };
  }
};

