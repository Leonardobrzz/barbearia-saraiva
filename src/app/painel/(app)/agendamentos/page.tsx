"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import Header from "@/components/painel/Header";
import { BookingDetail, StatusBadge } from "@/components/painel/bookings";
import { usePanel } from "@/components/painel/PanelApp";
import { STATUS, WD, addDays, brl, dayKey, hm, localToIso, weekday } from "@/lib/format";
import type { Appointment, Status } from "@/lib/types";

export default function Lista() {
  const sb = supabaseBrowser();
  const { isOwner, pros, pro, range, period, date, bump, openPanel } = usePanel();
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [q, setQ] = useState("");
  const [fp, setFp] = useState("");
  const [fs, setFs] = useState<Status | "">("");

  useEffect(() => {
    const r = range();
    let query = sb.from("appointments").select("*, appointment_services(*)")
      .gte("starts_at", localToIso(r.from, "00:00")).lt("starts_at", localToIso(addDays(r.to, 1), "00:00"))
      .order("starts_at", { ascending: false }).limit(1000);
    if (fp) query = query.eq("professional_id", fp);
    if (fs) query = query.eq("status", fs);
    setRows(null);
    query.then(({ data }: { data: Appointment[] | null }) => setRows(data ?? []));
  }, [period, date, fp, fs, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = q.trim().toLowerCase(), digits = q.replace(/\D/g, "");
  const L = (rows ?? []).filter((a) => !needle || a.client_name.toLowerCase().includes(needle) || (digits && a.client_phone.includes(digits)));
  const done = L.filter((a) => a.status === "done");

  return (<>
    <Header title="Agendamentos" />
    <div className="filters">
      <div className="search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente ou telefone" /></div>
      {isOwner && <select value={fp} onChange={(e) => setFp(e.target.value)}><option value="">Todos os profissionais</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      <select value={fs} onChange={(e) => setFs(e.target.value as Status | "")}><option value="">Todos os status</option>{(Object.keys(STATUS) as Status[]).map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select>
    </div>
    {rows === null ? <div className="spinner" /> : (<>
      <div className="tablewrap"><table>
        <thead><tr><th>Data</th><th>Hora</th><th>Cliente</th><th>Serviços</th>{isOwner && <th>Profissional</th>}<th>Status</th><th>Origem</th><th className="r">Valor</th></tr></thead>
        <tbody>
          {L.map((a) => { const k = dayKey(a.starts_at), p = pro(a.professional_id); return (
            <tr key={a.id} onClick={() => openPanel("Agendamento", <BookingDetail id={a.id} />)}>
              <td>{WD[weekday(k)]} {k.slice(8)}/{k.slice(5, 7)}</td><td className="num">{hm(a.starts_at)}</td><td>{a.client_name}</td>
              <td>{(a.appointment_services ?? []).map((s) => s.name).join(" + ")}</td>
              {isOwner && <td><span className="who"><img src={p?.photo_url ?? "/logo.png"} alt="" />{p?.name}</span></td>}
              <td><StatusBadge s={a.status} /></td><td style={{ color: "var(--l2)" }}>{a.origin === "app" ? "App" : "Balcão/WhatsApp"}</td>
              <td className="r num">{brl(a.total_cents)}</td>
            </tr>); })}
          {!L.length && <tr><td colSpan={8} className="empty">Nenhum agendamento com esses filtros</td></tr>}
        </tbody>
      </table></div>
      <div className="totals"><span><b>{L.length}</b> agendamentos</span><span><b>{done.length}</b> atendidos</span>
        <span>Realizado <b>{brl(done.reduce((s, a) => s + a.total_cents, 0))}</b></span><span>Faltas <b>{L.filter((a) => a.status === "no_show").length}</b></span></div>
    </>)}
  </>);
}
