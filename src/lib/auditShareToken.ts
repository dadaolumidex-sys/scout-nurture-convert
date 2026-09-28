export const SHARE_TOKEN = /^[a-f0-9]{64}$/;
const COMPACT_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const invalid = () => new Error("Report unavailable or link expired.");

/** A reversible, lossless URL encoding of the same 256-bit secret. */
export function compactAuditToken(token: string): string {
  if (!SHARE_TOKEN.test(token)) throw invalid();
  const bytes = token.match(/../g)!.map((pair) => Number.parseInt(pair, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Old 64-character links remain valid; compact links decode before the API call. */
export function expandAuditToken(value: string): string {
  if (SHARE_TOKEN.test(value)) return value;
  if (!COMPACT_TOKEN.test(value)) throw invalid();
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=");
    if (binary.length !== 32) throw invalid();
    const token = Array.from(binary, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    if (compactAuditToken(token) !== value) throw invalid();
    return token;
  } catch {
    throw invalid();
  }
}
