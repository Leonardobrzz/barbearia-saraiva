"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import Header from "@/components/painel/Header";
import { BookingDetail, NewBooking } from "@/components/painel/bookings";
import { usePanel } from "@/components/painel/PanelApp";
import { addDays, brl, dayKey, hm, localToIso, minutesOfDay, weekday } from "@/lib/format";
import type { Appointment, TimeBlock } from "@/lib/types";

const PX = 1.6; // px por minuto
const tmin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);

export default function Agenda() {
  const sb = supabaseBrowser();
  const { isOwner, myPro, pros, hours, date, bump, openPanel } = usePanel();
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [now, setNow] = useState(() => minutesOfDay(new Date()));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setInterval(() => setNow(minutesOfDay(new Date())), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const from = localToIso(date, "00:00"), to = localToIso(addDays(date, 1), "00:00");
    Promise.all([
      sb.from("appointments").select("*, appointment_services(*)").gte("starts_at", from).lt("starts_at", to).neq("status", "cancelled").order("starts_at"),
      sb.from("time_blocks").select("*").lt("starts_at", to).gt("ends_at", from),
    ]).then(([a, b]) => { setAppts((a.data ?? []) as Appointment[]); setBlocks((b.data ?? []) as TimeBlock[]); });
  }, [date, bump, sb]);

  const h = hours.find((x) => x.weekday === weekday(date));
  const list = isOwner ? pros.filter((p) => p.active) : myPro ? [myPro] : [];

  // rola até a hora atual
  useEffect(() => {
    if (!box.current || !h || h.closed || date !== dayKey()) return;
    box.current.scrollTop = Math.max(0, (now - tmin(h.open_time) - 60) * PX);
  }, [appts]); // eslint-disable-line react-hooks/exhaustive-deps

  const fab = <button className="fab" onClick={() => openPanel("Novo agendamento", <NewBooking defaultDate={date} />)}><Icon name="plus" /><span>Novo agendamento</span></button>;
  if (!h || h.closed) return <><Header title="Agenda do dia" dayOnly /><div className="card empty">Fechado neste dia. Use as setas para trocar a data.</div>{fab}</>;
  if (!appts) return <><Header title="Agenda do dia" dayOnly /><div className="spinner" /></>;

  const open = tmin(h.open_time), close = tmin(h.close_time);
  const done = appts.filter((a) => a.status === "done"), todo = appts.filter((a) => a.status === "confirmed" || a.status === "in_service");
  const slots: number[] = []; for (let m = open; m < close; m += 30) slots.push(m);
  const bStart = (iso: string) => (dayKey(iso) < date ? open : Math.max(open, minutesOfDay(iso)));
  const bEnd = (iso: string) => (dayKey(iso) > date ? close : Math.min(close, minutesOfDay(iso)));
  const blockFor = (pid: string) => blocks.filter((b) => b.professional_id === pid || b.professional_id === null);

  return (<>
    <Header title="Agenda do dia" dayOnly />
    <div className="totals" style={{ margin: "-6px 4px 12px" }}>
      <span><b>{appts.filter((a) => a.status !== "cancelled").length}</b> horários</span><span><b>{done.length}</b> atendidos</span>
      <span><b>{todo.length}</b> a fazer</span><span><b>{brl(done.reduce((s, a) => s + a.total_cents, 0))}</b> realizado</span>
      <span><b>{brl(todo.reduce((s, a) => s + a.total_cents, 0))}</b> previsto</span>
    </div>
    <div className="agenda" ref={box}>
      <div className="ag" style={{ gridTemplateColumns: `56px repeat(${list.length},minmax(${isOwner ? 168 : 320}px,1fr))` }}>
        <div className="corner" />
        {list.map((p) => { const B = appts.filter((a) => a.professional_id === p.id); return (
          <div className="ph" key={p.id}><img src={p.photo_url ?? "/logo.png"} alt="" /><div><b>{p.name}</b><span>{B.length} horário{B.length === 1 ? "" : "s"} · {brl(B.reduce((s, a) => s + a.total_cents, 0))}</span></div></div>); })}
        <div className="times">{slots.map((m) => <div key={m} style={{ height: 30 * PX }}>{m % 60 === 0 ? `${String(m / 60).padStart(2, "0")}:00` : ""}</div>)}</div>
        {list.map((p) => (
          <div className="col" key={p.id}>
            {slots.map((m) => <div key={m} className={`slot ${m % 60 === 0 ? "h" : ""}`} style={{ height: 30 * PX }} />)}
            {blockFor(p.id).map((b) => { const s = bStart(b.starts_at), e = bEnd(b.ends_at); return e > s ? (
              <div key={b.id} className="blk blocked" style={{ top: (s - open) * PX, height: Math.max(22, (e - s) * PX - 3) }}><b>{b.professional_id ? "Bloqueado" : "Barbearia fechada"}</b><span>{b.reason}</span></div>) : null; })}
            {appts.filter((a) => a.professional_id === p.id).map((a) => {
              const s = minutesOfDay(a.starts_at), dur = (new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000;
              const cls = { confirmed: "conf", in_service: "now", done: "done", no_show: "miss", cancelled: "canc" }[a.status];
              return (
                <button key={a.id} className={`blk ${cls}`} style={{ top: (s - open) * PX, height: Math.max(26, dur * PX - 3) }} onClick={() => openPanel("Agendamento", <BookingDetail id={a.id} />)}>
                  <b>{hm(a.starts_at)} {a.client_name.split(" ")[0]}</b><span>{(a.appointment_services ?? []).map((x) => x.name).join(" + ")}</span>
                </button>);
            })}
          </div>
        ))}
        {date === dayKey() && now >= open && now < close && <div className="nowline" style={{ top: 64 + (now - open) * PX, gridColumn: "1/-1" }} />}
      </div>
    </div>
    <div className="legend">
      <span><i style={{ background: "#2a2a2d", boxShadow: "inset 3px 0 var(--good)" }} />Atendido</span>
      <span><i style={{ background: "#fff", boxShadow: "0 0 0 2px var(--warn)" }} />Em atendimento</span>
      <span><i style={{ background: "#e5e5ea" }} />Confirmado</span>
      <span><i style={{ background: "rgba(208,59,59,.4)" }} />Faltou</span>
      <span><i style={{ background: "repeating-linear-gradient(135deg,#3a3a3c 0 3px,#1f1f21 3px 6px)" }} />Bloqueado</span>
    </div>
    {fab}
  </>);
}
