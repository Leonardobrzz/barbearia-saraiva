import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function requireOwner() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "owner" ? user : null;
}

/** Dono cria o login (e-mail + senha) de um profissional. */
export async function POST(req: Request) {
  if (!(await requireOwner())) return NextResponse.json({ error: "Só o dono pode criar acessos" }, { status: 403 });
  const { professional_id, email, password } = await req.json();
  if (!professional_id || !email || !password || String(password).length < 8)
    return NextResponse.json({ error: "Informe e-mail e uma senha com pelo menos 8 caracteres" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: pro } = await admin.from("professionals").select("id, name, user_id").eq("id", professional_id).single();
  if (!pro) return NextResponse.json({ error: "Profissional não encontrado" }, { status: 404 });
  if (pro.user_id) return NextResponse.json({ error: "Este profissional já tem acesso" }, { status: 409 });

  const { data: created, error } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(), password, email_confirm: true, user_metadata: { name: pro.name },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Erro ao criar usuário" }, { status: 400 });

  await admin.from("profiles").upsert({ id: created.user.id, name: pro.name, role: "staff" });
  await admin.from("professionals").update({ user_id: created.user.id }).eq("id", pro.id);
  return NextResponse.json({ ok: true });
}

/** Dono troca a senha ou remove o acesso de um profissional. */
export async function PATCH(req: Request) {
  if (!(await requireOwner())) return NextResponse.json({ error: "Só o dono pode alterar acessos" }, { status: 403 });
  const { professional_id, password, revoke } = await req.json();
  const admin = supabaseAdmin();
  const { data: pro } = await admin.from("professionals").select("user_id").eq("id", professional_id).single();
  if (!pro?.user_id) return NextResponse.json({ error: "Profissional sem acesso" }, { status: 404 });

  if (revoke) {
    await admin.from("professionals").update({ user_id: null }).eq("id", professional_id);
    await admin.auth.admin.deleteUser(pro.user_id);
    return NextResponse.json({ ok: true });
  }
  if (!password || String(password).length < 8) return NextResponse.json({ error: "Senha com pelo menos 8 caracteres" }, { status: 400 });
  const { error } = await admin.auth.admin.updateUserById(pro.user_id, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
