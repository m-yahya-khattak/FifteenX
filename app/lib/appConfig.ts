/**
 * Application Configuration
 * Controls whether the main app should use resources (WebSockets, APIs, etc.)
 * Set PAUSE_MAIN_APP=true in .env to disable main app feeds when focusing on Market Maker
 */

export function isMainAppPaused(): boolean {
  // Check environment variable (client-side safe check)
  if (typeof window === 'undefined') {
    // Server-side: check process.env
    return process.env.NEXT_PUBLIC_PAUSE_MAIN_APP === 'true';
  }
  
  // Client-side: check from a global config or localStorage
  // For now, we'll use environment variable via Next.js public env vars
  return process.env.NEXT_PUBLIC_PAUSE_MAIN_APP === 'true';
}

export function getMainAppPauseMessage(): string {
  return "Main app feeds are paused. Enable Market Maker mode or set PAUSE_MAIN_APP=false to resume.";
}
