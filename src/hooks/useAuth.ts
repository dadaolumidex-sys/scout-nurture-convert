import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Several page components use this hook at once (page, sidebar, mobile nav).
// Keep one shared Supabase listener and session request instead of making every
// component start a fresh network check whenever the user changes pages.
let cachedSession: Session | null | undefined;
let authStarted = false;
const subscribers = new Set<(session: Session | null) => void>();

const publishSession = (nextSession: Session | null) => {
  cachedSession = nextSession;
  subscribers.forEach((subscriber) => subscriber(nextSession));
};

const startAuth = () => {
  if (authStarted) return;
  authStarted = true;

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    publishSession(nextSession);
  });

  void supabase.auth.getSession().then(({ data: { session } }) => {
    publishSession(session);
  }).catch(() => {
    publishSession(null);
  });
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(cachedSession ?? null);
  const [loading, setLoading] = useState(cachedSession === undefined);

  useEffect(() => {
    startAuth();
    const update = (nextSession: Session | null) => {
      setSession(nextSession);
      setLoading(false);
    };
    subscribers.add(update);
    if (cachedSession !== undefined) update(cachedSession);

    return () => subscribers.delete(update);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { session, user: session?.user ?? null, loading, signOut };
}
