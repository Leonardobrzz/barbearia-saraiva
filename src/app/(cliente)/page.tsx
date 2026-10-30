"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { useClient, haptic } from "@/components/cliente/ClientApp";
import { Seg } from "@/components/cliente/BookingSheet";
import { MapCard, isOpenNow } from "@/components/cliente/bits";
import { brl, dayKey, dayLabel, durTxt, hm, initials, SHOP } from "@/lib/format";
import type { Appointment, Category } from "@/lib/types";

export default function Home() {
  const sb = supabaseBrowser();
  const { pros, services, hours, user, profile, openBooking, pro, bump } = useClient();
  const [cat, setCat] = useState<Category>("barber");
  const [next, setNext] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!user) { setNext(null); return; }
    sb.from("appointments").select("*").eq("client_id", user.id).in("status", ["confirmed", "in_service"])
      .gte("starts_at", new Date().toISOString()).order("starts_at").limit(1)
      .then(({ data }: { data: Appointment[] | null }) => setNext(data?.[0] ?? null));
  }, [user, bump, sb]);

  const open = isOpenNow(hours);
  const h = new Date().getHours();
  const greet = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const fav = pro(profile?.favorite_professional_id);
  const heroPics = [pros[2], pros[6], pros[0]].filter(Boolean);

  return (<>
    <div className="largetitle">
      <div><div className="sub">{greet}{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}</div><h1>Saraiva</h1></div>
      {profile ? <Link href="/perfil" className="avatar sm press" style={{ textDecoration: "none" }}>{initials(profile.name || "?")}</Link>
        : <Link href="/perfil" className="press" style={{ fontSize: 15, fontWeight: 600, padding: "8px 14px", borderRadius: 20, background: "var(--fill)", color: "#fff", textDecoration: "none" }}>Entrar</Link>}
    </div>

    <div className="hero" style={fav ? { minHeight: 456 } : undefined}>
      <div className="bgpros">{heroPics.map((p) => <img key={p.id} src={p.photo_url ?? ""} alt="" />)}</div>
      <img className="logo" src="/logo.png" alt={SHOP.name} />
      <span className={`status ${open ? "" : "closed"}`}><i />{open ? "Aberto agora" : "Fechado agora"}</span>
      <h2>Estilo que se <span>respeita.</span></h2>
      <p>Barbearia e estética no Parque Santa Rosa. Escolha seu profissional e garanta seu horário em segundos.</p>
      <button className="btn silver shine" onClick={() => openBooking({ cat })}><Icon name="cal" /> Agendar horário</button>
      {fav && (
        <button className="btn gray" onClick={() => openBooking({ pro: fav.id })} style={{ marginTop: 10, height: 46, fontSize: 15 }}>
          <img src={fav.photo_url ?? ""} alt="" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover", objectPosition: "top" }} /> Agendar com {fav.name}
        </button>
      )}
    </div>

    {next && (() => { const p = pro(next.professional_id); return (
      <Link href="/horarios" className="next-card press" style={{ width: "calc(100% - 32px)", textDecoration: "none", color: "inherit" }}>
        <img src={p?.photo_url ?? ""} alt="" />
        <div style={{ flex: 1 }}><div className="k">Próximo horário</div><div className="v">{dayLabel(dayKey(next.starts_at))} · {hm(next.starts_at)}</div><div style={{ fontSize: 13, color: "var(--l2)" }}>com {p?.name}</div></div>
        <Icon name="chev" />
      </Link>); })()}

    <div className="section">
      <div className="section-h"><h2>Nossa equipe</h2></div>
      <div className="team stagger">
        {pros.map((p) => (
          <button key={p.id} className="pcard press" onClick={() => openBooking({ pro: p.id })}>
            <div className="ph"><img src={p.photo_url ?? ""} alt={p.name} loading="lazy" /><span className="tag">{p.category === "beauty" ? "Unhas" : "Barbeiro"}</span></div>
            <div className="n">{p.name}</div><div className="r">{p.role_label}</div>
          </button>
        ))}
      </div>
    </div>

    <div className="section">
      <div className="section-h"><h2>Serviços</h2></div>
      <Seg value={cat} onChange={setCat} />
      <div className="group stagger" key={cat}>
        {services.filter((s) => s.category === cat).slice(0, 6).map((s) => (
          <button key={s.id} className="svc" onClick={() => {
            haptic(); const list = pros.filter((p) => p.category === s.category);
            openBooking({ cat: s.category, services: [s.id], pro: list.length === 1 ? list[0].id : undefined });
          }}>
            <div className="m"><div className="a">{s.name}{s.popular && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "var(--fill)", color: "var(--l2)", marginLeft: 6, verticalAlign: 2 }}>Popular</span>}</div>
              <div className="b">{durTxt(s.duration_min)} · {s.description}</div></div>
            <div className="pr">{brl(s.price_cents)}</div><Icon name="chev" />
          </button>
        ))}
      </div>
    </div>

    <div className="section"><div className="section-h"><h2>Onde estamos</h2></div><MapCard /></div>
    <div className="foot">{SHOP.name} · {SHOP.phone}</div>
  </>);
}
