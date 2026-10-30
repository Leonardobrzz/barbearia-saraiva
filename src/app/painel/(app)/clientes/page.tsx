"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import Header from "@/components/painel/Header";
import { usePanel } from "@/components/painel/PanelApp";
import { MO, brl, maskPhone, waLink } from "@/lib/format";

interface C { name: string; phone: string; visits: number; spent: number; last_visit: string; fav_pro: string | null; no_shows?: number }
interface Report { active: number; new: number; top: C[]; lost: C[]; no_shows: C[] }

export default function Clientes() {
  const sb = supabaseBrowser();
  const { isOwner, pro, range, period, date, bump } = usePanel();
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => {
    const x = range();
    sb.rpc("clients_report", { p_from: x.from, p_to: x.to }).then(({ data }: { data: Report | null }) => setR(data));
  }, [period, date, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOwner) return <div className="card empty">Só o dono acessa esta página.</div>;
  if (!r) return <><Header title="Clientes" /><div className="spinner" /></>;

  const last = (k: string) => (k ? `${Number(k.slice(8))} ${MO[Number(k.slice(5, 7)) - 1]}` : "—");
  const row = (c: C, extra: React.ReactNode) => { const p = pro(c.fav_pro); return (
    <div className="li" key={c.name + c.phone}><img src={p?.photo_url ?? "/logo.png"} alt="" title={p ? `Costuma ser atendido por ${p.name}` : ""} />
      <div className="m"><div className="a">{c.name}</div><div className="b">{c.visits} visitas · última {last(c.last_visit)}{p ? ` · com ${p.name}` : ""}</div></div>{extra}</div>); };

  return (<>
    <Header title="Clientes" />
    <div className="grid kpis k3">
      <div className="card kpi"><div className="k"><Icon name="people" />Clientes atendidos</div><div className="v num">{r.active}</div><div className="foot">no período selecionado</div></div>
      <div className="card kpi"><div className="k"><Icon name="plus" />Clientes novos</div><div className="v num">{r.new}</div><div className="foot">primeira visita no período</div></div>
      <div className="card kpi"><div className="k"><Icon name="warn" />Sumidos</div><div className="v num">{r.lost.length}</div><div className="foot">30+ dias sem voltar</div></div>
    </div>
    <div className="grid two-eq">
      <div className="card"><h3>Melhores clientes<small>por valor gasto</small></h3><div className="list">
        {r.top.map((c) => row(c, <div className="t num">{brl(c.spent)}</div>))}{!r.top.length && <div className="empty">Sem clientes ainda</div>}</div></div>
      <div className="card"><h3>Chamar de volta<small>frequentes que sumiram</small></h3><div className="list">
        {r.lost.map((c) => row(c, c.phone ? (
          <a className="btn wa" style={{ height: 32, fontSize: 13, padding: "0 10px" }} target="_blank" rel="noopener"
            href={waLink("55" + c.phone.replace(/\D/g, "").replace(/^55/, ""), `Fala, ${c.name.split(" ")[0]}! Sentimos sua falta aqui na Barbearia Saraiva 💈 Bora marcar seu horário?`)}><Icon name="wa" />Chamar</a>
        ) : <span className="st canc">sem telefone</span>))}
        {!r.lost.length && <div className="empty">Ninguém sumido 🎉</div>}</div></div>
    </div>
    <div className="grid two-eq">
      <div className="card"><h3>Clientes que mais faltaram</h3><div className="list">
        {r.no_shows.map((c) => (<div className="li" key={c.name + c.phone}><div className="m"><div className="a">{c.name}</div><div className="b">{c.phone ? maskPhone(c.phone) : "sem telefone"}</div></div>
          <span className="st miss"><Icon name="sx" />{c.no_shows} falta{c.no_shows === 1 ? "" : "s"}</span></div>))}
        {!r.no_shows.length && <div className="empty">Nenhuma falta registrada</div>}</div></div>
    </div>
  </>);
}
