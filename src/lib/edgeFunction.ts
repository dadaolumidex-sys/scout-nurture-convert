import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TIMEOUT_MS = 45_000;

export async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || apiKey}`,
          apikey: apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error
          : `Request failed (${response.status})`,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The AI request took too long. Please try again.");
    }

    // Lovable Cloud can be unavailable while local development is still running.
    // Keep this fallback strictly local so production never exposes a provider key
    // to the browser.
    if (functionName === "analyze-knowledge" && import.meta.env.DEV && window.location.hostname === "localhost") {
      const { analyzeKnowledgeLocally } = await import("./localKnowledgeAnalysis");
      return analyzeKnowledgeLocally(body) as Promise<T>;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
