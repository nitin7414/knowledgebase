"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Paperclip,
  Copy,
  Check,
  RotateCcw,
  Menu,
  FileText,
  ShieldCheck,
  X,
  ArrowUp,
  TrendingUp,
  Shield,
  Layers,
  FileCheck2,
} from "lucide-react";
import { Conversation, DocumentItem, AppSettings } from "@/types/chat";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import { KnowbaseIcon, AssistantAvatar } from "@/components/ui/KnowbaseIcon";

interface ChatAreaProps {
  conversation: Conversation | null;
  onSendMessage: (content: string, attachments?: string[]) => void;
  onRegenerateResponse: (conversationId: string) => void;
  isLoading: boolean;
  onToggleMobileSidebar: () => void;
  documents: DocumentItem[];
  settings: AppSettings;
}

const STARTER_PROMPTS = [
  {
    title: "Summarize Q3 Financial Drivers",
    description: "Analyze YoY revenue expansion and regional operating margins",
    prompt: "What were our primary revenue growth drivers in Q3 according to the financial audit report?",
    icon: TrendingUp,
  },
  {
    title: "SOC2 Cryptographic Policies",
    description: "Review required encryption algorithms for data at rest and in transit",
    prompt: "What are our required encryption standards for data at rest and in transit according to our security policies?",
    icon: Shield,
  },
  {
    title: "Support Escalation SLAs",
    description: "Break down P0 through P3 response target times from runbooks",
    prompt: "Summarize the customer support escalation response times and SLA targets for P0-P3 tickets.",
    icon: Layers,
  },
  {
    title: "Vendor Contract Caps",
    description: "Inspect indemnification clauses and liability caps for new tooling",
    prompt: "What are the standard liability caps and indemnification terms for vendor contracts?",
    icon: FileCheck2,
  },
];

