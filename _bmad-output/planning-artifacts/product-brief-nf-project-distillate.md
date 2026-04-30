---
title: "Product Brief Distillate: nf-project (LogLens)"
type: llm-distillate
source: "product-brief-nf-project.md"
created: "2026-04-27"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate — LogLens

## Technical Architecture Constraints

- **Deployment unit is always a container** — no bare-metal or non-containerised install path. Both single-dev and company-wide use the same image.
- **Configuration is 100% environment-variable driven** — no mode distinction in config model; same env vars, same defaults regardless of deployment scale. All vars must be documented.
- **Trust boundary is server → LLM API**, not client → server. The client and server are trusted equally (same user/org). Scrubbing runs on the server before any data exits to an external LLM provider.
- **Three Grafana/Loki connection paths required:**
  1. Direct server-to-Loki (when network allows)
  2. Browser-proxied (browser fetches from Grafana on private/client network, forwards to LogLens server) — critical for consulting/agency context where Grafana is on client infra
  3. File upload — universal fallback for air-gapped, offline, or exported logs (`.log`, `.json`, `.ndjson`)
- **Loki patterns API** (`/loki/api/v1/patterns`) is a preferred optimisation — sends template clusters + frequencies rather than raw lines, reducing tokens and noise. Must degrade gracefully for older Loki versions that lack this endpoint.
- **OpenAI Privacy Filter** (`openai/privacy-filter`, Apache 2.0) is the primary scrubbing model — runs server-side (NOT in browser). 1.5B params, 128k context, BIOES span decoding, 8 categories: `account_number`, `private_address`, `private_email`, `private_person`, `private_phone`, `private_url`, `private_date`, `secret`. Precision/recall tunable at runtime via decoding parameters.
- **Yelp detect-secrets** complements the NER model for pattern-based secret detection (AWS keys, GitHub tokens, JWT, OpenAI keys, 30+ formats).
- **Custom regex deny-list** for org-specific patterns (internal token formats, UUID-as-user-ID, etc.) — must be user-configurable.
- Scrubbing is probabilistic — UI must show redacted spans for user review before LLM submission. Never present as a guarantee.

## Authentication & Identity

- **Logto** is the named preferred OIDC provider; any compatible OIDC/OAuth2 provider must also work.
- **First-run setup wizard** when no identity provider is configured — prompts admin to set a password. **No hardcoded default credentials** (e.g. admin/admin is explicitly rejected as an OWASP A07 violation).
- Multi-user session support required (for shared deployment).
- Per-user LLM API key override via UI — user can supply their own key on top of any centrally configured one.
- RBAC beyond basic auth is out of scope for v1.

## LLM Provider Requirements

- Must support: OpenAI, Anthropic, LM Studio, any OpenAI-compatible API endpoint (e.g. llama.cpp server, private deployments).
- **LM Studio / local LLM = zero-data-leaves-machine mode** — a first-class feature, not a footnote. Important for air-gapped and high-sensitivity environments.
- LLM provider and credentials configured via env vars.
- Per-user key override via UI supplements (not replaces) the env-var-configured provider.

## Scrubbing Pipeline — Rejected Alternatives

- **Microsoft Presidio** — considered and rejected as primary scrubber in favour of OpenAI Privacy Filter. Presidio remains a valid fallback reference but should not be the default implementation.
- **scrubadub** — explicitly rejected; effectively unmaintained as of 2026.
- **Browser/WebGPU-based scrubbing** — considered and explicitly rejected. Scrubbing runs server-side only. Client → server data flow is trusted; server → LLM API is the boundary to protect.
- **Default admin/admin credentials** — explicitly rejected on security grounds (OWASP A07). First-run wizard is the approved approach.

## Competitive Intelligence (PRD-relevant specifics)

