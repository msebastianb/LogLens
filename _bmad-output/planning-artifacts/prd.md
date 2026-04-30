---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-nf-project.md
  - _bmad-output/planning-artifacts/product-brief-nf-project-distillate.md
briefCount: 1
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
workflowType: 'prd'
classification:
  projectType: web-application
  domain: developer-tooling/observability
  complexity: medium-high
  projectContext: greenfield
---

# Product Requirements Document - nf-project (LogLens)

**Author:** Sebastian
**Date:** 2026-04-27

## Executive Summary

LogLens is a privacy-first, AI-native web application for Grafana/Loki log analysis. It enables engineers and SREs to surface errors, anomalies, root cause hypotheses, and recommended actions from log data in seconds — without routing logs through vendor infrastructure or sacrificing control over where sensitive data goes.

The tool runs as a single container image, deployable on a developer's laptop (`docker compose up`) or on shared company infrastructure (Kubernetes/Docker Compose). All behaviour is configuration-driven via documented environment variables — no code or image difference between deployment contexts. Users connect to Grafana/Loki directly or upload log files. Before any data is sent to an LLM provider, a server-side scrubbing pipeline strips PII and secrets. The user configures their own LLM provider — remote (OpenAI, Anthropic, any OpenAI-compatible API) or fully local (LM Studio) — eliminating vendor lock-in and enabling a zero-data-leaves-infrastructure mode.

Target users are individual developers, SREs, and DevOps engineers on self-managed Grafana/Loki infrastructure. A secondary but highly motivated cohort includes teams in regulated industries (fintech, healthcare, legal) and organisations under GDPR/HIPAA constraints where sending logs to external AI APIs triggers compliance review.

### What Makes This Special

Every existing competitor — Grafana Cloud AI, Elastic AI Assistant, Datadog AI — treats privacy as a compliance checkbox or skips it entirely, sending raw log content including accidentally-logged secrets directly to third-party LLMs. LogLens inverts this: the scrubbing pipeline (pattern-based secrets detection via Yelp detect-secrets + custom regex, with optional NER-based PII detection via OpenAI Privacy Filter) is a first-class architectural citizen that runs server-side before any LLM call. The trust boundary being protected is explicitly server → LLM API, not client → server.

The result is the only tool that combines: local-first PII/secret scrubbing, user-controlled LLM endpoint, support for fully local LLMs, and a single container deployable from a laptop to company-wide infrastructure — all without a per-seat subscription or vendor data ingestion agreement.

### Project Classification

- **Type:** Web application (containerised, full-stack — browser UI + backend server)
- **Domain:** Developer tooling / observability
- **Complexity:** Medium-High — AI scrubbing pipeline, multiple LLM provider integrations, Grafana/Loki API surface, OIDC identity provider integration
- **Context:** Greenfield

## Success Criteria

### User Success

- An engineer can go from `docker compose up` to first completed log analysis in under 5 minutes
- A 10,000-line log file is fully analysed and results returned in under 60 seconds
- Users report surfacing errors or anomalies they would have taken 20+ minutes to find manually
- LLM output cites actual log excerpts — no hallucinated line references
- The redaction review UI clearly shows what was scrubbed before any LLM call is made
- Engineers prefer LogLens over manual grep/search for incident investigation within 30 days of first use

### Business Success

- At least 50% of engineers in the organisation are actively using LogLens within 6 months of internal release
- At least 3 distinct teams (not just early adopters) have adopted it for regular incident investigation
- Zero incidents of sensitive data (secrets, PII) confirmed to have reached an LLM provider due to scrubbing failure
- Tool is deployable on company infrastructure by the platform team without changes to the container image

### Technical Success

- 100% recall on a defined reference set of known secret patterns: AWS access keys, GitHub personal access tokens, OpenAI API keys, JWT tokens, and private keys — verified by automated test suite
- NER-based PII scrubbing (names, emails, phone numbers, addresses) is opt-in via `NER_ENABLED=true` (disabled by default for CPU-only deployments where inference is too slow); when enabled, operates at best-effort probabilistic level — no hard recall target, but false positive rate must not strip so much context that LLM analysis is degraded
- All runtime behaviour controlled via documented environment variables — no undocumented config surface
- LM Studio end-to-end flow produces no external network calls during scrubbing or analysis

