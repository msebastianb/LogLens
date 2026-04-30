# Story 4.5: Recommended next steps

Status: done

## Story

As a user,
I want the analysis to conclude with recommended next steps based on the identified errors and root cause,
So that I have concrete actions to investigate or remediate the issue without having to formulate follow-up prompts.

## Acceptance Criteria

1. **Given** the analysis completes, **When** the `event: complete` payload is received, **Then** the UI renders a "Recommended Next Steps" section as an ordered list of actionable items.

2. **Given** the next steps section, **When** rendered, **Then** each step references specific log evidence or analysis findings from the same session (not generic advice). *(Verified structurally — the LLM is already prompted to produce contextual next steps; no additional validation logic is required in this story.)*

3. **Given** the LLM returns a `complete` payload with no recommended steps, **When** Zod validates the payload, **Then** validation fails and Fastify emits `event: error` rather than rendering an empty steps section. *(Already satisfied by `nextSteps: z.array(z.string()).min(1)` in `analysisOutputSchema.ts` — add integration-style unit test to verify the path through the GET route.)*

4. **Given** the complete analysis output (all sections including next steps), **When** displayed, **Then** a persistent "AI-generated — not authoritative" banner is visible at the top of the analysis view and **cannot be dismissed**. *(Story 4.4 added `role="note"` — upgrade to a non-dismissable `role="banner"` that is visually prominent and has no close button.)*

## Tasks / Subtasks

- [x] Task 1 — Add "Recommended Next Steps" section to `AnalysisOutput.tsx` (AC1, AC2)
  - [x] Add a fifth section after "Event Timeline": heading "Recommended Next Steps"
  - [x] Render `output.nextSteps` as an `<ol>` (ordered list) — each item is an `<li>`
  - [x] Upgrade the AI disclaimer from `<p role="note">` to `<div role="banner" aria-label="AI-generated disclaimer">` with no close/dismiss button (AC4)

- [x] Task 2 — Add integration unit test for empty `nextSteps` path through GET stream route (AC3)
  - [x] In `api/src/routes/analysis.test.ts`: add test case `GET /stream emits event: error when nextSteps is empty array`
  - [x] Mock LLM stream to return `JSON.stringify({ ...validOutput, nextSteps: [] })` — verify `event: error` with `statusCode: 502`

- [x] Task 3 — Update `frontend/src/features/analysis/AnalysisOutput.test.tsx` (AC1, AC4)
  - [x] Add test: `renders "Recommended Next Steps" ordered list when nextSteps is present`
  - [x] Add test: `renders each next-step item text`
  - [x] Update existing `renders "AI-generated — not authoritative" label` test to query `role="banner"` instead of `role="note"`
  - [x] Add test: `banner has no dismiss button`

- [x] Task 4 — Finalize
  - [x] Run `pnpm --filter frontend test` — all pass (frontend)
  - [x] Run `pnpm test` in `api/` — all pass (API)
  - [x] Story → review, sprint-status updated

## Dev Notes

### This story touches both frontend and API

**Frontend:** `frontend/src/features/analysis/AnalysisOutput.tsx` + `AnalysisOutput.test.tsx`
**API:** `api/src/routes/analysis.test.ts` (add one test only — no production code change needed, `min(1)` is already enforced in `analysisOutputSchema.ts`)

Do NOT touch: `analysisOutputSchema.ts` (already has `min(1)`), `analysis.ts` (route is already correct — `parseAnalysisJson` throws on empty `nextSteps`), `analysisApi.ts` (`nextSteps` already in interface).

### AC4 — banner upgrade from `role="note"` to `role="banner"`

Story 4.4 used `<p role="note">` as a placeholder. Story 4.5 upgrades it to a persistent, non-dismissable banner. ARIA `role="banner"` is the landmark role for site-wide header-level content.

Replace:
```tsx
<p role="note" className="text-sm text-amber-700 font-medium">
  AI-generated — not authoritative
</p>
```
With:
```tsx
<div
  role="banner"
  aria-label="AI-generated disclaimer"
  className="rounded border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"
>
  AI-generated — not authoritative
</div>
```
No `<button>` or close affordance anywhere in this element. Tests assert `queryByRole('button')` inside the banner returns `null`.

