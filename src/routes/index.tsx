import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { Catalog } from "@/components/store/Catalog";
import { ResellerBanner } from "@/components/store/ResellerProgram";
import { useStore } from "@/lib/store-state";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Recargas | Recargas de juegos, streaming y gift cards" },
      {
        name: "description",
        content:
          "Recargas de Free Fire, Roblox, PUBG y más, suscripciones de streaming y gift cards con entrega inmediata y precios en córdobas (C$).",
      },
      { property: "og:title", content: "Recargas | Recargas de juegos, streaming y gift cards" },
      {
        property: "og:description",
        content:
          "Recargas de Free Fire, Roblox, PUBG y más, suscripciones de streaming y gift cards con entrega inmediata y precios en córdobas (C$).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { settings } = useStore();
  const [closed, setClosed] = useState(false);
  const showPromo = settings.showPromo && !closed;

  return (
    <div className="min-h-screen">
      <StoreHeader />

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-6">
          {showPromo ? (
            <div className="animate-rise mt-5 flex items-start gap-3 rounded-2xl border border-primary/30 bg-card/80 p-4 [animation-delay:0.15s]">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-lg"
              >
                🎁
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-muted-foreground">{settings.promoText}</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => setClosed(true)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>
          ) : null}

          <ResellerBanner />
        </section>

        <section className="mx-auto max-w-3xl px-4 py-14 text-center">
          <span className="animate-pop inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            ⚡ Entrega inmediata &amp; verificada
          </span>
          <h1 className="animate-blur-in mt-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl [animation-delay:0.1s]">
            Todo lo que juegas y ves,{" "}
            <span className="text-gradient-animated">en un solo lugar</span>
          </h1>
          <p className="animate-rise mt-4 text-base text-muted-foreground [animation-delay:0.25s]">
            Recargas de juegos, suscripciones de streaming y gift cards. Precios en
            córdobas (C$) para Nicaragua, atención inmediata por WhatsApp.
          </p>
          <div className="reveal-stagger mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>
              ⚡ Entrega <strong className="text-foreground">inmediata</strong>
            </span>
            <span aria-hidden>•</span>
            <span>
              🔒 Proceso <strong className="text-foreground">seguro</strong>
            </span>
            <span aria-hidden>•</span>
            <span>
              💎 Mejor <strong className="text-foreground">precio</strong>
            </span>
          </div>
        </section>

        <Catalog />
      </main>

      <footer className="border-t border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="text-base font-extrabold">
            {settings.storeName.split(" ")[0]}{" "}
            <span className="text-primary">
              {settings.storeName.split(" ").slice(1).join(" ")}
            </span>
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Centro de recargas digitales. Atención por WhatsApp todos los días, entrega
            verificada en minutos. Precios en córdobas (C$).
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings.storeName}. Todos los derechos
            reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
