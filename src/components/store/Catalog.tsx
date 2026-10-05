import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Product } from "./data";
import { formatC, useStore } from "@/lib/store-state";
import { useResellerTier } from "@/hooks/use-reseller";
import { packPrice, type PriceTier } from "@/lib/pricing";

function ProductCard({ item, tier }: { item: Product; tier: PriceTier }) {
  const min = Math.min(...item.packs.map((p) => packPrice(p, tier)));
  const cardRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !window.matchMedia("(max-width: 767px) and (pointer: coarse) and (prefers-reduced-motion: no-preference)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        card.classList.add("mobile-card-visible");
        observer.disconnect();
      }
    }, { threshold: 0.2 });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <Link
      ref={cardRef}
      to="/producto/$id"
      params={{ id: item.id }}
      className="product-card group relative block overflow-hidden rounded-2xl surface-card transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.02] hover:glow-ring active:scale-[0.97]"
    >
      <div className="card-shine relative aspect-square overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          width={640}
          height={640}
          className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 group-hover:rotate-1 group-active:scale-105"
        />
        {item.hot ? (
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
            🔥
          </span>
        ) : null}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-bold">{item.name}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{item.tag}</p>
        <p className="mt-1 text-xs font-bold text-primary">desde {formatC(min)}</p>
      </div>
    </Link>
  );
}

export function Catalog() {
  const { categories } = useStore();
  const { tier } = useResellerTier();
  const [active, setActive] = useState(categories[0]!.id);
  const [query, setQuery] = useState("");
  const category = categories.find((c) => c.id === active) ?? categories[0]!;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return category.items;
    return categories.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(q));
  }, [query, category, categories]);

  return (
    <section id="catalogo" className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mb-6 flex justify-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 Buscar juego, streaming o gift card..."
          className="w-full max-w-md rounded-full border border-border bg-card/80 px-5 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <div className="mb-8 flex justify-center">
        <div className="flex flex-wrap justify-center gap-1 rounded-full border border-border bg-card/80 p-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActive(c.id);
                setQuery("");
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                c.id === active && !query
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span aria-hidden className="mr-1.5">
                {c.icon}
              </span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-xl bg-secondary text-base"
        >
          {query ? "🔎" : category.icon}
        </span>
        <h2 className="text-lg font-extrabold tracking-tight">
          {query ? "Resultados" : category.label}
        </h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {items.length}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No encontramos resultados para "{query}".
        </p>
      ) : (
        <div
          key={`${category.id}-${query}`}
          className="reveal-stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {items.map((item) => (
            <ProductCard key={item.id} item={item} tier={tier} />
          ))}
        </div>
      )}
    </section>
  );
}
