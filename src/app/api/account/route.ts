import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Cliente exclui a própria conta (LGPD). O histórico de atendimentos fica, sem vínculo com a pessoa. */
export async function DELETE() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "client") return NextResponse.json({ error: "Contas da equipe são removidas pelo dono" }, { status: 403 });

  const admin = supabaseAdmin();
  // anonimiza os agendamentos antes de apagar o usuário
  await admin.from("appointments").update({ client_name: "Cliente removido", client_phone: "" }).eq("client_id", user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
