"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Trash2,
  Eye,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Menu,
  ArrowLeft,
  X,
  FileCode,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { DocumentItem } from "@/types/chat";

interface DocumentsViewProps {
  documents: DocumentItem[];
  onAddDocument: (doc: DocumentItem) => void;
  onDeleteDocument: (id: string) => void;
  onBackToChat: () => void;
  onToggleMobileSidebar: () => void;
}

export function DocumentsView({
  documents,
  onAddDocument,
  onDeleteDocument,
  onBackToChat,
  onToggleMobileSidebar,
}: DocumentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDocDetails, setSelectedDocDetails] = useState<DocumentItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "Recent";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    handleProcessFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleProcessFiles(files);
    }
  };

  const handleProcessFiles = async (files: File[]) => {
    for (const file of files) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const extension = file.name.split(".").pop()?.toLowerCase();
      let type: "pdf" | "docx" | "txt" = "txt";
      if (extension === "pdf") type = "pdf";
      else if (extension === "docx") type = "docx";

      const tempDoc: DocumentItem = {
        id: tempId,
        name: file.name,
        type,
        sizeBytes: file.size,
        uploadDate: new Date().toISOString(),
        status: "indexing",
        tokenCount: Math.floor(file.size / 4),
        chunkCount: Math.max(1, Math.floor(file.size / 4000)),
        description: `Extracting text and generating 768-dim vector embeddings...`,
      };

      onAddDocument(tempDoc);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || "Upload failed");
        }

        if (data.document) {
          onDeleteDocument(tempId);
          onAddDocument(data.document);
        }
      } catch (err: unknown) {
        console.error("Upload error:", err);
        const errMsg = err instanceof Error ? err.message : "Failed to upload document";
        onAddDocument({
          ...tempDoc,
          status: "failed",
          description: errMsg,
        });
      }
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col flex-1 h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* HEADER */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 bg-white dark:bg-zinc-900/90 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 md:hidden transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            onClick={onBackToChat}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Chat</span>
          </button>

          <div className="h-4 w-px bg-zinc-200 dark:border-zinc-800 hidden sm:block" />

          <h1 className="text-sm font-semibold text-zinc-950 dark:text-zinc-100 hidden sm:block">
            Document Repository & Vector Knowledge Base
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
        </div>
      </header>

      {/* BODY CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        {/* TOP INTRO BANNER */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            Uploaded Documents
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage files indexed into Knowbase AI. Ground answers with source verified embeddings from your enterprise content.
          </p>
        </div>

        {/* DRAG AND DROP UPLOAD ZONE */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? "border-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/10 scale-[1.005]"
              : "border-zinc-300 dark:border-zinc-700/80 bg-white dark:bg-zinc-950/40 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.docx,.txt"
            className="hidden"
          />

          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
            <UploadCloud className="w-6 h-6" />
          </div>

          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Click to upload or drag & drop files here
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Supports <span className="font-medium text-zinc-700 dark:text-zinc-300">PDF, DOCX, and TXT</span> (up to 50MB per file)
          </p>
        </div>

        {/* SEARCH & CONTROLS */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by filename..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600"
            />
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 self-center">
            <span>Total:</span>
            <span className="font-semibold text-zinc-900 dark:text-zinc-200">
              {documents.length} files
            </span>
          </div>
        </div>

        {/* DOCUMENTS TABLE / CARDS */}
        {filteredDocs.length === 0 ? (
          <div className="p-12 text-center border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/40">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              No documents found
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-xs mx-auto">
              {searchQuery
                ? `No documents match "${searchQuery}". Clear your search query.`
                : "Upload documents to begin asking questions grounded in your private knowledge base."}
            </p>
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/60 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/70 font-semibold text-zinc-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Document Name</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Size</th>
                    <th className="px-3 py-3">Upload Date</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {filteredDocs.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                            {doc.type === "pdf" ? (
                              <FileText className="w-4 h-4 text-rose-500" />
                            ) : doc.type === "docx" ? (
                              <FileSpreadsheet className="w-4 h-4 text-blue-500" />
                            ) : (
                              <FileCode className="w-4 h-4 text-emerald-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate max-w-[220px] sm:max-w-xs font-semibold">
                              {doc.name}
                            </span>
                            {doc.tokenCount && (
                              <span className="text-[10px] text-zinc-400 font-normal">
                                {doc.tokenCount.toLocaleString()} tokens &bull; {doc.chunkCount} chunks
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5 uppercase font-mono text-[11px] text-zinc-500">
                        {doc.type}
                      </td>

                      <td className="px-3 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatFileSize(doc.sizeBytes)}
                      </td>

                      <td className="px-3 py-3.5 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                        {formatDate(doc.uploadDate)}
                      </td>

                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {doc.status === "ready" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Ready</span>
                          </span>
                        ) : doc.status === "indexing" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3 animate-spin" />
                            <span>Indexing</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                            <AlertCircle className="w-3 h-3" />
                            <span>Failed</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDocDetails(doc)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            title="View Document Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(doc.id)}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DOCUMENT DETAILS MODAL */}
      {selectedDocDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedDocDetails(null)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <FileText className="w-5 h-5 text-indigo-500" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-base text-zinc-950 dark:text-zinc-50 truncate">
                  {selectedDocDetails.name}
                </h3>
                <span className="text-xs text-zinc-400 uppercase font-mono">
                  {selectedDocDetails.type} document
                </span>
              </div>
            </div>

            <div className="space-y-3 py-3 border-y border-zinc-200 dark:border-zinc-800 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Processing Status:</span>
                <span className="font-medium text-emerald-500 uppercase">
                  {selectedDocDetails.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">File Size:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  {formatFileSize(selectedDocDetails.sizeBytes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Vector Token Count:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  {selectedDocDetails.tokenCount?.toLocaleString() || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Indexed Chunks:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  {selectedDocDetails.chunkCount || "N/A"} chunks (size: 512 tokens)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Embedding Model:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200 font-mono">
                  text-embedding-3-large
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Upload Timestamp:</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200">
                  {formatDate(selectedDocDetails.uploadDate)}
                </span>
              </div>
              {selectedDocDetails.description && (
                <div className="pt-2">
                  <span className="text-zinc-500 block mb-1">Extracted Summary:</span>
                  <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed bg-zinc-50 dark:bg-zinc-800/50 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700/60">
                    {selectedDocDetails.description}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedDocDetails(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="font-semibold text-base text-zinc-950 dark:text-zinc-50 mb-2">
              Delete Document?
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              This will remove the document and purge its corresponding embedding chunks from your vector index. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteDocument(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