### Measurable Outcomes

- **Pivot signal:** If engineers consistently report that scrubbing removes too much useful context (over-redaction degrading LLM output quality), the precision/recall tuning of OpenAI Privacy Filter must be revisited before wider rollout
- **Failure signal:** If setup complexity prevents more than 2 engineers from getting to first analysis independently, the onboarding flow must be redesigned before company-wide deployment

## User Journeys

### Journey 1: Alex — SRE, Production Incident (Primary User, Happy Path)

Alex is on-call. At 2am a service degradation alert fires. He opens LogLens, selects the affected Loki data source, and queries the last 30 minutes of logs from the failing service. LogLens fetches the logs, runs them through the scrubbing pipeline, and shows Alex a redaction summary: 3 API keys and 12 email addresses removed. He confirms and submits. Within 20 seconds the LLM returns: two recurring database connection timeout errors spiking at 01:47, one upstream dependency returning 503s, a root cause hypothesis pointing to a misconfigured connection pool, and the three log lines that evidence it. Alex has his answer in under 2 minutes. He resolves the incident and goes back to sleep.

*Capabilities revealed:* Loki live query with time range selection, redaction review UI, fast LLM turnaround, structured output with excerpts, confidence indication.

---

### Journey 3: Alex — Uploaded Log File (Primary User, Offline)

A client provides a `.ndjson` log export from an air-gapped environment — no Grafana access at all. Alex uploads the file to LogLens. The same scrubbing and analysis pipeline runs. He gets structured output identifying a pattern of failed authentication attempts pointing to a misconfigured service account. He shares the analysis with the client.

*Capabilities revealed:* File upload handling, format parsing (`.log`, `.json`, `.ndjson`), identical analysis pipeline for uploaded vs live logs.

---

### Journey 4: Priya — Platform Engineer, First Deployment (Admin/Operations User)

Priya is tasked with deploying LogLens company-wide. She pulls the container image, sets the required env vars (Loki URL, LLM provider, Logto OIDC config) and runs `docker compose up` on the company's internal Kubernetes cluster. The first-run wizard confirms OIDC is configured and skips password setup. She shares the URL with the engineering team. No engineer needs to install anything locally.

*Capabilities revealed:* Env-var-driven configuration, OIDC integration (Logto), first-run wizard, Docker Compose + Kubernetes compatibility, zero per-user setup.

---

### Journey 5: Priya — No OIDC Configured (Admin, Setup Edge Case)

Priya is evaluating LogLens locally before the company-wide rollout. She runs `docker compose up` with minimal config — no OIDC provider set. The first-run wizard prompts her to set an admin password. She sets it, logs in, connects to her local Loki instance, and runs a test analysis. She is satisfied with the results and proceeds to configure the full production deployment.

*Capabilities revealed:* First-run wizard for standalone password auth, graceful fallback when OIDC not configured, no hardcoded credentials.

---

### Journey 6: Marco — Engineer on High-Sensitivity Project (Secondary, Compliance-Sensitive)

Marco's team works on a healthcare platform. He uses LogLens with LM Studio pointing to a locally running model. He verifies in the redaction review UI that patient-adjacent data (emails, names) was stripped before submission. The analysis completes with zero data leaving his machine. He can use AI-assisted log analysis without triggering a GDPR/HIPAA review.

*Capabilities revealed:* LM Studio (local LLM) integration, redaction review UI surfacing what was removed, complete air-gap mode, no external network calls during analysis.

---

### Journey Requirements Summary

