"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Category, Service } from "@/lib/types";
import { Icon } from "@/components/icons";
import {
  MO, MOL, SHOP, WD, brl, dayKey, dayLabel, durTxt, errMsg, hm, initials, maskPhone, minutesOfDay, waLink, weekday,
} from "@/lib/format";
import { useClient, haptic } from "./ClientApp";
import PhoneAuth from "./PhoneAuth";

export interface BookingOpts { pro?: string; services?: string[]; cat?: Category }
const STEP_T = ["Profissional", "Serviços", "Data e hora", "Confirmar", ""];

export default function BookingSheet({ opts, onClose }: { opts: BookingOpts | null; onClose: () => void }) {
  const sb = supabaseBrowser();
  const { pros, services, user, profile, toast, pro: getPro, setBump } = useClient();
  const open = !!opts;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"fwd" | "back" | "">("fwd");
  const [cat, setCat] = useState<Category>("barber");
  const [proId, setProId] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [days, setDays] = useState<{ day: string; free_slots: number }[]>([]);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; starts: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // abre/reinicia
  useEffect(() => {
    if (!opts) return;
    const p = opts.pro ? getPro(opts.pro) : undefined;
    setCat(opts.cat ?? p?.category ?? "barber");
    setProId(p?.id ?? null);
    setSel(opts.services ?? []);
    setDay(null); setTime(null); setSlots(null); setDone(null);
    setNote(profile?.haircut_note ?? "");
    setDir("fwd"); setStep(p ? 1 : 0);
  }, [opts]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = useMemo(() => sel.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[], [sel, services]);
  const total = chosen.reduce((a, s) => a + s.price_cents, 0);
  const dur = chosen.reduce((a, s) => a + s.duration_min, 0);
  const p = getPro(proId);

  // dias com horário livre
  useEffect(() => {
    if (step !== 2 || !proId || !dur) return;
    let alive = true;
    sb.rpc("get_available_days", { p_professional: proId, p_from: dayKey(), p_days: 21, p_duration: dur })
      .then(({ data }: { data: { day: string; free_slots: number }[] | null }) => {
        if (!alive || !data) return;
        setDays(data);
        setDay((d) => d ?? data.find((x) => x.free_slots > 0)?.day ?? data[0]?.day ?? null);
      });
    return () => { alive = false; };
  }, [step, proId, dur, sb]);

  // horários do dia escolhido
  useEffect(() => {
    if (step !== 2 || !proId || !day || !dur) return;
    let alive = true; setSlots(null);
    sb.rpc("get_available_slots", { p_professional: proId, p_date: day, p_duration: dur })
      .then(({ data }: { data: { slot_start: string }[] | null }) => { if (alive) setSlots((data ?? []).map((r) => r.slot_start)); });
    return () => { alive = false; };
  }, [step, proId, day, dur, sb]);

  function go(n: number) { setDir(n > step ? "fwd" : "back"); setStep(n); haptic(); bodyRef.current?.scrollTo({ top: 0 }); }

  async function confirm() {
    if (!proId || !time) return;
    setBusy(true);
    const { data, error } = await sb.rpc("book_appointment", {
      p_professional: proId, p_service_ids: sel, p_starts_at: time, p_notes: note.trim(),
    });
    setBusy(false);
    if (error) {
      toast(errMsg(error), false);
      if (/ocupado|bloqueado|futuro/i.test(error.message)) { setTime(null); go(2); }
      return;
    }
    haptic([10, 40, 20]);
    setDone({ id: data as string, starts: time });
    setBump((n) => n + 1);
    setDir("fwd"); setStep(4);
  }

  const sum = chosen.length ? (
    <div className="sum"><div className="p">{brl(total)}</div><div className="d">{chosen.length} serviço{chosen.length > 1 ? "s" : ""} · {durTxt(dur)}</div></div>
  ) : <div className="sum"><div className="d">Nenhum serviço selecionado</div></div>;

  let body: React.ReactNode = null, foot: React.ReactNode = null;

  if (step === 0) {
    const list = pros.filter((x) => x.category === cat);
    body = (<>
      <h3>Com quem?</h3><p className="lead">Escolha o profissional para o seu atendimento.</p>
      <Seg value={cat} onChange={(c) => { setCat(c); if (p && p.category !== c) { setProId(null); setSel([]); } }} />
      <div className="pgrid stagger">
        {list.map((x) => (
          <button key={x.id} className={`ppick ${proId === x.id ? "sel" : ""}`} onClick={() => {
            haptic();
            if (proId !== x.id) { setSel((s) => s.filter((id) => services.find((v) => v.id === id)?.category === x.category)); setDay(null); setTime(null); }
            setProId(x.id); setTimeout(() => go(1), 300);
          }}>
            <img src={x.photo_url ?? "/logo.png"} alt={x.name} />
            <span className="ck"><Icon name="check" /></span>
            {profile?.favorite_professional_id === x.id && <span className="star">★ Favorito</span>}
            <div className="info"><div className="n">{x.name}</div><div className="r">{x.role_label}</div></div>
          </button>
        ))}
      </div>
    </>);
    foot = <>{sum}<button className="btn primary" disabled={!proId} onClick={() => go(1)}>Continuar</button></>;
  }

  if (step === 1 && p) {
    const list = services.filter((s) => s.category === p.category);
    body = (<>
      <div className="chosen"><img src={p.photo_url ?? "/logo.png"} alt="" /><div><div className="n">{p.name}</div><div className="r">{p.role_label}</div></div><button onClick={() => go(0)}>Trocar</button></div>
      <h3>O que vamos fazer?</h3><p className="lead">Selecione um ou mais serviços com {p.name}.</p>
      <div className="group stagger">
        {list.map((s) => (
          <button key={s.id} className={`svc ${sel.includes(s.id) ? "on" : ""}`} onClick={() => {
            haptic(); setTime(null); setDay(null);
            setSel((v) => v.includes(s.id) ? v.filter((x) => x !== s.id) : [...v, s.id]);
          }}>
            <span className="tick"><Icon name="check" /></span>
            <div className="m"><div className="a">{s.name}</div><div className="b">{durTxt(s.duration_min)} · {s.description}</div></div>
            <div className="pr">{brl(s.price_cents)}</div>
          </button>
        ))}
      </div>
    </>);
    foot = <>{sum}<button className="btn primary" disabled={!sel.length} onClick={() => go(2)}>Continuar</button></>;
  }

  if (step === 2 && p) {
    const groups: [string, "sun" | "sunset" | "moon", number, number][] = [["Manhã", "sun", 0, 720], ["Tarde", "sunset", 720, 1080], ["Noite", "moon", 1080, 1440]];
    const [y, m] = (day ?? dayKey()).split("-").map(Number);
    body = (<>
      <h3>Quando?</h3><p className="lead">{p.name} · {durTxt(dur)} de atendimento</p>
      <div className="month">{MOL[m - 1]} {y}</div>
      <div className="days">
        {days.map((d) => {
          const w = weekday(d.day), [, mm, dd] = d.day.split("-").map(Number), off = d.free_slots === 0;
          return (
            <button key={d.day} className={`day ${day === d.day ? "on" : ""} ${off ? "off" : ""}`} onClick={() => { haptic(); setDay(d.day); setTime(null); }}>
              <div className="w">{d.day === dayKey() ? "Hoje" : WD[w]}</div><div className="d">{dd}</div><div className="m">{off ? "lotado" : MO[mm - 1]}</div>
            </button>
          );
        })}
      </div>
      {slots === null ? <div className="spinner" /> : slots.length === 0 ? (
        <div className="empty"><Icon name="clock" /><div>Sem horários livres neste dia.<br />Tente outra data.</div></div>
      ) : groups.map(([label, ic, a, b]) => {
        const xs = slots.filter((s) => { const mm = minutesOfDay(s); return mm >= a && mm < b; });
        return xs.length ? (
          <div key={label}>
            <div className="period"><Icon name={ic} />{label}</div>
            <div className="times">{xs.map((s) => (
              <button key={s} className={`time ${time === s ? "on" : ""}`} onClick={() => { haptic(); setTime(s); }}>{hm(s)}</button>
            ))}</div>
          </div>
        ) : null;
      })}
    </>);
    foot = <>{sum}<button className="btn primary" disabled={!time} onClick={() => go(3)}>Continuar</button></>;
  }

  if (step === 3 && p && time) {
    const end = new Date(new Date(time).getTime() + dur * 60000);
    body = (<>
      <h3>Quase lá</h3><p className="lead">Confira os detalhes e confirme.</p>
      <div className="recap">
        <div className="top"><img src={p.photo_url ?? "/logo.png"} alt="" /><div><div className="n">{p.name}</div><div className="r">{dayLabel(dayKey(time))} · {hm(time)} – {hm(end)}</div></div></div>
        {chosen.map((s) => <div className="line" key={s.id}><span>{s.name}</span><span>{brl(s.price_cents)}</span></div>)}
        <div className="line total"><span>Total</span><span>{brl(total)}</span></div>
      </div>
      {user && profile ? (<>
        <div className="who-card"><span className="avatar sm">{initials(profile.name || "?")}</span>
          <div><div className="n">{profile.name}</div><div className="p">{profile.phone ? maskPhone(profile.phone) : ""}</div></div></div>
        <div className="field"><label>Observação (opcional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: degradê baixo, barba desenhada…" /></div>
        <p style={{ fontSize: 13, color: "var(--l3)", textAlign: "center" }}>Pagamento no local.</p>
      </>) : (<>
        <p style={{ fontSize: 15, fontWeight: 600, margin: "4px 0 10px" }}>Entre com seu WhatsApp para confirmar</p>
        <PhoneAuth compact />
      </>)}
    </>);
    foot = user ? <>{sum}<button className="btn primary" disabled={busy} onClick={confirm}>{busy ? "Agendando…" : "Confirmar"}</button></> : null;
  }

  if (step === 4 && done && p) {
    const msg = `Olá! Acabei de agendar pelo app da ${SHOP.name} ✂️\n\n👤 ${profile?.name}\n💈 ${p.name}\n📋 ${chosen.map((s) => s.name).join(" + ")}\n📅 ${dayLabel(dayKey(done.starts))} às ${hm(done.starts)}\n💰 ${brl(total)}`;
    body = (
      <div className="success">
        <div className="check"><svg viewBox="0 0 52 52"><path d="M14 27l8 8 16-17" /></svg></div>
        <h3>Horário reservado!</h3>
        <p>Te esperamos {dayLabel(dayKey(done.starts)).toLowerCase()} às {hm(done.starts)}.</p>
        <div className="recap ticket">
          <div className="top"><img src={p.photo_url ?? "/logo.png"} alt="" /><div><div className="n">{p.name}</div><div className="r">{chosen.map((s) => s.name).join(" + ")}</div></div></div>
          <div className="line"><span>Local</span><span>{SHOP.street}</span></div>
          <div className="line total"><span>Total</span><span>{brl(total)}</span></div>
        </div>
        <div className="acts">
          <a className="btn wa" href={waLink(SHOP.whatsapp, msg)} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><Icon name="wa" /> Avisar no WhatsApp</a>
          <Link className="btn gray" href="/horarios" onClick={onClose} style={{ textDecoration: "none" }}><Icon name="cal" /> Ver meus horários</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`scrim ${open ? "on" : ""}`} onClick={onClose} />
      <section className={`sheet ${open ? "on" : ""}`} role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="sheet-head">
          <button style={{ visibility: step > 0 && step < 4 ? "visible" : "hidden" }} onClick={() => go(Math.max(0, step - 1))}>Voltar</button>
          <div className="t">{STEP_T[step]}</div>
          <button className="r" onClick={onClose}>{step === 4 ? "OK" : "Fechar"}</button>
        </div>
        <div className="progress"><i style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
        <div className="sheet-body" ref={bodyRef}>
          <div className={`step ${dir}`} key={step}>{body}</div>
        </div>
        <div className="sheet-foot" style={{ display: foot ? "flex" : "none" }}>{foot}</div>
      </section>
    </>
  );
}

function Seg({ value, onChange }: { value: Category; onChange: (c: Category) => void }) {
  return (
    <div className={`seg ${value === "beauty" ? "r" : ""}`}>
      <span className="knob" />
      <button className={value === "barber" ? "on" : ""} onClick={() => { haptic(); onChange("barber"); }}>Barbearia</button>
      <button className={value === "beauty" ? "on" : ""} onClick={() => { haptic(); onChange("beauty"); }}>Unhas & Estética</button>
    </div>
  );
}
export { Seg };
