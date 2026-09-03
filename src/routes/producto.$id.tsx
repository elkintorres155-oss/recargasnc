import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { getMyPhone } from "@/lib/profile.functions";
import { purchaseWithBalance } from "@/lib/purchase.functions";
import { checkPlayerId } from "@/lib/provider.functions";
import { useSessionState } from "@/hooks/use-session";
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
  const { findItem } = useStore();
  const base = findItem(id);

  const [packId, setPackId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [account, setAccount] = useState<{
    service: string;
    email: string;
    password: string;
    profile: string;
    pin: string;
    notes: string;
    expiresAt: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [checkOk, setCheckOk] = useState<boolean | null>(null);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getMyWallet);
  const buy = useServerFn(purchaseWithBalance);
  const verifyId = useServerFn(checkPlayerId);
  const session = useSessionState();
  const wallet = useQuery({
    queryKey: ["wallet"],
    queryFn: () => fetchWallet(),
    retry: false,
    enabled: session === "signed-in",
  });
  const fetchPhone = useServerFn(getMyPhone);
  const profilePhone = useQuery({
    queryKey: ["profile-phone"],
    queryFn: () => fetchPhone(),
    retry: false,
    enabled: session === "signed-in",
  });
  useEffect(() => {
    if (!phoneTouched && profilePhone.data?.phone) setPhone(profilePhone.data.phone);
  }, [profilePhone.data?.phone, phoneTouched]);


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
  const cleanPhone = phone.replace(/[^\d]/g, "");
  const phoneValid = cleanPhone.length >= 8;

  const payWithBalance = async () => {
    setError("");
    setResult("");
    setAccount(null);
    if (!pack) {
      setError("Este producto aún no tiene paquetes configurados.");
      return;
    }
    if (base.needsId && !playerId.trim()) {
      setError("Ingresa tu ID de jugador para continuar.");
      return;
    }
    if (!phoneValid) {
      setPhoneTouched(true);
      setError("Ingresa tu número de teléfono (obligatorio).");
      return;
    }
    if (session !== "signed-in") {
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
          packSku: pack.sku ?? "",
          playerId: playerId.trim(),
          customerPhone: cleanPhone,
          amountNio: pack.price,
          productImageUrl: base.image.startsWith("http")
            ? base.image
            : `${window.location.origin}${base.image}`,
        },
      });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
      await qc.invalidateQueries({ queryKey: ["profile-phone"] });
      if (!res.ok && "insufficient" in res && res.insufficient) {
        setError(`Saldo insuficiente. Te faltan ${formatC(res.missing)} para completar esta compra.`);
      } else if (!res.ok) {
        setError(res.message);
      } else {
        if ("account" in res && res.account) setAccount(res.account);
        setResult(
          "account" in res && res.account
            ? "¡Listo! Tu compra se realizó correctamente."
            : "¡Listo! Tu recarga se realizó correctamente.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar la compra.");
    } finally {
      setBusy(false);
    }
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
                <button
                  type="button"
                  onClick={verify}
                  disabled={checking}
                  className="mt-2 rounded-full border border-border px-4 py-2 text-xs font-extrabold text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  {checking ? "Verificando..." : "Verificar ID"}
                </button>
                {checkMsg ? (
                  <p
                    className={`mt-2 text-xs font-semibold ${checkOk ? "text-primary" : "text-destructive"}`}
                  >
                    {checkMsg}
                  </p>
                ) : null}
              </>
            ) : null}

            <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
              {base.needsId ? "3." : "2."} Tu número de teléfono{" "}
              <span className="text-destructive">*</span>
            </h2>
            <input
              value={phone}
              inputMode="tel"
              required
              onChange={(e) => {
                setPhoneTouched(true);
                setPhone(e.target.value);
              }}
              placeholder="Ej: 8888 8888"
              className="mt-3 w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Obligatorio: lo usamos si necesitamos contactarte sobre tu recarga. La factura llega
              a tu correo.
            </p>
            {phoneTouched && !phoneValid ? (
              <p className="mt-1 text-xs font-semibold text-destructive">
                Ingresa un número válido (mínimo 8 dígitos).
              </p>
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
              <div className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-4">
                <p className="text-sm font-semibold text-primary">{result}</p>
                {account ? (
                  <div className="mt-3 rounded-xl border border-border bg-card/80 p-4">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                      Tu cuenta ({account.service})
                    </p>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Correo</dt>
                        <dd className="font-mono font-bold select-all">{account.email}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Contraseña</dt>
                        <dd className="font-mono font-bold select-all">{account.password}</dd>
                      </div>
                      {account.profile ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Perfil</dt>
                          <dd className="font-bold">{account.profile}</dd>
                        </div>
                      ) : null}
                      {account.pin ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">PIN</dt>
                          <dd className="font-mono font-bold select-all">{account.pin}</dd>
                        </div>
                      ) : null}
                      {account.expiresAt ? (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Vence</dt>
                          <dd className="font-bold">{account.expiresAt}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {account.notes ? (
                      <p className="mt-2 text-xs text-muted-foreground">{account.notes}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      También puedes verla cuando quieras en{" "}
                      <Link to="/mis-pedidos" className="font-bold text-primary">
                        Mis pedidos
                      </Link>
                      .
                    </p>
                  </div>
                ) : null}
              </div>
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
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