| Capability | Revealed By |
|---|---|
| Loki live query with time range | Journey 1 |
| File upload + format parsing | Journey 3 |
| Redaction review UI | Journeys 1, 6 |
| Structured LLM output with log excerpt citations | Journey 1 |
| Env-var configuration + OIDC integration | Journey 4 |
| First-run wizard (OIDC + password fallback) | Journeys 4, 5 |
| LM Studio local LLM integration | Journey 6 |
| Zero external network calls in local LLM mode | Journey 6 |

## Domain-Specific Requirements

The following requirements reflect the security-sensitive nature of the product (log data containing credentials and PII) and the multi-deployment context (laptop to company infrastructure).

### Security & Privacy Constraints

- Log content is **never persisted to disk permanently** — temporary session-scoped cache is permitted to allow re-running analysis without re-fetching, but cache must be cleared on session logout or expiry
- No log data is retained server-side after the session that produced it ends
- LLM API keys, OIDC client secrets, and all credentials must never appear in server logs, error responses, or UI output
- All non-localhost deployments must be served over HTTPS — plain HTTP is only acceptable for `localhost`
- The scrubbing pipeline runs before any data is written to the session cache — cached content is always the scrubbed version, never the raw log

### Compliance Considerations

- **GDPR:** If logs contain EU personal data (email addresses, names, IP addresses), the scrubbing pipeline is the primary mitigating control for data minimisation before LLM submission. LogLens does not claim GDPR certification but enables and documents compliant usage patterns. Teams should reference the scrubbing pipeline in their own DPIA documentation.
- **HIPAA:** The local LLM mode (LM Studio) enables teams handling PHI-adjacent log data to run analysis with zero data leaving their infrastructure. LogLens does not claim HIPAA certification but the architecture supports compliant usage.
- LogLens makes no guarantee of complete PII removal — documentation must state this clearly so teams understand the residual risk before relying on it for compliance purposes.

### Technical Constraints

- Session cache must be scoped per authenticated user — no cross-user cache access
- Container must support read-only filesystem mounts except for explicitly defined ephemeral cache and log volumes
- All external HTTP calls (Grafana/Loki, LLM APIs) must respect configurable timeouts and fail gracefully — no hanging requests that block the UI

### Risk Mitigations

| Risk | Mitigation |
|---|---|
| Scrubbing false negative — secret reaches LLM API | Layered pipeline (NER + pattern + regex); redaction review UI; documented probabilistic guarantee |
| Session cache accessed after logout | Cache invalidated on session end; TTL enforced server-side |
| LLM API key leaked via error message | Credentials redacted from all error responses and server logs |
| Over-redaction degrades LLM analysis quality | Tunable precision/recall on OpenAI Privacy Filter; user can review scrubbed output before submission |
| Large log upload causes memory exhaustion | Configurable size limit on upload |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Privacy-by-architecture, not privacy-by-policy**
Every existing log AI tool treats privacy as a policy layer — compliance certifications, data processing agreements, terms of service. LogLens makes privacy a structural property: the scrubbing pipeline is an architectural gate that raw log data cannot bypass on the way to an LLM. This is a genuine paradigm shift in how AI tooling handles sensitive operational data.

**2. LLM-agnostic analysis pipeline**
Rather than coupling the analysis capability to a specific LLM vendor, LogLens exposes a provider-abstracted interface. The same analysis workflow runs against OpenAI, Anthropic, any OpenAI-compatible API, or a fully local LM Studio model — with zero workflow changes. This makes the tool portable across security postures and cost models in a way no current competitor supports.

### Validation Approach

| Innovation | Validation Signal |
|---|---|
| Privacy-by-architecture | Automated test suite proves 100% recall on reference secret set; redaction review UI confirms to user what was removed |
| LLM-agnostic pipeline | Same log file produces structurally equivalent output across OpenAI, Anthropic, and LM Studio; verified in integration tests |

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| LLM output quality varies across providers | Structured output enforcement (JSON schema); citation of actual log excerpts prevents hallucinated references |
| Scrubbing false negatives undermine privacy claim | Layered pipeline + probabilistic disclosure in docs; never marketed as a guarantee |

## Web Application Specific Requirements

### Project-Type Overview

