# Test corpus & questions

Three fictional, demo-only PDFs for exercising the Altovo DocQA pipeline. Upload
all three (Documents → drag-drop or picker), then ask the questions below. Each
group targets a specific behavior; the **Expect** line is the correct outcome.

| File | Pages | Purpose |
|------|-------|---------|
| `northwind-employee-handbook.pdf` | 4 | Grounded facts, exact-term codes, one side of a cross-doc conflict |
| `northwind-it-security-policy.pdf` | 3 | Overlaps the handbook — the other side of the conflict |
| `aurora-analytics-release-notes.pdf` | 4 | Version numbers / error codes (FTS), absent topics for refusal |

> The two Northwind docs are the same company (so a conflict is meaningful).
> Aurora is unrelated — keep that in mind for cross-doc questions.

---

## 1. Grounded fact → cited answer
- **How long is the probation period at Northwind Robotics?** — Expect: 90 days · cite Handbook p1.
- **How many PTO days do employees get per year?** — Expect: 22 days · cite Handbook p2.
- **How often must passwords be rotated?** — Expect: every 90 days · cite Security Policy p1.

## 2. Exact-term / keyword retrieval (hybrid FTS strength)
- **What does policy HR-204 cover?** — Expect: the probation policy (90 days) · cite Handbook p1.
- **What is standard SEC-11?** — Expect: access control (least-privilege + MFA) · cite Security Policy p1.
- **What was fixed in ERR-4021?** — Expect: dashboard export failure (large PDF exports aborting) · cite Aurora p2.
- **What does ERR-3350 refer to?** — Expect: timezone drift after DST · cite Aurora p2.
  - *Why these matter:* rare tokens like `HR-204` / `ERR-4021` are where keyword
    beats pure vector search — good signal that RRF fusion is working.

## 3. Multi-page citation (fact on a later page)
- **What is the home-office stipend?** — Expect: $400/year · cite Handbook p3.
- **What is the minimum password length?** — Expect: 14 characters · cite Security Policy p2.
- **How long are security logs retained, and how long are backups kept?** — Expect: logs 180 days (p2) + backups 30 days (p3) · cite both.
- **What is the minimum RAM requirement, and which PostgreSQL version is needed?** — Expect: 16 GB RAM · Postgres 14+ · cite Aurora p3.

## 4. Version / release facts
- **What is the current Aurora release, and what was the previous one?** — Expect: current v3.2.0 (12 Mar 2026); previous v3.1.4 · cite Aurora p1.
- **Is the v2 REST API still available in v4.0?** — Expect: no — deprecated now, removed in v4.0 · cite Aurora p3.

## 5. Correctly-answerable negatives
- **Is Safari supported by Aurora Analytics?** — Expect: no — only Chrome, Firefox, Edge · cite Aurora p3. (The doc *states* the negative, so it should answer, not refuse.)

## 6. Cross-document conflict (should cite BOTH sides — D19)
- **How often are company laptops replaced at Northwind?** — Expect: surface the
  conflict — Handbook p3 says **every 3 years**, IT & Security Policy p2 says
  **every 4 years** — cite both, don't silently pick one.

## 7. Ambiguous question (name the ambiguity / ask a clarifier — D19)
- **How many days do I get?** — Expect: not a single number. Either ask which
  (PTO / sick / notice) or enumerate: PTO 22, sick 10, notice 30, carryover cap
  5 (all Handbook p2).

## 8. Not in the documents (canned refusal, no LLM guess — D10)
- **What is Northwind's parental leave policy?** — Expect: "couldn't find this in the documents"; no fabrication.
- **Does Northwind offer a 401(k) match or stock options?** — Expect: refusal.
- **How much does Aurora Analytics cost?** — Expect: refusal (pricing absent).
- **Does Aurora support SSO / SAML login?** — Expect: refusal.

## 9. Weak-match caveat
- **How do I improve query performance in Aurora?** — Expect: a hedged answer —
  the doc only mentions the Query Profiler and `QUERY_TIMEOUT = 30s`, no tuning
  guide — ideally flagged as a weak/loose match rather than a confident answer.

## 10. Multi-turn (history → generation, D13)
1. **What is the notice period for resigning?** → Expect: 30 days (Handbook p2).
2. **And the PTO carryover cap?** → Expect: 5 days — a follow-up that only makes
   sense if the prior turn's context carried over.

---

### Things to watch in the UI while testing
- **Citation chips** render provisional (dashed) during streaming, then reconcile
  when the validated `citations` event arrives.
- **Sources panel** shows a relevance band (green/amber/red) per passage — check
  the weak-match question (§9) lands amber/red.
- **Weak-match banner** appears above answers that only loosely match.
- On the conflict question (§6), both documents should appear in Sources.
