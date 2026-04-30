# Story 6.2: Authentication screens — login and first-run setup

Status: done

> **Design system:** shadcn/ui + Tailwind CSS. Full UX specification: `_bmad-output/planning-artifacts/ux-design-specification.md`

## Story

As a user,
I want the login and first-run setup screens to clearly present the app identity and guide me through authentication,
so that I can sign in or create my admin account with confidence, understand what is expected, and recover from errors without confusion.

## User Flows

### Login flow

1. User navigates to `/login`
2. Sees the LogLens name and a brief one-line tagline ("Privacy-first AI log analysis")
3. Form shows: username field, password field, "Sign in" submit button
4. User submits → button enters loading state (disabled, text or indicator changes)
5. On success (200): redirected to `/`
6. On wrong credentials (401): inline error message "Invalid credentials" appears below the form
7. On rate limit (429): inline error message "Too many attempts. Please wait."
8. OIDC variant (when `VITE_OIDC_ENABLED=true`): form is hidden; only "Sign in with SSO" button is shown

### First-run setup wizard flow

1. User navigates to `/setup` (redirected here automatically on first run)
2. Sees "Welcome to LogLens" heading and "Create your admin account to get started" subtitle
3. Form shows: username field, password field with a hint note ("Must be at least 12 characters"), "Create account" submit button
4. Client-side validation runs on submit: if username empty → inline error below username field; if password < 12 chars → inline error below password field
5. Submit → button enters loading state
6. On server error (non-409): error message below the form
7. On 409 (wizard already complete): brief message "Setup already complete" then auto-redirect to `/login`
8. On success: redirected to `/login`

## Screen Elements

### Shared auth layout (`AuthLayout` component)

Both login and setup use a centered single-column layout:

| Element | Notes |
|---|---|
| LogLens app name heading | Rendered as `<h1>LogLens</h1>` (brand anchor) |
| Tagline | "Privacy-first AI log analysis" (one line, below heading) |
| Content slot | Renders the form passed by the child screen |

Layout: centred column `max-w-sm mx-auto`, vertical padding `pt-16 pb-8`.

### Login screen (`LoginForm` component)

| Element | Notes |
|---|---|
| Form heading | "Sign in" (`<h2>` or visible section label) |
| Username field | `<label>` + `<input type="text" autoComplete="username">` |
| Password field | `<label>` + `<input type="password" autoComplete="current-password">` with show/hide toggle (`Eye`/`EyeOff` Lucide icon) |
| Submit button | "Sign in"; disabled and visually indicates loading while request is in-flight |
| Error message | `role="alert"` element; shown only when an error exists; hidden otherwise |
| OIDC-only variant | A single "Sign in with SSO" `<a>` or `<button>` pointing to `/api/v1/auth/oidc/login`; form is not rendered |

### Setup wizard screen (`FirstRunWizard` component)

| Element | Notes |
|---|---|
| Page heading | "Welcome to LogLens" (`<h1>` rendered inside `AuthLayout`, replaces generic heading for this screen) |
| Subtitle | "Create your admin account to get started" |
| Username field | `<label>` + `<input type="text" autoComplete="username">` |
| Password field | `<label>` + `<input type="password" autoComplete="new-password">` with show/hide toggle (`Eye`/`EyeOff` Lucide icon) |
| Password hint | Inline note below the password field: "Must be at least 12 characters" — always visible (not only on error) |
| Per-field error | `role="alert"` inline below each field; shown only when that field has a validation error |
| Server error | `role="alert"` below the form; shown only on server-side failure |
| Submit button | "Create account"; disabled while submitting |

## Acceptance Criteria

1. **Given** I navigate to `/login`, **When** the page loads, **Then** I see the LogLens heading and a sign-in form with username field, password field, and a "Sign in" button.

2. **Given** I submit with wrong credentials, **When** the 401 response arrives, **Then** an error message with `role="alert"` appears below the form with text "Invalid credentials".

