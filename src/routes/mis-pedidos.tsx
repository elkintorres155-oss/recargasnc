import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StoreHeader } from "@/components/store/StoreHeader";
import { getMyOrders } from "@/lib/orders.functions";
import { myStockAccounts } from "@/lib/stock.functions";
import { formatC } from "@/lib/store-state";
import { STATUS_LABEL } from "@/lib/order-status";

export const Route = createFileRoute("/mis-pedidos")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mis pedidos | Recargas NC" },
      {
        name: "description",
        content:
          "Consulta el estado de tus recargas de juegos y streaming compradas en Recargas NC: pago verificado, en proceso o completada.",
      },
      { property: "og:title", content: "Mis pedidos | Recargas NC" },
      {
        property: "og:description",
        content: "Estado en vivo de tus recargas compradas en Recargas NC.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MyOrders,
});

function MyOrders() {
  const fetchOrders = useServerFn(getMyOrders);
  const fetchAccounts = useServerFn(myStockAccounts);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
    retry: false,
  });

  const accounts = useQuery({
    queryKey: ["my-stock-accounts"],
    queryFn: () => fetchAccounts(),
    retry: false,
  });

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Mis pedidos</h1>

        {isLoading ? <p className="mt-6 text-sm text-muted-foreground">Cargando...</p> : null}
        {error ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Inicia sesión para ver tus pedidos.{" "}
            <Link to="/auth" className="font-bold text-primary">
              Entrar
            </Link>
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          {(data ?? []).map((o) => (
            <div key={o.id} className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">
                  {o.product_name} · {o.pack_label}
                </p>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.order_code} · {formatC(Number(o.amount_nio))}
                {o.player_id ? ` · ID: ${o.player_id}` : ""}
              </p>
              {o.status_reason ? (
                <p className="mt-2 text-xs text-muted-foreground">{o.status_reason}</p>
              ) : null}
            </div>
          ))}
          {data && data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no tienes pedidos.</p>
          ) : null}
        </div>

        {(accounts.data?.accounts ?? []).length ? (
          <section className="mt-10">
            <h2 className="text-lg font-extrabold tracking-tight">Mis cuentas</h2>
            <div className="mt-4 space-y-3">
              {(accounts.data?.accounts ?? []).map((a) => (
                <div key={a.id} className="rounded-2xl border border-primary/40 bg-card/70 p-4">
                  <p className="font-bold capitalize">{a.service}</p>
                  <p className="mt-1 text-sm">
                    Correo: <span className="font-semibold">{a.email}</span>
                  </p>
                  <p className="text-sm">
                    Contraseña: <span className="font-semibold">{a.password}</span>
                  </p>
                  {a.profile ? <p className="text-sm">Perfil: {a.profile}</p> : null}
                  {a.pin ? <p className="text-sm">PIN: {a.pin}</p> : null}
                  {a.expires_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">Vence: {a.expires_at}</p>
                  ) : null}
                  {a.notes ? (
                    <p className="mt-1 text-xs text-muted-foreground">{a.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <Link to="/" className="mt-8 inline-block text-sm font-bold text-primary">
          ← Volver al catálogo
        </Link>
      </main>
    </div>
  );
}
