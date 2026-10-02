import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminAddExpense,
  adminDeleteExpense,
  adminFinances,
  adminListPayments,
  adminPaymentAudit,
} from "@/lib/payments.functions";
import { adminReviewTopup } from "@/lib/wallet.functions";
import { formatC } from "@/lib/store-state";
import { useSessionState } from "@/hooks/use-session";

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const PS: Record<string, string> = {
  payment_pending: "Pendiente",
  payment_submitted: "Enviado",
  payment_review: "En revisión",
  payment_approved: "Aprobado",
  payment_rejected: "Rechazado",
};

type Filter = "all" | "payment_submitted" | "payment_review" | "payment_approved" | "payment_rejected";

export function AdminPayments() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPayments);
  const audit = useServerFn(adminPaymentAudit);
  const review = useServerFn(adminReviewTopup);
  const enabled = useSessionState() === "signed-in";
  const [filter, setFilter] = useState<Filter>("payment_review");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const rows = useQuery({
    queryKey: ["admin-payments", filter],
    queryFn: () => list({ data: { status: filter } }),
    enabled,
    retry: false,
  });
  const log = useQuery({
    queryKey: ["admin-payment-audit", open],
    queryFn: () => audit({ data: { topupId: open! } }),
    enabled: Boolean(open),
    retry: false,
  });

  const act = async (id: string, approve: boolean) => {
    const reason = approve ? "" : window.prompt("Motivo del rechazo:") ?? "";
    setBusy(id);
    setMsg("");
    try {
      const r = await review({ data: { topupId: id, approve, reason } });
      setMsg(r?.message ?? "Listo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error.");
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["admin-payments"] });
    }
  };

  if (!enabled || rows.error)
    return <p className="mt-6 text-sm text-muted-foreground">Inicia sesión como administrador.</p>;

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Pagos recibidos</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["payment_review", "payment_submitted", "payment_approved", "payment_rejected", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${filter === f ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            {f === "all" ? "Todos" : PS[f]}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {(rows.data ?? []).map((t) => (
          <div key={t.id} className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {formatC(Number(t.amount_nio))} · {t.method_name}
              </p>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                {PS[t.payment_status ?? ""] ?? t.payment_status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.customer || t.user_id} · {new Date(t.created_at).toLocaleString("es-NI")}
            </p>
            <p className="text-xs text-muted-foreground">
              Ref. interna: {t.internal_reference || "—"} · Ref. banco: {t.bank_reference || t.reference || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              Gmail: {t.gmail_message_id ? `encontrado (${t.gmail_from ?? ""})` : "sin correo"}
            </p>
            {t.ai_notes ? <p className="mt-1 text-xs">{t.ai_notes}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {t.receiptUrl ? (
                <a href={t.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary">
                  Ver comprobante
                </a>
              ) : null}
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="text-xs font-bold text-primary">
                {open === t.id ? "Ocultar historial" : "Ver historial"}
              </button>
            </div>
            {open === t.id ? (
              <div className="mt-2 space-y-1">
                {(log.data ?? []).map((a, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("es-NI")} · <span className="font-semibold text-foreground">{a.step}</span>
                  </p>
                ))}
              </div>
            ) : null}
            {t.status === "pending" ? (
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy !== null} onClick={() => act(t.id, true)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-primary-foreground disabled:opacity-50">
                  {busy === t.id ? "Procesando…" : "Aprobar"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => act(t.id, false)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {rows.data && rows.data.length === 0 ? <p className="text-sm text-muted-foreground">No hay pagos aquí.</p> : null}
      </div>
      {msg ? <p className="mt-3 text-sm font-semibold text-primary">{msg}</p> : null}
    </section>
  );
}

export function AdminFinances() {
  const qc = useQueryClient();
  const fin = useServerFn(adminFinances);
  const add = useServerFn(adminAddExpense);
  const del = useServerFn(adminDeleteExpense);
  const enabled = useSessionState() === "signed-in";
  const q = useQuery({ queryKey: ["admin-finances"], queryFn: () => fin(), enabled, retry: false });
  const [f, setF] = useState({ description: "", category: "General", amount: "", currency: "NIO" as "NIO" | "USD", spentOn: new Date().toISOString().slice(0, 10), note: "" });
  const [msg, setMsg] = useState("");

  const save = async () => {
    const amount = Number(f.amount.replace(",", "."));
    if (!f.description.trim() || !amount) return setMsg("Escribe descripción y monto.");
    try {
      await add({ data: { ...f, amount } });
      setF({ ...f, description: "", amount: "", note: "" });
      setMsg("Gasto guardado.");
      await qc.invalidateQueries({ queryKey: ["admin-finances"] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error.");
    }
  };

  if (!enabled || q.error)
    return <p className="mt-6 text-sm text-muted-foreground">Inicia sesión como administrador.</p>;
  const d = q.data;
  const cards: Array<[string, string]> = d
    ? [
        ["Vendido", formatC(d.totalSold)],
        ["Recibido (pagos aprobados)", formatC(d.totalReceived)],
        ["Costo proveedores", formatC(d.providerCost)],
        ["Ganancia bruta", formatC(d.grossProfit)],
        ["Gastos", formatC(d.totalExpenses)],
        ["Ganancia neta", formatC(d.netProfit)],
        ["Ventas hoy", formatC(d.salesToday)],
        ["Ventas del mes", formatC(d.salesMonth)],
        ["Pagos pendientes", String(d.pending)],
        ["En revisión", String(d.review)],
        ["Aprobados", String(d.approved)],
        ["Rechazados", String(d.rejected)],
      ]
    : [];

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Finanzas</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 text-lg font-extrabold">{v}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">Agregar gasto</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Descripción<input className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="text-sm">Categoría<input className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
        <label className="text-sm">Monto<input className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, "") })} /></label>
        <label className="text-sm">Moneda
          <select className={inputCls} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as "NIO" | "USD" })}>
            <option value="NIO">Córdobas</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        <label className="text-sm">Fecha<input type="date" className={inputCls} value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} /></label>
        <label className="text-sm">Nota<input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <button type="button" onClick={save} className="mt-3 rounded-full bg-primary px-5 py-2 text-xs font-extrabold text-primary-foreground">Guardar gasto</button>
      {msg ? <p className="mt-2 text-sm font-semibold text-primary">{msg}</p> : null}

      <h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">Gastos registrados</h3>
      <div className="mt-2 space-y-1">
        {(d?.expenses ?? []).map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
            <span>{e.spent_on} · {e.category} · {e.description}</span>
            <span className="flex items-center gap-3">
              <b>{e.currency === "USD" ? `$${Number(e.amount).toFixed(2)}` : formatC(Number(e.amount))}</b>
              <button type="button" className="text-destructive" onClick={async () => { await del({ data: { id: e.id } }); await qc.invalidateQueries({ queryKey: ["admin-finances"] }); }}>Eliminar</button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
