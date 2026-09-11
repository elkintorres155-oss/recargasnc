import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listResellerApplications,
  reviewResellerApplication,
  revokeResellerMember,
} from "@/lib/reseller.functions";
import { tierLabel } from "@/lib/pricing";

/** Panel para revisar solicitudes de revendedores y gestionar niveles activos. */
export function AdminResellers() {
  const list = useServerFn(listResellerApplications);
  const review = useServerFn(reviewResellerApplication);
  const revoke = useServerFn(revokeResellerMember);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const query = useQuery({
    queryKey: ["admin-resellers"],
    queryFn: () => list(),
  });

  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>, key: string) => {
    setBusy(key);
    setMsg("");
    try {
      const res = await fn();
      if (!res.ok) setMsg(res.message ?? "No se pudo completar la acción.");
      await query.refetch();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setBusy("");
    }
  };

  const apps = query.data?.applications ?? [];
  const members = query.data?.members ?? [];
  const pending = apps.filter((a) => a.status === "pending");
  const history = apps.filter((a) => a.status !== "pending");

  return (
    <section className="rounded-3xl border border-border bg-card/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">🤝 Revendedores</h2>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Actualizar
        </button>
      </div>

      {msg ? <p className="mt-3 text-sm font-semibold text-destructive">{msg}</p> : null}
      {query.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando...</p>
      ) : null}

      <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide">
        Solicitudes pendientes ({pending.length})
      </h3>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {pending.map((a) => (
            <div key={a.id} className="rounded-2xl border border-primary/30 bg-background/60 p-4">
              <p className="text-sm font-extrabold">
                {a.full_name || "(sin nombre)"} · {tierLabel[a.tier as "pro" | "wholesale"]}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                📞 {a.phone || "—"} · ✉️ {a.email || "—"} · 🏪 {a.business_name || "—"} · 📍{" "}
                {a.city || "—"} · 💵 {a.monthly_volume || "—"}
              </p>
              {a.notes ? <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() =>
                    act(() => review({ data: { id: a.id, approve: true, reason: "" } }), a.id)
                  }
                  className="rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground disabled:opacity-60"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => {
                    const reason = window.prompt("Motivo del rechazo (opcional)") ?? "";
                    void act(
                      () => review({ data: { id: a.id, approve: false, reason } }),
                      a.id,
                    );
                  }}
                  className="rounded-full border border-destructive/50 px-4 py-2 text-xs font-extrabold text-destructive disabled:opacity-60"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
        Niveles activos ({members.length})
      </h3>
      {members.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no hay revendedores activos.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-background/60 p-3"
            >
              <p className="text-sm font-bold">
                {m.email || m.user_id}{" "}
                <span className="text-primary">· {tierLabel[m.tier as "pro" | "wholesale"]}</span>
              </p>
              <button
                type="button"
                disabled={busy === m.user_id}
                onClick={() => {
                  if (!window.confirm("¿Quitar el nivel de revendedor a esta cuenta?")) return;
                  void act(() => revoke({ data: { userId: m.user_id } }), m.user_id);
                }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-60"
              >
                Quitar nivel
              </button>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 ? (
        <>
          <h3 className="mt-6 text-sm font-extrabold uppercase tracking-wide">Historial</h3>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {history.slice(0, 30).map((a) => (
              <p key={a.id}>
                {a.status === "approved" ? "✅" : "❌"} {a.full_name} ·{" "}
                {tierLabel[a.tier as "pro" | "wholesale"]}
                {a.review_reason ? ` · ${a.review_reason}` : ""}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
