import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Comprueba (contra la base de datos) si la sesión actual tiene el rol `admin`.
 * Solo las cuentas con ese rol ven el panel de administración.
 */
export function useIsAdmin() {
  const [state, setState] = useState<{ loading: boolean; isAdmin: boolean }>({
    loading: true,
    isAdmin: false,
  });

  useEffect(() => {
    let active = true;

    const check = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (active) setState({ loading: false, isAdmin: false });
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (active) setState({ loading: false, isAdmin: Boolean(data) });
    };

    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
