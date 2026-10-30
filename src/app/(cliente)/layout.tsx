import "@/styles/app.css";
import ClientApp, { type Catalog } from "@/components/cliente/ClientApp";
import { supabaseServer } from "@/lib/supabase/server";

export const revalidate = 60; // catálogo (equipe, serviços, horários) atualiza a cada minuto

export default async function ClienteLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const [pros, services, hours] = await Promise.all([
    sb.from("professionals").select("*").eq("active", true).order("sort"),
    sb.from("services").select("*").eq("active", true).order("sort"),
    sb.from("business_hours").select("*").order("weekday"),
  ]);
  const catalog: Catalog = { pros: pros.data ?? [], services: services.data ?? [], hours: hours.data ?? [] };
  return (
    <div className="ca-wrap">
      <div className="ca" id="app">
        <ClientApp catalog={catalog}>{children}</ClientApp>
      </div>
    </div>
  );
}
