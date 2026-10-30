"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import Header from "@/components/painel/Header";
import { usePanel } from "@/components/painel/PanelApp";
import { MO, WDL, addDays, dayKey, errMsg, hm, localToIso, weekday } from "@/lib/format";
import type { TimeBlock } from "@/lib/types";

const fmt = (iso: string) => { const k = dayKey(iso); return `${WDL[weekday(k)]}, ${Number(k.slice(8))} ${MO[Number(k.slice(5, 7)) - 1]} · ${hm(iso)}`; };

export default function Bloqueios() {
  const sb = supabaseBrowser();
  const { isOwner, myPro, pros, pro, bump, refresh, toast, me } = usePanel();
  const [list, setList] = useState<TimeBlock[] | null>(null);
  const [who, setWho] = useState<string>(isOwner ? (pros[0]?.id ?? "") : (myPro?.id ?? ""));
  const [day, setDay] = useState(dayKey());
  const [toDay, setToDay] = useState(dayKey());
  const [allDay, setAllDay] = useState(false);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [reason, setReason] = useState("Almoço");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sb.from("time_blocks").select("*").gte("ends_at", new Date().toISOString()).order("starts_at").limit(200)
      .then(({ data }: { data: TimeBlock[] | null }) => setList(data ?? []));
  }, [bump, sb]);

  async function add() {
    const starts = localToIso(day, allDay ? "00:00" : from);
    const ends = allDay ? localToIso(addDays(toDay < day ? day : toDay, 1), "00:00") : localToIso(day, to);
    if (new Date(ends) <= new Date(starts)) return toast("O fim precisa ser depois do início");
    setBusy(true);
    const { error } = await sb.from("time_blocks").insert({
      professional_id: who === "all" ? null : who, starts_at: starts, ends_at: ends, reason: reason.trim(), created_by: me.id,
    });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Horário bloqueado"); refresh();
  }
  async function remove(id: string) {
    const { error } = await sb.from("time_blocks").delete().eq("id", id);
    if (error) return toast(errMsg(error));
    toast("Bloqueio removido"); refresh();
  }

  return (<>
    <Header title="Bloqueios e folgas" period={false} dateNav={false} />
    <div className="grid two">
      <div className="card">
        <h3>Próximos bloqueios<small>{list?.length ?? 0}</small></h3>
        {list === null ? <div className="spinner" /> : list.length === 0 ? <div className="empty">Nenhum bloqueio pela frente</div> : (
          <div className="list">{list.map((b) => { const p = pro(b.professional_id); const mine = isOwner || b.professional_id === myPro?.id; return (
            <div className="li" key={b.id}>
              <img src={p?.photo_url ?? "/logo.png"} alt="" />
              <div className="m"><div className="a">{p ? p.name : "Barbearia inteira"} · {b.reason || "Bloqueado"}</div><div className="b">{fmt(b.starts_at)} → {dayKey(b.ends_at) === dayKey(b.starts_at) ? hm(b.ends_at) : fmt(b.ends_at)}</div></div>
              {mine && <button className="btn danger" style={{ height: 32, fontSize: 13, padding: "0 12px" }} onClick={() => remove(b.id)}>Remover</button>}
            </div>); })}</div>
        )}
      </div>
      <div className="card">
        <h3>Novo bloqueio</h3>
        <div className="field"><label>Quem</label>
          <select value={who} onChange={(e) => setWho(e.target.value)} disabled={!isOwner}>
            {isOwner && <option value="all">Barbearia inteira (feriado, evento)</option>}
            {(isOwner ? pros : myPro ? [myPro] : []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
          <span style={{ fontSize: 15 }}>Dia inteiro / folga</span>
          <button className={`switch ${allDay ? "on" : ""}`} onClick={() => setAllDay((v) => !v)} aria-label="Dia inteiro" />
        </div>
        <div className="formgrid">
          <div className="field"><label>{allDay ? "De" : "Dia"}</label><input type="date" value={day} min={dayKey()} onChange={(e) => { setDay(e.target.value); if (toDay < e.target.value) setToDay(e.target.value); }} /></div>
          {allDay ? <div className="field"><label>Até</label><input type="date" value={toDay} min={day} onChange={(e) => setToDay(e.target.value)} /></div> : (<>
            <div className="field"><label>Início</label><input type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field"><label>Fim</label><input type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>)}
        </div>
        <div className="field" style={{ marginTop: 10 }}><label>Motivo</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Almoço, folga, médico…" /></div>
        <button className="btn primary full" disabled={busy} onClick={add}><Icon name="plus" />Bloquear</button>
        <p className="notice" style={{ marginTop: 12 }}>Horários bloqueados somem do app na hora. Agendamentos que já existem nesse período <b>não</b> são cancelados — confira na agenda.</p>
      </div>
    </div>
  </>);
}
