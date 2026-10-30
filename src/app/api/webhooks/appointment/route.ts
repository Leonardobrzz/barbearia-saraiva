import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dayKey, dayLabel, hm } from "@/lib/format";

/**
 * Chamado pelo Database Webhook do Supabase (tabela appointments, INSERT e UPDATE).
 * Envia push para o dono e para o profissional do horário.
 */
interface Row { id: string; professional_id: string; client_name: string; starts_at: string; status: string; origin: string }
interface Payload { type: "INSERT" | "UPDATE" | "DELETE"; table: string; record: Row | null; old_record: Row | null }

export async function POST(req: Request) {
  if (req.headers.get("x-webhook-secret") !== process.env.WEBHOOK_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Payload;
  const r = body.record;
  if (!r || body.table !== "appointments") return NextResponse.json({ skipped: true });

  let title: string | null = null;
  if (body.type === "INSERT" && r.origin === "app") title = "Novo agendamento ✂️";
  if (body.type === "UPDATE" && r.status === "cancelled" && body.old_record?.status !== "cancelled") title = "Horário cancelado";
  if (!title) return NextResponse.json({ skipped: true });

  const admin = supabaseAdmin();
  const [{ data: pro }, { data: owners }] = await Promise.all([
    admin.from("professionals").select("name, user_id").eq("id", r.professional_id).single(),
    admin.from("profiles").select("id").eq("role", "owner"),
  ]);
  const userIds = [...new Set([...(owners ?? []).map((o) => o.id), pro?.user_id].filter(Boolean))] as string[];
  if (!userIds.length) return NextResponse.json({ sent: 0 });

  const { data: subs } = await admin.from("push_subscriptions").select("*").in("user_id", userIds);
  if (!subs?.length) return NextResponse.json({ sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const payload = JSON.stringify({
    title,
    body: `${r.client_name.split(" ")[0]} · ${pro?.name ?? ""} · ${dayLabel(dayKey(r.starts_at)).toLowerCase()} às ${hm(r.starts_at)}`,
    url: "/painel/agenda",
    tag: `appt-${r.id}`,
  });

  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); // inscrição expirada
    }
  }));
  return NextResponse.json({ sent });
}
