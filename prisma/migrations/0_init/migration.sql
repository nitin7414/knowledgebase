-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "DocumentStatus" AS ENUM ('processing', 'ready', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable documents
CREATE TABLE IF NOT EXISTS "documents" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "file_hash" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'processing',
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable chunks
CREATE TABLE IF NOT EXISTS "chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "page_number" INTEGER,
    "section_title" TEXT,
    "metadata" JSONB,
    "content_hash" TEXT NOT NULL,
    "embedding" vector(768),
    "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable conversations
CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rolling_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable messages
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sources" JSONB,
    "usage" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable conversation_documents
CREATE TABLE IF NOT EXISTS "conversation_documents" (
    "conversation_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,

    CONSTRAINT "conversation_documents_pkey" PRIMARY KEY ("conversation_id","document_id")
);

-- CreateTable rate_limits
CREATE TABLE IF NOT EXISTS "rate_limits" (
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable answer_cache
CREATE TABLE IF NOT EXISTS "answer_cache" (
    "key" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttl" INTEGER NOT NULL DEFAULT 86400,

    CONSTRAINT "answer_cache_pkey" PRIMARY KEY ("key")
);

-- Foreign Keys
DO $$ BEGIN
    ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- BTree Indexes
CREATE INDEX IF NOT EXISTS "idx_documents_session_id" ON "documents"("session_id");
CREATE INDEX IF NOT EXISTS "idx_documents_file_hash" ON "documents"("file_hash");
CREATE INDEX IF NOT EXISTS "idx_chunks_document_id" ON "chunks"("document_id");
CREATE INDEX IF NOT EXISTS "idx_chunks_content_hash" ON "chunks"("content_hash");
CREATE INDEX IF NOT EXISTS "idx_conversations_session_id" ON "conversations"("session_id");
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_conv_docs_conversation_id" ON "conversation_documents"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_conv_docs_document_id" ON "conversation_documents"("document_id");
CREATE INDEX IF NOT EXISTS "idx_rate_limits_window_start" ON "rate_limits"("window_start");
CREATE INDEX IF NOT EXISTS "idx_answer_cache_created_at" ON "answer_cache"("created_at");

-- Vector HNSW Index (Cosine similarity)
CREATE INDEX IF NOT EXISTS "idx_chunks_embedding_hnsw" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Full-Text GIN Index on tsvector
CREATE INDEX IF NOT EXISTS "idx_chunks_tsv_gin" ON "chunks" USING gin ("tsv");

