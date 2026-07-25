const TOKEN_STORAGE_KEY = "auditor_zero_token";
const DEMO_EMAIL = "demo@auditor-zero.local";
const DEMO_PASSWORD = "demo-password";

export interface DemoAuthDependencies {
  fetchImpl?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  serviceUrl?: string;
  email?: string;
  password?: string;
  mode?: "login" | "signup";
}

export async function authenticateWithCredentials({
  fetchImpl = fetch,
  storage = typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : undefined,
  serviceUrl = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:8080",
  email,
  password,
  mode,
}: DemoAuthDependencies): Promise<string> {
  const endpoint = mode === "signup" ? `${serviceUrl}/api/auth/signup` : `${serviceUrl}/api/auth/login`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!response.ok || !data.token) {
    throw new Error(data.error || "Authentication failed");
  }

  storage?.setItem?.(TOKEN_STORAGE_KEY, data.token);
  return data.token;
}

export async function resolveDemoAuth({
  fetchImpl = fetch,
  storage = typeof globalThis !== "undefined" && "localStorage" in globalThis ? globalThis.localStorage : undefined,
  serviceUrl = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost:8080",
  email = DEMO_EMAIL,
  password = DEMO_PASSWORD,
}: DemoAuthDependencies = {}): Promise<string> {
  const existingToken = storage?.getItem?.(TOKEN_STORAGE_KEY);
  if (existingToken) return existingToken;

  return authenticateWithCredentials({
    fetchImpl,
    storage,
    serviceUrl,
    email,
    password,
    mode: "login",
  }).catch(() => authenticateWithCredentials({
    fetchImpl,
    storage,
    serviceUrl,
    email,
    password,
    mode: "signup",
  }));
}