### AC1 — "Recommended Next Steps" section

Add as the fifth `<section>` after Event Timeline, before closing `</div>`:

```tsx
{/* AC1 — Recommended Next Steps */}
<section aria-labelledby="nextsteps-heading">
  <h2 id="nextsteps-heading" className="text-lg font-semibold mb-2">
    Recommended Next Steps
  </h2>
  <ol className="list-decimal list-inside space-y-1">
    {output.nextSteps.map((step, i) => (
      <li key={i} className="text-sm">
        {step}
      </li>
    ))}
  </ol>
</section>
```

`nextSteps` is always non-empty when the payload is valid (Zod `min(1)` enforced at the backend) — no empty-state guard needed.

### AC3 — backend integration unit test for empty nextSteps

In `api/src/routes/analysis.test.ts`, add inside the `GET /api/v1/analysis-jobs/:id/stream` describe block:

```typescript
it('emits event: error when nextSteps is empty array (Zod min(1))', async () => {
  mockRedisGet.mockResolvedValue(makeJob())
  mockScrubCacheGet.mockResolvedValue('log text')
  mockRedisSet.mockResolvedValue('OK')
  mockLlmProviderFactory.mockReturnValue({
    stream: () => makeTokenStream([JSON.stringify({ ...validOutput, nextSteps: [] })]),
  })
  const app = await buildTestApp()
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/analysis-jobs/${JOB_ID}/stream`,
    headers: { cookie: makeAuthCookie(app) },
  })
  const events = parseSSE(res.body)
  const errorEvents = events.filter(e => e.event === 'error')
  expect(errorEvents).toHaveLength(1)
  expect((errorEvents[0].data as { statusCode: number }).statusCode).toBe(502)
  expect((errorEvents[0].data as { message: string }).message).toMatch(/invalid structured output/i)
})
```

### Test update — role="banner" replaces role="note"

The existing test in `AnalysisOutput.test.tsx`:
```typescript
it('renders "AI-generated — not authoritative" label (AC5)', () => {
  render(<AnalysisOutput output={STUB_OUTPUT} />)
  expect(screen.getByRole('note')).toHaveTextContent('AI-generated — not authoritative')
})
```
Must be updated to:
```typescript
it('renders "AI-generated — not authoritative" banner (AC5/AC4)', () => {
  render(<AnalysisOutput output={STUB_OUTPUT} />)
  expect(screen.getByRole('banner')).toHaveTextContent('AI-generated — not authoritative')
})
```
And add the no-dismiss test:
```typescript
it('banner has no dismiss button (AC4)', () => {
  render(<AnalysisOutput output={STUB_OUTPUT} />)
  const banner = screen.getByRole('banner')
  expect(within(banner).queryByRole('button')).toBeNull()
})
```

### STUB_OUTPUT in test file already has nextSteps

The existing `STUB_OUTPUT` in `AnalysisOutput.test.tsx` already includes:
```typescript
nextSteps: ['Add null check in UserService.getById before cache lookup'],
```
This is sufficient for the new next-steps rendering tests.

### Files to create / modify

| File | Change |
|------|--------|
| `frontend/src/features/analysis/AnalysisOutput.tsx` | Add "Recommended Next Steps" section; upgrade banner to `role="banner"` |
| `frontend/src/features/analysis/AnalysisOutput.test.tsx` | Add 3 tests; update banner test to `role="banner"` |
| `api/src/routes/analysis.test.ts` | Add 1 test for empty nextSteps → event: error |

No changes to: `analysisOutputSchema.ts`, `analysis.ts`, `analysisApi.ts`, `app.ts`, `env.ts`.

### References

- [Source: epics.md — Story 4.5 AC and Test Scenarios]
- [Source: architecture.md — AI-generated label / banner, frontend analysis component]
- [Source: frontend/src/features/analysis/AnalysisOutput.tsx — current file with role="note" placeholder]
- [Source: frontend/src/features/analysis/AnalysisOutput.test.tsx — existing tests]
- [Source: api/src/routes/analysis.test.ts — mock pattern for SSE tests]
- [Source: api/src/services/analysisOutputSchema.ts — nextSteps min(1) already present]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
