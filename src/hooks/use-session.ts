import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SessionState = "loading" | "signed-in" | "signed-out";

export function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>("loading");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState(data.session ? "signed-in" : "signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? "signed-in" : "signed-out");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