LogLens is a Single Page Application (SPA) — rich interactive UI with multiple concurrent states (log fetching, scrubbing, analysis in progress, results display). It is an authenticated internal tool; no SEO or public indexing requirements. Real-time feedback is a core UX requirement during both log streaming and analysis.

### Browser Matrix

- **Supported:** Chrome, Firefox, Safari, Edge — latest two stable releases
- **Not supported:** Legacy browsers (IE11, pre-Chromium Edge, Opera Mini)
- No mobile browser support required for v1 (engineering tool, desktop-primary)

### Responsive Design

- Desktop-optimised layout (min 1280px); responsive down to 1024px for smaller laptops
- No mobile/tablet breakpoints required for v1

### Real-Time & Async Patterns

- **LLM response streaming:** Stream tokens to the UI as they arrive rather than waiting for full response — reduces perceived latency and allows early abort
- **Live Loki tail:** WebSocket-based log streaming for real-time follow mode (Loki `/loki/api/v1/tail`)
- **Analysis progress feedback:** Visible progress state for each pipeline stage (fetching → scrubbing → analysing → complete)
- **Non-blocking UI:** All long-running operations (fetch, scrub, LLM call) run asynchronously; UI remains interactive

### Accessibility

- WCAG 2.1 AA baseline
- Keyboard navigable throughout
- Screen reader compatible for primary workflows (log source selection, result review)
- Sufficient colour contrast on redaction highlights and analysis output

### SEO & Indexing

- Not applicable — fully authenticated tool, no public pages

### Implementation Considerations

- SPA framework with strong async state management (analysis pipeline has multiple concurrent states)
- WebSocket support required (Loki tail)
- Server-Sent Events or WebSocket for LLM response streaming
- All API calls to the LogLens backend must include CSRF protection tokens for non-localhost deployments
- Content Security Policy headers required to restrict script execution and prevent XSS

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — the minimum that makes AI-assisted log analysis safe enough to use on real production logs. Every MVP capability exists to close a specific gap that makes existing tools unacceptable (privacy, vendor lock-in, network topology).

**Resource Requirements:** Full-stack engineer(s) with Python backend experience (scrubbing pipeline), modern SPA frontend, Docker/Kubernetes deployment. No dedicated DevOps or compliance roles required for v1.

**Infrastructure Note:** The NER-based PII detection (OpenAI Privacy Filter, 1.5B params) is disabled by default (`NER_ENABLED=false`) because inference on CPU-only hardware is impractically slow (~134 chars/sec). When enabled, the model is loaded eagerly at container startup — always warm, consistent response times. Minimum container memory: **4GB RAM** when NER is enabled; **1GB RAM** sufficient when NER is disabled (secrets-only scrubbing). Platform teams must provision accordingly.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Journey 3: Uploaded log file analysis
- Journey 4 & 5: First deployment (password auth, first-run wizard; OIDC deferred to Post-MVP)
- Journey 6: Full local LLM mode (LM Studio, zero egress)
- *(Journey 1 — SRE live Loki investigation — deferred to Post-MVP; direct Loki query is Epic 2)*

**Must-Have Capabilities:**
- Single container image, env-var configured, Docker Compose + Kubernetes
- File upload: `.log`, `.json`, `.ndjson`
- Server-side scrubbing pipeline: Yelp detect-secrets + custom regex deny-list (always active); OpenAI Privacy Filter NER (opt-in via `NER_ENABLED=true`, requires GPU or high-end CPU)
- Redaction review UI with per-session cache (scrubbed version only)
- Configurable LLM provider: OpenAI, Anthropic, LM Studio, any OpenAI-compatible endpoint
- LLM response streaming to UI
- Structured analysis output: errors, anomalies, root cause hypothesis, log excerpt citations, confidence indication
- Authentication: first-run wizard + username/password (OIDC deferred to Post-MVP)
- Multi-user sessions
- HTTPS enforcement on non-localhost; CSRF protection; CSP headers
- Non-blocking async UI; analysis progress per pipeline stage; in-flight cancellation

