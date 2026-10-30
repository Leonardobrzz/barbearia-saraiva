"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Header from "@/components/painel/Header";
import { usePanel } from "@/components/painel/PanelApp";
import { WDL, errMsg } from "@/lib/format";
import type { BusinessHour, Category, Service } from "@/lib/types";

export default function Servicos() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { isOwner, services, hours, toast } = usePanel();
  const [nw, setNw] = useState({ name: "", category: "barber" as Category, price: "", dur: "30" });
  if (!isOwner) return <div className="card empty">Só o dono acessa esta página.</div>;

  async function patch(id: string, p: Partial<Service>) {
    const { error } = await sb.from("services").update(p).eq("id", id);
    if (error) return toast(errMsg(error));
    toast("Serviço atualizado"); router.refresh();
  }
  async function add() {
    const price = Math.round(Number(nw.price.replace(",", ".")) * 100), dur = Number(nw.dur);
    if (nw.name.trim().length < 2 || !(price >= 0) || !(dur > 0)) return toast("Preencha nome, preço e duração");
    const { error } = await sb.from("services").insert({ name: nw.name.trim(), category: nw.category, price_cents: price, duration_min: dur, sort: 99 });
    if (error) return toast(errMsg(error));
    setNw({ name: "", category: nw.category, price: "", dur: "30" }); toast("Serviço criado"); router.refresh();
  }
  async function saveHour(h: BusinessHour, p: Partial<BusinessHour>) {
    const row = { ...h, ...p };
    if (!row.closed && (!row.open_time || !row.close_time || row.open_time >= row.close_time)) return toast("Horário inválido");
    const { error } = await sb.from("business_hours").update({ open_time: row.closed ? null : row.open_time, close_time: row.closed ? null : row.close_time, closed: row.closed }).eq("weekday", h.weekday);
    if (error) return toast(errMsg(error));
    toast("Horário atualizado"); router.refresh();
  }

  const table = (cat: Category, title: string) => (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>{title}</h3>
      <div className="tablewrap" style={{ background: "transparent" }}><table style={{ minWidth: 560 }}>
        <thead><tr><th>Serviço</th><th className="r">Preço (R$)</th><th className="r">Duração (min)</th><th>Popular</th><th>Ativo</th></tr></thead>
        <tbody>{services.filter((s) => s.category === cat).map((s) => (
          <tr key={s.id} style={{ cursor: "default", opacity: s.active ? 1 : 0.5 }}>
            <td><input className="inl" defaultValue={s.name} onBlur={(e) => e.target.value.trim() !== s.name && patch(s.id, { name: e.target.value.trim() })} /></td>
            <td className="r"><input className="inl num" style={{ textAlign: "right", width: 90 }} defaultValue={(s.price_cents / 100).toFixed(2).replace(".", ",")}
              onBlur={(e) => { const v = Math.round(Number(e.target.value.replace(",", ".")) * 100); if (v >= 0 && v !== s.price_cents) patch(s.id, { price_cents: v }); }} /></td>
            <td className="r"><input className="inl num" style={{ textAlign: "right", width: 70 }} type="number" min={5} step={5} defaultValue={s.duration_min}
              onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== s.duration_min) patch(s.id, { duration_min: v }); }} /></td>
            <td><button className={`switch ${s.popular ? "on" : ""}`} onClick={() => patch(s.id, { popular: !s.popular })} aria-label="Popular" /></td>
            <td><button className={`switch ${s.active ? "on" : ""}`} onClick={() => patch(s.id, { active: !s.active })} aria-label="Ativo" /></td>
          </tr>))}</tbody>
      </table></div>
    </div>
  );

  return (<>
    <Header title="Serviços e horários" period={false} dateNav={false} />
    <p className="notice">Mudanças de preço valem para os próximos agendamentos. Os que já foram marcados mantêm o valor da época.</p>
    {table("barber", "Barbearia")}
    {table("beauty", "Unhas & Estética")}
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Novo serviço</h3>
      <div className="formgrid">
        <div className="field"><label>Nome</label><input value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></div>
        <div className="field"><label>Área</label><select value={nw.category} onChange={(e) => setNw({ ...nw, category: e.target.value as Category })}><option value="barber">Barbearia</option><option value="beauty">Unhas & Estética</option></select></div>
        <div className="field"><label>Preço (R$)</label><input inputMode="decimal" value={nw.price} onChange={(e) => setNw({ ...nw, price: e.target.value })} /></div>
        <div className="field"><label>Duração (min)</label><input type="number" min={5} step={5} value={nw.dur} onChange={(e) => setNw({ ...nw, dur: e.target.value })} /></div>
      </div>
      <button className="btn primary" style={{ marginTop: 12 }} onClick={add}>Adicionar serviço</button>
    </div>
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Horário de funcionamento</h3>
      <div className="list">{[1, 2, 3, 4, 5, 6, 0].map((wd) => { const h = hours.find((x) => x.weekday === wd); if (!h) return null; return (
        <div className="li" key={wd} style={{ flexWrap: "wrap" }}>
          <div className="m" style={{ minWidth: 110 }}><div className="a" style={{ textTransform: "capitalize" }}>{WDL[wd]}</div></div>
          {!h.closed && (<>
            <input type="time" className="inl" style={{ width: 110, background: "var(--bg3)", borderRadius: 8, padding: "6px 8px" }} defaultValue={h.open_time?.slice(0, 5)} onBlur={(e) => saveHour(h, { open_time: e.target.value })} />
            <span style={{ color: "var(--l2)" }}>até</span>
            <input type="time" className="inl" style={{ width: 110, background: "var(--bg3)", borderRadius: 8, padding: "6px 8px" }} defaultValue={h.close_time?.slice(0, 5)} onBlur={(e) => saveHour(h, { close_time: e.target.value })} />
          </>)}
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--l2)", display: "flex", alignItems: "center", gap: 8 }}>{h.closed ? "Fechado" : "Aberto"}
            <button className={`switch ${h.closed ? "" : "on"}`} onClick={() => saveHour(h, { closed: !h.closed, open_time: h.open_time ?? "09:00", close_time: h.close_time ?? "18:00" })} aria-label="Aberto" /></span>
        </div>); })}</div>
    </div>
  </>);
}
