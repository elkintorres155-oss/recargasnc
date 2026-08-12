export function StoreHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <a href="/" className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-lg glow-ring">
            💚
          </span>
          <span className="leading-tight">
            <span className="block text-base font-extrabold tracking-tight">
              HOPE <span className="text-primary">STORE</span>
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Centro de recargas
            </span>
          </span>
        </a>

        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <span aria-hidden>🇻🇪</span> Bs
          <span aria-hidden className="text-muted-foreground">
            ▾
          </span>
        </button>
      </div>
    </header>
  );
}
