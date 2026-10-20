import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticação necessária." }, 401);
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("id,role,team_id,full_name").eq("id", user.id).single();
    if (profileError || profile?.role !== "coach" || !profile.team_id) return json({ error: "Somente treinador configurado pode convidar atletas." }, 403);
    const { data: team } = await admin.from("teams").select("id").eq("id", profile.team_id).eq("owner_id", user.id).single();
    if (!team) return json({ error: "Equipe não autorizada." }, 403);
    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const sport = String(body.sport ?? "").trim() || null;
    if (full_name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe nome e e-mail válidos." }, 400);
    const { data: existing } = await admin.from("athletes").select("id").eq("team_id", profile.team_id).ilike("email", email).maybeSingle();
    if (existing) return json({ error: "Já existe um cadastro com esse e-mail na equipe." }, 409);
    const redirectTo = Deno.env.get("ATHLETE_INVITE_REDIRECT_URL");
    const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name, invited_by: user.id, invitation_pending: true },
      ...(redirectTo ? { redirectTo } : {})
    });
    if (inviteError || !invite.user) return json({ error: inviteError?.message ?? "Não foi possível enviar o convite." }, 400);
    const athleteUserId = invite.user.id;
    const { error: updateProfileError } = await admin.from("profiles").update({ full_name, role: "athlete", team_id: profile.team_id }).eq("id", athleteUserId);
    if (updateProfileError) {
      await admin.auth.admin.deleteUser(athleteUserId);
      return json({ error: "Falha ao configurar perfil do atleta." }, 500);
    }
    const { error: athleteError } = await admin.from("athletes").insert({
      user_id: athleteUserId, team_id: profile.team_id, full_name, email, sport, created_by: user.id
    });
    if (athleteError) {
      await admin.auth.admin.deleteUser(athleteUserId);
      return json({ error: "Falha ao criar cadastro do atleta." }, 500);
    }
    return json({ ok: true, message: "Convite enviado.", athlete: { full_name, email } }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
