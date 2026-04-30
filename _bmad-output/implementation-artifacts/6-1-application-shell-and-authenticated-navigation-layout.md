# Story 6.1: Application shell and authenticated navigation layout

Status: done

> **Design system:** shadcn/ui + Tailwind CSS. Full UX specification: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Story

As an authenticated user,
I want to see a consistent application shell with navigation and user controls on every protected page,
so that I can move between areas of the app and always know who I am logged in as and how to log out.

## User Flow

1. User logs in → lands on any protected route (`/` or `/analysis`)
2. A persistent header is visible at the top of every authenticated page
3. Header contains: LogLens app name (acts as home link), navigation links, logged-in username, logout button
4. User clicks "Analysis" nav link → navigates to `/analysis`
5. User clicks the app name or "Dashboard" nav link → navigates to `/`
6. Active nav link is visually distinct from inactive links
7. User clicks "Log out" → logout API is called → redirect to `/login`
8. User navigates to an unknown route → sees a "Page not found" message with a link back to the dashboard
9. An uncaught render error anywhere in the app shows a recoverable error message with a "Return to Dashboard" link (does not crash the whole page to blank)

## Screen Elements

### App header (`AppHeader` component)

| Element | Notes |
|---|---|
| App name / brand mark | Text "LogLens"; acts as a home link (`/`) |
| Navigation links | "Dashboard" → `/`, "Analysis" → `/analysis` |
| Active link indicator | Current route's link uses `text-teal-600 font-medium` — no underline, no background |
| User badge | Displays logged-in username from `getMe()` response |
| Logout button | Triggers `POST /api/v1/auth/logout`, then navigates to `/login` |
| Skip link | `<a href="#main-content">Skip to main content</a>` — visually hidden (`sr-only`) but visible on focus; must be the first focusable element in the DOM |

Layout: fixed height `h-14`, full-width, `border-b border-zinc-200`, `px-6` horizontal padding.

Accessibility requirements:
- Header element has `role="banner"`
- Nav element has `role="navigation"` and `aria-label="Main navigation"`
- Logout button is a `<button type="button">` (not an anchor)
- Skip link is the first focusable element; styled `sr-only focus:not-sr-only`

### Authenticated layout wrapper (`AppShell` component)

- Renders the header followed by a `<main id="main-content">` element that outputs the child route via `<Outlet />`
- All routes under `indexRoute` and `analysisRoute` use `AppShell` as their layout parent
- Page content inside `<main>` uses `pt-8 pb-16 px-6` padding and a `max-w-3xl mx-auto` content column

### Not-found screen

| Element | Notes |
|---|---|
| Heading | "Page not found" |
| Message | Brief note that the page does not exist |
| Link | "Return to Dashboard" → `/` |

### Error boundary

| Element | Notes |
|---|---|
| Heading | "Something went wrong" |
| Message | Reassurance that the error has been contained |
| Link / button | "Return to Dashboard" → `/` |

## Acceptance Criteria

1. **Given** I am authenticated and navigate to `/`, **When** the page loads, **Then** the `AppHeader` is visible with the LogLens name, navigation links, my username, and a logout button.

2. **Given** I am on the `/analysis` page, **When** I look at the navigation, **Then** the "Analysis" link is visually distinct from the "Dashboard" link.

3. **Given** I click the logout button in the header, **When** the request completes, **Then** the JWT cookie is cleared and I am redirected to `/login`.

4. **Given** I am unauthenticated and navigate to `/`, **When** the page loads, **Then** I am redirected to `/login` (existing guard — must remain functional after refactor).

5. **Given** I navigate to a route that does not exist (e.g. `/foo`), **When** the page renders, **Then** I see a "Page not found" message and a link back to `/`.