3. **Given** I am submitting the login form, **When** the request is in-flight, **Then** the "Sign in" button is disabled and visually indicates a loading state.

4. **Given** `VITE_OIDC_ENABLED=true`, **When** I navigate to `/login`, **Then** I see a "Sign in with SSO" button and no username/password form.

5. **Given** I navigate to `/setup`, **When** the page loads, **Then** I see "Welcome to LogLens" heading, the subtitle, username and password fields, and a "Create account" button.

6. **Given** I submit the setup form with a password shorter than 12 characters, **When** the form validates, **Then** an inline error message appears below the password field before any API call is made.

7. **Given** I submit the setup form with valid input, **When** the API responds with success, **Then** I am redirected to `/login`.

8. **Given** I submit the setup form and setup is already complete (409), **When** the response arrives, **Then** I see a brief message and am automatically redirected to `/login`.

## Tasks / Subtasks

- [x] Task 1 — Create `frontend/src/features/auth/AuthLayout.tsx`
  - [x] Renders the page wrapper with `<h1>LogLens</h1>` heading and tagline "Privacy-first AI log analysis"
  - [x] Accepts a `children` prop (or `title` override prop for the setup wizard to replace the heading)
  - [x] Centers content (single-column, vertically and horizontally)

- [x] Task 2 — Polish `frontend/src/features/auth/LoginForm.tsx`
  - [x] Wrap with `AuthLayout`
  - [x] Add `<h2>Sign in</h2>` (or equivalent form heading) below the brand heading
  - [x] Change button label to "Sign in"
  - [x] Add loading state: disable button and change text to "Signing in…" (or add a loading indicator) while request is in-flight
  - [x] Add show/hide toggle to password field: button with `Eye`/`EyeOff` Lucide icon that toggles `type` between `password` and `text`; `aria-label="Show password"` / `"Hide password"`
  - [x] Ensure the error `<p>` has `role="alert"` so screen readers announce it

- [x] Task 3 — Polish `frontend/src/features/setup/FirstRunWizard.tsx`
  - [x] Wrap with `AuthLayout` using a title override that renders "Welcome to LogLens" as the page heading
  - [x] Add "Create your admin account to get started" subtitle below the heading
  - [x] Add a persistent hint below the password field: "Must be at least 12 characters"
  - [x] Add show/hide toggle to password field: button with `Eye`/`EyeOff` Lucide icon; `aria-label="Show password"` / `"Hide password"`
  - [x] Move per-field validation errors to appear directly below the relevant field (not in a single error block); associate via `aria-describedby`
  - [x] Keep server-side errors in a `role="alert"` element below the form
  - [x] Change button label to "Create account"
  - [x] Add loading state: disable button and change text to "Creating…" while request is in-flight

- [x] Task 4 — Ensure both forms meet keyboard navigation requirements (NFR21)
  - [x] Tab order: heading → first field → second field → submit button
  - [x] Submit on `Enter` key works in all fields (standard HTML form behaviour)
  - [x] Error messages are associated with their fields via `aria-describedby` where applicable

## Test Scenarios

*Unit (Vitest + React Testing Library):*
- `LoginForm`: renders username field, password field, and "Sign in" button
- `LoginForm`: displays `role="alert"` error after simulated 401 response
- `LoginForm`: button is disabled while submitting
- `LoginForm` (OIDC): renders SSO button and no username/password form when `VITE_OIDC_ENABLED=true`
- `FirstRunWizard`: renders "Welcome to LogLens" heading and "Create account" button
- `FirstRunWizard`: shows inline password field error when password is < 12 chars on submit (no API call made)
- `FirstRunWizard`: button is disabled while submitting

*E2E (Playwright — `e2e/auth.spec.ts` — existing tests must continue to pass):*
- Login with valid credentials lands on dashboard (existing)
- Login with invalid credentials shows error (existing)
- Fresh setup: `/setup` shows form; valid submission redirects to `/login` (existing)
