import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminAdjustBalance,
  adminListTopups,
  adminReviewTopup,
  adminSearchWallets,
  adminUserTransactions,
} from "@/lib/wallet.functions";
import { formatC } from "@/lib/store-state";

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const STATUS: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

export function AdminWallets() {
  const qc = useQueryClient();
  const listTopups = useServerFn(adminListTopups);
  const review = useServerFn(adminReviewTopup);
  const search = useServerFn(adminSearchWallets);
  const userTx = useServerFn(adminUserTransactions);
  const adjust = useServerFn(adminAdjustBalance);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  const session = useSessionState();
  const enabled = session === "signed-in";

  const topups = useQuery({
    queryKey: ["admin-topups"],
    queryFn: () => listTopups(),
    enabled,
    retry: false,
  });

  const users = useQuery({
    queryKey: ["admin-wallets", q],
    queryFn: () => search({ data: { q } }),
    enabled,
    retry: false,
  });

  const history = useQuery({
    queryKey: ["admin-user-tx", selected],
    queryFn: () => userTx({ data: { userId: selected! } }),
    enabled: Boolean(selected),
    retry: false,
  });

  const act = async (topupId: string, approve: boolean) => {
    setMsg("");
    const motive = approve ? "" : window.prompt("Motivo del rechazo:") ?? "";
    try {
      await review({ data: { topupId, approve, reason: motive } });
      await qc.invalidateQueries({ queryKey: ["admin-topups"] });
      await qc.invalidateQueries({ queryKey: ["admin-wallets"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al procesar.");
    }
  };

  const doAdjust = async () => {
    setMsg("");
    const value = Number(amount.replace(",", "."));
    if (!selected || !value || !reason.trim()) {
      setMsg("Selecciona un usuario e ingresa monto y motivo.");
      return;
    }
    try {
      await adjust({ data: { userId: selected, amountNio: value, reason, type: "adjustment" } });
      setAmount("");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["admin-wallets"] });
      await qc.invalidateQueries({ queryKey: ["admin-user-tx", selected] });
      setMsg("Ajuste aplicado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al aplicar el ajuste.");
    }
  };

  if (topups.error || users.error) {
    return (
      <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Gestión de saldos</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Inicia sesión con una cuenta de administrador para gestionar saldos y recargas.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Gestión de saldos</h2>

      <h3 className="mt-4 text-xs font-extrabold uppercase text-muted-foreground">
        Recargas pendientes
      </h3>
      <div className="mt-3 space-y-2">
        {(topups.data ?? [])
          .filter((t) => t.status === "pending")
          .map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">
                  {formatC(Number(t.amount_nio))} · {t.method_name}
                </p>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  {STATUS[t.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.email || t.fullName || t.user_id} ·{" "}
                {new Date(t.created_at).toLocaleString("es-NI")}
                {t.reference ? ` · Ref: ${t.reference}` : ""}
              </p>
              {t.receiptUrl ? (
                <a
                  href={t.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-bold text-primary"
                >
                  Ver comprobante
                </a>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Sin comprobante adjunto.</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => act(t.id, true)}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => act(t.id, false)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-destructive"
                >
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        {topups.data && topups.data.filter((t) => t.status === "pending").length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay recargas pendientes.</p>
        ) : null}
      </div>

      <h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">Usuarios</h3>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por correo o nombre"
        className={inputCls}
      />
      <div className="mt-3 space-y-2">
        {(users.data ?? []).map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setSelected(selected === u.id ? null : u.id)}
            className={`block w-full rounded-2xl border p-4 text-left transition-colors ${
              selected === u.id ? "border-primary bg-primary/10" : "border-border bg-background/60"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">{u.email || u.fullName || u.id}</span>
              <span className="text-sm font-extrabold text-primary">{formatC(u.balance)}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Recargado {formatC(u.toppedUp)} · Gastado {formatC(u.spent)}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
          <h4 className="text-xs font-extrabold uppercase text-muted-foreground">
            Ajuste manual de saldo
          </h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="text-muted-foreground">Monto (negativo para descontar)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,-]/g, ""))}
                className={inputCls}
              />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground">Motivo</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
            </label>
          </div>
          <button
            type="button"
            onClick={doAdjust}
            className="mt-3 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground"
          >
            Aplicar ajuste
          </button>

          <h4 className="mt-5 text-xs font-extrabold uppercase text-muted-foreground">
            Historial del usuario
          </h4>
          <div className="mt-2 space-y-1">
            {(history.data ?? []).map((h) => (
              <p key={h.id} className="text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString("es-NI")} ·{" "}
                <span className="font-semibold text-foreground">
                  {Number(h.amount_nio) > 0 ? "+" : "−"} {formatC(Math.abs(Number(h.amount_nio)))}
                </span>{" "}
                · {h.description} · Saldo {formatC(Number(h.balance_after))}
              </p>
            ))}
            {history.data && history.data.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin movimientos.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-3 text-sm font-semibold text-primary">{msg}</p> : null}
    </section>
  );
}