export function ChatArea({
  conversation,
  onSendMessage,
  onRegenerateResponse,
  isLoading,
  onToggleMobileSidebar,
  documents,
  settings,
}: ChatAreaProps) {
  const [inputText, setInputText] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (settings.autoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation?.messages, isLoading, settings.autoScroll]);

  // Handle send message
  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    onSendMessage(trimmed, selectedAttachments.length > 0 ? selectedAttachments : undefined);
    setInputText("");
    setSelectedAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleAttachMockDoc = (docName: string) => {
    if (!selectedAttachments.includes(docName)) {
      setSelectedAttachments((prev) => [...prev, docName]);
    }
    setShowAttachMenu(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!selectedAttachments.includes(file.name)) {
        setSelectedAttachments((prev) => [...prev, file.name]);
      }
    }
    setShowAttachMenu(false);
  };

  const hasMessages = conversation && conversation.messages.length > 0;

  return (
    <div className="flex flex-col flex-1 h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 overflow-hidden relative">
      {/* TOP HEADER */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 z-10 shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleMobileSidebar}
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden transition-colors"
            title="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm truncate max-w-[220px] sm:max-w-md">
              {conversation ? conversation.title : "New Chat"}
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>RAG Connected ({documents.length} docs)</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hidden sm:block">
            Knowbase 2.5 Pro
          </div>
        </div>
      </header>

      {/* CHAT BODY */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-6 space-y-6">
        {!hasMessages ? (
          /* INITIAL EMPTY STATE */
          <div className="max-w-2xl mx-auto min-h-[70vh] flex flex-col justify-center items-center text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center mb-6 shadow-md ring-1 ring-zinc-900/10 dark:ring-white/10">
              <KnowbaseIcon size={28} variant="hero" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mb-2">
              What would you like to know?
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 max-w-md">
              Ask questions about your documents and knowledge base. Answers are grounded in your enterprise indexes with source citations.
            </p>

            {/* Starter Suggestion Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left mb-6">
              {STARTER_PROMPTS.map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setInputText(item.prompt);
                      textareaRef.current?.focus();
                    }}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-150 text-left group"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                        <IconComponent className="w-3.5 h-3.5" />
                      </div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-950 dark:group-hover:text-white">
                        {item.title}
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2 pl-6">
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* CONVERSATION MESSAGES LIST */
          <div className="max-w-3xl mx-auto space-y-6">
            {conversation.messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const isAssistant = msg.role === "assistant";
              const isLastAssistantMessage =
                isAssistant && index === conversation.messages.length - 1;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3.5 sm:gap-4 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Assistant Avatar */}
                  {!isUser && <AssistantAvatar />}

                  {/* Message Bubble & Content */}
                  <div
                    className={`flex flex-col min-w-0 ${
                      isUser
                        ? "items-end max-w-[85%] sm:max-w-[75%]"
                        : "items-start max-w-[90%] sm:max-w-[85%]"
                    }`}
                  >
                    {/* Attachments preview if user sent any */}
                    {isUser && msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 justify-end">
                        {msg.attachments.map((att, aIdx) => (
                          <span
                            key={aIdx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                          >
                            <FileText className="w-3.5 h-3.5 text-zinc-500" />
                            <span className="truncate max-w-[180px]">{att}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className={`p-4 rounded-2xl ${
                        isUser
                          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 rounded-br-xs shadow-xs"
                          : "bg-transparent text-zinc-900 dark:text-zinc-100 px-0 sm:px-1 py-1"
                      }`}
                    >
                      {isUser ? (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed">
                          {msg.content}
                        </div>
                      ) : (
                        <MarkdownRenderer content={msg.content} />
                      )}
                    </div>

                    {/* Sources citation pill if assistant attached sources */}
                    {isAssistant && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {msg.sources.map((src, sIdx) => (
                          <div
                            key={sIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/80 shadow-xs"
                          >
                            <FileText className="w-3 h-3 text-indigo-500" />
                            <span className="font-semibold">{src.documentName}</span>
                            <span className="text-zinc-400">({src.pageOrSection})</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Assistant Action Buttons: Copy & Regenerate */}
                    {isAssistant && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                          title="Copy response"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-emerald-500 text-[11px]">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Copy</span>
                            </>
                          )}
                        </button>

                        {isLastAssistantMessage && !isLoading && (
                          <button
                            onClick={() => onRegenerateResponse(conversation.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                            title="Regenerate response"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="text-[11px]">Regenerate</span>
                          </button>
                        )}

                        <span className="text-[10px] text-zinc-400 ml-1">
                          {msg.timestamp}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-900 border border-zinc-700 text-zinc-200 flex items-center justify-center shrink-0 text-xs font-semibold ring-2 ring-zinc-200 dark:ring-zinc-800">
                      {settings.user.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                  )}
                </div>
              );
            })}

            {/* TYPING / LOADING INDICATOR */}
            {isLoading && (
              <div className="flex gap-4 items-start">
                <AssistantAvatar isPulsing />
                <div className="p-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" />
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-2 font-medium">
                    Searching knowledge base & synthesizing answer...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* MESSAGE COMPOSER */}
      <footer className="p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200/60 dark:border-zinc-800 shrink-0">
        <div className="max-w-3xl mx-auto">
          {/* Active Attachments Preview in composer */}
          {selectedAttachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
              {selectedAttachments.map((att, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="truncate max-w-[200px]">{att}</span>
                  <button
                    onClick={() =>
                      setSelectedAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-0.5 hover:text-rose-500 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Composer Input Box */}
          <div className="relative flex items-end bg-zinc-100 dark:bg-zinc-800/90 rounded-2xl border border-zinc-300 dark:border-zinc-700/80 focus-within:border-zinc-400 dark:focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-zinc-500 transition-all shadow-xs p-1.5 sm:p-2">
            {/* Attachment Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className="p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-200/70 dark:hover:bg-zinc-700/50 transition-colors"
                title="Attach documents"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Attach Dropdown Menu */}
              {showAttachMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl p-2 z-50 text-xs">
                  <div className="px-2 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Ground response in document:
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.docx,.txt"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-left transition-colors font-medium"
                  >
                    <Paperclip className="w-4 h-4 text-indigo-500" />
                    <span>Upload new document (PDF, DOCX, TXT)</span>
                  </button>

                  <div className="border-t border-zinc-200 dark:border-zinc-800 my-1 pt-1">
                    <div className="px-2 py-1 text-[10px] text-zinc-400 font-medium">
                      Select from existing knowledge base:
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-0.5">
                      {documents.map((doc) => (
                        <button
                          key={doc.id}
                          onClick={() => handleAttachMockDoc(doc.name)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-left transition-colors truncate"
                        >
                          <span className="truncate">{doc.name}</span>
                          <span className="text-[10px] text-zinc-400 uppercase ml-2 shrink-0">
                            {doc.type}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Expandable Textarea */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your documents... (Shift + Enter for new line)"
              rows={1}
              className="flex-1 bg-transparent px-2 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 outline-none resize-none max-h-48 leading-relaxed"
            />

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className={`p-2 rounded-xl transition-all duration-150 shrink-0 ${
                inputText.trim() && !isLoading
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:opacity-90 shadow-sm"
                  : "text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50"
              }`}
              title="Send message (Enter)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Unobtrusive Disclaimer */}
          <p className="text-[11px] text-center text-zinc-400 dark:text-zinc-500 mt-2">
            AI-generated responses may contain inaccuracies. Verify important information against primary source documents.
          </p>
        </div>
      </footer>
    </div>
  );
}
