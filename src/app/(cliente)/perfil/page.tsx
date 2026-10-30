"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { useClient, haptic } from "@/components/cliente/ClientApp";
import PhoneAuth from "@/components/cliente/PhoneAuth";
import { MO, MOL, brl, dayKey, initials, maskPhone } from "@/lib/format";
import type { Appointment } from "@/lib/types";

export default function Perfil() {
  const sb = supabaseBrowser();
  const { user, profile, authReady, pros, pro, toast, ask, openBooking, refreshProfile, bump } = useClient();
  const [hist, setHist] = useState<Appointment[] | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => { setName(profile?.name ?? ""); setNote(profile?.haircut_note ?? ""); }, [profile]);
  useEffect(() => {
    if (!user) return;
    sb.from("appointments").select("*, appointment_services(*)").eq("client_id", user.id)
      .or(`status.in.(done,no_show,cancelled),ends_at.lt.${new Date().toISOString()}`)
      .order("starts_at", { ascending: false }).limit(50)
      .then(({ data }: { data: Appointment[] | null }) => setHist(data ?? []));
  }, [user, bump, sb]);

  if (!authReady) return <div className="spinner" />;

  if (!user || !profile) return (<>
    <div className="largetitle"><div><h1>Minha conta</h1></div></div>
    <div className="auth">
      <div className="hero-a"><img src="/logo.png" alt="" /><h2>Entre ou crie sua conta</h2><p>Só seu nome e WhatsApp. Seus cortes ficam salvos aqui.</p></div>
    </div>
    <PhoneAuth />
  </>);

  const h = hist ?? [];
  const done = h.filter((b) => b.status === "done");
  const spent = done.reduce((a, b) => a + b.total_cents, 0);
  const cnt: Record<string, number> = {};
  done.forEach((b) => (cnt[b.professional_id] = (cnt[b.professional_id] || 0) + 1));
  const top = pro(Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] ?? profile.favorite_professional_id);
  const since = new Date(profile.created_at);

  async function save() {
    if (name.trim().length < 2) return toast("Digite seu nome", false);
    const { error } = await sb.from("profiles").update({ name: name.trim(), haircut_note: note.trim() }).eq("id", user!.id);
    if (error) return toast("Não foi possível salvar", false);
    haptic(15); toast("Perfil atualizado"); refreshProfile();
  }
  async function setFav(id: string) {
    haptic();
    const v = profile!.favorite_professional_id === id ? null : id;
    await sb.from("profiles").update({ favorite_professional_id: v }).eq("id", user!.id);
    await refreshProfile(); toast(v ? `${pro(v)?.name} é seu favorito` : "Favorito removido", !!v);
  }

  return (<>
    <div className="largetitle"><div><h1>Perfil</h1></div></div>
    <div className="phead">
      <div className="avatar">{initials(profile.name || "?")}</div>
      <div className="n">{profile.name}</div>
      <div className="p">{profile.phone ? maskPhone(profile.phone) : ""}</div>
      <span className="since">Cliente desde {MOL[since.getMonth()]} de {since.getFullYear()}</span>
    </div>
    <div className="stats stagger">
      <div className="stat"><div className="v">{done.length}</div><div className="k">{done.length === 1 ? "Atendimento" : "Atendimentos"}</div></div>
      <div className="stat"><div className="v">{brl(spent)}</div><div className="k">Investido</div></div>
      <div className="stat">{top ? <><img src={top.photo_url ?? ""} alt="" /><div className="k" style={{ color: "#fff", fontWeight: 600 }}>{top.name}</div><div className="k">Seu barbeiro</div></> : <><div className="v">–</div><div className="k">Favorito</div></>}</div>
    </div>

    <div className="section"><div className="section-h"><h2>Histórico de cortes</h2></div>
      <div className="group stagger">
        {hist === null ? <div className="spinner" /> : h.length === 0 ? (
          <div className="empty" style={{ padding: "26px 16px" }}><Icon name="scissors" /><div>Seus cortes aparecem aqui depois de cada atendimento.</div></div>
        ) : h.map((b) => {
          const p = pro(b.professional_id), [y, m, d] = dayKey(b.starts_at).split("-").map(Number), items = b.appointment_services ?? [];
          const cx = b.status === "cancelled" || b.status === "no_show";
          return (
            <div className={`hist ${cx ? "cx" : ""}`} key={b.id}>
              <img src={p?.photo_url ?? ""} alt="" />
              <div className="m"><div className="a">{items.map((i) => i.name).join(" + ")}</div>
                <div className="b">{d} {MO[m - 1]} {y} · {p?.name} · {b.status === "cancelled" ? "cancelado" : b.status === "no_show" ? "faltou" : brl(b.total_cents)}</div></div>
              <button className="again press" onClick={() => openBooking({ pro: b.professional_id, services: items.map((i) => i.service_id) })}>Repetir</button>
            </div>
          );
        })}
      </div>
    </div>

    <div className="section"><div className="section-h"><h2>Profissional favorito</h2></div>
      <div className="group"><div className="favs">
        {pros.map((p) => (
          <button key={p.id} className={`fav ${profile.favorite_professional_id === p.id ? "on" : ""}`} onClick={() => setFav(p.id)}>
            <img src={p.photo_url ?? ""} alt="" /><span>{p.name}</span>
          </button>
        ))}
      </div></div>
    </div>

    <div className="section"><div className="section-h"><h2>Meus dados</h2></div>
      <div className="field"><label>Nome</label><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></div>
      <div className="field"><label>Telefone</label><input value={profile.phone ? maskPhone(profile.phone) : ""} disabled style={{ color: "var(--l2)" }} /></div>
      <div className="field"><label>Como gosto do meu corte</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: degradê baixo, risquinho do lado, barba desenhada…" /></div>
      <button className="btn gray" onClick={save}>Salvar alterações</button>
    </div>

    <div className="section"><div className="group">
      <button className="row plain" onClick={() => ask("Sair da sua conta neste aparelho?", [{ label: "Sair", danger: true, run: async () => { await sb.auth.signOut(); toast("Você saiu da conta"); } }])}>
        <div className="main"><div className="a" style={{ color: "#0a84ff" }}>Sair da conta</div></div></button>
      <button className="row plain" onClick={() => ask("Excluir sua conta? Seus dados pessoais são apagados e não dá pra desfazer.", [{
        label: "Excluir conta", danger: true, run: async () => {
          const r = await fetch("/api/account", { method: "DELETE" });
          if (!r.ok) return toast("Não foi possível excluir", false);
          await sb.auth.signOut(); toast("Conta excluída");
        },
      }])}><div className="main"><div className="a" style={{ color: "var(--red)" }}>Excluir conta</div></div></button>
    </div></div>
    <div className="foot">Barbearia Saraiva</div>
  </>);
}
