import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store-state";

export function StoreHeader() {
  const { settings } = useStore();
  const [open, setOpen] = useState(false);

  const links: Array<{ label: string; to: "/" | "/admin" | "/saldo"; hash?: string }> = [
    { label: "Inicio", to: "/" },
    { label: "Catálogo", to: "/", hash: "catalogo" },
    { label: "Mi saldo", to: "/saldo" },
    { label: "Admin", to: "/admin" },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-lg glow-ring">
            💚
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight">
              {settings.storeName.split(" ")[0]}{" "}
              <span className="text-primary">{settings.storeName.split(" ").slice(1).join(" ")}</span>
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Centro de recargas
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              {...(l.hash ? { hash: l.hash } : {})}
              className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2 flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold">
            <span aria-hidden>🇳🇮</span> C$
          </span>
        </nav>

        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold sm:hidden"
        >
          ☰
        </button>
      </div>

      {open ? (
        <div className="border-t border-border/60 px-4 py-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                {...(l.hash ? { hash: l.hash } : {})}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
            <span className="mt-1 rounded-xl bg-secondary px-3 py-2 text-sm font-semibold">
              🇳🇮 Precios en córdobas (C$)
            </span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
