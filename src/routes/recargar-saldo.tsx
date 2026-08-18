import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { StoreHeader } from "@/components/store/StoreHeader";
import { createTopupRequest, TOPUP_METHODS, type TopupMethod } from "@/lib/wallet.functions";
import { formatC, useStore } from "@/lib/store-state";

export const Route = createFileRoute("/recargar-saldo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Recargar saldo | Recargas NC" },
      {
        name: "description",
        content:
          "Recarga saldo en córdobas con Binance, BAC, LAFISE o BANPRO y úsalo para comprar diamantes, Robux y suscripciones al instante.",
      },
      { property: "og:title", content: "Recargar saldo | Recargas NC" },
      {
        property: "og:description",
        content: "Agrega saldo a tu cuenta de Recargas NC con Binance, BAC, LAFISE o BANPRO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TopupPage,
});

const METHOD_NAME: Record<TopupMethod, string> = {
  binance: "Binance",
  bac: "BAC",
  lafise: "LAFISE",
  banpro: "BANPRO",
};

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary";

function TopupPage() {
  const navigate = useNavigate();
  const { banks } = useStore();
  const submit = useServerFn(createTopupRequest);
  const fileRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState<TopupMethod>("binance");
  const [amount, setAmount] = useState("100");
  const [reference, setReference] = useState("");
  const [image, setImage] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const bank = banks.find(
    (b) => b.name.toLowerCase().includes(method) || b.id.toLowerCase().includes(method),
  );
  const value = Number(amount.replace(",", "."));

  const send = async () => {
    setMsg("");
    if (!(value > 0)) {
      setMsg("Ingresa un monto válido en córdobas.");
      return;
    }
    if (!image) {
      setMsg("Sube el comprobante de tu pago para poder verificarlo.");
      return;
    }
    setBusy(true);
    try {
      await submit({
        data: {
          method,
          methodName: METHOD_NAME[method],
          amountNio: value,
          reference: reference.trim(),
          imageDataUrl: image,
        },
      });
      navigate({ to: "/saldo" });
    } catch (e) {
      setMsg(
        e instanceof Error && e.message.includes("Unauthorized")
          ? "Inicia sesión para recargar saldo."
          : e instanceof Error
            ? e.message
            : "No se pudo enviar la solicitud.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">Recargar saldo</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paga con tu método preferido y sube el comprobante. Tu saldo se acredita al verificarlo.
        </p>

        <section className="mt-6 rounded-3xl border border-border bg-card/70 p-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wide">1. Método de pago</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {TOPUP_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  m === method
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card/70 text-muted-foreground hover:text-foreground"
                }`}
              >
                {METHOD_NAME[m]}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4 text-sm">
            {bank ? (
              <>
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
                {bank.note ? <p className="mt-1 text-xs text-muted-foreground">{bank.note}</p> : null}
              </>
            ) : (
              <p className="text-muted-foreground">
                Configura la cuenta de {METHOD_NAME[method]} desde el panel de administración.
              </p>
            )}
            {method === "binance" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Cuando la confirmación automática esté activa, tu saldo se acreditará solo al
                detectarse el pago.
              </p>
            ) : null}
          </div>

          <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">2. Monto</h2>
          <label className="block text-sm">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
              className={inputCls}
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {[100, 200, 500, 1000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {formatC(v)}
              </button>
            ))}
          </div>

          <h2 className="mt-6 text-sm font-extrabold uppercase tracking-wide">
            3. Referencia y comprobante
          </h2>
          <label className="block text-sm">
            <span className="text-muted-foreground">Número de referencia / transacción</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej: 987654321"
              className={inputCls}
            />
          </label>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => setImage(String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            📷 {image ? "Cambiar comprobante" : "Subir comprobante"}
          </button>
          {image ? (
            <img
              src={image}
              alt="Comprobante"
              className="mt-3 max-h-48 rounded-2xl border border-border object-contain"
            />
          ) : null}

          {msg ? <p className="mt-4 text-sm font-semibold text-destructive">{msg}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={send}
            className="mt-5 w-full rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Enviando..." : `Solicitar recarga de ${formatC(value || 0)}`}
          </button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Quedará como <strong>pendiente de verificación</strong> hasta que se confirme el pago.
          </p>
        </section>

        <Link to="/saldo" className="mt-8 inline-block text-sm font-bold text-primary">
          ← Volver a mi saldo
        </Link>
      </main>
    </div>
  );
}
