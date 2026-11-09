export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  attachments?: string[];
  sources?: {
    documentName: string;
    pageOrSection: string;
    confidence: number;
  }[];
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  pinned?: boolean;
}

export type DocumentStatus = "ready" | "indexing" | "failed";

export interface DocumentItem {
  id: string;
  name: string;
  type: "pdf" | "docx" | "txt";
  sizeBytes: number;
  uploadDate: string;
  status: DocumentStatus;
  tokenCount?: number;
  chunkCount?: number;
  description?: string;
}

export type ThemePreference = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemePreference;
  systemPrompt: string;
  searchDepth: "fast" | "balanced" | "deep";
  streamingSpeed: "normal" | "fast" | "instant";
  autoScroll: boolean;
  user: {
    name: string;
    email: string;
    role: string;
    avatarUrl?: string;
  };
}

export type ViewMode = "chat" | "documents";

