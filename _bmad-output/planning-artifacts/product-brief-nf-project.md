---
title: "Product Brief: LogLens (working title)"
status: "complete"
created: "2026-04-27"
updated: "2026-04-27"
inputs: ["user interview", "web research: competitive landscape, Grafana/Loki APIs, PII scrubbing libraries, LLM log analysis patterns, market signals, openai/privacy-filter model card"]
---

# Product Brief: LogLens _(working title)_

## Executive Summary

Engineers investigating production incidents spend a disproportionate amount of time reading raw logs — scrolling through thousands of lines under pressure, manually hunting for error patterns and anomalies that should surface instantly. Existing AI-powered log analysis tools solve the analysis problem but introduce a new one: they require routing production logs through cloud infrastructure, where sensitive data — API keys, user identifiers, internal hostnames, and business-critical schema information — leaves the organisation's control permanently.

LogLens is a privacy-first, AI-native web application designed to run in two modes: locally on a developer's machine, or deployed on shared company infrastructure for the entire engineering organisation. In both modes the trust model is identical — it connects directly to Grafana/Loki or accepts uploaded log files, scrubs PII and secrets on the server before any data exits to an LLM provider, then uses a configured LLM — cloud-based or fully local — to surface errors, anomalies, root cause hypotheses, and recommended actions from log data in seconds.

The result is AI-assisted log analysis with a clear conscience: no vendor data ingestion agreements, no cloud relay, no per-seat subscription, and full organisational control over where log data goes — whether a single developer is running it on their laptop or the whole company is using a shared instance.

---

## The Problem

Logs contain the truth about what went wrong — but reading them at scale is slow, error-prone, and cognitively expensive. During incidents, when speed matters most, engineers are forced to manually grep through thousands of lines, correlate across services, and piece together a timeline from noise.

The obvious solution — apply an LLM to the problem — runs directly into a wall for many organisations and individuals:

- **Self-managed Grafana users** cannot use Grafana Cloud's AI assistant without routing data through Grafana Cloud. There is no local-only mode.
- **Datadog AI and Splunk AI** lock engineers into SaaS infrastructure; log data must transit vendor systems.
- **Elastic AI Assistant** lets users bring their own OpenAI key, but sends raw log content — including credentials that engineers accidentally log — directly to third-party APIs with no pre-processing.
- **Network topology makes direct API access impractical** in many real deployments: Grafana runs on a client's private network, behind a VPN, or in an isolated environment that a shared tool server cannot reach.

The fundamental gap: **no tool performs local PII and secret scrubbing before LLM submission.** Every competitor treats privacy as a compliance checkbox rather than an architectural property. For engineers in regulated industries, organisations under GDPR/HIPAA constraints, or teams that simply don't want their internal service topology and error patterns analysed by a third party's training pipeline, the current options are unacceptable.

---

## The Solution

LogLens is a containerised web application — one image, configuration-driven — that makes AI-powered log analysis safe to use whether a developer spins it up on their laptop or an infrastructure team deploys it company-wide.

**1. Connect or upload**
- **Direct server connection** — LogLens backend queries Grafana/Loki directly when the server has network access to the Grafana instance
- **Browser-proxied connection** — when Grafana is on a private or client-restricted network unreachable by the LogLens server, the user's browser (which is on the correct network via VPN or direct access) fetches the logs and forwards them to the LogLens server for scrubbing and analysis. The trust model is unchanged: scrubbing still runs server-side before any LLM call.
- **File upload** — universal fallback for air-gapped environments, offline analysis, or previously exported logs (`.log`, `.json`, `.ndjson`)

**2. Scrub on the server**
Before any log data is sent to an external LLM provider, the scrubbing pipeline runs on the LogLens backend — the trust boundary being protected is server → LLM API, not client → server:
- **OpenAI Privacy Filter** (`openai/privacy-filter`, Apache 2.0) — a 1.5B-parameter bidirectional token classifier that runs on the local server. Detects and redacts 8 span categories in a single forward pass: `account_number`, `private_address`, `private_email`, `private_person`, `private_phone`, `private_url`, `private_date`, and `secret`. 128k token context window; no chunking required for typical log files.
- **Yelp detect-secrets** — pattern-based detection for API keys, cloud credentials, JWT tokens, and 30+ secret formats not covered by the NER model
- **Custom regex deny-list** — organisation-specific patterns (internal token formats, UUIDs used as user IDs, etc.)

The scrubbing layer is honest about its guarantees: it substantially reduces exposure, but detection is probabilistic. Users are shown what was redacted and can review the scrubbed output before submission. Precision/recall tradeoffs are tunable at runtime.

**3. Analyse with your LLM**
Scrubbed log context is sent to the developer's configured LLM provider:
- Remote providers: OpenAI, Anthropic, any OpenAI-compatible API
- **Local providers: LM Studio, llama.cpp** — enabling a fully zero-data-leaves-machine mode where no log content ever reaches an external service

**4. Get answers**
The LLM returns structured, actionable output:
- Detected errors and their frequency/distribution
- Anomalous patterns relative to baseline (when a comparison window is provided)
- Root cause hypothesis with confidence indication
- Affected components and timeline reconstruction
- Recommended next steps

All AI outputs are clearly marked as LLM-generated suggestions, not facts. Confidence indicators and direct log excerpt citations ground every finding.

---

## What Makes This Different