- **Grafana Assistant**: Requires Grafana Cloud relay even for self-managed Grafana. Self-hosted users must "one-click connect" to Grafana Cloud — no fully local AI mode exists.
- **Grafana Sift**: Automated correlation feature, also cloud-bound.
- **Elastic AI Assistant**: Brings-your-own OpenAI/Azure key, but sends raw log content including accidentally-logged secrets to third-party LLMs with zero pre-processing.
- **Datadog Bits AI / Splunk AI**: Full SaaS vendor lock-in; log data must transit vendor infrastructure.
- **OpenObserve**: OSS, self-hostable, but AI features are minimal/evolving — not a current threat.
- **Salesforce LogAI**: OSS research project, archived/unmaintained, no LLM integration, no Grafana connector.
- **Key unoccupied position**: No tool does local-first PII/secret scrubbing before LLM submission + user-configurable LLM endpoint + works without Grafana Cloud. This is verified, not assumed.

## Requirements Hints (captured from conversation, not yet formalised)

- Grafana HTTP API migration: Grafana 13+ moves from `/api` to `/apis` routes — implementation should plan for this transition.
- Grafana auth surface: must handle service account tokens, basic auth, bearer tokens, self-signed certs, and proxy configs. Not all are trivial in enterprise self-managed setups.
- Log volume strategy needed: production Loki can return millions of lines. Chunking/windowing/sampling strategy required — Loki patterns API is the preferred approach but not sufficient alone.
- LLM output must cite actual log excerpts — hallucinated line number references are a known failure mode to defend against.
- Structured JSON output from LLM preferred: `errors[]`, `affected_components[]`, `root_cause_hypothesis`, `confidence (0-1)`, `timeline[]`, `recommended_actions[]`.
- All AI output must be clearly labelled as LLM-generated suggestions, not facts.
- Fine-tuning path for OpenAI Privacy Filter should be documented — org-specific credential patterns can be added via supervised fine-tuning on the Apache 2.0 base model.
- Scrubbing rule configs and prompt templates are a v2 candidate for team-wide sharing via git-tracked config files.

## Open Questions (unresolved at brief completion)

- What is the exact name of the project? "LogLens" is a working title only.
- Which container registry will the image be published to (internal registry, GitHub Container Registry, Docker Hub)?
- Is there a target runtime (Node.js, Python, or polyglot) for the backend? The scrubbing pipeline (OpenAI Privacy Filter, detect-secrets) is Python-native; the web layer could be Node or Python.
- What is the expected GPU availability for running OpenAI Privacy Filter server-side? CPU inference is viable but slower for large log files.
- Will there be a public GitHub repository from day one, or internal-first with a later open-source release?
- Is there a preferred frontend framework?

## Scope Signals — MVP Boundaries

**Confirmed in:**
- File upload + Loki live connection (direct + browser-proxied)
- Server-side scrubbing pipeline (OpenAI Privacy Filter + detect-secrets + custom regex)
- Configurable LLM provider via env vars (remote + LM Studio/local)
- Error/anomaly analysis + structured output with citations
- Auth: OIDC configurable (Logto), first-run wizard fallback
- Multi-user sessions + per-user LLM key override
- Single container image, env-var config, Docker Compose + Kubernetes

**Confirmed out for v1:**
- RBAC beyond basic auth
- Non-Loki sources (Prometheus, Tempo, Elasticsearch)
- Metrics/traces analysis
- Automated/scheduled analysis or alerting
- Custom prompt library / saved templates (v2)
- SaaS or multi-tenant hosting

**Explicitly deferred (strong v2 candidates):**
- Shared team scrubbing rule configs and prompt templates (git-tracked)
- Incident timeline reconstruction across multiple services
- Baseline comparison / persistent "normal" pattern storage
- Additional Grafana data sources (Tempo, Prometheus as log context)
- CI/CD pipeline integration (analyse test/deployment logs automatically)
- Fine-tuned OpenAI Privacy Filter for org-specific patterns
- Open-source public release (internal validation first)
