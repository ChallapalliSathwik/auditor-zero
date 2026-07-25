export const SERVICE_URL = (window as any).__AUDITOR_ZERO_SERVICE_URL__ || "http://localhost:8080";
const TOKEN_KEY = "auditor_zero_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const res = await fetch(`${SERVICE_URL}${path}`, {
    method: opts?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))).error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

/** Authenticates against the REST auth endpoints and stores the JWT. */
export async function authenticate(mode: "login" | "signup", email: string, password: string): Promise<void> {
  const res = await fetch(`${SERVICE_URL}/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !data.token) throw new Error(data.error || "Authentication failed");
  setToken(data.token);
}
