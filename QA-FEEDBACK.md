# QA Feedback Report — LogLens

**Date**: 2026-04-30
**Auditor**: AI-assisted QA (Claude + Chrome DevTools MCP + Lighthouse + Playwright)

---

## 1. Test Coverage Analysis

### Summary

| Layer | Test Files | Tests | Pass | Fail | Statement Coverage |
|-------|-----------|-------|------|------|--------------------|
| API (unit) | 19 | 136 | 136 | 0 | **86.71%** |
| Frontend (unit) | 13 | 90 | 90 | 0 | — (coverage dependency missing) |
| Scrubber (unit) | 3 | 45 | 29 | 16* | **94%** (pipeline code) |
| E2E (Playwright) | 2 | 27 | 27 | 0 | — |
| **Total** | **37** | **298** | **282** | **16*** | — |

> *16 scrubber failures are NER-related tests that require NER_ENABLED=true (GPU). Core pipeline passes 100%.

### API Coverage Breakdown (v8)

| Module | Statements | Branches | Functions | Lines | Gaps |
|--------|-----------|----------|-----------|-------|------|
| `src/config/env.ts` | 100% | 100% | 100% | 100% | — |
| `src/routes/analysis.ts` | 91% | 85% | 100% | 91% | Error paths (L226-231, L238-246) |
| `src/routes/auth.ts` | 97% | 90% | 100% | 97% | OIDC code path (L43-44) |
| `src/routes/logs.ts` | 78% | 65% | 100% | 78% | Error/edge paths (L94-95, L109-110) |
| `src/routes/setup.ts` | 82% | 75% | 100% | 82% | Race condition handler (L46-51) |
| `src/routes/health.ts` | 96% | 89% | 100% | 96% | — |
| `src/services/llmProvider.ts` | 93% | 77% | 100% | 93% | Anthropic/compatible branches |
| `src/services/logFileParser.ts` | 98% | 97% | 100% | 98% | — |
| `src/plugins/` | 100% | 75% | 100% | 100% | CSRF/Helmet branch conditions |
| `src/db/client.ts` | 0% | — | — | 0% | No unit test (infra) |
| `src/services/redisClient.ts` | 0% | — | — | 0% | No unit test (infra) |
| `src/app.ts` | 0% | — | — | 0% | Integration-tested only |

### Coverage Gaps Identified

1. **`logs.ts` at 78%** — Missing tests for multipart error handling and edge cases (oversized files, malformed multipart). Priority: Medium.
2. **`setup.ts` at 82%** — Missing test for concurrent setup race condition. Priority: High.
3. **`llmProvider.ts` at 93%, branches 77%** — Missing tests for Anthropic and openai-compatible provider branches. Priority: Medium.
4. **Frontend coverage not measurable** — `@vitest/coverage-v8` is not installed in frontend. Priority: Low (install with `npm i -D @vitest/coverage-v8`).
5. **`db/client.ts` and `redisClient.ts` at 0%** — Infrastructure modules tested only via integration tests. Acceptable.

### Bugs Found During Coverage Run

- **FIXED**: `api/src/config/env.ts` — `OIDC_ISSUER_URL` and `LLM_BASE_URL` Zod schemas used `z.string().transform(...)` which failed when env var was absent (undefined). Fixed by adding `.default('')` before the transform. This caused 4 unit test failures.

---

## 2. Performance Testing

**Tool**: Chrome DevTools MCP Performance Trace
**Page**: http://localhost:8080/login (dev mode, Vite)

### Core Web Vitals

| Metric | Value | Rating | Target |
|--------|-------|--------|--------|
| **LCP** (Largest Contentful Paint) | 500 ms | 🟢 Good | < 2500 ms |
| **CLS** (Cumulative Layout Shift) | 0.00 | 🟢 Good | < 0.1 |
| **FCP** (First Contentful Paint) | ~30 ms | 🟢 Good | < 1800 ms |

### LCP Breakdown

| Phase | Duration | Notes |
|-------|----------|-------|
| TTFB (Time to First Byte) | 26 ms | Excellent (local dev) |
| Render Delay | 474 ms | Acceptable — React hydration |

### Render-Blocking Resources

| Resource | Duration | LCP Impact |
|----------|----------|------------|
| Google Fonts CSS (Plus Jakarta Sans) | 6 ms | 0 ms |

