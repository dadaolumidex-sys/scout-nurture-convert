const URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/gi;
const MAX_URLS = 2;
const MAX_BYTES = 500_000;
const MAX_TEXT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.,!?;:]+$/g, "");
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0") return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || a >= 224;
  }

  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function parsePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || isBlockedHostname(url.hostname)) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function extractPublicUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) || [];
  const unique = new Set<string>();
  for (const match of matches) {
    const parsed = parsePublicUrl(trimTrailingPunctuation(match));
    if (parsed) unique.add(parsed.toString());
    if (unique.size >= MAX_URLS) break;
  }
  return [...unique];
}

function htmlToReadableText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Web page";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: title.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Web page",
    text,
  };
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = MAX_BYTES - total;
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
    total += Math.min(value.length, remaining);
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchPublicPage(initialUrl: string): Promise<{ url: string; title: string; text: string }> {
  let current = parsePublicUrl(initialUrl);
  if (!current) throw new Error("Blocked or invalid URL");

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": "StreamScout-LinkReader/1.0", Accept: "text/html,text/plain,application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Too many redirects");
      current = parsePublicUrl(new URL(location, current).toString());
      if (!current) throw new Error("Redirected to a blocked URL");
      continue;
    }
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json")) {
      await response.body?.cancel();
      throw new Error("Unsupported page type");
    }
    const raw = await readLimitedBody(response);
    const parsed = contentType.includes("text/html")
      ? htmlToReadableText(raw)
      : { title: current.hostname, text: raw.replace(/\s+/g, " ").trim() };
    return { url: current.toString(), title: parsed.title, text: parsed.text.slice(0, MAX_TEXT_CHARS) };
  }
  throw new Error("Could not load URL");
}

export async function buildLiveUrlContext(text: string): Promise<string> {
  const urls = extractPublicUrls(text);
  if (urls.length === 0) return "";
  const results = await Promise.allSettled(urls.map(fetchPublicPage));
  const blocks = results.map((result, index) => {
    if (result.status === "fulfilled" && result.value.text) {
      return `### ${result.value.title}\nSource: ${result.value.url}\n${result.value.text}`;
    }
    const reason = result.status === "rejected" && result.reason instanceof Error
      ? result.reason.message
      : "Could not read this website";
    return `### Link unavailable\nSource: ${urls[index]}\n${reason}`;
  });
  return `\n\n## LIVE WEBSITE CONTENT\nThe user included these links in their latest message. Use only the extracted content below, distinguish it from stored knowledge, and clearly say when a page could not be read.\n\n${blocks.join("\n\n")}`;
}
