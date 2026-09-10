import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyReseller } from "@/lib/reseller.functions";
import { useSessionState } from "@/hooks/use-session";
import type { PriceTier } from "@/lib/pricing";

/** Nivel de precios del usuario actual (público si no ha iniciado sesión). */
export function useResellerTier() {
  const session = useSessionState();
  const fetchMine = useServerFn(getMyReseller);
  const query = useQuery({
    queryKey: ["reseller-me"],
    queryFn: () => fetchMine(),
    enabled: session === "signed-in",
    staleTime: 60_000,
  });

  return {
    session,
    tier: (query.data?.tier ?? "public") as PriceTier,
    application: query.data?.application ?? null,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
