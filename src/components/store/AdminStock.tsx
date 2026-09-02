import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkCreateStock,
  createStockAccount,
  deleteStockAccount,
  listStock,
  listStockMovements,
  updateStockAccount,
  STOCK_STATUS_LABEL,
  type StockStatus,
} from "@/lib/stock.functions";

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

const STATUSES: StockStatus[] = ["available", "reserved", "sold", "suspended", "expired"];

const PLATFORMS = [
  "netflix",
  "disney+",
  "max",
  "prime video",
  "spotify",
  "youtube premium",
  "crunchyroll",
  "paramount+",
  "vix+",
  "apple tv+",
  "canva pro",
  "chatgpt plus",
];

const DURATIONS: { label: string; days: number | null }[] = [
  { label: "Sin vencimiento", days: null },
  { label: "1 semana", days: 7 },
  { label: "15 días", days: 15 },
  { label: "1 mes", days: 30 },
  { label: "2 meses", days: 60 },
  { label: "3 meses", days: 90 },
  { label: "6 meses", days: 180 },
  { label: "1 año", days: 365 },
];

function dateAfter(days: number | null): string {
  if (days === null) return "";
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().slice(0, 10);
}

export function AdminStock() {
  const qc = useQueryClient();
  const fetchStock = useServerFn(listStock);
  const fetchMovements = useServerFn(listStockMovements);
  const createOne = useServerFn(createStockAccount);
  const bulk = useServerFn(bulkCreateStock);
  const updateOne = useServerFn(updateStockAccount);
  const removeOne = useServerFn(deleteStockAccount);

  const [service, setService] = useState("");
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState("");
  const [showMoves, setShowMoves] = useState(false);

  const [form, setForm] = useState({
    service: "",
    customService: "",
    email: "",
    password: "",
    profile: "",
    pin: "",
    notes: "",
    duration: "30",
  });
  const [bulkForm, setBulkForm] = useState({ service: "", customService: "", text: "", duration: "30" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["stock", service, status],
    queryFn: () => fetchStock({ data: { service, status } }),
    retry: false,
  });

  const movements = useQuery({
    queryKey: ["stock-movements"],
    queryFn: () => fetchMovements(),
    enabled: showMoves,
    retry: false,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["stock"] });
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
  };

  return (
    <section className="rounded-3xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Stock de cuentas</h2>

      {error ? (
        <p className="mt-3 text-xs font-semibold text-destructive">
          No se pudo cargar el inventario (inicia sesión como administrador).
        </p>
      ) : null}

      {/* Resumen */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(data?.summary ?? []).map((s) => (
          <div key={s.service} className="rounded-2xl border border-border bg-background px-3 py-2">
            <p className="text-xs font-extrabold uppercase">{s.service}</p>
            <p className="text-[11px] text-muted-foreground">
              {s.counts["available"] ?? 0} disponibles · {s.counts["sold"] ?? 0} vendidas
            </p>
          </div>
        ))}
        {!isLoading && !(data?.summary ?? []).length ? (
          <p className="text-xs text-muted-foreground">Todavía no hay cuentas en el inventario.</p>
        ) : null}
      </div>

      {/* Alta individual */}
      <div className="mt-6 rounded-2xl border border-border/60 p-4">
        <h3 className="text-xs font-extrabold uppercase text-muted-foreground">Agregar cuenta</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="text-muted-foreground">Plataforma</span>
            <select
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
              className={inputCls}
            >
              <option value="">Elegir plataforma...</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              <option value="__otra">Otra (escribir)</option>
            </select>
            {form.service === "__otra" ? (
              <input
                value={form.customService}
                onChange={(e) => setForm({ ...form, customService: e.target.value })}
                placeholder="nombre del servicio"
                className={inputCls}
              />
            ) : null}
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Duración</span>
            <select
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              className={inputCls}
            >
              {DURATIONS.map((d) => (
                <option key={d.label} value={String(d.days ?? "")}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Correo</span>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Contraseña</span>
            <input
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Perfil</span>
            <input
              value={form.profile}
              onChange={(e) => setForm({ ...form, profile: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">PIN</span>
            <input
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              className={inputCls}
            />
          </label>
          <label className="text-xs sm:col-span-3">
            <span className="text-muted-foreground">Notas</span>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={async () => {
            setMsg("");
            const svc = (form.service === "__otra" ? form.customService : form.service).trim();
            if (!svc || !form.email.trim() || !form.password.trim()) {
              setMsg("Plataforma, correo y contraseña son obligatorios.");
              return;
            }
            try {
              const res = await createOne({
                data: {
                  service: svc,
                  email: form.email,
                  password: form.password,
                  profile: form.profile,
                  pin: form.pin,
                  notes: form.notes,
                  expiresAt: dateAfter(form.duration ? Number(form.duration) : null),
                  status: "available",
                },
              });
              setMsg(res.ok ? "Cuenta agregada." : (res.message ?? "Error"));
              if (res.ok) setForm({ ...form, email: "", password: "", profile: "", pin: "", notes: "" });
              refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "No se pudo agregar la cuenta.");
            }
          }}

          className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
        >
          Agregar cuenta
        </button>
      </div>

      {/* Alta masiva */}
      <div className="mt-4 rounded-2xl border border-border/60 p-4">
        <h3 className="text-xs font-extrabold uppercase text-muted-foreground">Alta masiva</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Una cuenta por línea con el formato <code>correo:contraseña:perfil:pin</code> (perfil y PIN
          opcionales).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="text-muted-foreground">Servicio</span>
            <input
              value={bulkForm.service}
              onChange={(e) => setBulkForm({ ...bulkForm, service: e.target.value })}
              placeholder="netflix"
              className={inputCls}
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Vence (AAAA-MM-DD)</span>
            <input
              value={bulkForm.expiresAt}
              onChange={(e) => setBulkForm({ ...bulkForm, expiresAt: e.target.value })}
              className={inputCls}
            />
          </label>
        </div>
        <textarea
          value={bulkForm.text}
          onChange={(e) => setBulkForm({ ...bulkForm, text: e.target.value })}
          rows={5}
          placeholder={"correo1@mail.com:clave123\ncorreo2@mail.com:clave456:Perfil 1:1234"}
          className={`${inputCls} font-mono`}
        />
        <button
          type="button"
          onClick={async () => {
            setMsg("");
            const svc = bulkForm.service.trim();
            if (!svc) {
              setMsg("Escribe el servicio (ej. netflix) antes de agregar.");
              return;
            }
            if (!bulkForm.text.trim()) {
              setMsg("Pega al menos una línea correo:contraseña.");
              return;
            }
            try {
              const res = await bulk({ data: { ...bulkForm, service: svc } });
              setMsg(res.ok ? `${res.created} cuentas agregadas.` : res.message);
              if (res.ok) setBulkForm({ ...bulkForm, text: "" });
              refresh();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "No se pudo agregar el stock.");
            }
          }}

          className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-extrabold text-primary-foreground"
        >
          Agregar en masa
        </button>
      </div>

      {msg ? <p className="mt-3 text-xs font-semibold text-primary">{msg}</p> : null}

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="">Todos los servicios</option>
          {(data?.services ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-xs"
        >
          <option value="">Todos los estados</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STOCK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowMoves((v) => !v)}
          className="rounded-full border border-border px-3 py-2 text-xs font-semibold"
        >
          {showMoves ? "Ocultar historial" : "Ver historial"}
        </button>
      </div>

      {/* Lista */}
      <div className="mt-4 space-y-2">
        {isLoading ? <p className="text-xs text-muted-foreground">Cargando...</p> : null}
        {(data?.accounts ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">
                {a.service} · {a.email}
              </p>
              <select
                value={a.status}
                onChange={async (e) => {
                  await updateOne({ data: { id: a.id, status: e.target.value as StockStatus } });
                  refresh();
                }}
                className="rounded-full border border-border bg-secondary px-3 py-1 text-[11px] font-semibold"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STOCK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Clave: {a.password || "—"}
              {a.profile ? ` · Perfil: ${a.profile}` : ""}
              {a.pin ? ` · PIN: ${a.pin}` : ""}
              {a.expires_at ? ` · Vence: ${a.expires_at}` : ""}
            </p>
            {a.order ? (
              <p className="mt-1 text-[11px] text-primary">
                Entregada en {a.order.order_code} · {a.customer?.email ?? a.customer?.full_name ?? ""}
                {a.assigned_at ? ` · ${new Date(a.assigned_at).toLocaleString("es-NI")}` : ""}
              </p>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`¿Eliminar ${a.email}?`)) return;
                await removeOne({ data: { id: a.id } });
                refresh();
              }}
              className="mt-2 text-[11px] font-semibold text-destructive"
            >
              Eliminar
            </button>
          </div>
        ))}
        {data && data.accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cuentas para este filtro.</p>
        ) : null}
      </div>

      {/* Historial */}
      {showMoves ? (
        <div className="mt-6 space-y-1">
          <h3 className="text-xs font-extrabold uppercase text-muted-foreground">Movimientos</h3>
          {(movements.data?.movements ?? []).map((m) => (
            <p key={m.id} className="text-[11px] text-muted-foreground">
              {new Date(m.created_at).toLocaleString("es-NI")} · {m.action} · {m.service} ·{" "}
              {m.account_email} {m.order_code ? `· ${m.order_code}` : ""} {m.note ? `· ${m.note}` : ""}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
