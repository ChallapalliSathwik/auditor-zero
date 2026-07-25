export function summarize(value: unknown, maxLen = 130): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

export function shortHash(hash: string): string {
  return hash === "GENESIS" ? "GENESIS" : hash.slice(0, 12) + "…";
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
