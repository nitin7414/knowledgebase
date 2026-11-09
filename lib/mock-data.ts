import { Conversation, DocumentItem, AppSettings } from "@/types/chat";

export const INITIAL_SETTINGS: AppSettings = {
  theme: "system",
  systemPrompt: "You are Knowbase AI, an intelligent knowledge assistant that answers queries with citations from verified documents.",
  searchDepth: "balanced",
  streamingSpeed: "normal",
  autoScroll: true,
  user: {
    name: "Alex Vance",
    email: "alex.vance@company.ai",
    role: "Knowledge Lead",
  },
};

export const INITIAL_DOCUMENTS: DocumentItem[] = [
  {
    id: "doc-1",
    name: "Q3_2026_Financial_Audit_Report.pdf",
    type: "pdf",
    sizeBytes: 4288120, // 4.1 MB
    uploadDate: "2026-10-28T09:30:00Z",
    status: "ready",
    tokenCount: 42150,
    chunkCount: 86,
    description: "Audited financial statements and revenue breakdown across North American and European business units.",
  },
  {
    id: "doc-2",
    name: "Enterprise_Security_Architecture_v4.docx",
    type: "docx",
    sizeBytes: 1845100, // 1.8 MB
    uploadDate: "2026-10-25T14:15:00Z",
    status: "ready",
    tokenCount: 19800,
    chunkCount: 42,
    description: "SOC2 Type II compliance controls, zero-trust network policies, and API encryption requirements.",
  },
  {
    id: "doc-3",
    name: "Product_Roadmap_2026_2027.pdf",
    type: "pdf",
    sizeBytes: 6724300, // 6.4 MB
    uploadDate: "2026-10-20T11:00:00Z",
    status: "ready",
    tokenCount: 58900,
    chunkCount: 118,
    description: "Multi-quarter strategic deliverables, RAG vector pipeline upgrades, and agentic workflows.",
  },
  {
    id: "doc-4",
    name: "Customer_Support_SOP_Runbook.txt",
    type: "txt",
    sizeBytes: 341200, // 333 KB
    uploadDate: "2026-10-15T16:45:00Z",
    status: "ready",
    tokenCount: 8200,
    chunkCount: 18,
    description: "Standard operating procedures for tier-1 & tier-2 escalation protocols, incident tagging, and SLA resolution times.",
  },
  {
    id: "doc-5",
    name: "Vendor_Procurement_Guidelines_2026.docx",
    type: "docx",
    sizeBytes: 982000, // 958 KB
    uploadDate: "2026-10-12T10:10:00Z",
    status: "indexing",
    tokenCount: 11400,
    chunkCount: 24,
    description: "Purchasing thresholds, RFP evaluation rubric, and standard MSA terms for cloud service vendors.",
  },
];

