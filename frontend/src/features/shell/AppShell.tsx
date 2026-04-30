/**
 * AppShell — authenticated layout wrapper.
 *
 * Renders AppHeader above a <main> content area.
 * All authenticated routes compose inside this shell.
 *
 * [Source: story-6.1, Task 2]
 */
import { Outlet } from '@tanstack/react-router'
import AppHeader from './AppHeader.js'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <AppHeader />
      <main id="main-content" className="pt-8 pb-16 px-6">
        <div className="max-w-3xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
