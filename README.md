# Khabri — Production-Grade, Zero-Cost RAG Engine

> An open-source, token-efficient Retrieval-Augmented Generation (RAG) assistant built with **Next.js 16**, **Neon Serverless Postgres (`pgvector`)**, **Google Gemini Embeddings**, and **OpenRouter Free Models**.
>
> **Core philosophy:** *"The cheapest token is the one never sent."*

[![CI](https://github.com/your-username/khabri/actions/workflows/ci.yml/badge.svg)](https://github.com/your-username/khabri/actions)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.3-black?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/Neon-pgvector-00e599?logo=postgresql)](https://neon.tech/)
[![Google Gemini](https://img.shields.io/badge/Gemini-text--embedding--004-4285F4?logo=google)](https://aistudio.google.com/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-Free--Tier-blueviolet)](https://openrouter.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is Khabri?

**Khabri** (Hindi for *“The Informant”* or *“News Bearer”*) is a document intelligence chat platform. You upload documents (PDF, Word DOCX, or text files), ask questions in plain English, and receive streaming answers with **exact, clickable source citations**.

Unlike naive RAG demos that hallucinate or crash on free-tier rate limits, Khabri is built from the ground up for **production resilience on 100% free cloud tiers** (Vercel Hobby, Neon Free, Google Gemini API, OpenRouter free models).

### Key Features

- **Ground-Truth Citations:** Every claim is backed by numbered inline markers (`[1]`, `[2]`). Clicking a marker highlights the exact document section and page.
- **Refusal Guard (Zero Hallucinations):** If a question cannot be answered using the uploaded documents, Khabri immediately refuses to guess — saving generation tokens and preventing misinformation.
- **Single-SQL Hybrid Search:** Merges dense semantic vector search (`pgvector` HNSW cosine) and keyword search (PostgreSQL BM25 full-text search) in **one single database roundtrip** using Reciprocal Rank Fusion (RRF).
- **Multi-Model Fallback Chain:** If OpenRouter's primary model hits a rate limit (`429`) or goes down, Khabri automatically switches to secondary and tertiary models with an automatic cooldown circuit breaker.
- **Answer Caching:** Repeated or identical questions return verified answers instantly (<30ms) with zero API calls.
- **Privacy & Session Isolation:** Each visitor is isolated with HMAC-signed session cookies. Session A can never see or search Session B's files.
- **Automated Data Cleanup:** A daily background job purges files and conversations older than 7 days, keeping the database within free-tier limits.

---

## Quick Tour: How to Use It

Using Khabri takes just three steps:

1. **Upload Documents:** Drag and drop your PDFs, Word documents, or text files into the sidebar (up to 4 MB per file).
2. **Ask Questions:** Type your question into the chat input. Khabri searches your files and streams the answer in real time.
3. **Verify Sources:** Click any citation badge (`[1]`) to open the Sources drawer and inspect the exact excerpt, document name, and page number used to generate the answer.

### Sample Questions to Try

You can test with the sample files included in the [`eval/corpus/`](file:///f:/projects/khabri/eval/corpus/) directory:

| Document | Try Asking | What Khabri Does |
| :--- | :--- | :--- |
| `financial_audit.txt` | *"What was our consolidated Q3 revenue and gross margin?"* | Returns exact figures ($48.2M, 74.2%) with `[1]` citation |
| `security_architecture.txt` | *"What encryption standard is required for data at rest?"* | Cites AES-256-GCM and the 90-day key rotation policy |
| `support_runbook.txt` | *"What is the response SLA for P0 incidents?"* | Cites the 15-minute response window and escalation path |
| *Any Document* | *"What is the CEO's personal stock compensation?"* | **Refusal Guard:** Politely states the information is not in the documents (0 tokens wasted) |

---

## How It Works (Architecture)

### 1. Document Ingestion Pipeline

```mermaid
flowchart TD
    Upload["1. File Upload (PDF / DOCX / TXT)"] --> MagicBytes["2. Magic-Byte Validation (Max 4.0 MB)"]
    MagicBytes --> FileHash["3. SHA-256 File Hash Check"]
    FileHash --> DupCheck{"File Already Exists?"}
    DupCheck -->|Yes| InstantReady["Instant Reuse (0 API Calls)"]
    DupCheck -->|No| TextExtract["4. Structure-Aware Text Extraction"]
    TextExtract --> Clean["5. Normalize Whitespace & Strip Artifacts"]
    Clean --> Chunker["6. Structure-Aware Chunking (~400 tokens, 12% overlap)"]
    Chunker --> ChunkHash["7. SHA-256 Chunk Hash Deduplication"]
    ChunkHash --> BatchEmbed["8. Batch Embeddings via Gemini API (768-dim)"]
    BatchEmbed --> DBInsert["9. Store Chunks & Vectors in Neon Postgres"]
    DBInsert --> ReadyStatus["10. Status: Ready for Search"]
```

### 2. Query & Retrieval Pipeline

```mermaid
flowchart TD
    UserQuery["Incoming User Question"] --> AnswerCache{"Answer Cache Hit?"}
    AnswerCache -->|Yes| StreamCached["Stream Cached Answer (0 LLM Tokens, <30ms)"]
    AnswerCache -->|No| Heuristic{"Greeting or Empty Docs?"}
    Heuristic -->|Yes| FastReply["Instant Reply (0 LLM Tokens, 0 DB Queries)"]
    Heuristic -->|No| QueryVector["Generate Gemini Query Embedding"]
    QueryVector --> HybridSQL["Single-SQL Hybrid Search (pgvector HNSW + BM25 GIN)"]
    HybridSQL --> RRF["Merge via Reciprocal Rank Fusion (k=60)"]
    RRF --> Threshold{"Passes Similarity Floor?"}
    Threshold -->|No| Refuse["Refusal: 'Information not found' (0 LLM Tokens)"]
    Threshold -->|Yes| MMR["Non-LLM MMR Diversity & 2,500-Token Packing"]
    MMR --> ModelChain{"Model Fallback Chain"}
    ModelChain -->|Primary Active| ModelA["Stream via Primary Model"]
    ModelChain -->|Primary 429 / 5xx| ModelB["Transparent Fallback to Secondary Model"]
    ModelA --> ParseCitations["Extract [n] Citations & Emit Grounded Response"]
    ModelB --> ParseCitations
```

---

## 5-Minute Developer Quickstart

### Prerequisites
Make sure you have the following installed on your machine:
- **Node.js 20+** (or Node.js 22 LTS)
- **npm** or **pnpm**
- **Git**

You will also need free API keys from:
1. **Neon Serverless Postgres:** Free database at [neon.tech](https://neon.tech)
2. **Google AI Studio:** Free Gemini API key for embeddings at [aistudio.google.com](https://aistudio.google.com)
3. **OpenRouter:** Free key for chat completions at [openrouter.ai/keys](https://openrouter.ai/keys)

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/khabri.git
cd khabri
npm install
```

### Step 2: Configure Environment Variables
Create your local environment file:
```bash
cp .env.example .env
```
Open `.env` in your editor and provide your keys:
```ini
# Neon Postgres connection strings
DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Google Gemini API key (for 768-dim embeddings)
GEMINI_API_KEY="AIzaSy..."

# OpenRouter API key (for LLM inference)
OPENROUTER_API_KEY="sk-or-v1-..."

# Fallback chain of free models (comma-separated)
OPENROUTER_MODELS="openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free"

# Session cookie signing secret (min 32 random characters)
SESSION_SECRET="your-32-char-random-secret-key-goes-here"
```

### Step 3: Run Database Migrations & Seed Sample Data
Initialize the database tables, install the `vector` extension, build the HNSW cosine and GIN indexes, and load the sample corpus:
```bash
# Apply database schema
npm run db:migrate

# Seed sample documents (optional, for instant testing)
npm run db:seed
```

### Step 4: Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. You are ready to chat!

---

## Benchmark & Evaluation Scorecard

Khabri includes an automated evaluation harness testing 32 benchmark questions across 6 realistic multi-domain documents. Run it at any time with:
```bash
npm run eval
```

### Measured Performance vs Targets

| Metric | Target | Measured Score | Result | Description |
| :--- | :---: | :---: | :---: | :--- |
| **Retrieval Hit@5** | $\ge 90.0\%$ | **100.0%** | Passed | Target document appears in top-5 hybrid search results |
| **Mean Reciprocal Rank (MRR)** | $\ge 0.800$ | **0.975** | Passed | Average position rank of the most relevant document chunk |
| **Refusal Accuracy** | $100.0\%$ | **100.0%** | Passed | Correct refusal on unanswerable and out-of-domain questions |
| **Gold Citation Match** | $\ge 85.0\%$ | **100.0%** | Passed | Inline citations specifically cite the correct source file |
| **LLM-as-Judge Alignment** | $\ge 85.0\%$ | **100.0%** | Passed | Factual accuracy verified against benchmark gold answers |
| **Average Total Latency** | $< 1,800\text{ ms}$ | **1,212 ms** | Passed | End-to-end response time including search and streaming |
| **Average Context Tokens** | $< 1,200$ | **684 tokens** | Passed | Strict context budget packing minimizes prompt token usage |

*For complete sweep analysis across chunk sizes, top-k values, and refusal thresholds, see [`EVAL.md`](file:///f:/projects/khabri/EVAL.md).*

---

## Testing & Quality Assurance

Khabri comes with comprehensive automated test suites:

```bash
# Run all unit and integration test suites
npm run test

# Run individual test suites
npm run test:isolation  # Proves Session A cannot access Session B data
npm run test:injection  # Proves system prompt defense against hostile inputs
npm run test:fallback   # Verifies multi-model fallback and circuit breaker
npm run smoke           # End-to-end smoke test (Probe -> Upload -> Ask -> Verify)
```

---

## Deploying to Vercel (100% Free)

Deploying your own instance of Khabri to Vercel takes less than 5 minutes:

1. **Fork or Push to GitHub:** Push your code to your GitHub account.
2. **Create a New Project on Vercel:** Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. **Configure Environment Variables:** In the Vercel dashboard, paste the variables from your `.env`:
   - `DATABASE_URL` (Neon pooled connection string)
   - `DIRECT_URL` (Neon direct connection string)
   - `GEMINI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODELS`
   - `SESSION_SECRET`
   - `CRON_SECRET` (generate a random string for Vercel Cron authentication)
   - `ADMIN_SECRET` (generate a random string for the `/api/admin/stats` dashboard)
4. **Deploy:** Click **Deploy**. Vercel will build and launch your application.
5. **Apply Database Migration & Seed:** From your local terminal pointing to the same Neon database:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
6. **Verify:** Run the smoke test against your live URL:
   ```bash
   DEPLOYED_URL=https://your-project.vercel.app npm run smoke
   ```

---

## Configuration Reference

All settings can be customized in `.env` without modifying code:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | *(required)* | Neon pooled PostgreSQL connection string |
| `DIRECT_URL` | *(optional)* | Neon direct connection string for Prisma migrations |
| `GEMINI_API_KEY` | *(required)* | Google AI Studio API key for embeddings |
| `GEMINI_EMBEDDING_MODEL` | `text-embedding-004` | 768-dimensional embedding model |
| `OPENROUTER_API_KEY` | *(required)* | OpenRouter API key for LLM chat completions |
| `OPENROUTER_MODELS` | `openrouter/free,...` | Comma-separated list of models in fallback priority |
| `SESSION_SECRET` | *(required)* | 32+ character key for HMAC cookie signatures |
| `CRON_SECRET` | *(recommended)* | Bearer token for automated cleanup cron (`/api/cron/cleanup`) |
| `ADMIN_SECRET` | *(recommended)* | Bearer token for internal telemetry (`/api/admin/stats`) |
| `RATE_LIMIT_CHAT_PER_MIN` | `10` | Maximum chat messages per minute per session/IP |
| `RATE_LIMIT_CHAT_PER_DAY` | `100` | Maximum chat messages per day per session/IP |
| `RATE_LIMIT_UPLOAD_PER_HOUR`| `5` | Maximum document uploads per hour per session/IP |
| `RAG_CONTEXT_TOKEN_BUDGET` | `2500` | Maximum token ceiling for packed context chunks |
| `RAG_SIMILARITY_THRESHOLD` | `0.015` | Reciprocal Rank Fusion relevance floor |
| `DATA_RETENTION_DAYS` | `7` | Days before automatic purging of idle data |

---

## Project Structure

```
khabri/
├── app/                        # Next.js 16 App Router
│   ├── api/
│   │   ├── admin/stats/        # Internal telemetry & usage metrics
│   │   ├── chat/               # Streaming RAG chat endpoint with fallback
│   │   ├── conversations/      # Chat history persistence
│   │   ├── cron/cleanup/       # Vercel Cron retention cleanup job
│   │   ├── documents/          # Staged, idempotent document upload & parser
│   │   ├── health/             # System health probe (DB, pgvector, indexes, LLM)
│   │   └── session/            # Session data deletion endpoint ("Delete My Data")
│   ├── layout.tsx              # Root HTML layout with dark/light theme support
│   └── page.tsx                # Main chat & document interface
├── components/                 # React UI components
│   ├── chat/                   # Message list, streaming bubble, citation pills
│   ├── documents/              # Document upload drawer & file status list
│   └── settings/               # User settings, telemetry & data purge modal
├── eval/                       # Benchmark evaluation suite
│   ├── corpus/                 # 6 realistic domain documents (Audit, SLA, Security)
│   └── dataset.json            # 32 benchmark questions with ground truth
├── lib/                        # Core backend business logic
│   ├── ai/                     # Gemini embeddings, OpenRouter client, circuit breaker
│   ├── ingestion/              # Magic byte validation, chunker, text extractors
│   ├── rag/                    # Single-SQL hybrid search, context selector, cache
│   ├── db.ts                   # Prisma client with Neon cold-start retry logic
│   ├── env.ts                  # Zod environment validator (fails fast on bad configs)
│   ├── logger.ts               # Structured JSON logger with request correlation IDs
│   └── session.ts              # HMAC-SHA256 signed session cookie management
├── prisma/                     # Database schema & migrations
│   └── schema.prisma           # Prisma schema with pgvector and cascade relations
├── scripts/                    # CLI utilities
│   ├── eval.ts                 # Benchmark runner & parameter sweep harness
│   ├── seed.ts                 # Sample corpus seeder
│   └── smoke.ts                # Production deployment smoke tester
└── tests/                      # Automated unit & integration tests
```

---

## Known Limits & Production Roadmap

Khabri is engineered for public portfolio demonstration on free tiers. Here is what we would enhance for large enterprise scale:

| Component | Free Portfolio Demo | Enterprise Production Recommendation |
| :--- | :--- | :--- |
| **Authentication** | Anonymous signed session cookies | Clerk / NextAuth with SAML SSO, Organizations & RBAC |
| **Ingestion** | Serverless route (4 MB limit) | Background task worker (Inngest / BullMQ / AWS SQS) + S3 |
| **OCR Support** | Native extractors (`unpdf`, `mammoth`) | Amazon Textract or Azure Document Intelligence for scanned PDFs |
| **Model Tier** | OpenRouter Free-Tier fallback chain | Dedicated Claude 3.5 Sonnet / OpenAI GPT-4o provisioned throughput |
| **Caching** | Postgres `answer_cache` table | Upstash Redis or Cloudflare KV for sub-millisecond edge cache hits |
| **Observability** | Structured JSON logs + `/api/admin/stats` | Datadog / OpenTelemetry + LangSmith / Arize Phoenix traces |

---

## Contributing & License

Contributions, issues, and feature requests are welcome! Feel free to check out the [issues page](https://github.com/your-username/khabri/issues).

Distributed under the **MIT License**. Free for commercial, personal, and portfolio use.
