"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import type { Appointment, Payment, Status } from "@/lib/types";
import {
  PAYMENT, STATUS, WD, WDL, MO, addDays, brl, dayKey, durTxt, errMsg, hm, maskPhone, waLink, weekday,
} from "@/lib/format";
import { usePanel } from "./PanelApp";

export function StatusBadge({ s }: { s: Status }) {
  const ic = s === "done" ? "scheck" : s === "confirmed" ? "sclock" : s === "in_service" ? "dot" : "sx";
  return <span className={`st ${STATUS[s].cls}`}><Icon name={ic} />{STATUS[s].label}</span>;
}

export function whenLabel(iso: string) {
  const k = dayKey(iso), t = dayKey();
  const d = k === t ? "Hoje" : k === addDays(t, 1) ? "Amanhã" : `${WD[weekday(k)]} ${Number(k.slice(8))}/${Number(k.slice(5, 7))}`;
  return `${d} · ${hm(iso)}`;
}

export function BookingRow({ a }: { a: Appointment }) {
  const { pro, openPanel } = usePanel();
  const p = pro(a.professional_id);
  return (
    <button className="li" onClick={() => openPanel("Agendamento", <BookingDetail id={a.id} />)}>
      <img src={p?.photo_url ?? "/logo.png"} alt="" />
      <div className="m"><div className="a">{a.client_name}</div>
        <div className="b">{whenLabel(a.starts_at)} · {(a.appointment_services ?? []).map((s) => s.name).join(" + ")} · {p?.name}</div></div>
      <div className="t num">{brl(a.total_cents)}<small><StatusBadge s={a.status} /></small></div>
    </button>
  );
}

/** Detalhe com ações: atendido / faltou / cancelar / forma de pagamento */
export function BookingDetail({ id }: { id: string }) {
  const sb = supabaseBrowser();
  const { pro, toast, refresh } = usePanel();
  const [a, setA] = useState<Appointment | null>(null);
  const [visits, setVisits] = useState<number | null>(null);

  async function load() {
    const { data } = await sb.from("appointments").select("*, appointment_services(*)").eq("id", id).single();
    setA(data as Appointment);
    if (data?.client_id) {
      const { count } = await sb.from("appointments").select("id", { count: "exact", head: true }).eq("client_id", data.client_id).eq("status", "done");
      setVisits(count ?? 0);
    }
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function set(patch: Partial<Pick<Appointment, "status" | "payment_method">>, msg: string) {
    const { error } = await sb.from("appointments").update(patch).eq("id", id);
    if (error) return toast(errMsg(error));
    toast(msg); refresh(); load();
  }

  if (!a) return <div className="spinner" />;
  const p = pro(a.professional_id), k = dayKey(a.starts_at);
  const started = new Date(a.starts_at) <= new Date();
  const items = a.appointment_services ?? [];
  const dur = (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
  const phone = a.client_phone.replace(/\D/g, "");
  return (<>
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "4px 0 16px" }}>
      <img src={p?.photo_url ?? "/logo.png"} style={{ width: 56, height: 56, borderRadius: 16, objectFit: "cover", objectPosition: "top" }} alt="" />
      <div><div style={{ fontSize: 20, fontWeight: 800 }}>{a.client_name}</div><div style={{ color: "var(--l2)" }}>{phone ? maskPhone(phone) : "sem telefone"}</div></div>
    </div>
    <div className="dl">
      <div><span>Status</span><span><StatusBadge s={a.status} /></span></div>
      <div><span>Data</span><span>{WDL[weekday(k)]}, {Number(k.slice(8))} {MO[Number(k.slice(5, 7)) - 1]}</span></div>
      <div><span>Horário</span><span className="num">{hm(a.starts_at)} – {hm(a.ends_at)} ({durTxt(dur)})</span></div>
      <div><span>Profissional</span><span>{p?.name}</span></div>
      <div><span>Serviços</span><span>{items.map((s) => s.name).join(" + ")}</span></div>
      <div><span>Origem</span><span>{a.origin === "app" ? "App" : "Balcão/WhatsApp"}</span></div>
      {a.notes && <div><span>Observação</span><span>{a.notes}</span></div>}
      <div style={{ fontWeight: 700 }}><span style={{ color: "#fff" }}>Valor</span><span className="num">{brl(a.total_cents)}</span></div>
    </div>
    {a.status !== "cancelled" && (
      <div className="acts2">
        {a.status === "confirmed" && started && <button className="btn gray" onClick={() => set({ status: "in_service" }, "Em atendimento")}><Icon name="sclock" />Iniciar</button>}
        {a.status !== "done" && <button className="btn good" onClick={() => set({ status: "done", payment_method: a.payment_method ?? "pix" }, "Marcado como atendido")}><Icon name="scheck" />Atendido</button>}
        {a.status !== "no_show" && a.status !== "done" && started && <button className="btn danger" onClick={() => set({ status: "no_show" }, "Marcado como falta")}><Icon name="sx" />Faltou</button>}
        {a.status === "confirmed" && <button className="btn danger" onClick={() => set({ status: "cancelled" }, "Agendamento cancelado")}><Icon name="sx" />Cancelar</button>}
        {(a.status === "done" || a.status === "no_show") && <button className="btn gray" onClick={() => set({ status: "confirmed", payment_method: null }, "Status desfeito")}>Desfazer</button>}
      </div>
    )}
    {a.status === "done" && (
      <div className="field" style={{ marginTop: 12 }}><label>Forma de pagamento</label>
        <select value={a.payment_method ?? ""} onChange={(e) => set({ payment_method: e.target.value as Payment }, "Pagamento atualizado")}>
          {(Object.keys(PAYMENT) as Payment[]).map((k) => <option key={k} value={k}>{PAYMENT[k]}</option>)}
        </select></div>
    )}
    {phone && (
      <a className="btn wa full" style={{ marginTop: 12 }} target="_blank" rel="noopener"
        href={waLink("55" + phone.replace(/^55/, ""), `Olá, ${a.client_name.split(" ")[0]}! Aqui é da Barbearia Saraiva. Sobre seu horário de ${WDL[weekday(k)]} às ${hm(a.starts_at)} com ${p?.name}: `)}>
        <Icon name="wa" />Falar com o cliente</a>
    )}
    {visits !== null && <p style={{ fontSize: 12.5, color: "var(--l3)", marginTop: 14, textAlign: "center" }}>Cliente com {visits} atendimento{visits === 1 ? "" : "s"} no histórico</p>}
  </>);
}

