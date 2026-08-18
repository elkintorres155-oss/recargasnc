import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StoreHeader } from "@/components/store/StoreHeader";
import { getMyWallet, getMyTransactions, getMyTopups } from "@/lib/wallet.functions";
import { formatC } from "@/lib/store-state";

export const Route = createFileRoute("/saldo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mi saldo | Recargas NC" },
      {
        name: "description",
        content:
          "Consulta tu saldo en córdobas, el total recargado, el total gastado y el historial completo de movimientos de tu cuenta en Recargas NC.",
      },
      { property: "og:title", content: "Mi saldo | Recargas NC" },
      {
        property: "og:description",
        content: "Saldo, recargas y movimientos de tu cartera en Recargas NC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletPage,
});

const TX_LABEL: Record<string, string> = {
  topup: "Recarga de saldo",
  purchase: "Compra",
  refund: "Reembolso",
  bonus: "Bonificación",
  adjustment: "Ajuste de administrador",
};

const TOPUP_LABEL: Record<string, string> = {
  pending: "Pendiente de verificación",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

function WalletPage() {
  const wallet = useServerFn(getMyWallet);
  const txs = useServerFn(getMyTransactions);
  const topups = useServerFn(getMyTopups);

  const w = useQuery({ queryKey: ["wallet"], queryFn: () => wallet(), retry: false });
  const t = useQuery({ queryKey: ["wallet-tx"], queryFn: () => txs(), retry: false });
  const r = useQuery({ queryKey: ["my-topups"], queryFn: () => topups(), retry: false });

  if (w.error) {
    return (
      <div className="min-h-screen">
        <StoreHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-extrabold">Mi saldo</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Inicia sesión para ver tu saldo y tus movimientos.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground"
          >
            Entrar
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight">Mi saldo</h1>
          <Link
            to="/recargar-saldo"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground"
          >
            Recargar saldo
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card/70 p-5 glow-ring">
            <p className="text-xs text-muted-foreground">Saldo disponible</p>
            <p className="mt-1 text-3xl font-extrabold text-primary">
              {formatC(w.data?.balance ?? 0)}
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card/70 p-5">
            <p className="text-xs text-muted-foreground">Total recargado</p>
            <p className="mt-1 text-xl font-extrabold">{formatC(w.data?.toppedUp ?? 0)}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card/70 p-5">
            <p className="text-xs text-muted-foreground">Total gastado</p>
            <p className="mt-1 text-xl font-extrabold">{formatC(w.data?.spent ?? 0)}</p>
          </div>
        </div>

        {(r.data ?? []).some((x) => x.status === "pending") ? (
          <section className="mt-8">
            <h2 className="text-sm font-extrabold uppercase tracking-wide">Recargas en proceso</h2>
            <div className="mt-3 space-y-2">
              {(r.data ?? [])
                .filter((x) => x.status === "pending")
                .map((x) => (
                  <div
                    key={x.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/70 p-4"
                  >
                    <p className="text-sm font-bold">
                      {formatC(Number(x.amount_nio))} · {x.method_name}
                    </p>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                      {TOPUP_LABEL[x.status]}
                    </span>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-extrabold uppercase tracking-wide">Historial de movimientos</h2>
          {t.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Cargando...</p>
          ) : null}
          <div className="mt-3 space-y-2">
            {(t.data ?? []).map((x) => {
              const amount = Number(x.amount_nio);
              const positive = amount > 0;
              return (
                <div key={x.id} className="rounded-2xl border border-border bg-card/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">
                      {x.description || TX_LABEL[x.type] || x.type}
                    </p>
                    <p
                      className={`text-sm font-extrabold ${positive ? "text-primary" : "text-foreground"}`}
                    >
                      {positive ? "+" : "−"} {formatC(Math.abs(amount))}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TX_LABEL[x.type] ?? x.type} ·{" "}
                    {new Date(x.created_at).toLocaleString("es-NI")} · Saldo:{" "}
                    {formatC(Number(x.balance_after))}
                  </p>
                </div>
              );
            })}
            {t.data && t.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no tienes movimientos.</p>
            ) : null}
          </div>
        </section>

        <Link to="/" className="mt-8 inline-block text-sm font-bold text-primary">
          ← Volver al catálogo
        </Link>
      </main>
    </div>
  );
}
