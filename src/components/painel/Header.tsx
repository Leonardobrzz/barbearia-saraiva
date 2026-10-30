"use client";

import { Icon } from "@/components/icons";
import { MO, WDL, addDays, dayKey, weekday } from "@/lib/format";
import { usePanel, type Period } from "./PanelApp";

export default function Header({ title, period = true, dateNav = true, dayOnly = false }: { title: string; period?: boolean; dateNav?: boolean; dayOnly?: boolean }) {
  const { isOwner, me, myPro, period: per, setPeriod, date, setDate, range } = usePanel();
  const p: Period = dayOnly ? "day" : per;
  const step = p === "day" ? 1 : range().n;
  let label: string;
  const today = dayKey();
  if (p === "day") {
    label = date === today ? "Hoje" : date === addDays(today, -1) ? "Ontem" : date === addDays(today, 1) ? "Amanhã"
      : `${WDL[weekday(date)]}, ${Number(date.slice(8))} ${MO[Number(date.slice(5, 7)) - 1]}`;
  } else {
    const r = range();
    label = `${Number(r.from.slice(8))} ${MO[Number(r.from.slice(5, 7)) - 1]} – ${Number(r.to.slice(8))} ${MO[Number(r.to.slice(5, 7)) - 1]}`;
  }
  return (<>
    <div className="mobile-top"><img src="/logo.png" alt="" /><span style={{ fontSize: 13, color: "var(--l2)" }}>{isOwner ? "Dono" : myPro?.name}</span></div>
    <div className="top">
      <div><div className="eyebrow">{isOwner ? "Barbearia Saraiva" : `Olá, ${(me.name || myPro?.name || "").split(" ")[0]}`}</div><h1>{title}</h1></div>
      <div className="controls">
        {period && !dayOnly && (
          <div className="seg">
            {([["day", "Dia"], ["week", "7 dias"], ["month", "30 dias"]] as [Period, string][]).map(([k, l]) => (
              <button key={k} className={per === k ? "on" : ""} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
        )}
        {dateNav && (
          <div className="datenav">
            <button aria-label="Anterior" onClick={() => setDate(addDays(date, -step))}><Icon name="left" /></button>
            <button className="d" onClick={() => setDate(today)}>{label}</button>
            <button aria-label="Próximo" onClick={() => setDate(addDays(date, step))}><Icon name="right" /></button>
          </div>
        )}
      </div>
    </div>
  </>);
}
