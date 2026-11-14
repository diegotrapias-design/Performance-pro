import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function makeTemporaryPassword(length = 8) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => chars[value % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" }
    });

  let createdUserId: string | null = null;

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Autenticação necessária." }, 401);

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return json({ error: "Sessão inválida." }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,role,team_id,full_name")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.role !== "coach" || !profile.team_id) {
      return json({ error: "Somente treinador configurado pode gerar acesso de atleta." }, 403);
    }

    const { data: team } = await admin
      .from("teams")
      .select("id")
      .eq("id", profile.team_id)
      .eq("owner_id", user.id)
      .single();

    if (!team) return json({ error: "Equipe não autorizada." }, 403);

    const body = await req.json();
    const full_name = String(body.full_name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const sport = String(body.sport ?? "").trim() || null;

    if (full_name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Informe nome e e-mail válidos." }, 400);
    }

    const { data: athleteRow, error: athleteLookupError } = await admin
      .from("athletes")
      .select("id,user_id")
      .eq("team_id", profile.team_id)
      .ilike("email", email)
      .maybeSingle();

    if (athleteLookupError) return json({ error: "Não foi possível verificar o cadastro do atleta." }, 500);

    let existingAuthUser: any = null;

    if (athleteRow?.user_id) {
      const { data, error } = await admin.auth.admin.getUserById(athleteRow.user_id);
      if (!error && data?.user && data.user.email?.toLowerCase() === email) {
        existingAuthUser = data.user;
      }
    }

    if (!existingAuthUser) {
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) return json({ error: "Não foi possível verificar a conta de acesso existente." }, 500);
        const match = data.users.find((candidate: any) => candidate.email?.toLowerCase() === email);
        if (match) {
          existingAuthUser = match;
          break;
        }
        if (data.users.length < 1000) break;
      }
    }

    if (existingAuthUser) {
      const { data: existingProfile, error: existingProfileError } = await admin
        .from("profiles")
        .select("role,team_id")
        .eq("id", existingAuthUser.id)
        .maybeSingle();

      if (existingProfileError) return json({ error: "Não foi possível validar o perfil da conta existente." }, 500);
      if (existingProfile?.role === "coach") {
        return json({ error: "Este e-mail já pertence a uma conta de treinador. Use outro e-mail para o atleta." }, 409);
      }
      if (athleteRow?.user_id && athleteRow.user_id !== existingAuthUser.id) {
        return json({ error: "O cadastro do atleta está vinculado a outra conta. Solicite suporte antes de alterar o acesso." }, 409);
      }
    }

    const temporaryPassword = makeTemporaryPassword(8);
    const metadata = {
      ...(existingAuthUser?.user_metadata ?? {}),
      full_name,
      invited_by: user.id,
      invitation_pending: true
    };

    let athleteUserId: string;
    if (existingAuthUser) {
      athleteUserId = existingAuthUser.id;
      const { error } = await admin.auth.admin.updateUserById(athleteUserId, {
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: metadata
      });
      if (error) return json({ error: "Não foi possível atualizar o acesso provisório: " + error.message }, 400);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: metadata
      });
      if (error || !data.user) return json({ error: error?.message ?? "Não foi possível criar a conta do atleta." }, 400);
      athleteUserId = data.user.id;
      createdUserId = athleteUserId;
    }

    const { error: saveProfileError } = await admin.from("profiles").upsert({
      id: athleteUserId,
      full_name,
      role: "athlete",
      team_id: profile.team_id
    }, { onConflict: "id" });

    if (saveProfileError) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      return json({ error: "Falha ao configurar o perfil do atleta." }, 500);
    }

    const athleteData = {
      user_id: athleteUserId,
      team_id: profile.team_id,
      full_name,
      email,
      sport,
      created_by: user.id
    };

    const { error: saveAthleteError } = athleteRow
      ? await admin.from("athletes").update(athleteData).eq("id", athleteRow.id)
      : await admin.from("athletes").insert(athleteData);

    if (saveAthleteError) {
      if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
      return json({ error: "Falha ao salvar o cadastro do atleta." }, 500);
    }

    return json({
      ok: true,
      message: "Acesso provisório gerado.",
      athlete: { full_name, email },
      temporaryPassword
    }, 200);
  } catch (e) {
    if (createdUserId) {
      try {
        const url = Deno.env.get("SUPABASE_URL")!;
        const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(url, service, { auth: { persistSession: false } });
        await admin.auth.admin.deleteUser(createdUserId);
      } catch (_) { /* preserve the original error */ }
    }
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
