import { supabase } from "@/integrations/supabase/client";

const DEFAULT_TIMEOUT_MS = 45_000;

export async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  // Any localhost build (including `vite preview`) deliberately bypasses the
  // hosted function and uses the signed-in user's own configured keys instead.
  // Keeping this hostname-only means provider keys are never exposed on the
  // published site, while local testing does not depend on Lovable Cloud.
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (functionName === "analyze-knowledge" && isLocalhost) {
    const { analyzeKnowledgeLocally } = await import("./localKnowledgeAnalysis");
    return analyzeKnowledgeLocally(body) as Promise<T>;
  }
  if (functionName === "chat-suggestions" && isLocalhost) {
    const { generateInboxSuggestionsLocally } = await import("./localKnowledgeAnalysis");
    return generateInboxSuggestionsLocally(body) as Promise<T>;
  }

  const runPersonalKnowledgeFallback = async () => {
    // Each signed-in user can only read their own RLS-protected API keys. This
    // is a resilience fallback for file/link analysis when the hosted function
    // is behind an old deployment or temporarily unavailable.
    const { analyzeKnowledgeLocally } = await import("./localKnowledgeAnalysis");
    return analyzeKnowledgeLocally(body) as Promise<T>;
  };

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
      const errorText = typeof payload.error === "string" ? payload.error.trim() : "";
      if (/^AI service error\.?$/i.test(errorText)) {
        throw new Error(
          "The online AI analyzer could not complete this file. Check that your Gemini key is active in Settings → API & Connections. " +
          "If it is active, refresh the app and retry; the online AI service may be temporarily unavailable.",
        );
      }
      throw new Error(
        errorText
          ? errorText
          : `Request failed (${response.status})`,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The AI request took too long. Please try again.");
    }

    // A published frontend can be newer than its hosted Edge Function. Let a
    // signed-in user's own saved keys handle knowledge files/links in that
    // case, rather than showing a vague cloud error or losing the upload.
    if (functionName === "analyze-knowledge") {
      try {
        return await runPersonalKnowledgeFallback();
      } catch (fallbackError) {
        // The local analyzer gives detailed, actionable key/file messages.
        throw fallbackError;
      }
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