**Nice-to-Have for MVP (include if time permits):**
- Live Loki tail (WebSocket streaming follow mode)
- Loki patterns API optimisation (template clustering before LLM submission)

### Post-MVP Features

**Phase 2 — Growth:**
- Shared team scrubbing rule configs and prompt templates (git-tracked)
- Baseline comparison — persist normal log patterns for sharper anomaly detection
- Incident timeline reconstruction across multiple services
- Role-based access control
- Custom prompt library / saved analysis templates
- Live Loki tail (if deferred from MVP)

**Phase 3 — Expansion:**
- Additional Grafana data sources: Tempo traces, Prometheus metrics as supporting context
- CI/CD integration — automated analysis of test/deployment log artifacts
- Fine-tuned OpenAI Privacy Filter for organisation-specific credential patterns
- Open-source public release following internal adoption validation
- Community-contributed scrubbing rules and prompt templates

### Risk Mitigation Strategy

| Risk | Mitigation |
|---|---|
| **Technical:** Privacy Filter memory footprint blocks laptop deployments | NER disabled by default (`NER_ENABLED=false`); only 1GB RAM needed for secrets-only scrubbing; 4GB RAM when NER is enabled |
| **Market:** Low adoption if setup is still complex | 5-minute first-run target is a hard success criterion; simplify before company-wide rollout |
| **Resource:** Scrubbing pipeline + LLM integration scope creep | Loki patterns API and live tail are explicitly nice-to-have; cut if timeline is at risk |

## Functional Requirements

### Log Source & Ingestion

- **FR1:** Users can connect to a Grafana/Loki instance by providing a server URL and authentication credentials
- **FR2:** Users can query logs from a connected Loki instance with a time range and LogQL filter
- **FR4:** Users can upload log files for analysis (`.log`, `.json`, `.ndjson` formats)
- **FR5:** Users can select between direct server connection and file upload as the log source
- **FR6:** Users can configure multiple named Grafana/Loki data source connections

### Privacy Scrubbing Pipeline

- **FR7:** The system automatically scrubs PII and secrets from log content before any LLM submission
- **FR8:** Users can review a summary of what was redacted before confirming submission to the LLM
- **FR9:** Users can configure custom regex patterns for organisation-specific sensitive data detection
- **FR10:** The system detects and redacts secrets using pattern-based detection (API keys, tokens, credentials)
- **FR11:** The system optionally detects and redacts PII using NER-based detection (names, emails, addresses, phone numbers, account numbers, dates, URLs) — enabled via `NER_ENABLED=true` env var (disabled by default for CPU-only deployments)
- **FR12:** Users can adjust the scrubbing precision/recall tradeoff before submission
- **FR13:** The system caches the scrubbed (not raw) log content for the duration of the authenticated session
- **FR14:** Users can re-run analysis on cached scrubbed logs without re-fetching or re-scrubbing

### LLM Provider Configuration

- **FR15:** Users can configure a remote LLM provider (OpenAI, Anthropic, any OpenAI-compatible endpoint) via environment variables
- **FR16:** *(Post-MVP)* Users can override the configured LLM provider with their own API key via the UI
- **FR17:** Users can configure a local LLM provider (LM Studio or compatible) with no external network calls during analysis
- **FR18:** The system streams LLM analysis output to the UI as it is generated
- **FR18a:** The system analyses logs of any size without truncation by splitting large logs into chunks, analysing each chunk independently, then merging partial results via a final LLM consolidation pass

### Log Analysis & Output

- **FR19:** The system identifies and surfaces errors from log content with frequency and distribution
- **FR20:** The system identifies anomalous patterns in log content
- **FR21:** The system generates a root cause hypothesis with a confidence indication
- **FR22:** The system reconstructs a timeline of affected components and events
- **FR23:** The system provides recommended next steps based on the analysis
- **FR24:** All analysis output cites actual log excerpts as evidence
- **FR25:** Analysis output is clearly labelled as LLM-generated and not authoritative

### Authentication & Access

