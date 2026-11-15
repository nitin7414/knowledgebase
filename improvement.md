# TASK: Fix the Khabri RAG eval, code claims and REPORT.md for a credible demo deployment

Goal: make Khabri honest, measurable and demo-ready on Vercel (Hobby) + Neon free + OpenRouter free models. This is a portfolio demo, not enterprise production. Do not over-engineer, do not change the stack or redesign the UI, and ask before adding any paid service.

## Ground rules (apply to everything below)
1. **No number goes into any report unless a script produced it.** Metrics, pass/fail status, latencies and token counts must be computed and written by the eval script. No hand-typed results.
2. **If a claim cannot be measured, label it "estimate" or delete it.**
3. **Report failures as failures.** A generation failure is its own category, never counted as a citation miss, and never hidden by averaging.
4. **Verify current docs before coding** for Gemini embeddings, OpenRouter free model IDs, Vercel limits and Neon limits. Do not rely on memory.
5. Work in the phases below. After each phase, stop and show: what changed, the evidence (command output), and anything you could not fix.

---

## Phase 1: Verify the embedding model (do this first)
`REPORT.md` says `text-embedding-004`. Google retired that model on 2026-01-14, so it should not work.
- [ ] Find which embedding model the code actually calls. Print it from config.
- [ ] If it is retired or the report is wrong, migrate to the current recommended Gemini embedding model (check Google's deprecations page).
- [ ] Keep the database vector dimension consistent with the model. If the model's default dimension differs from the column (768), either set `outputDimensionality` to 768 or write a migration that changes the column, re-embeds, and rebuilds the HNSW index.
- [ ] Re-run ingestion on the sample corpus and confirm retrieval works end to end.
- [ ] Put the real model name and dimension in one config constant, and make the README and report read from that fact.

**Done when:** a startup check logs the embedding model and dimension, and a mismatch fails fast with a clear error.

## Phase 2: Fix measurement bugs
- [ ] **TTFT shows 0 ms.** Measure time from request start to the first streamed token chunk actually received (first non-empty content delta), not when the SSE connection opens. Report TTFT and total latency separately, as median and p95, not just the mean.
- [ ] **Token usage:** record provider-reported input and output tokens per query. Fall back to the estimator only if missing, and flag those rows as estimated. Report average input, output and total, over answered queries only. Keep "context tokens" as a separate column.
- [ ] **Generation failures:** log the provider error per query (status code, model, retry count). Run the eval sequentially with delays and retry/backoff to stay under free-tier limits. Add columns `generation_failed` and `error`. Exclude failed queries from quality metrics, but show the failure rate.
- [ ] Add **cache hit rate** and **fallback usage rate** (share of answers served by a non-primary model).
- [ ] The eval must run twice per query set when measuring caching: once cold, once warm. Report both.

**Done when:** no metric reads 0 ms or 0 tokens unless the query genuinely skipped that step (refusal or cache hit), and those rows say so.

## Phase 3: Reconcile the numbers and thresholds
- [ ] One source of truth for every tuned parameter (chunk size, overlap, k, cosine floor, RRF settings, context budget, MMR/dedupe threshold) in a single config file. The pipeline diagram, report, sweeps and eval must all read from it.
- [ ] Resolve the conflict: report says cosine floor 0.68 in the pipeline, 0.65 in the sweep, and an RRF threshold of 0.012 existed earlier. Determine which is actually in code, explain in the report which mechanism causes refusals (cosine floor, keyword match, or RRF threshold), and remove the others from the docs.
- [ ] Recompute MRR and Hit@k over **answerable questions only**. State the counts explicitly: total questions, answerable, unanswerable. Fix the sentence "rank 1 on 31 of 32 queries" so it matches the real denominator.
- [ ] Hit@k must be measured at **chunk or page level**, not only document level. Report both.
- [ ] Add confidence intervals (Wilson interval is fine) for rate metrics, since n is small. Replace "100%" with "100% (n=XX, 95% CI a-b%)".

**Done when:** every number in REPORT.md can be traced to a line in the eval output, and the denominators are stated.

## Phase 4: Make the eval able to fail
The current set is too easy (every sweep value gives identical metrics).
- [ ] Add 10 to 15 harder questions: paraphrased with no keyword overlap, multi-chunk or multi-document answers, near-miss unanswerables (in-domain but absent), questions where a distractor document contains similar wording, and 4 to 6 multi-turn follow-ups that require query rewriting.
- [ ] Add 2 to 3 distractor documents that overlap in topic with existing ones.
- [ ] Judge: use a different model family from the generator when possible, return a structured score with a one-line reason, cache judge results, and spot-check 5 judged answers by hand and record the agreement.
- [ ] Keep unanswerable questions at roughly 30 to 40% of the set.

**Done when:** at least some metrics are below 100% and the sweeps show real differences, or the report states honestly that the settings were indistinguishable.

## Phase 5: Replace the straw-man comparison with a real ablation
Delete the "Naive RAG vs Enterprise RAG vs Khabri" matrix. Replace it with measured ablations on the same eval set, changing one thing at a time:
| Variant | What changes |
| --- | --- |
| A | Vector-only retrieval |
| B | Keyword-only retrieval |
| C | Hybrid + RRF (current default) |
| D | Hybrid, no refusal floor |
| E | Hybrid, no near-duplicate pruning |
| F | Hybrid, no chronological reordering |
| G | Context budget 1,000 / 2,500 / 3,500 |
| H | Chunk size sweep (e.g. 250 / 400 / 600) with overlap held at about 12% |

Report for each: Hit@k (chunk level), MRR, citation correctness, refusal accuracy, judge score, avg total tokens, TTFT, failure rate. Write the winner and the reason per row. If a technique shows no measurable benefit, say so.

## Phase 6: Correct the technical wording
Update REPORT.md, README and code comments:
- [ ] "BM25" -> "Postgres full-text search (`ts_rank`)", unless real BM25 is implemented.
- [ ] "MMR" -> either implement real MMR (relevance vs diversity trade-off with a lambda parameter) or rename the feature to "near-duplicate pruning (Jaccard)".
- [ ] "HMAC-SHA256 encrypted session_id" -> "HMAC-signed session cookie".
- [ ] Remove "single SQL query eliminates token bloat". The real benefit is fewer database round trips and lower latency.
- [ ] Remove all unmeasured latency or token-saving figures ("<5 ms", "<30 ms", "500-1,500 tokens/query", "45% increase") unless the eval now measures them.
- [ ] Prompt-injection: describe the XML boundary as a **mitigation**, not a guarantee. List which payloads were tested.
- [ ] Remove superlatives ("bulletproof", "enterprise-caliber", "exceptional", "obsessive", "every claim is verified").

## Phase 7: Fill the demo-readiness gaps
- [ ] **Chat vs retention mismatch:** chats are in browser storage but documents and vectors are purged after 7 days. When a user opens an old chat whose documents were purged, show a clear banner ("Documents expired, re-upload to continue") and disable retrieval gracefully instead of failing.
- [ ] **Incognito cleanup:** `sendBeacon` is unreliable on mobile. Keep it, but state that the retention cron is the guaranteed cleanup, and make sure the endpoint only deletes the caller's own session (cookie-scoped) and accepts POST.
- [ ] **Upload limits:** test the largest allowed file (4 MB or lower) on the deployed Vercel function and record ingestion time vs `maxDuration`. If it can time out, lower the cap or stage ingestion.
- [ ] **Smoke test:** `pnpm smoke <url>` does upload -> ask -> verify a cited streamed answer -> ask an unanswerable question -> verify refusal -> delete session. Run it against the deployed URL and save the output.
- [ ] **Health:** `/api/health` reports DB, pgvector, embedding provider and at least one reachable model.
- [ ] **Model chain:** validate `OPENROUTER_MODELS` against OpenRouter's current model list at startup, skip missing IDs with a warning. Force the primary model to fail once and confirm the fallback serves the answer.
- [ ] **Friendly failure UI:** when every model is down or a limit is hit, show a readable message and any retrieved sources.
- [ ] Confirm env validation (Zod) fails fast with readable messages, and that no secrets appear in client bundles or logs.

## Phase 8: Rewrite REPORT.md
Rebuild the report from the eval output, in a plain, factual tone with no emojis in headings and no marketing language.
- [ ] Author: leave the placeholder `[YOUR NAME]`. Do not credit any AI vendor or "engineering team".
- [ ] Sections: overview, architecture (keep the two pipeline diagrams), token-saving design (describe each mechanism, mark measured vs estimated), evaluation (scorecard with n and confidence intervals, ablation table, sweeps), security (what was tested and what was not), tests, deployment evidence, **Known limitations**, **What I would change for production**.
- [ ] Known limitations must be honest and specific. Include at least: small dataset, free-model variability, judge-model bias, no OCR, 4 MB upload cap, document-level vs chunk-level caveats, localStorage size limits, unreliable `sendBeacon`, 7-day document expiry, and anything the eval did not cover.
- [ ] Add a "Try it" section: live URL, 2 to 3 sample documents, suggested questions, and a note that the demo uses free models and may be rate limited.
- [ ] Remove the self-written "Final Portfolio Assessment & Verdict" section.
- [ ] Generate scorecard and ablation tables automatically from eval output (script writes `EVAL.md`; the report links to it or embeds it).

## Definition of done (verify each and show evidence)
1. Embedding model verified, documented once, dimension consistent.
2. Eval re-run: real TTFT, real token counts, zero unexplained generation failures, computed pass/fail, chunk-level metrics, confidence intervals, judge score with a hand-check, cache and fallback rates.
3. Harder dataset in place; at least one ablation shows a measurable difference or the report says none was found.
4. Ablation table replaces the competitor matrix.
5. All thresholds come from one config and match everywhere.
6. Technical wording corrected, superlatives removed, injection defense described accurately.
7. Deployed URL passes `pnpm smoke`; max-size upload completes within the function limit; forced primary-model failure still returns an answer.
8. REPORT.md rewritten with limitations, author placeholder and no unmeasured claims.

If any item cannot be completed, say so explicitly in the final summary instead of working around it.