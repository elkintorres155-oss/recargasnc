import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { applyForReseller } from "@/lib/reseller.functions";
import { useResellerTier } from "@/hooks/use-reseller";
import { tierLabel } from "@/lib/pricing";

type Tier = "pro" | "wholesale";

const TIERS: Record<
  Tier,
  { title: string; emoji: string; accent: string; perks: string[]; cta: string }
> = {
  pro: {
    title: "REVENDEDOR PRO",
    emoji: "🔵",
    accent: "from-primary/25 to-primary/5 border-primary/40",
    perks: ["Precios especiales", "Mejores márgenes", "Recargas rápidas", "Soporte"],
    cta: "SOLICITAR PRO",
  },
  wholesale: {
    title: "MAYORISTA",
    emoji: "🟣",
    accent: "from-fuchsia-500/25 to-fuchsia-500/5 border-fuchsia-400/40",
    perks: [
      "Precios preferenciales",
      "Mayor margen",
      "Ideal para vender por volumen",
      "Soporte prioritario",
    ],
    cta: "SOLICITAR MAYORISTA",
  },
};

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function ApplyForm({ tier, onDone }: { tier: Tier; onDone: () => void }) {
  const apply = useServerFn(applyForReseller);
  const { refetch } = useResellerTier();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [monthlyVolume, setMonthlyVolume] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async () => {
    setError("");
    if (fullName.trim().length < 3) return setError("Escribe tu nombre completo.");
    if (phone.replace(/\D/g, "").length < 8) return setError("Escribe un teléfono válido.");
    setBusy(true);
    try {
      const res = await apply({
        data: {
          tier,
          fullName: fullName.trim(),
          phone: phone.replace(/\D/g, ""),
          businessName: businessName.trim(),
          city: city.trim(),
          monthlyVolume: monthlyVolume.trim(),
          notes: notes.trim(),
        },
      });
      if (!res.ok) setError(res.message);
      else {
        setDone(res.message);
        void refetch();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/10 p-5 text-center">
        <p className="text-3xl">✅</p>
        <p className="mt-2 text-sm font-bold text-primary">{done}</p>
        <button
          type="button"
          onClick={onDone}
          className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-foreground"
        >
          Entendido
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-extrabold">
        Solicitud · {tier === "pro" ? "Revendedor PRO" : "Mayorista"}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Nombre completo *</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Teléfono (WhatsApp) *</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Nombre de tu negocio</span>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Ciudad</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground">¿Cuánto vendes al mes aproximadamente?</span>
          <input
            value={monthlyVolume}
            onChange={(e) => setMonthlyVolume(e.target.value)}
            placeholder="Ej: C$ 10,000"
            className={inputCls}
          />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className="text-muted-foreground">Comentario (opcional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </label>
      </div>
      {error ? <p className="mt-3 text-sm font-semibold text-destructive">{error}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Enviando..." : "Enviar solicitud"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-muted-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Modal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { session, tier, application } = useResellerTier();
  const [chosen, setChosen] = useState<Tier | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const choose = (t: Tier) => {
    if (session !== "signed-in") {
      navigate({ to: "/auth" });
      return;
    }
    setChosen(t);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-rise my-8 w-full max-w-3xl rounded-3xl border border-primary/30 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight">
              PROGRAMA DE <span className="text-gradient-animated">REVENDEDORES</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vende recargas, consigue mejores precios y aumenta tus ganancias.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {tier !== "public" ? (
          <p className="mt-4 rounded-2xl border border-primary/40 bg-primary/10 p-3 text-sm font-bold text-primary">
            Tu cuenta ya es {tierLabel[tier]}: ves tus precios especiales automáticamente.
          </p>
        ) : application?.status === "pending" ? (
          <p className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm font-semibold">
            Tu solicitud está en revisión. Te notificaremos cuando sea aprobada.
          </p>
        ) : application?.status === "rejected" ? (
          <p className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            Tu última solicitud fue rechazada{application.review_reason ? `: ${application.review_reason}` : "."} Puedes
            volver a solicitarla.
          </p>
        ) : null}

        {chosen ? (
          <div className="mt-5">
            <ApplyForm tier={chosen} onDone={() => setChosen(null)} />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(Object.keys(TIERS) as Tier[]).map((t) => {
              const info = TIERS[t];
              return (
                <div
                  key={t}
                  className={`rounded-3xl border bg-gradient-to-b p-5 transition-transform hover:-translate-y-1 ${info.accent}`}
                >
                  <p className="text-lg font-extrabold">
                    {info.emoji} {info.title}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                    {info.perks.map((p) => (
                      <li key={p}>✓ {p}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => choose(t)}
                    className="mt-5 w-full rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    {info.cta}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Anuncio del programa de revendedores con acceso directo. */
export function ResellerBanner() {
  const [open, setOpen] = useState(false);
  const { tier } = useResellerTier();

  return (
    <>
      <div className="animate-rise card-shine mt-5 flex flex-wrap items-center gap-4 rounded-3xl border border-primary/40 bg-gradient-to-r from-primary/20 via-card to-fuchsia-500/10 p-5 [animation-delay:0.2s]">
        <span aria-hidden className="text-3xl">
          🚀
        </span>
        <div className="min-w-[220px] flex-1">
          <p className="text-base font-extrabold tracking-tight">PROGRAMA DE REVENDEDORES</p>
          <p className="text-sm text-muted-foreground">
            Vende recargas, consigue mejores precios y aumenta tus ganancias.
            {tier !== "public" ? ` Nivel activo: ${tierLabel[tier]}.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="animate-glow rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground transition-transform hover:scale-105"
        >
          ÚNETE AL PROGRAMA
        </button>
      </div>
      {open ? <Modal onClose={() => setOpen(false)} /> : null}
    </>
  );
}
