import { useState } from "react";
import { categories, type Product } from "./data";

function ProductCard({ item }: { item: Product }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl surface-card transition-transform duration-200 hover:-translate-y-1 hover:glow-ring">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          width={640}
          height={640}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
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
      </div>
    </article>
  );
}

export function Catalog() {
  const [active, setActive] = useState(categories[0]!.id);
  const category = categories.find((c) => c.id === active) ?? categories[0]!;

  return (
    <section id="catalogo" className="mx-auto max-w-6xl px-4 pb-20">
      <div className="mb-8 flex justify-center">
        <div className="flex flex-wrap justify-center gap-1 rounded-full border border-border bg-card/80 p-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActive(c.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                c.id === active
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
          {category.icon}
        </span>
        <h2 className="text-lg font-extrabold tracking-tight">{category.label}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {category.items.length}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {category.items.map((item) => (
          <ProductCard key={`${category.id}-${item.name}`} item={item} />
        ))}
      </div>
    </section>
  );
}