### Performance Findings

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| P1 | Low | Google Fonts render-blocks (6 ms) | Use `font-display: swap` (already set via `&display=swap`). Consider self-hosting fonts for production. |
| P2 | Info | No performance issues detected | Dev mode Vite HMR adds overhead not present in production builds. |
| P3 | Info | Network dependency chain depth: 3 | Acceptable. JS bundles loaded via standard Vite chunking. |

**Verdict**: No performance issues. All Core Web Vitals are well within thresholds.

---

## 3. Accessibility Testing

**Tool**: Lighthouse (via Chrome DevTools MCP)
**Standard**: WCAG 2.1 AA

### Lighthouse Scores by Page

| Page | Accessibility | Best Practices | SEO |
|------|--------------|----------------|-----|
| `/login` | **87** | 100 | 82 |
| `/` (Dashboard) | **95** | 100 | 60 |
| `/analysis` | **96** | 100 | 60 |

### Accessibility Failures

| # | Severity | Page(s) | Issue | Element | WCAG |
|---|----------|---------|-------|---------|------|
| A1 | High | `/login` | **Missing `<main>` landmark** — document has no main landmark | `<html>` | 1.3.1 Info and Relationships |
| A2 | High | All | **Insufficient color contrast** — teal-600 on white background | `span.text-teal-600`, `a.text-teal-600`, nav links | 1.4.3 Contrast (Minimum) |
| A3 | Medium | All | **Insufficient color contrast** — zinc-400 text for "Logged in as" | `span.text-zinc-400` | 1.4.3 Contrast (Minimum) |
| A4 | Medium | `/login` | **Touch target too small** — "Show password" toggle button | `button.absolute` (password toggle) | 2.5.8 Target Size |
| A5 | Low | All | **Missing meta description** | `<head>` | SEO |
| A6 | Low | All | **Missing robots.txt** | — | SEO |

### Recommendations

1. **A1 (Critical)**: Wrap login form content in `<main>` element. The dashboard and analysis pages already have `<main>`.
2. **A2/A3 (High)**: Change `text-teal-600` to `text-teal-700` or `text-teal-800` for WCAG AA compliance (4.5:1 contrast ratio). Change `text-zinc-400` to `text-zinc-500` or `text-zinc-600`.
3. **A4 (Medium)**: Increase password toggle button size to minimum 44×44 CSS pixels. Add padding: `p-2` to the button.
4. **A5/A6 (Low)**: Add `<meta name="description">` to `index.html` and create a `robots.txt`.

---

## 4. Security Review

**Method**: AI code review (OWASP Top 10) + manual source analysis

### Critical Findings

| # | Severity | Category | File | Issue |
|---|----------|----------|------|-------|
| S1 | 🔴 Critical | A02 Sensitive Data | `.env` | **Hardcoded production secrets** — LLM API keys and JWT secret committed in `.env` file. `.env` is in `.gitignore` but may have been committed previously. Rotate all exposed credentials immediately. |
| S2 | 🔴 Critical | A01 Access Control | `api/src/routes/setup.ts` | **Setup endpoint race condition** — POST `/api/v1/setup` checks `isFirstRunComplete()` without distributed locking (TOCTOU). Concurrent requests can create multiple admin accounts. Fix: add Redis-based distributed lock with `SET NX EX`. |

### High Findings

| # | Severity | Category | File | Issue |
|---|----------|----------|------|-------|
| S3 | 🔴 High | A04 Insecure Design | `logs.ts`, `analysis.ts` | **Missing rate limiting on upload/analysis endpoints** — only login has rate limiting. Upload and LLM endpoints can be abused for DoS. Add per-user rate limits. |
| S4 | 🔴 High | A01 Access Control | `api/src/plugins/csrf.ts` | **CSRF disabled in development** — CSRF check skipped when `NODE_ENV !== 'production'`. If dev build is deployed or HTTPS_ONLY is unset, CSRF is bypassed entirely. |
| S5 | 🔴 High | A03 Injection | `api/src/routes/analysis.ts` | **No job ID validation** — `:id` parameter in stream/delete endpoints not validated as UUID. Could enable Redis key injection or cache pollution. |
| S6 | 🔴 High | A09 Logging Failures | `api/src/services/llmProvider.ts` | **Information disclosure in errors** — LLM error responses include full provider response body. Log details server-side; return generic message to clients. |
| S7 | 🔴 High | A02 Crypto Failures | `redisClient.ts` | **Redis without authentication** — Redis connection has no password. If network is compromised, cached logs are exposed. |
| S8 | 🔴 High | A05 Security Misconfig | `Dockerfile` (api, scrubber) | **Containers run as root** — no `USER` directive in Dockerfiles. Add non-root user. |