// Helper timestamps to reliably generate Today, Yesterday, Previous 7 Days, Older
const now = new Date();
const todayIso = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
const yesterdayIso = new Date(now.getTime() - 26 * 60 * 60 * 1000).toISOString();
const fourDaysAgoIso = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();
const tenDaysAgoIso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
const twentyDaysAgoIso = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1",
    title: "Q3 Revenue & Margin Analysis",
    createdAt: todayIso,
    updatedAt: todayIso,
    messages: [
      {
        id: "msg-1-1",
        role: "user",
        content: "What were our primary revenue growth drivers in Q3 according to the financial audit report?",
        timestamp: "10:14 AM",
      },
      {
        id: "msg-1-2",
        role: "assistant",
        content: `Based on **Q3_2026_Financial_Audit_Report.pdf** (Section 3.2, *Operating Results*), here is a summary of the key drivers:

### 1. Enterprise Subscription Expansion
- **Annual Recurring Revenue (ARR)** surged by **34.2% YoY**, propelled by enterprise tier adoptions.
- Net Revenue Retention (NRR) climbed to **118%**, driven primarily by automated AI assistant add-ons.

### 2. Regional Breakdown
| Region | Revenue (Q3) | YoY Growth | Gross Margin |
| :--- | :--- | :--- | :--- |
| **North America** | $42.8M | +28.4% | 78.5% |
| **EMEA** | $26.1M | +39.1% | 76.2% |
| **APAC** | $14.5M | +44.0% | 74.0% |

### 3. Key Observations
> *"The migration toward consolidated platform licensing eliminated multi-vendor churn, reducing customer acquisition costs by 18%."* — Page 24

Would you like me to drill down into EBITDA margins or specific cost of goods sold (COGS) details?`,
        timestamp: "10:14 AM",
        sources: [
          {
            documentName: "Q3_2026_Financial_Audit_Report.pdf",
            pageOrSection: "Pages 22-26, Section 3.2",
            confidence: 0.96,
          },
        ],
      },
      {
        id: "msg-1-3",
        role: "user",
        content: "Can you provide a code snippet for how we could query this quarterly revenue table via SQL?",
        timestamp: "10:16 AM",
      },
      {
        id: "msg-1-4",
        role: "assistant",
        content: `Certainly! Here is an optimized SQL query using window functions to calculate the quarter-over-quarter and year-over-year revenue comparisons:

\`\`\`sql
WITH QuarterlyMetrics AS (
  SELECT
    region,
    DATE_TRUNC('quarter', transaction_date) AS fiscal_quarter,
    SUM(gross_revenue) AS total_revenue,
    SUM(cogs) AS total_cogs
  FROM financial_ledger
  WHERE transaction_date >= '2025-01-01'
  GROUP BY 1, 2
)
SELECT
  region,
  fiscal_quarter,
  total_revenue,
  ROUND(((total_revenue - total_cogs) / NULLIF(total_revenue, 0)) * 100, 2) AS gross_margin_pct,
  LAG(total_revenue, 4) OVER (PARTITION BY region ORDER BY fiscal_quarter) AS prev_year_revenue,
  ROUND(
    ((total_revenue - LAG(total_revenue, 4) OVER (PARTITION BY region ORDER BY fiscal_quarter)) 
    / NULLIF(LAG(total_revenue, 4) OVER (PARTITION BY region ORDER BY fiscal_quarter), 0)) * 100, 
    2
  ) AS yoy_growth_pct
FROM QuarterlyMetrics
ORDER BY fiscal_quarter DESC, total_revenue DESC;
\`\`\`

### Execution Notes:
- **\`LAG(..., 4)\`**: Looks back exactly 4 quarters for direct year-over-year matching.
- **\`NULLIF\`**: Safeguards against division-by-zero errors in case of missing baseline rows.`,
        timestamp: "10:16 AM",
      },
    ],
  },
  {
    id: "conv-2",
    title: "SOC2 Compliance & Zero Trust",
    createdAt: yesterdayIso,
    updatedAt: yesterdayIso,
    messages: [
      {
        id: "msg-2-1",
        role: "user",
        content: "What are our required encryption standards for data at rest and in transit?",
        timestamp: "Yesterday at 3:45 PM",
      },
      {
        id: "msg-2-2",
        role: "assistant",
        content: `According to **Enterprise_Security_Architecture_v4.docx** (Section 4.1 *Cryptographic Controls*):

- **Data at Rest**:
  - All database volumes, vector indexes, and object stores must employ **AES-256-GCM** encryption.
  - Customer managed encryption keys (CMEK) via AWS KMS or Cloud KMS with annual automated rotation.

- **Data in Transit**:
  - Mandatory **TLS 1.3** across all public ingress endpoints.
  - Mutual TLS (**mTLS**) for inter-service RPC communication inside the Kubernetes service mesh.
  - Weak cipher suites (e.g. SHA-1, CBC modes, 3DES) are strictly blocked at the Cloudflare edge proxy.`,
        timestamp: "Yesterday at 3:45 PM",
        sources: [
          {
            documentName: "Enterprise_Security_Architecture_v4.docx",
            pageOrSection: "Section 4.1",
            confidence: 0.98,
          },
        ],
      },
    ],
  },
  {
    id: "conv-3",
    title: "Support Escalation SLA Runbook",
    createdAt: fourDaysAgoIso,
    updatedAt: fourDaysAgoIso,
    messages: [
      {
        id: "msg-3-1",
        role: "user",
        content: "Summarize the Tier-1 to Tier-2 escalation response times.",
        timestamp: "4 days ago",
      },
      {
        id: "msg-3-2",
        role: "assistant",
        content: `From **Customer_Support_SOP_Runbook.txt**:

- **P0 (Critical Outage)**: Escalation within **10 minutes**, pager duty alert triggered immediately.
- **P1 (Major Impairment)**: Escalation within **30 minutes**, status page banner updated within 1 hour.
- **P2 (Standard Issue)**: Escalation within **4 business hours**.
- **P3 (General Inquiry)**: SLA response within **24 hours**.`,
        timestamp: "4 days ago",
      },
    ],
  },
  {
    id: "conv-4",
    title: "Q4 Vector Pipeline Architecture",
    createdAt: tenDaysAgoIso,
    updatedAt: tenDaysAgoIso,
    messages: [
      {
        id: "msg-4-1",
        role: "user",
        content: "What are the roadmap dates for the hybrid semantic search migration?",
        timestamp: "10 days ago",
      },
      {
        id: "msg-4-2",
        role: "assistant",
        content: `According to the **Product_Roadmap_2026_2027.pdf**, the hybrid semantic + BM25 search rollout is scheduled for **Sprint 44 (Q4 2026)**, followed by multi-modal chunking in **Q1 2027**.`,
        timestamp: "10 days ago",
      },
    ],
  },
  {
    id: "conv-5",
    title: "Vendor Cloud Contract Guidelines",
    createdAt: twentyDaysAgoIso,
    updatedAt: twentyDaysAgoIso,
    messages: [
      {
        id: "msg-5-1",
        role: "user",
        content: "What are the insurance and indemnity liability caps for new software vendors?",
        timestamp: "20 days ago",
      },
      {
        id: "msg-5-2",
        role: "assistant",
        content: `Per **Vendor_Procurement_Guidelines_2026.docx**, standard liability caps are pegged to **2x annual contract value (ACV)**, with uncapped indemnification for data breach, gross negligence, and IP infringement.`,
        timestamp: "20 days ago",
      },
    ],
  },
];