- **FR26:** Users can authenticate via a configured OIDC/OAuth2 identity provider (Logto or compatible)
- **FR27:** An admin can complete a first-run setup wizard to configure an admin password when no OIDC provider is set
- **FR28:** Users can log in with username and password when no OIDC provider is configured
- **FR29:** The system maintains authenticated user sessions
- **FR30:** Session expiry invalidates the scrubbed log cache

### Deployment & Configuration

- **FR31:** Administrators can configure all application behaviour via documented environment variables
- **FR32:** The application runs from a single container image without modification across deployment contexts
- **FR33:** The application enforces HTTPS for all non-localhost deployments
- **FR34:** The application performs a health check on startup and reports readiness

### Analysis UX & Workflow

- **FR35:** Users can see progress state for each pipeline stage (fetching, scrubbing, analysing, complete)
- **FR36:** Users can cancel an in-progress analysis
- **FR37:** The UI remains interactive while analysis is running
- **FR38:** *(Post-MVP)* Users can view analysis history within their current session

## Non-Functional Requirements

### Performance

- Initial page load (authenticated session): < 3 seconds on a standard corporate connection
- Log fetch + scrubbing pipeline: progress indicator visible within 1 second of submission
- Analysis completion (10,000-line log file): < 60 seconds end-to-end
- Large log analysis (> 400K tokens): chunked analysis with automatic splitting, per-chunk LLM calls, and merge pass; no log truncation
- Session cache re-run (resend scrubbed content to LLM): < 5 seconds
- The UI main thread must not block during any long-running operation — fetch, scrub, and LLM calls execute asynchronously
- LLM responses are streamed to the UI; first tokens must appear within 5 seconds of LLM call initiation
- When `NER_ENABLED=true`, the OpenAI Privacy Filter model is loaded eagerly at container startup — no cold-start latency on first analysis request; when disabled (default), the scrubber starts in under 2 seconds

### Security

- All credentials (LLM API keys, OIDC client secrets) must never appear in server logs, error responses, API responses, or UI output
- Scrubbing pipeline runs before any log content is written to session cache — cached data is always scrubbed, never raw
- Session-scoped cache: no cross-user data access; cache invalidated on session logout or expiry
- HTTPS enforced for all non-localhost deployments; HTTP acceptable only on `localhost`
- CSRF protection required on all state-mutating API endpoints for non-localhost deployments
- Content Security Policy headers restrict script execution sources and prevent XSS
- Browser-proxied log payloads validated server-side for size and content type before entering the scrubbing pipeline
- Container supports read-only filesystem mounts except for explicitly defined ephemeral cache and log volumes
- No log data persisted to disk permanently; all log content is transient in session memory only

### Scalability

- Single shared deployment must support concurrent sessions for all engineers in the organisation without degradation
- Container resource requirements documented: minimum 4GB RAM (Privacy Filter model + application); 8GB recommended for shared deployments
- Log volume handling: configurable maximum log size per analysis request to prevent memory exhaustion; default limit documented
- All external calls (Grafana/Loki, LLM APIs) respect configurable timeouts; no unbounded blocking operations

### Accessibility

- WCAG 2.1 AA compliance for all primary user workflows
- Full keyboard navigation throughout the application
- Screen reader compatibility for core workflows: log source selection, redaction review, analysis output
- Sufficient colour contrast on redaction highlights, status indicators, and analysis output

### Integration

- Grafana/Loki: compatible with Loki HTTP API v1; graceful degradation when patterns API is unavailable (older Loki versions)
- LLM providers: OpenAI API-compatible interface; supports streaming responses (Server-Sent Events or WebSocket)
- Identity providers: standard OIDC/OAuth2 — tested with Logto; any spec-compliant provider must work
- Container orchestration: Docker Compose (local) and Kubernetes (shared); image must pass standard Kubernetes liveness and readiness probe patterns
- Log file formats: `.log` (plaintext), `.json` (structured), `.ndjson` (newline-delimited JSON); malformed files must fail gracefully with a user-facing error
