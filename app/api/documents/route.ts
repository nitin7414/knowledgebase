import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getOrCreateSessionId } from "@/lib/session";
import { ingestDocumentFile } from "@/lib/ingestion/pipeline";
import { checkUploadRateLimits, getClientIp } from "@/lib/ratelimit";
import { createRequestId, logEvent } from "@/lib/logger";

export const maxDuration = 60; // Allow sufficient serverless execution time for large docs

export async function GET() {
  try {
    const sessionId = await getOrCreateSessionId();

    const docs = await prisma.document.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      include: {
        chunks: {
          select: { id: true, tokenCount: true },
        },
      },
    });

    const formatted = docs.map((d) => {
      let docType: "pdf" | "docx" | "txt" = "txt";
      if (d.mime === "application/pdf" || d.filename.endsWith(".pdf")) docType = "pdf";
      else if (
        d.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        d.filename.endsWith(".docx")
      )
        docType = "docx";

      const totalTokens = d.chunks.reduce((acc, c) => acc + c.tokenCount, 0);

      return {
        id: d.id,
        name: d.filename,
        type: docType,
        sizeBytes: d.size,
        uploadDate: d.createdAt.toISOString(),
        status: d.status === "processing" ? "indexing" : d.status,
        tokenCount: totalTokens,
        chunkCount: d.chunks.length,
        pageCount: d.pageCount,
        description: `${docType.toUpperCase()} document (${d.chunks.length} chunks indexed)`,
      };
    });

    return NextResponse.json({ documents: formatted });
  } catch (err: unknown) {
    console.error("GET /api/documents error:", err);
    return NextResponse.json(
      { error: "Failed to fetch documents", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const reqId = req.headers.get("x-request-id") || createRequestId();

  try {
    const sessionId = await getOrCreateSessionId();
    const clientIp = getClientIp(req);

    // Rate limit check: uploads per hour
    const limitCheck = await checkUploadRateLimits(sessionId, clientIp);
    if (!limitCheck.success) {
      logEvent("warn", "upload_rate_limited", {
        reqId,
        route: "/api/documents",
        method: "POST",
        status: 429,
        errorClass: "UploadRateLimitExceeded",
        latencyMs: Date.now() - startTime,
      });
      return NextResponse.json(
        {
          error: "UploadRateLimitExceeded",
          message: `You have reached the maximum document upload limit (${limitCheck.limit} per hour). Please retry in ${limitCheck.retryAfterSeconds} seconds.`,
          reqId,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(limitCheck.retryAfterSeconds || 60),
            "X-Request-Id": reqId,
          },
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided in form data" }, { status: 400 });
    }

    // Enforce 4 MB upload limit for Vercel Hobby serverless ceiling (4.5 MB platform limit)
    const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: "Payload too large",
          message: `File size (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds the 4.0 MB serverless platform limit. Please upload a smaller file.`,
        },
        { status: 413 }
      );
    }

    // Enforce max documents per session cap (15 documents)
    const MAX_DOCS_PER_SESSION = 15;
    const existingCount = await prisma.document.count({ where: { sessionId } });
    if (existingCount >= MAX_DOCS_PER_SESSION) {
      return NextResponse.json(
        {
          error: "Document limit reached",
          message: `You have reached the maximum limit (${MAX_DOCS_PER_SESSION} documents per session). Please delete unused documents from the Documents view before uploading more.`,
        },
        { status: 400 }
      );
    }

    // Enforce total storage cap per session (20 MB)
    const MAX_STORAGE_BYTES = 20 * 1024 * 1024;
    const storageSum = await prisma.document.aggregate({
      where: { sessionId },
      _sum: { size: true },
    });
    const currentStorage = storageSum._sum.size || 0;
    if (currentStorage + file.size > MAX_STORAGE_BYTES) {
      return NextResponse.json(
        {
          error: "Storage quota exceeded",
          message: `Total document storage exceeds the 20 MB per-session ceiling. Please delete unused files to free up space.`,
        },
        { status: 400 }
      );
    }

    const filename = file.name || "uploaded-file.txt";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await ingestDocumentFile(buffer, filename, sessionId);

    let docType: "pdf" | "docx" | "txt" = "txt";
    if (result.mime === "application/pdf" || filename.endsWith(".pdf")) docType = "pdf";
    else if (
      result.mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.endsWith(".docx")
    )
      docType = "docx";

    logEvent("info", "document_ingested", {
      reqId,
      route: "/api/documents",
      method: "POST",
      status: 200,
      latencyMs: Date.now() - startTime,
      docType,
      sizeBytes: result.size,
      chunkCount: result.chunkCount,
      reused: result.reused,
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: result.documentId,
          name: result.filename,
          type: docType,
          sizeBytes: result.size,
          uploadDate: new Date().toISOString(),
          status: result.status === "ready" ? "ready" : "failed",
          tokenCount: result.tokenCount,
          chunkCount: result.chunkCount,
          pageCount: result.pageCount,
          reused: result.reused,
          description: result.message || `Indexed ${result.chunkCount} vector chunks.`,
        },
      },
      { headers: { "X-Request-Id": reqId } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", "document_ingest_failed", {
      reqId,
      route: "/api/documents",
      method: "POST",
      status: 400,
      errorClass: "IngestionError",
      errorMessage: message,
      latencyMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "IngestionError", message, reqId },
      { status: 400, headers: { "X-Request-Id": reqId } }
    );
  }
}

