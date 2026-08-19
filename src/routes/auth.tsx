import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión | Recargas NC" },
      {
        name: "description",
        content:
          "Entra a tu cuenta de Recargas NC para comprar recargas de juegos y streaming en córdobas con verificación automática de pago.",
      },
      { property: "og:title", content: "Iniciar sesión | Recargas NC" },
      {
        property: "og:description",
        content: "Accede a tu cuenta para hacer recargas automáticas en córdobas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-card/70 px-4 py-3 text-sm outline-none focus:border-primary";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/mis-pedidos" });
    });
  }, [navigate]);

  const submit = async () => {
    setBusy(true);
    setMsg("");
    const fn =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/mis-pedidos` },
          });
    const { error } = await fn;
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    if (mode === "signup") {
      setMsg("Cuenta creada. Revisa tu correo si te pedimos confirmación.");
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) navigate({ to: "/mis-pedidos" });
  };

  const signInGoogle = async () => {
    setBusy(true);
    setMsg("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setMsg("No se pudo iniciar sesión con Google. Intenta de nuevo.");
        setBusy(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/mis-pedidos" });
    } catch {
      setMsg("No se pudo iniciar sesión con Google. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <StoreHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Necesitas una cuenta para enviar tu comprobante y recibir la recarga automática.
        </p>

        <div className="mt-6 space-y-4 rounded-3xl border border-border bg-card/70 p-5">
          <button
            type="button"
            disabled={busy}
            onClick={signInGoogle}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-border bg-background px-6 py-3 text-sm font-extrabold disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.7-3.1-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.2 5.2C39.8 36.2 44 30.8 44 24c0-1.2-.1-2.4-.4-3.5z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
          </div>


          <label className="block text-sm font-semibold">
            Correo
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block text-sm font-semibold">
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>

          {msg ? <p className="text-sm font-semibold text-primary">{msg}</p> : null}

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="w-full rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Procesando..." : mode === "login" ? "Entrar" : "Registrarme"}
          </button>

          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "No tengo cuenta, crear una" : "Ya tengo cuenta, iniciar sesión"}
          </button>
        </div>

        <Link to="/" className="mt-6 inline-block text-sm font-bold text-primary">
          ← Volver al catálogo
        </Link>
      </main>
    </div>
  );
}
