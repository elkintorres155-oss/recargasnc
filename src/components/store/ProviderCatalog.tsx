import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listProviderProducts, listProviderServices } from "@/lib/provider.functions";

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function ProviderCatalog() {
  const getProducts = useServerFn(listProviderProducts);
  const getServices = useServerFn(listProviderServices);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [productId, setProductId] = useState("");

  const run = async (fn: () => Promise<{ ok: boolean; status: number; json: string }>) => {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const res = await fn();
      if (!res.ok) setError(`El proveedor respondió ${res.status}`);
      setResult(JSON.stringify(JSON.parse(res.json), null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar al proveedor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl surface-card p-4">
      <h2 className="text-base font-extrabold">🔌 Catálogo del proveedor (FlashTopUp)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Consulta los productos y sus denominaciones para copiar los códigos (SKU) a tus paquetes.
        Requiere iniciar sesión como administrador.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-xs font-semibold text-muted-foreground">
          ID del producto (para servicios)
          <input
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            placeholder="ej. 12"
            className={inputCls}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => run(() => getProducts())}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          Ver productos
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => run(() => getServices({ data: { productId } }))}
          className="rounded-full border border-primary/50 px-4 py-2 text-sm font-bold text-primary disabled:opacity-60"
        >
          Ver servicios
        </button>
      </div>

      {loading ? <p className="mt-3 text-xs text-muted-foreground">Consultando…</p> : null}
      {error ? <p className="mt-3 text-xs font-semibold text-destructive">{error}</p> : null}
      {result ? (
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-border bg-background p-3 text-[11px] leading-relaxed">
          {result}
        </pre>
      ) : null}
    </section>
  );
}
