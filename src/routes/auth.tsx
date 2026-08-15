import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { StoreHeader } from "@/components/store/StoreHeader";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

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

  const google = async () => {
    await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
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
            onClick={google}
            className="w-full rounded-full border border-border px-4 py-3 text-sm font-bold hover:border-primary"
          >
            Continuar con Google
          </button>

          <div className="text-center text-xs text-muted-foreground">o con tu correo</div>

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
