# Story 6.3: Dashboard home screen

Status: done

> **Design system:** shadcn/ui + Tailwind CSS. Layout column (`max-w-3xl mx-auto`) is provided by `AppShell` (story 6.1). Full UX specification: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Story

As an authenticated user,
I want the dashboard to welcome me by name and give me a clear entry point for starting an analysis,
so that I land somewhere meaningful after login and can begin working in one click without hunting for navigation.

## User Flow

1. User logs in → redirected to `/`
2. Dashboard renders inside the `AppShell` (header + main content area from Story 6.1)
3. Dashboard greets the user by their username: "Welcome back, {username}"
4. A brief description of what LogLens does is displayed (one short paragraph — reminds infrequent users of the tool's purpose)
5. A prominent "Start New Analysis" call-to-action is visible — clicking it navigates to `/analysis`
6. If the user navigates back to the dashboard from `/analysis` mid-session, the same screen is shown (no persistent session state displayed in this story — session history is Post-MVP)

## Screen Elements

### Dashboard page (`DashboardPage` component)

The dashboard occupies the `<main>` region rendered by `AppShell`.

| Element | Notes |
|---|---|
| Welcome heading | "Welcome back, {username}" — username retrieved from `getMe()` response; show loading placeholder ("\u2026") while fetching |
| Description paragraph | One to two sentences describing LogLens (privacy-first AI log analysis for Grafana/Loki logs — reduces incident investigation time) |
| "Start New Analysis" CTA | Primary `Button` (shadcn/ui) or `<Link>` styled as primary button; navigates to `/analysis` on click |

No sidebar, no settings panel, no data table — this screen is intentionally minimal. Empty state (no prior analyses): welcome message + CTA is the entire content.

### Username sourcing

- `getMe()` is already called in the `beforeLoad` guard of the root index route (it redirects to `/login` on 401)
- `DashboardPage` calls `getMe()` independently (or receives it via TanStack Router loader context) to display the username
- While the `getMe()` call resolves, the welcome heading shows a loading placeholder such as "Welcome back, …"
- If `getMe()` fails (session expired mid-view), the existing route guard handles the redirect to `/login` — `DashboardPage` does not need its own error handler for this case

## Acceptance Criteria

1. **Given** I am authenticated and navigate to `/`, **When** the page loads, **Then** I see a welcome heading that includes my username.

2. **Given** the page is loading my user info, **When** `getMe()` has not yet resolved, **Then** the welcome heading shows a loading placeholder and does not crash.

3. **Given** the page is loaded, **When** I look at the main content, **Then** I see a "Start New Analysis" button or link.

4. **Given** I click "Start New Analysis", **When** the navigation occurs, **Then** I arrive at `/analysis`.

5. **Given** I am on the dashboard, **When** I look at the `AppShell` header, **Then** the "Dashboard" navigation link shows the active state indicator.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/dashboard/DashboardPage.tsx`
  - [x] Call `getMe()` from `authApi.ts` using React Query (`useQuery`) to get the logged-in user's username
  - [x] Render welcome heading: `<h1>Welcome back, {username}</h1>` (or "Welcome back, …" while loading)
  - [x] Render a description paragraph about LogLens
  - [x] Render a `<Link to="/analysis">Start New Analysis</Link>` styled as a primary button

- [x] Task 2 — Update `frontend/src/router.tsx`
  - [x] Replace the inline `Dashboard` function component in `router.tsx` with an import of `DashboardPage`
  - [x] `indexRoute` component → `DashboardPage`

- [x] Task 3 — Write unit tests `frontend/src/features/dashboard/DashboardPage.test.tsx`
  - [x] Renders welcome heading containing the mocked username
  - [x] Renders loading placeholder when `getMe()` is pending
  - [x] Renders "Start New Analysis" link pointing to `/analysis`

## Test Scenarios

*Unit (Vitest + React Testing Library):*
- `DashboardPage`: renders "Welcome back, testuser" when `getMe()` resolves with `{ username: 'testuser' }`
- `DashboardPage`: renders loading placeholder while `getMe()` is pending
- `DashboardPage`: renders a link or button labelled "Start New Analysis" with href `/analysis`

*E2E (Playwright — `e2e/auth.spec.ts`):*
- After successful login, the page at `/` shows a "Start New Analysis" element
- Clicking "Start New Analysis" navigates to `/analysis`
