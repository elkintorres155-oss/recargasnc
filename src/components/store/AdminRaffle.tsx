import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { drawWeeklyWinner, listRaffleWinners, listWeekBuyers } from "@/lib/raffle.functions";
import { formatC } from "@/lib/store-state";
import { useSessionState } from "@/hooks/use-session";

const COLORS = [
  "hsl(210 90% 55%)",
  "hsl(190 85% 45%)",
  "hsl(225 75% 45%)",
  "hsl(175 70% 40%)",
  "hsl(245 70% 55%)",
  "hsl(200 95% 60%)",
];

const label = (p: { name: string; email: string; userId: string }) =>
  p.name || p.email || `${p.userId.slice(0, 8)}…`;

export function AdminRaffle() {
  const qc = useQueryClient();
  const session = useSessionState();
  const enabled = session === "signed-in";

  const buyers = useServerFn(listWeekBuyers);
  const winners = useServerFn(listRaffleWinners);
  const draw = useServerFn(drawWeeklyWinner);

  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [msg, setMsg] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const week = useQuery({
    queryKey: ["raffle-week"],
    queryFn: () => buyers(),
    enabled,
    retry: false,
  });

  const history = useQuery({
    queryKey: ["raffle-history"],
    queryFn: () => winners(),
    enabled,
    retry: false,
  });

  const participants = week.data?.participants ?? [];
  const slice = participants.length ? 360 / participants.length : 360;

  const gradient = useMemo(() => {
    if (!participants.length) return "conic-gradient(hsl(var(--muted)) 0deg 360deg)";
    const stops = participants.map((_, i) => {
      const c = COLORS[i % COLORS.length];
      return `${c} ${i * slice}deg ${(i + 1) * slice}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  }, [participants, slice]);

  const spin = async () => {
    if (spinning || !participants.length) return;
    setMsg("");
    setRevealed(null);
    setSpinning(true);
    try {
      const res = await draw({ data: { force: false } });
      const idx = participants.findIndex((p) => p.userId === res.winner.user_id);
      const target = idx >= 0 ? idx : 0;
      // El puntero está arriba (0°): giramos para dejar el centro del sector ahí.
      const center = target * slice + slice / 2;
      const next = angle + 360 * 6 + (360 - (((angle % 360) + center) % 360));
      setAngle(next);
      if (res.alreadyDrawn) setMsg("Esta semana ya tenía ganador; se muestra el mismo.");
      timer.current = setTimeout(async () => {
        setRevealed(res.winner.full_name || res.winner.email || res.winner.user_id);
        setSpinning(false);
        await qc.invalidateQueries({ queryKey: ["raffle-week"] });
        await qc.invalidateQueries({ queryKey: ["raffle-history"] });
      }, 4200);
    } catch (e) {
      setSpinning(false);
      setMsg(e instanceof Error ? e.message : "No se pudo realizar el sorteo.");
    }
  };

  if (!enabled || week.error) {
    return (
      <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide">Ruleta semanal</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Inicia sesión con una cuenta de administrador para usar la ruleta.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 rounded-3xl border border-border bg-card/60 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">🎡 Ruleta semanal</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Participan los compradores del {week.data?.weekStart ?? "—"} al {week.data?.weekEnd ?? "—"}.
        El ganador recibe {formatC(week.data?.prize ?? 100)} en saldo automáticamente.
      </p>

      <div className="mt-5 flex flex-col items-center gap-4">
        <div className="relative">
          <div
            aria-hidden
            className="absolute left-1/2 top-[-10px] z-10 -translate-x-1/2 text-2xl"
          >
            🔻
          </div>
          <div
            className="size-64 rounded-full border-4 border-primary/60 shadow-lg"
            style={{
              background: gradient,
              transform: `rotate(${angle}deg)`,
              transition: "transform 4s cubic-bezier(0.15, 0.9, 0.2, 1)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center rounded-full border border-border bg-card text-center text-xs font-extrabold">
              {participants.length}
              <br />
              part.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={spin}
          disabled={spinning || !participants.length}
          className="rounded-full bg-primary px-6 py-2 text-sm font-extrabold text-primary-foreground disabled:opacity-50"
        >
          {spinning ? "Girando…" : "Girar la ruleta"}
        </button>

        {!participants.length ? (
          <p className="text-sm text-muted-foreground">No hay compradores esta semana todavía.</p>
        ) : null}

        {revealed ? (
          <p className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-center text-sm font-extrabold text-primary">
            🎉 ¡Ganador: {revealed}! Se acreditaron {formatC(week.data?.prize ?? 100)} en su saldo.
          </p>
        ) : null}
        {msg ? <p className="text-sm font-semibold text-muted-foreground">{msg}</p> : null}
      </div>

      <h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">
        Participantes de la semana
      </h3>
      <div className="mt-2 space-y-1">
        {participants.map((p, i) => (
          <p key={p.userId} className="text-xs text-muted-foreground">
            <span
              aria-hidden
              className="mr-2 inline-block size-2 rounded-full align-middle"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="font-semibold text-foreground">{label(p)}</span> · {p.orders} compra
            {p.orders === 1 ? "" : "s"} · {formatC(p.spent)}
          </p>
        ))}
      </div>

      <h3 className="mt-6 text-xs font-extrabold uppercase text-muted-foreground">
        Ganadores anteriores
      </h3>
      <div className="mt-2 space-y-1">
        {(history.data ?? []).map((w) => (
          <p key={w.id} className="text-xs text-muted-foreground">
            {w.week_start} → {w.week_end} ·{" "}
            <span className="font-semibold text-foreground">
              {w.full_name || w.email || w.user_id}
            </span>{" "}
            · {formatC(Number(w.amount_nio))} · {w.participants} participantes
          </p>
        ))}
        {history.data && history.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay sorteos realizados.</p>
        ) : null}
      </div>
    </section>
  );
}
