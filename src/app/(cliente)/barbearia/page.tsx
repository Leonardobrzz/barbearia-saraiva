"use client";

import { Icon } from "@/components/icons";
import { useClient } from "@/components/cliente/ClientApp";
import { MapCard } from "@/components/cliente/bits";
import { SHOP, WDL, dayKey, weekday } from "@/lib/format";

const PAYMENTS = ["Dinheiro", "Cartão de crédito", "Cartão de débito", "Pix"];

export default function Barbearia() {
  const { hours } = useClient();
  const today = weekday(dayKey());
  return (<>
    <div className="largetitle"><div><h1>A Barbearia</h1></div></div>
    <div style={{ textAlign: "center", padding: "6px 20px 0" }}>
      <img src="/logo.png" alt="" style={{ width: 96, height: 96, borderRadius: "50%", margin: "0 auto 12px", animation: "logoIn .9s var(--spring) both" }} />
      <div style={{ fontSize: 22, fontWeight: 800 }}>{SHOP.name}</div><div style={{ color: "var(--l2)" }}>{SHOP.district}</div>
    </div>
    <div className="section"><MapCard /></div>
    <div className="section"><div className="section-h"><h2>Contato</h2></div><div className="group">
      <a className="row" href={`https://wa.me/${SHOP.whatsapp}`} target="_blank" rel="noopener" style={{ textDecoration: "none", color: "inherit" }}><span className="ic" style={{ background: "var(--wa)", color: "#fff" }}><Icon name="wa" /></span><div className="main"><div className="a">WhatsApp</div><div className="b">{SHOP.phone}</div></div><Icon name="chev" /></a>
      <a className="row" href={`tel:+${SHOP.whatsapp}`} style={{ textDecoration: "none", color: "inherit" }}><span className="ic" style={{ background: "#30d158", color: "#fff" }}><Icon name="phone" /></span><div className="main"><div className="a">Ligar</div><div className="b">{SHOP.phone}</div></div><Icon name="chev" /></a>
    </div></div>
    <div className="section"><div className="section-h"><h2>Horário de atendimento</h2></div><div className="group">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => { const h = hours.find((x) => x.weekday === d); return (
        <div className="row plain" key={d}><div className="main"><div className="a" style={d === today ? { fontWeight: 700 } : undefined}>{WDL[d][0].toUpperCase() + WDL[d].slice(1)}{d === today ? " · hoje" : ""}</div></div>
          <div className="end">{h && !h.closed ? `${h.open_time?.slice(0, 5)} – ${h.close_time?.slice(0, 5)}` : "Fechado"}</div></div>); })}
    </div></div>
    <div className="section"><div className="section-h"><h2>Pagamento</h2></div><div className="chips">{PAYMENTS.map((p) => <span className="chip" key={p}>{p}</span>)}</div></div>
    <div className="foot">{SHOP.name}</div>
  </>);
}