6. **Given** a component inside the authenticated layout throws an uncaught error, **When** React catches it at the error boundary, **Then** I see a recovery message and a "Return to Dashboard" link — not a blank page.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/shell/AppHeader.tsx`
  - [x] Render skip link as first child: `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>`
  - [x] Render the LogLens app name as a TanStack Router `<Link to="/">`
  - [x] Render navigation links: `<Link to="/">Dashboard</Link>` and `<Link to="/analysis">Analysis</Link>`
  - [x] Use TanStack Router `activeProps` to apply `className="text-teal-600 font-medium"` on the active route's link
  - [x] Render the logged-in username — fetch via `getMe()` (can be a separate React Query call or passed via layout loader); show a placeholder "..." while loading
  - [x] Render a `<button type="button">Log out</button>` that calls `logout()` then `navigate({ to: '/login' })`
  - [x] Add ARIA attributes: wrapping `<header role="banner">`, `<nav role="navigation" aria-label="Main navigation">`
  - [x] Apply layout classes: `h-14 w-full border-b border-zinc-200 px-6 flex items-center`
- [x] Task 2 — Create `frontend/src/features/shell/AppShell.tsx`
  - [x] Import and render `AppHeader`
  - [x] Render `<main id="main-content">` below the header containing `<Outlet />` from TanStack Router
  - [x] Apply page content layout: `<main id="main-content" className="pt-8 pb-16 px-6"><div className="max-w-3xl mx-auto"><Outlet /></div></main>`
  - [x] The shell has no other logic — it is a pure layout component

- [x] Task 3 — Update `frontend/src/router.tsx`
  - [x] Create an `authenticatedLayout` route under `rootRoute` that uses `AppShell` as its component
  - [x] Move `indexRoute` and `analysisRoute` to be children of `authenticatedLayout` (they inherit the layout and keep their `beforeLoad` guards)
  - [x] Add a `notFoundRoute` using TanStack Router's `createNotFoundRoute` or a catch-all `path: '$'` route with the not-found screen component

- [x] Task 4 — Create `frontend/src/features/shell/NotFound.tsx`
  - [x] Render "Page not found" heading
  - [x] Render a `<Link to="/">Return to Dashboard</Link>`

- [x] Task 5 — Create `frontend/src/features/shell/ErrorBoundary.tsx`
  - [x] React class component or `react-error-boundary` wrapper
  - [x] On caught error: render "Something went wrong" heading and a "Return to Dashboard" link
  - [x] Register as `errorComponent` on the root route in `router.tsx`

- [x] Task 6 — Write unit tests `frontend/src/features/shell/AppHeader.test.tsx`
  - [x] Renders the LogLens brand link
  - [x] Renders "Dashboard" and "Analysis" nav links
  - [x] Calls `logout()` and navigates to `/login` when logout button is clicked

### Review Findings

- [x] [Review][Patch] Logout errors silently swallowed — `void handleLogout()` discards rejections; user stays on current page with no feedback [AppHeader.tsx:handleLogout]
- [x] [Review][Patch] `aria-label="Logged in as"` overrides accessible name — screen readers announce label only, username never read aloud [AppHeader.tsx:~L47]
- [x] [Review][Patch] `getSetupStatus()` unguarded — network failure throws unhandled out of `beforeLoad`, shows unformatted crash [router.tsx:indexRoute.beforeLoad]
- [x] [Review][Patch] `rootRoute.errorComponent` uses `<a href="/">` — Link is available in router context, hard reload is unnecessary [router.tsx:rootRoute.errorComponent]
- [x] [Review][Patch] `ErrorBoundary` has no reset path — `hasError` stays `true` after navigation; entire subtree shows error fallback indefinitely [ErrorBoundary.tsx]
- [x] [Review][Patch] `['me']` query cache not invalidated on logout — stale username visible for up to 5 min after re-login as different user [AppHeader.tsx:handleLogout]
- [x] [Review][Patch] `me` stuck at `'…'` on query error — broken-auth state (expired cookie mid-session) goes undetected; no redirect to `/login` [AppHeader.tsx:useQuery]
- [x] [Review][Patch] `ErrorBoundary` not mounted in `main.tsx` — route render errors are not caught by the class component (AC6 gap) [main.tsx]
- [x] [Review][Patch] No `aria-current="page"` on active nav link — active state conveyed by colour only; WCAG 2.1 SC 1.3.1 gap (AC7) [AppHeader.tsx:~L33]
- [x] [Review][Patch] Double-click logout fires concurrent `logout()` calls — no in-progress guard [AppHeader.tsx:handleLogout]
- [x] [Review][Defer] `getMe()` in `beforeLoad` bypasses React Query cache — each guarded route fires an independent network call; architectural smell, pre-existing pattern — deferred, pre-existing

## Test Scenarios

*Unit (Vitest + React Testing Library):*
- `AppHeader`: renders brand name "LogLens"
- `AppHeader`: renders "Dashboard" and "Analysis" nav links
- `AppHeader`: logout button click calls `logout()` and triggers navigation to `/login`
- `NotFound`: renders "Page not found" heading and "Return to Dashboard" link

*E2E (Playwright — `e2e/auth.spec.ts`):*
- Authenticated user sees header with username and logout button on `/`
- Authenticated user sees header on `/analysis`
- Clicking logout from header redirects to `/login`
- Navigating to `/nonexistent` shows "Page not found" message
