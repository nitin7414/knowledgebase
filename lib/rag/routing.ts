const GREETING_PATTERNS = [
  /^(?:hi|hello|hey|greetings|howdy|sup|hola)(?:\s+there)?(?:\s*!|\.|\?)*$/i,
  /^(?:good\s+(?:morning|afternoon|evening|day))(?:\s*!|\.|\?)*$/i,
  /^(?:thanks|thank\s+you|thx|cheers)(?:\s+(?:very\s+much|a\s+lot))?(?:\s*!|\.|\?)*$/i,
  /^(?:who\s+are\s+you|what\s+can\s+you\s+do|what\s+is\s+your\s+name|help(?:\s+me)?)(?:\s*!|\.|\?)*$/i,
];

export interface RoutingDecision {
  type: "chitchat" | "no_documents" | "retrieval";
  directResponse?: string;
}

export function routeUserQuery(
  query: string,
  totalDocumentsCount: number
): RoutingDecision {
  const trimmed = query.trim().toLowerCase();

  // 1. Check for simple greetings or chit-chat
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(trimmed)) {
      if (/thanks|thank\s+you|thx|cheers/i.test(trimmed)) {
        return {
          type: "chitchat",
          directResponse: "You're very welcome! Let me know if you need any more insights from your documents.",
        };
      }
      return {
        type: "chitchat",
        directResponse:
          "Hello! I am your RAG Knowledge Assistant. Ask me anything about your uploaded documents, and I will cite verified sources with page references.",
      };
    }
  }

  // 2. Check if no documents exist in the knowledge base
  if (totalDocumentsCount === 0) {
    return {
      type: "no_documents",
      directResponse:
        "No documents are currently attached to this conversation or uploaded to your knowledge base. Please upload a PDF, DOCX, or text file via the Documents tab to enable verified grounded answers.",
    };
  }

  return { type: "retrieval" };
}

