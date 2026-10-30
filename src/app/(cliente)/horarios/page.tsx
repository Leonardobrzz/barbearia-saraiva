"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { useClient } from "@/components/cliente/ClientApp";
import { MO, SHOP, brl, dayKey, dayLabel, durTxt, errMsg, hm, waLink } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function Horarios() {
  const sb = supabaseBrowser();
  const { user, authReady, profile, pro, ask, toast, openBooking, bump, setBump } = useClient();
  const [list, setList] = useState<Appointment[] | null>(null);

  useEffect(() => {
    if (!user) { setList([]); return; }
    sb.from("appointments").select("*, appointment_services(*)").eq("client_id", user.id)
      .in("status", ["confirmed", "in_service"]).gte("ends_at", new Date().toISOString()).order("starts_at")
      .then(({ data }: { data: Appointment[] | null }) => setList(data ?? []));
  }, [user, bump, sb]);

  if (!authReady) return <div className="spinner" />;
  if (!user) return (<>
    <div className="largetitle"><div><h1>Meus horários</h1></div></div>
    <div className="empty"><Icon name="cal" /><div style={{ fontWeight: 600, color: "#fff", fontSize: 17 }}>Entre para ver seus horários</div>
      <div style={{ margin: "4px 0 18px" }}>Seus agendamentos ficam salvos na sua conta.</div>
      <Link className="btn primary" href="/perfil" style={{ maxWidth: 260, margin: "0 auto", textDecoration: "none" }}>Entrar ou criar conta</Link></div>
  </>);

  return (<>
    <div className="largetitle"><div><h1>Meus horários</h1></div></div>
    <div style={{ padding: "0 16px" }}>
      {list === null ? <div className="spinner" /> : list.length === 0 ? (
        <div className="empty"><Icon name="cal" /><div style={{ fontWeight: 600, color: "#fff", fontSize: 17 }}>Nenhum horário marcado</div>
          <div style={{ margin: "4px 0 18px" }}>Quando você agendar, ele aparece aqui.</div>
          <button className="btn primary" onClick={() => openBooking()} style={{ maxWidth: 260, margin: "0 auto" }}>Agendar agora</button></div>
      ) : (
        <div className="stagger">
          {list.map((b) => {
            const p = pro(b.professional_id), k = dayKey(b.starts_at), [, m, d] = k.split("-").map(Number);
            const items = b.appointment_services ?? [];
            const dur = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000;
            const msg = `Olá! Sobre meu horário na ${SHOP.name}: ${dayLabel(k)} às ${hm(b.starts_at)} com ${p?.name} (${items.map((i) => i.name).join(" + ")}). — ${profile?.name}`;
            return (
              <div className="bk" key={b.id}>
                <div className="top">
                  <div className="datebox"><span className="m">{MO[m - 1]}</span><span className="d">{d}</span></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="when">{dayLabel(k)} · {hm(b.starts_at)}</div>
                    <div className="who">com {p?.name} · {durTxt(dur)} · {brl(b.total_cents)}</div>
                    <div className="svcs">{items.map((i) => i.name).join(" + ")}</div>
                  </div>
                  <img src={p?.photo_url ?? ""} alt="" />
                </div>
                <div className="bar">
                  <a href={waLink(SHOP.whatsapp, msg)} target="_blank" rel="noopener" style={{ color: "var(--wa)", textDecoration: "none", padding: 12, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Icon name="wa" /> Falar</a>
                  {b.status === "confirmed" && (
                    <button style={{ color: "var(--red)" }} onClick={() => ask(`Cancelar ${dayLabel(k).toLowerCase()} às ${hm(b.starts_at)} com ${p?.name}?`, [{
                      label: "Cancelar agendamento", danger: true, run: async () => {
                        const { error } = await sb.rpc("cancel_my_appointment", { p_id: b.id });
                        if (error) return toast(errMsg(error), false);
                        toast("Agendamento cancelado"); setBump((n) => n + 1);
                      },
                    }])}><Icon name="x" /> Cancelar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Link href="/perfil" className="row press" style={{ background: "var(--bg2)", borderRadius: 14, marginTop: 10, textDecoration: "none", color: "inherit" }}>
        <span className="ic"><Icon name="scissors" /></span><div className="main"><div className="a">Histórico de cortes</div><div className="b">No seu perfil</div></div><Icon name="chev" />
      </Link>
    </div>
  </>);
}
