import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const tierSchema = z.enum(["pro", "wholesale"]);

/** Nivel y última solicitud del usuario autenticado. */
export const getMyReseller = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("reseller_members")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: app } = await supabase
      .from("reseller_applications")
      .select("id, tier, status, review_reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      tier: (member?.tier ?? "public") as "public" | "pro" | "wholesale",
      application: app ?? null,
    };
  });

const applySchema = z.object({
  tier: tierSchema,
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(8).max(20),
  businessName: z.string().trim().max(120).default(""),
  city: z.string().trim().max(80).default(""),
  monthlyVolume: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
});

/** Envía la solicitud para ser Revendedor PRO o Mayorista. */
export const applyForReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => applySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: member } = await supabaseAdmin
      .from("reseller_members")
      .select("tier")
      .eq("user_id", userId)
      .maybeSingle();
    if (member?.tier === data.tier) {
      return { ok: false as const, message: "Tu cuenta ya tiene este nivel activo." };
    }

    const { data: pending } = await supabaseAdmin
      .from("reseller_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) {
      return { ok: false as const, message: "Ya tienes una solicitud en revisión." };
    }

    let email = "";
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = authUser.user?.email ?? "";
    } catch {
      /* sin correo */
    }

    const { error } = await supabaseAdmin.from("reseller_applications").insert({
      user_id: userId,
      tier: data.tier,
      full_name: data.fullName,
      phone: data.phone,
      email,
      business_name: data.businessName,
      city: data.city,
      monthly_volume: data.monthlyVolume,
      notes: data.notes,
      status: "pending",
    });
    if (error) return { ok: false as const, message: error.message };

    await supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", userId);

    try {
      const { notifyAdminTelegram } = await import("./telegram.server");
      await notifyAdminTelegram(
        `🤝 Nueva solicitud de revendedor\n` +
          `Nivel: ${data.tier === "pro" ? "Revendedor PRO" : "Mayorista"}\n` +
          `Nombre: ${data.fullName}\nTeléfono: ${data.phone}\n` +
          `Correo: ${email || "—"}\nNegocio: ${data.businessName || "—"}\n` +
          `Ciudad: ${data.city || "—"}\nVolumen: ${data.monthlyVolume || "—"}`,
      );
    } catch {
      /* la notificación nunca bloquea la solicitud */
    }

    return {
      ok: true as const,
      message: "Solicitud enviada correctamente. Revisaremos tu cuenta y te notificaremos cuando sea aprobada.",
    };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Lista de solicitudes y miembros (solo administradores). */
export const listResellerApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: apps }, { data: members }] = await Promise.all([
      supabaseAdmin
        .from("reseller_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("reseller_members")
        .select("user_id, tier, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const memberEmails = new Map<string, string>();
    for (const m of members ?? []) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        memberEmails.set(m.user_id, u.user?.email ?? "");
      } catch {
        /* ignore */
      }
    }

    return {
      applications: apps ?? [],
      members: (members ?? []).map((m) => ({ ...m, email: memberEmails.get(m.user_id) ?? "" })),
    };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().trim().max(300).default(""),
});

/** Aprueba o rechaza una solicitud; al aprobar, activa el nivel automáticamente. */
export const reviewResellerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app } = await supabaseAdmin
      .from("reseller_applications")
      .select("id, user_id, tier, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!app) return { ok: false as const, message: "Solicitud no encontrada." };
    if (app.status !== "pending") return { ok: false as const, message: "Esta solicitud ya fue revisada." };

    if (data.approve) {
      const { error: memberError } = await supabaseAdmin
        .from("reseller_members")
        .upsert(
          {
            user_id: app.user_id,
            tier: app.tier,
            approved_by: context.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (memberError) return { ok: false as const, message: memberError.message };
    }

    const { error } = await supabaseAdmin
      .from("reseller_applications")
      .update({
        status: data.approve ? "approved" : "rejected",
        review_reason: data.reason,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", app.id);
    if (error) return { ok: false as const, message: error.message };

    return { ok: true as const };
  });

const revokeSchema = z.object({ userId: z.string().uuid() });

/** Quita el nivel de revendedor a una cuenta (solo administradores). */
export const revokeResellerMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revokeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("reseller_members")
      .delete()
      .eq("user_id", data.userId);
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const };
  });
