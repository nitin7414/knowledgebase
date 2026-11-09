"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Split content into blocks: code blocks, tables, lists, quotes, paragraphs
  const blocks = parseBlocks(content);

  return (
    <div className="space-y-3 leading-relaxed text-[15px] text-zinc-800 dark:text-zinc-200 break-words">
      {blocks.map((block, idx) => (
        <BlockItem key={idx} block={block} />
      ))}
    </div>
  );
}

type BlockType =
  | { type: "code"; language: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(markdown: string): BlockType[] {
  const lines = markdown.split("\n");
  const blocks: BlockType[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced Code Block
    if (line.trim().startsWith("```")) {
      const language = line.trim().replace(/^```/, "").trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Markdown Table (line starts with | and contains |)
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (rowStr: string) =>
          rowStr
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim());

        const headers = parseRow(tableLines[0]);
        // line 1 is usually separator (| :--- | :--- |)
        const rowLines = tableLines.slice(2);
        const rows = rowLines.map(parseRow);

        blocks.push({
          type: "table",
          headers,
          rows,
        });
        continue;
      }
    }

    // Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote (> text)
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        text: quoteLines.join(" "),
      });
      continue;
    }

    // Unordered List (- or *)
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({
        type: "unordered-list",
        items,
      });
      continue;
    }

    // Ordered List (1. 2. etc.)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({
        type: "ordered-list",
        items,
      });
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph (accumulate contiguous lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("|") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({
      type: "paragraph",
      text: paraLines.join(" "),
    });
  }

  return blocks;
}

function BlockItem({ block }: { block: BlockType }) {
  switch (block.type) {
    case "code":
      return <CodeBlock language={block.language} code={block.code} />;

    case "table":
      return (
        <div className="overflow-x-auto my-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800/60 font-semibold text-zinc-900 dark:text-zinc-100">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3.5 py-2.5 text-left text-xs uppercase tracking-wider font-semibold">
                    <InlineText text={h} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-transparent">
              {block.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3.5 py-2.5 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "heading": {
      if (block.level === 1) {
        return (
          <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50 mt-4 mb-2">
            <InlineText text={block.text} />
          </h1>
        );
      }
      if (block.level === 2) {
        return (
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 mt-3 mb-1.5">
            <InlineText text={block.text} />
          </h2>
        );
      }
      return (
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-2 mb-1">
          <InlineText text={block.text} />
        </h3>
      );
    }

    case "blockquote":
      return (
        <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 pl-4 py-1 italic text-zinc-600 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-r">
          <InlineText text={block.text} />
        </blockquote>
      );

    case "unordered-list":
      return (
        <ul className="space-y-1.5 list-disc pl-5 my-2">
          {block.items.map((item, idx) => (
            <li key={idx} className="text-zinc-800 dark:text-zinc-200">
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      );

    case "ordered-list":
      return (
        <ol className="space-y-1.5 list-decimal pl-5 my-2">
          {block.items.map((item, idx) => (
            <li key={idx} className="text-zinc-800 dark:text-zinc-200">
              <InlineText text={item} />
            </li>
          ))}
        </ol>
      );

    case "paragraph":
      return (
        <p className="my-1.5 leading-relaxed">
          <InlineText text={block.text} />
        </p>
      );
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-sm font-mono text-[13px]">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800 text-xs text-zinc-400">
        <span className="font-medium tracking-wide lowercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-sans text-xs">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="font-sans text-xs">Copy code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto leading-relaxed">
        <pre className="whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

// Inline formatting: **bold**, *italic*, `code`, and links
function InlineText({ text }: { text: string }) {
  // Regex to split by bold, inline code, italic
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // 1. Inline Code `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code
          key={keyIdx++}
          className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[0.88em] border border-zinc-300/60 dark:border-zinc-700/60"
        >
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // 2. Bold **bold**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={keyIdx++} className="font-semibold text-zinc-950 dark:text-zinc-100">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // 3. Italic *italic* or _italic_
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(
        <em key={keyIdx++} className="italic text-zinc-700 dark:text-zinc-300">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Find next special character
    const nextSpecial = remaining.search(/[`*]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial > 0) {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    } else {
      // Single stray special character
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }
  }

  return <>{parts}</>;
}

