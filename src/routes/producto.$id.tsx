import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { purchaseWithBalance } from "@/lib/purchase.functions";
import { StoreHeader } from "@/components/store/StoreHeader";
import { findProduct } from "@/components/store/data";
import { formatC, useStore } from "@/lib/store-state";

export const Route = createFileRoute("/producto/$id")({
  head: ({ params }) => {
    const p = findProduct(params.id);
    const title = p ? `${p.name} — Recarga en córdobas | Recargas` : "Producto | Recargas";
    const description = p
      ? `Compra ${p.name} con entrega inmediata. Paquetes desde ${formatC(Math.min(...p.packs.map((k) => k.price)))} en córdobas.`
      : "Recargas de juegos, streaming y gift cards en córdobas.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { settings, findItem, banks } = useStore();
  const base = findItem(id);

  const activeBanks = banks.filter((b) => b.enabled);
  const [packId, setPackId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [bankId, setBankId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getMyWallet);
  const buy = useServerFn(purchaseWithBalance);
  const wallet = useQuery({ queryKey: ["wallet"], queryFn: () => fetchWallet(), retry: false });

  if (!base) {
    return (
      <div className="min-h-screen">
        <StoreHeader />
        <main className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-extrabold">Producto no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Puede que haya sido eliminado desde el panel de administración.
          </p>
          <Link to="/" className="mt-6 inline-block text-sm font-bold text-primary">
            ← Volver al catálogo
          </Link>
        </main>
      </div>
    );
  }

  const pack = base.packs.find((p) => p.id === packId) ?? base.packs[0];
  const bank = activeBanks.find((b) => b.id === bankId) ?? activeBanks[0];

  const payWithBalance = async () => {
    setError("");
    setResult("");
    if (!pack) {
      setError("Este producto aún no tiene paquetes configurados.");
      return;
    }
    if (base.needsId && !playerId.trim()) {
      setError("Ingresa tu ID de jugador para continuar.");
      return;
    }
    if (!wallet.data) {
      navigate({ to: "/auth" });
      return;
    }
    setBusy(true);
    try {
      const res = await buy({
        data: {
          productId: base.id,
          productName: base.name,
          packId: pack.id,
          packLabel: pack.label,
          playerId: playerId.trim(),
          amountNio: pack.price,
        },
      });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      if (!res.ok && "insufficient" in res && res.insufficient) {
        setError(`Saldo insuficiente. Te faltan ${formatC(res.missing)} para completar esta compra.`);
      } else if (!res.ok) {
        setError(res.message);
      } else {
        setResult(`¡Listo! Orden ${res.orderCode}. ${res.message}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la compra.");
    } finally {
      setBusy(false);
    }
  };

  const order = () => {
    if (base.needsId && !playerId.trim()) {
      setError("Ingresa tu ID de jugador para continuar.");
      return;
    }
    if (!pack) {
      setError("Este producto aún no tiene paquetes configurados.");
      return;
    }
    setError("");
    const msg = `Hola ${settings.storeName}! Quiero comprar:%0A• Producto: ${base.name}%0A• Paquete: ${pack.label}%0A• Precio: ${formatC(pack.price)}${
      base.needsId ? `%0A• ID de jugador: ${playerId}` : ""
    }${bank ? `%0A• Pago: ${bank.name}${bank.account ? ` (${bank.account})` : ""}${bank.holder ? ` - ${bank.holder}` : ""}` : ""}`;
    window.open(`https://wa.me/${settings.whatsapp}?text=${msg}`, "_blank");
  };

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="text-sm font-semibold text-muted-foreground hover:text-foreground">
          ← Volver al catálogo
        </Link>

        <div className="mt-5 grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="overflow-hidden rounded-3xl border border-border glow-ring">
            <img
              src={base.image}
              alt={base.name}
              width={640}
              height={640}
              className="w-full object-cover"
            />
          </div>

          <div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
              {base.tag}
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">{base.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Entrega inmediata y verificada. Precios en córdobas (C$).
            </p>

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
              1. Elige tu paquete
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {base.packs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPackId(p.id)}
                  className={`rounded-2xl border p-3 text-left transition-colors ${
                    p.id === pack?.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/70 hover:border-primary/50"
                  }`}
                >
                  <span className="block text-sm font-bold">{p.label}</span>
                  <span className="mt-1 block text-sm font-extrabold text-primary">
                    {formatC(p.price)}
                  </span>
                </button>
              ))}
            </div>

            {base.needsId ? (
              <>
                <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
                  2. Tu ID de jugador
                </h2>
                <input
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  placeholder="Ej: 123456789"
                  className="mt-3 w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary"
                />
              </>
            ) : null}

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
              {base.needsId ? "3." : "2."} Método de pago
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeBanks.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBankId(b.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                    b.id === bank?.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>

            {bank ? (
              <div className="mt-3 rounded-2xl border border-border bg-card/70 p-4 text-sm">
                <p className="font-bold">{bank.name}</p>
                {bank.account ? (
                  <p className="mt-1 text-muted-foreground">
                    Cuenta: <span className="font-semibold text-foreground">{bank.account}</span>
                  </p>
                ) : null}
                {bank.holder ? (
                  <p className="text-muted-foreground">
                    Titular: <span className="font-semibold text-foreground">{bank.holder}</span>
                  </p>
                ) : null}
                {bank.note ? <p className="text-xs text-muted-foreground">{bank.note}</p> : null}
              </div>
            ) : null}

            {error ? <p className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}

            {wallet.data ? (
              <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Tu saldo:{" "}
                    <span className="font-extrabold text-primary">
                      {formatC(wallet.data.balance)}
                    </span>
                  </p>
                  <Link to="/recargar-saldo" className="text-xs font-bold text-primary">
                    Recargar saldo
                  </Link>
                </div>
                {pack && wallet.data.balance < pack.price ? (
                  <p className="mt-2 text-xs font-semibold text-destructive">
                    Saldo insuficiente. Te faltan {formatC(pack.price - wallet.data.balance)} para
                    completar esta compra.
                  </p>
                ) : null}
              </div>
            ) : null}

            {result ? (
              <p className="mt-4 text-sm font-semibold text-primary">{result}</p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card/70 p-4">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Total a pagar</p>
                <p className="text-2xl font-extrabold text-primary">
                  {pack ? formatC(pack.price) : "—"}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={payWithBalance}
                className="rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Procesando..." : "Pagar con mi saldo"}
              </button>
              <button
                type="button"
                onClick={order}
                className="rounded-full border border-border px-6 py-3 text-sm font-extrabold text-muted-foreground hover:text-foreground"
              >
                Comprar por WhatsApp
              </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
