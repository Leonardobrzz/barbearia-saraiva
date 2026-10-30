"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import Header from "@/components/painel/Header";
import BarChart, { type Bar } from "@/components/painel/BarChart";
import { BookingRow, NewBooking } from "@/components/painel/bookings";
import { usePanel } from "@/components/painel/PanelApp";
import { MO, PAYMENT, WD, WDL, addDays, brl, dayKey, minutesOfDay, weekday } from "@/lib/format";
import type { Appointment, Dashboard, Payment } from "@/lib/types";

const pct = (n: number) => `${Math.round(n * 100)}%`;
function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="delta flat">—</span>;
  const r = (cur - prev) / prev, up = r >= 0, good = invert ? !up : up;
  if (Math.abs(r) < 0.005) return <span className="delta flat">0%</span>;
  return <span className={`delta ${good ? "up" : "down"}`}><Icon name={up ? "up" : "down"} />{Math.abs(Math.round(r * 100))}%</span>;
}

export default function Overview() {
  const sb = supabaseBrowser();
  const { isOwner, myPro, period, date, range, bump, pro, openPanel } = usePanel();
  const [d, setD] = useState<Dashboard | null>(null);
  const [prev, setPrev] = useState<Dashboard | null>(null);
  const [next, setNext] = useState<Appointment[]>([]);
  const [rankBy, setRankBy] = useState<"rev" | "n">("rev");
  const [err, setErr] = useState("");

  useEffect(() => {
    const r = range();
    // no modo Dia, compara com o mesmo dia da semana anterior
    const pf = period === "day" ? addDays(date, -7) : r.prevFrom, pt = period === "day" ? addDays(date, -7) : r.prevTo;
    Promise.all([
      sb.rpc("dashboard", { p_from: r.from, p_to: r.to }),
      sb.rpc("dashboard", { p_from: pf, p_to: pt }),
      sb.from("appointments").select("*, appointment_services(*)").in("status", ["confirmed", "in_service"])
        .gte("ends_at", new Date().toISOString()).order("starts_at").limit(6),
    ]).then(([a, b, c]) => {
      if (a.error) return setErr(a.error.message);
      setD(a.data as Dashboard); setPrev(b.data as Dashboard); setNext((c.data ?? []) as Appointment[]);
    });
  }, [period, date, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <><Header title="Visão geral" /><div className="card empty">{err}</div></>;
  if (!d || !prev) return <><Header title={isOwner ? "Visão geral" : "Meu desempenho"} /><div className="spinner" /></>;

  // barbeiro vê os próprios ganhos (comissão)
  const k = isOwner ? 1 : (myPro?.commission_pct ?? 0) / 100;
  const occ = d.open_minutes ? d.booked_minutes / d.open_minutes : 0, pocc = prev.open_minutes ? prev.booked_minutes / prev.open_minutes : 0;
  const ticket = d.done_count ? d.revenue_cents / d.done_count : 0, pticket = prev.done_count ? prev.revenue_cents / prev.done_count : 0;
  const missRate = d.done_count + d.no_show_count ? d.no_show_count / (d.done_count + d.no_show_count) : 0;
  const cmp = period === "day" ? "vs. mesmo dia da semana passada" : "vs. período anterior";

  let chartTitle: string, bars: Bar[];
  if (period === "day") {
    chartTitle = "Faturamento por hora";
    const h = d.by_hour, nowH = Math.floor(minutesOfDay(new Date()) / 60);
    const hrs = Array.from({ length: 13 }, (_, i) => i + 8);
    bars = hrs.map((x) => { const r = h.find((y) => y.hour === x); const v = ((r?.revenue_cents ?? 0) * k) / 100;
      return { label: `${x}h`, value: v, hi: date === dayKey() && x === nowH, tip: `<b>${x}:00 – ${x + 1}:00</b><br>${brl(v * 100)} · ${r?.count ?? 0} atendido(s)${r?.scheduled ? `<br>${r.scheduled} agendado(s)` : ""}` }; });
  } else {
    chartTitle = "Faturamento por dia";
    bars = d.by_day.map((x) => { const v = (x.revenue_cents * k) / 100, w = weekday(x.day);
      return { label: period === "week" ? WD[w] : String(Number(x.day.slice(8))), value: v, hi: x.day === dayKey(), tip: `<b>${WDL[w]}, ${Number(x.day.slice(8))} ${MO[Number(x.day.slice(5, 7)) - 1]}</b><br>${brl(v * 100)} · ${x.count} atendimentos` }; });
  }
  const peak = bars.reduce((a, b) => (b.value > a.value ? b : a), bars[0] ?? { value: 0, label: "" });

  const ranked = [...d.by_professional].sort((a, b) => (rankBy === "rev" ? b.revenue_cents - a.revenue_cents : b.count - a.count));
  const rmax = Math.max(1, ...ranked.map((a) => (rankBy === "rev" ? a.revenue_cents : a.count)));
  const smax = Math.max(1, ...d.by_service.map((s) => s.count));
  const ptot = d.by_payment.reduce((a, b) => a + b.revenue_cents, 0), pmax = Math.max(1, ...d.by_payment.map((b) => b.revenue_cents));

  return (<>
    <Header title={isOwner ? "Visão geral" : "Meu desempenho"} />
    <div className="grid kpis">
      <div className="card kpi hero">
        <div className="k"><Icon name="money" />{isOwner ? "Faturamento" : `Seus ganhos (${myPro?.commission_pct ?? 0}%)`}</div>
        <div className="v num">{brl(d.revenue_cents * k)}</div>
        <Delta cur={d.revenue_cents} prev={prev.revenue_cents} /><span className="s">{cmp}</span>
        {d.expected_cents > 0 && <div className="foot">+ {brl(d.expected_cents * k)} previsto nos horários confirmados</div>}
      </div>
      <div className="card kpi"><div className="k"><Icon name="scissors" />Atendimentos</div><div className="v num">{d.done_count}</div>
        <Delta cur={d.done_count} prev={prev.done_count} />{d.pending_count > 0 && <div className="foot">{d.pending_count} ainda na agenda</div>}</div>
      <div className="card kpi"><div className="k"><Icon name="ticket" />Ticket médio</div><div className="v num">{brl(ticket)}</div><Delta cur={ticket} prev={pticket} /></div>
      <div className="card kpi"><div className="k"><Icon name="gauge" />Ocupação</div><div className="v num">{pct(occ)}</div><Delta cur={occ} prev={pocc} />
        <div className="foot">da agenda {isOwner ? "da equipe" : "sua"} preenchida</div></div>
      <div className="card kpi"><div className="k"><Icon name="warn" />Faltas</div><div className="v num">{d.no_show_count}</div><Delta cur={d.no_show_count} prev={prev.no_show_count} invert />
        <div className="foot">{d.cancelled_count} cancelado{d.cancelled_count === 1 ? "" : "s"} · {pct(missRate)} de falta</div></div>
    </div>

    <div className="grid two">
      <div className="card"><h3>{chartTitle}<small>{peak?.value ? `Pico: ${peak.label} · ${brl(peak.value * 100)}` : ""}</small></h3><BarChart data={bars} /></div>
      {isOwner ? (
        <div className="card">
          <h3>{period === "day" ? "Quem mais atendeu" : "Ranking da equipe"}
            <div className="seg"><button className={rankBy === "rev" ? "on" : ""} onClick={() => setRankBy("rev")}>R$</button><button className={rankBy === "n" ? "on" : ""} onClick={() => setRankBy("n")}>Cortes</button></div></h3>
          <div className="rank">{ranked.map((a, i) => {
            const v = rankBy === "rev" ? a.revenue_cents : a.count, first = i === 0 && v > 0;
            return (
              <Link key={a.id} href="/painel/agenda" className={`ritem ${first ? "first" : ""}`} style={{ textDecoration: "none" }}>
                <span className="pos">{i + 1}</span><img src={a.photo_url ?? "/logo.png"} alt="" />
                <div><div className="nm">{a.name}{first && <span className="crown">TOP 1</span>}</div><div className="track"><i style={{ width: `${(v / rmax) * 100}%`, animationDelay: `${i * 0.04}s` }} /></div></div>
                <div className="val num">{rankBy === "rev" ? brl(a.revenue_cents) : a.count}<small>{rankBy === "rev" ? `${a.count} atend.` : brl(a.revenue_cents)}</small></div>
              </Link>);
          })}</div>
        </div>
      ) : (
        <div className="card"><h3>Sua próxima fila</h3><div className="list">{next.map((a) => <BookingRow key={a.id} a={a} />)}{!next.length && <div className="empty">Nenhum horário pela frente</div>}</div></div>
      )}
    </div>

    <div className="grid two-eq">
      <div className="card"><h3>Serviços mais feitos<small>{d.done_count} atendimentos</small></h3>
        {d.by_service.length ? <div className="hbars">{d.by_service.map((s, i) => (
          <div className="hb" key={s.name}><div className="row"><span>{s.name}</span><span className="num">{s.count}× · {brl(s.revenue_cents * k)}</span></div>
            <div className="track"><i style={{ width: `${(s.count / smax) * 100}%`, animationDelay: `${i * 0.05}s` }} /></div></div>))}</div>
          : <div className="empty">Sem atendimentos no período</div>}
      </div>
      {isOwner ? (
        <div className="card"><h3>Recebido por forma de pagamento</h3>
          {d.by_payment.length ? <div className="hbars">{d.by_payment.map((b, i) => (
            <div className="hb" key={b.method}><div className="row"><span>{PAYMENT[b.method as Payment] ?? "Não informado"}</span><span className="num">{brl(b.revenue_cents)} · {pct(b.revenue_cents / ptot)}</span></div>
              <div className="track"><i style={{ width: `${(b.revenue_cents / pmax) * 100}%`, animationDelay: `${i * 0.05}s` }} /></div></div>))}</div>
            : <div className="empty">Nada recebido ainda</div>}
        </div>
      ) : (
        <div className="card"><h3>Comissão</h3><div className="notice">Você recebe <b>{myPro?.commission_pct ?? 0}%</b> de cada atendimento concluído. No período: <b>{brl(d.revenue_cents * k)}</b> de {brl(d.revenue_cents)} faturados.</div></div>
      )}
    </div>

    {isOwner && (
      <div className="grid two-eq">
        <div className="card"><h3>Próximos atendimentos<Link className="btn gray" href="/painel/agenda" style={{ height: 30, fontSize: 13, padding: "0 12px" }}>Ver agenda</Link></h3>
          <div className="list">{next.map((a) => <BookingRow key={a.id} a={a} />)}{!next.length && <div className="empty">Nenhum horário pela frente</div>}</div></div>
        <div className="card"><h3>Comissões do período</h3>
          <div className="list">{d.by_professional.filter((x) => x.revenue_cents > 0).map((x) => (
            <div className="li" key={x.id}><img src={pro(x.id)?.photo_url ?? "/logo.png"} alt="" /><div className="m"><div className="a">{x.name}</div><div className="b">{x.commission_pct}% de {brl(x.revenue_cents)}</div></div><div className="t num">{brl(x.commission_cents)}</div></div>))}
            {!d.by_professional.some((x) => x.revenue_cents > 0) && <div className="empty">Sem atendimentos concluídos</div>}
          </div></div>
      </div>
    )}
    <button className="fab" onClick={() => openPanel("Novo agendamento", <NewBooking defaultDate={date} />)}><Icon name="plus" /><span>Novo agendamento</span></button>
  </>);
}
