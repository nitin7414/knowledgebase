export type AllowedMime = "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "text/plain" | "text/markdown";

export interface MagicValidationResult {
  valid: boolean;
  detectedMime?: AllowedMime;
  error?: string;
}

/**
 * Validates file buffer against magic bytes and signatures.
 * Allowed types: pdf, docx, txt, md.
 */
export function validateFileMagic(buffer: Buffer, originalFilename: string): MagicValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "Empty file received" };
  }

  // 1. Check PDF: Starts with %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { valid: true, detectedMime: "application/pdf" };
  }

  // 2. Check DOCX (ZIP container): Starts with PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    const ext = originalFilename.split(".").pop()?.toLowerCase();
    if (ext === "docx") {
      return {
        valid: true,
        detectedMime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
  }

  // 3. Plain text or Markdown: Check for UTF-8 and lack of binary null bytes
  const ext = originalFilename.split(".").pop()?.toLowerCase();
  if (ext === "txt" || ext === "md") {
    // Check first 1024 bytes for binary null bytes
    const checkLen = Math.min(buffer.length, 1024);
    for (let i = 0; i < checkLen; i++) {
      if (buffer[i] === 0) {
        return { valid: false, error: "File contains binary null characters, not valid text" };
      }
    }
    return {
      valid: true,
      detectedMime: ext === "md" ? "text/markdown" : "text/plain",
    };
  }

  return {
    valid: false,
    error: `Unsupported file format. Only PDF, DOCX, TXT, and Markdown files are supported.`,
  };
}

