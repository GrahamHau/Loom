/* ============================================================
 * Codex Integration Point
 * ============================================================
 *
 * This module is the ONLY place that talks to the auth backend.
 * Landing ships with a placeholder implementation that always
 * fails after 1.5s — that's intentional, so the form's error
 * state is visible during design review.
 *
 * To wire to the real Loom auth, replace the body of
 * `loginRequest()` below. The function signature must stay the
 * same so <LoginPanel /> keeps working.
 *
 * Search for `TODO(codex)` to find the swap point.
 *
 * Reference implementation (drop-in once landing is integrated
 * with the Loom Express server at same origin):
 *
 *   export async function loginRequest({ username, password }) {
 *     const res = await fetch("/api/auth/login", {
 *       method: "POST",
 *       credentials: "include",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify({ username, password }),
 *     });
 *     if (!res.ok) {
 *       const data = await res.json().catch(() => ({}));
 *       throw new Error(data.message || `登录失败 (${res.status})`);
 *     }
 *     // Loom uses session cookies; on success redirect into the app.
 *     window.location.href = "/";
 *   }
 * ============================================================ */

export async function loginRequest({ username, password }) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `登录失败 (${res.status})`);
  }
  window.location.href = "/app";
}

export async function getAuthProviders() {
  const res = await fetch("/api/auth/providers", {
    credentials: "include",
  });
  if (!res.ok) return { password: true, feishu: false };
  return res.json();
}

export function startFeishuLogin() {
  window.location.href = `/api/auth/feishu/start?return_to=${encodeURIComponent("/app")}`;
}