/** Encaixe pelo balcão/WhatsApp */
export function NewBooking({ defaultDate }: { defaultDate: string }) {
  const sb = supabaseBrowser();
  const { pros, services, isOwner, myPro, toast, refresh, closePanel } = usePanel();
  const active = pros.filter((p) => p.active);
  const [proId, setProId] = useState(isOwner ? active[0]?.id ?? "" : myPro?.id ?? "");
  const [sel, setSel] = useState<string[]>([]);
  const [date, setDate] = useState(defaultDate < dayKey() ? dayKey() : defaultDate);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const p = pros.find((x) => x.id === proId);
  const list = services.filter((s) => s.active && s.category === p?.category);
  const dur = useMemo(() => sel.reduce((a, id) => a + (services.find((s) => s.id === id)?.duration_min ?? 0), 0), [sel, services]);
  const total = sel.reduce((a, id) => a + (services.find((s) => s.id === id)?.price_cents ?? 0), 0);

  useEffect(() => {
    if (!proId || !dur) { setSlots(null); return; }
    setSlots(null); setTime("");
    sb.rpc("get_available_slots", { p_professional: proId, p_date: date, p_duration: dur })
      .then(({ data }: { data: { slot_start: string }[] | null }) => setSlots((data ?? []).map((r) => r.slot_start)));
  }, [proId, date, dur, sb]);

  async function save() {
    if (name.trim().length < 2) return toast("Informe o nome do cliente");
    if (!sel.length) return toast("Escolha o serviço");
    if (!time) return toast("Escolha um horário livre");
    setBusy(true);
    const { error } = await sb.rpc("book_appointment", {
      p_professional: proId, p_service_ids: sel, p_starts_at: time, p_notes: "",
      p_client_name: name.trim(), p_client_phone: phone.replace(/\D/g, ""),
    });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Agendamento salvo"); refresh(); closePanel();
  }

  return (<>
    <p style={{ color: "var(--l2)", marginBottom: 14, fontSize: 14 }}>Para encaixes do balcão ou pedidos que chegam no WhatsApp.</p>
    <div className="field"><label>Cliente</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do cliente" /></div>
    <div className="field"><label>Telefone (opcional)</label><input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" placeholder="(85) 9 0000-0000" /></div>
    <div className="field"><label>Profissional</label>
      <select value={proId} disabled={!isOwner} onChange={(e) => { setProId(e.target.value); setSel([]); }}>
        {active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select></div>
    <div className="field"><label>Serviços</label>
      <div className="checks">{list.map((s) => (
        <label key={s.id}><input type="checkbox" checked={sel.includes(s.id)} onChange={() => setSel((v) => v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id])} />
          {s.name}<small>{brl(s.price_cents)} · {durTxt(s.duration_min)}</small></label>))}
      </div></div>
    <div className="field"><label>Data</label><input type="date" value={date} min={dayKey()} onChange={(e) => setDate(e.target.value)} /></div>
    <div className="field"><label>Horário livre</label>
      <select value={time} onChange={(e) => setTime(e.target.value)} disabled={!slots}>
        <option value="">{!dur ? "Escolha o serviço primeiro" : slots === null ? "Carregando…" : slots.length ? "Escolha" : "Sem horário livre"}</option>
        {(slots ?? []).map((s) => <option key={s} value={s}>{hm(s)}</option>)}
      </select></div>
    <button className="btn primary full" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? "Salvando…" : `Salvar agendamento${total ? ` · ${brl(total)}` : ""}`}</button>
  </>);
}