### Medium Findings

| # | Severity | Category | File | Issue |
|---|----------|----------|------|-------|
| S9 | 🟡 Medium | A03 Injection | `api/src/routes/scrub.ts` | **ReDoS risk in custom patterns** — no limit on pattern count/length/complexity. Add `z.array(z.string().max(500)).max(10)` and consider `safe-regex`. |
| S10 | 🟡 Medium | A02 Crypto Failures | `nginx.conf.template` | **HTTPS not enforced by default** — relies on HTTPS_ONLY flag. Non-localhost deployments should always redirect to HTTPS. |
| S11 | 🟡 Medium | A06 Vulnerable Components | `scrubber/requirements.txt` | **Loose Python dependency pinning** — uses `>=` and `.*` version ranges. Pin exact versions and use `pip-tools` lock file. |
| S12 | 🟡 Medium | A05 Security Misconfig | `api/src/plugins/helmet.ts` | **Missing security headers** — no Referrer-Policy, Permissions-Policy, or upgrade-insecure-requests in CSP. |
| S13 | 🟡 Medium | A09 Logging Failures | `auth.ts`, `setup.ts` | **Missing audit logging** — no IP, timestamp, or user-agent logged for login attempts. |

### Low / Positive Findings

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| S14 | 🟢 Low | A01 | CSP `connectSrc` includes unvalidated `LLM_BASE_URL` |
| S15 | 🟢 Low | A02 | Missing `Cache-Control: no-store` on API responses |
| S16 | ✅ Positive | A03 | **No SQL injection risk** — all queries use Drizzle ORM with parameterized queries |
| S17 | ✅ Positive | A07 | **Strong password hashing** — bcrypt with configurable rounds |
| S18 | ✅ Positive | A02 | **JWT handling is sound** — signed with HS256, HttpOnly cookies, SameSite=Strict |
| S19 | ✅ Positive | — | **Input validation at boundaries** — Zod schemas on all API routes, Pydantic on scrubber |

---

## Summary & Prioritized Action Items

### Must Fix (before production)

| Priority | Item | Effort |
|----------|------|--------|
| P0 | **Rotate exposed secrets** (S1) — verify `.env` not in git history | 30 min |
| P0 | **Add distributed lock to setup endpoint** (S2) | 1 hr |
| P1 | **Add rate limiting to upload/analysis endpoints** (S3) | 2 hr |
| P1 | **Validate job ID as UUID** (S5) | 15 min |
| P1 | **Run containers as non-root** (S8) | 30 min |
| P1 | **Fix color contrast** (A2/A3) — change teal-600→teal-700, zinc-400→zinc-600 | 30 min |

### Should Fix (high impact, moderate effort)

| Priority | Item | Effort |
|----------|------|--------|
| P2 | **Fix CSRF to enforce in non-dev** (S4) | 30 min |
| P2 | **Add Redis authentication** (S7) | 1 hr |
| P2 | **Sanitize LLM error messages** (S6) | 30 min |
| P2 | **Add `<main>` landmark to login page** (A1) | 15 min |
| P2 | **Increase password toggle target size** (A4) | 15 min |
| P2 | **Add audit logging for auth events** (S13) | 1 hr |

### Nice to Have (low risk, polish)

| Priority | Item | Effort |
|----------|------|--------|
| P3 | Pin scrubber dependencies exactly (S11) | 30 min |
| P3 | Add missing security headers (S12) | 30 min |
| P3 | Add ReDoS protection for custom patterns (S9) | 1 hr |
| P3 | Add meta description and robots.txt (A5/A6) | 15 min |
| P3 | Install `@vitest/coverage-v8` in frontend | 5 min |
| P3 | Add `Cache-Control: no-store` to API responses (S15) | 15 min |
| P3 | Improve `logs.ts` test coverage to >85% | 1 hr |
