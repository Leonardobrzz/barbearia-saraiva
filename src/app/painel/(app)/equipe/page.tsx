"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Header from "@/components/painel/Header";
import { usePanel } from "@/components/painel/PanelApp";
import { brl, errMsg } from "@/lib/format";
import type { Category, Dashboard, Professional } from "@/lib/types";

export default function Equipe() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const { isOwner, pros, range, period, date, bump, toast, openPanel, closePanel } = usePanel();
  const [d, setD] = useState<Dashboard | null>(null);

  useEffect(() => {
    const r = range();
    sb.rpc("dashboard", { p_from: r.from, p_to: r.to }).then(({ data }: { data: Dashboard | null }) => setD(data));
  }, [period, date, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOwner) return <div className="card empty">Só o dono acessa esta página.</div>;
  const reload = () => router.refresh();

  async function patchPro(id: string, patch: Partial<Professional>, msg: string) {
    const { error } = await sb.from("professionals").update(patch).eq("id", id);
    if (error) return toast(errMsg(error));
    toast(msg); reload();
  }

  const totC = d?.by_professional.reduce((s, x) => s + x.commission_cents, 0) ?? 0;
  const perDayOpen = d && d.by_professional.length ? d.open_minutes / Math.max(1, pros.filter((p) => p.active).length) : 0;

  return (<>
    <Header title="Equipe e comissões" />
    {d && <div className="totals" style={{ margin: "-6px 4px 14px" }}><span>Faturamento <b>{brl(d.revenue_cents)}</b></span><span>Comissões <b>{brl(totC)}</b></span><span>Fica para a casa <b>{brl(d.revenue_cents - totC)}</b></span></div>}
    <div className="grid team">
      {pros.map((p) => {
        const s = d?.by_professional.find((x) => x.id === p.id);
        const occ = s && perDayOpen ? s.booked_minutes / perDayOpen : 0;
        return (
          <div className="card tm" key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
            <div className="ph"><img src={p.photo_url ?? "/logo.png"} alt="" /><div className="nm"><b>{p.name}</b><span>{p.role_label}{p.active ? "" : " · inativo"}</span></div></div>
            <div className="stats">
              <div><div className="k">Atendimentos</div><div className="v num">{s?.count ?? 0}</div></div>
              <div><div className="k">Faturou</div><div className="v num">{brl(s?.revenue_cents ?? 0)}</div></div>
              <div><div className="k">Ocupação</div><div className="v num">{Math.round(occ * 100)}%</div></div>
              <div><div className="k">Comissão a pagar</div><div className="v num">{brl(s?.commission_cents ?? 0)}</div></div>
            </div>
            <div className="acts">
              <label className="commission">Comissão <input type="number" min={0} max={100} defaultValue={p.commission_pct}
                onBlur={(e) => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); if (v !== Number(p.commission_pct)) patchPro(p.id, { commission_pct: v }, "Comissão atualizada"); }} />%</label>
              <button className="btn gray" style={{ marginLeft: "auto" }} onClick={() => openPanel(p.name, <ProEditor p={p} onSaved={() => { closePanel(); reload(); }} />)}>Editar</button>
            </div>
            <div style={{ padding: "0 12px 12px", fontSize: 12.5, color: p.user_id ? "var(--good-t)" : "var(--l2)" }}>{p.user_id ? "● Acesso ao painel ativo" : "○ Sem acesso ao painel"}</div>
          </div>
        );
      })}
      <button className="card" style={{ display: "grid", placeItems: "center", minHeight: 200, border: "1.5px dashed var(--sep)", background: "transparent", color: "var(--l2)", fontWeight: 600 }}
        onClick={() => openPanel("Novo profissional", <ProEditor onSaved={() => { closePanel(); reload(); }} />)}>+ Adicionar profissional</button>
    </div>
  </>);
}

function ProEditor({ p, onSaved }: { p?: Professional; onSaved: () => void }) {
  const sb = supabaseBrowser();
  const { toast } = usePanel();
  const [name, setName] = useState(p?.name ?? "");
  const [label, setLabel] = useState(p?.role_label ?? "Barbeiro");
  const [cat, setCat] = useState<Category>(p?.category ?? "barber");
  const [photo, setPhoto] = useState(p?.photo_url ?? "");
  const [active, setActive] = useState(p?.active ?? true);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (name.trim().length < 2) return toast("Informe o nome");
    setBusy(true);
    const row = { name: name.trim(), role_label: label.trim(), category: cat, photo_url: photo.trim() || null, active };
    const { error } = p ? await sb.from("professionals").update(row).eq("id", p.id) : await sb.from("professionals").insert({ ...row, sort: 99 });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Salvo"); onSaved();
  }
  async function access(body: Record<string, unknown>, method: "POST" | "PATCH", msg: string) {
    setBusy(true);
    const r = await fetch("/api/staff", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ professional_id: p!.id, ...body }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) return toast(j.error ?? "Erro");
    toast(msg); onSaved();
  }

  return (<>
    <div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
    <div className="field"><label>Função</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
    <div className="field"><label>Área</label><select value={cat} onChange={(e) => setCat(e.target.value as Category)}><option value="barber">Barbearia</option><option value="beauty">Unhas & Estética</option></select></div>
    <div className="field"><label>Foto (endereço da imagem)</label><input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="/team/nome.jpg" /></div>
    <div className="field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
      <span>Aparece no app e recebe agendamentos</span><button className={`switch ${active ? "on" : ""}`} onClick={() => setActive((v) => !v)} aria-label="Ativo" />
    </div>
    <button className="btn primary full" disabled={busy} onClick={save}>Salvar</button>

    {p && (<>
      <h3 style={{ margin: "24px 0 10px", fontSize: 17 }}>Acesso ao painel</h3>
      {p.user_id ? (<>
        <p className="notice" style={{ marginBottom: 10 }}>{p.name} já entra no painel com o e-mail cadastrado e vê só a própria agenda e ganhos.</p>
        <div className="field"><label>Nova senha</label><input type="text" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="mínimo 8 caracteres" /></div>
        <div className="acts2">
          <button className="btn gray" disabled={busy} onClick={() => access({ password: pass }, "PATCH", "Senha alterada")}>Trocar senha</button>
          <button className="btn danger" disabled={busy} onClick={() => access({ revoke: true }, "PATCH", "Acesso removido")}>Remover acesso</button>
        </div>
      </>) : (<>
        <p className="notice" style={{ marginBottom: 10 }}>Crie um login para {p.name} ver a própria agenda, marcar atendimentos e bloquear horários pelo celular.</p>
        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Senha inicial</label><input type="text" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="mínimo 8 caracteres" /></div>
        <button className="btn primary full" disabled={busy} onClick={() => access({ email, password: pass }, "POST", "Acesso criado")}>Criar acesso</button>
      </>)}
    </>)}
  </>);
}