| | LogLens | Grafana Cloud AI | Elastic AI Assistant | Datadog AI |
|---|---|---|---|---|
| Works with self-managed Grafana | ✅ | ❌ (cloud relay required) | ✅ | ❌ |
| Local PII/secret scrubbing | ✅ | ❌ | ❌ | ❌ |
| User-configurable LLM endpoint | ✅ | ❌ | Partial (OpenAI/Azure only) | ❌ |
| Local LLM support (LM Studio) | ✅ | ❌ | ❌ | ❌ |
| File upload / offline mode | ✅ | ❌ | ❌ | ❌ |
| Server-side scrubbing before LLM egress | ✅ | ❌ | ❌ | ❌ |
| Works with private/restricted-network Grafana | ✅ (browser-proxied) | ❌ | ❌ | ❌ |
| No per-seat subscription | ✅ | ❌ | ❌ | ❌ |

**The core differentiator is architectural:** privacy-by-design, where the scrubbing pipeline is a first-class citizen of the tool, not an afterthought.

Developers already paying for OpenAI or Anthropic API access for coding assistants pay nothing incremental to use those same keys here. No new vendor relationship, no new data processing agreement, no usage-based billing from a log analytics vendor.

---

## Who This Serves

**Primary user: The developer or SRE investigating a production issue.**
- Runs Grafana/Loki on self-managed infrastructure (on-prem, private cloud, or Kubernetes)
- Values understanding what happened over being told what to do by an opaque SaaS product
- Configures their own LLM API keys or points the container at a local LM Studio instance via env vars

**Platform / infrastructure team: The deployer of the shared instance.**
- Deploys and maintains the LogLens instance on internal infrastructure
- Configures shared Grafana/Loki data source connections and LLM provider credentials
- Manages identity provider integration (Logto or OIDC)
- Values a single auditable deployment over per-developer shadow tooling

**High-sensitivity cohort (secondary, but highly motivated):**
- Teams in regulated industries (fintech, healthcare, legal) where sending logs to external APIs triggers compliance review
- Organisations under strict GDPR or HIPAA log-handling requirements
- Teams in air-gapped environments who need the local LLM path

---

## Success Criteria

The MVP is successful when:

1. A developer can go from `docker compose up` to first log analysis in under 5 minutes
2. The same container image runs unmodified on shared infrastructure (Kubernetes/Docker Compose on a server) and is accessed by multiple engineers without per-user setup
3. A Loki live query (direct and browser-proxied) and a file upload all produce usable AI analysis output
4. The scrubbing pipeline demonstrably removes known secret formats (verifiable in the redaction review UI) before any LLM call
5. Users report that the tool surfaces errors and anomalies they would have taken 20+ minutes to find manually
6. Works end-to-end with LM Studio — no external API calls during analysis
7. First-run setup wizard completes in under 2 minutes; OIDC provider integration works when configured via env vars

---

## Scope

**In scope for v1:**
- **Single container image, configuration-driven deployment** — `docker compose up` on a laptop for local use; the same image on Kubernetes or a server for company-wide shared access. All runtime behaviour — Grafana/Loki connections, LLM provider credentials, identity provider, and scrubbing rules — is controlled through documented environment variables. The same variables, the same defaults, regardless of where the container runs.
- Loki live connection: direct server-to-Loki query (query_range, patterns API where available, graceful degradation for older Loki versions) and browser-proxied query for private/restricted networks
- File upload (`.log`, `.json`, `.ndjson`)
- Server-side PII + secret scrubbing pipeline (OpenAI Privacy Filter + detect-secrets + custom regex) with redaction review UI in the web client
- Configurable LLM provider (OpenAI, Anthropic, LM Studio, OpenAI-compatible endpoints) via environment variables
- Error detection, anomaly analysis, root cause hypothesis output
- Structured output with log excerpt citations
- Authentication with configurable identity providers (Logto and compatible OIDC/OAuth2 providers); first-run setup wizard prompts admin to set a password if no provider is configured
- Multi-user session support; per-user LLM key override via the UI

**Explicitly out of scope for v1:**
- Role-based access control beyond basic authentication
- Non-Loki data sources (Prometheus, Tempo, Elasticsearch)
- Metrics or traces analysis (logs only)
- Automated scheduled analysis or alerting
- Custom prompt library / saved analysis templates _(strong v2 candidate)_
- SaaS / multi-tenant hosting (self-hosted only)

---

## Vision

If v1 proves the core value — private, fast, accurate log analysis — the natural evolution is:
- **Open-source release** — the tool is designed and built from the start as open-source-ready (permissive licence, no hard-coded secrets, clean separation of config from code). An external release is a realistic future step if internal adoption validates the approach.
- **Shared scrubbing rule configs and prompt templates** distributed within a team (git-tracked config files, no server required)
- **Incident timeline reconstruction** combining logs from multiple services into a coherent narrative
- **Baseline comparison** — persistent storage of "normal" log patterns to make anomaly detection dramatically more precise
- **Additional Grafana data sources** — Tempo traces, Prometheus metrics as supporting context for log analysis
- **CI/CD integration** — analyse test run logs or deployment logs automatically as part of a pipeline
- **Fine-tuned OpenAI Privacy Filter** — organisation-specific credential patterns and domain-specific PII categories can be added via fine-tuning on the Apache 2.0 base model

The privacy-first, user-controlled-LLM architecture remains constant. The scope grows, but the trust model does not change.
