import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import PanelApp from "@/components/painel/PanelApp";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/painel/login");

  const { data: me } = await sb.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!me || (me.role !== "owner" && me.role !== "staff")) {
    return (
      <div className="login"><div className="box">
        <img src="/logo.png" alt="" /><h1>Sem acesso</h1>
        <p>Esta conta não faz parte da equipe. Peça ao dono para criar seu acesso em Equipe.</p>
        <a className="btn gray full" href="/">Ir para o app de clientes</a>
      </div></div>
    );
  }

  const [pros, services, hours, myPro] = await Promise.all([
    sb.from("professionals").select("*").order("sort"),
    sb.from("services").select("*").order("category").order("sort"),
    sb.from("business_hours").select("*").order("weekday"),
    sb.from("professionals").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <PanelApp me={me} myPro={myPro.data ?? null} pros={pros.data ?? []} services={services.data ?? []} hours={hours.data ?? []}>
      {children}
    </PanelApp>
  );
}
