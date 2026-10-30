"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BusinessHour, Professional, Profile, Service } from "@/lib/types";
import { Icon, type IconName } from "@/components/icons";
import { addDays, dayKey, initials, hm, dayLabel } from "@/lib/format";
import PushToggle from "./PushToggle";

export type Period = "day" | "week" | "month";
interface Ctx {
  me: Profile;
  myPro: Professional | null;
  isOwner: boolean;
  pros: Professional[];
  services: Service[];
  hours: BusinessHour[];
  pro: (id: string | null | undefined) => Professional | undefined;
  svc: (id: string) => Service | undefined;
  period: Period; setPeriod: (p: Period) => void;
  date: string; setDate: (d: string) => void;
  range: () => { from: string; to: string; n: number; prevFrom: string; prevTo: string };
  bump: number; refresh: () => void;
  toast: (m: string) => void;
  panel: { title: string; body: React.ReactNode } | null;
  openPanel: (title: string, body: React.ReactNode) => void;
  closePanel: () => void;
}
const C = createContext<Ctx | null>(null);
export const usePanel = () => { const c = useContext(C); if (!c) throw new Error("fora do painel"); return c; };

interface NavItem { href: string; label: string; short: string; icon: IconName; owner?: boolean }
export const NAV: NavItem[] = [
  { href: "/painel", label: "Visão geral", short: "Geral", icon: "grid" },
  { href: "/painel/agenda", label: "Agenda do dia", short: "Agenda", icon: "cal" },
  { href: "/painel/agendamentos", label: "Agendamentos", short: "Lista", icon: "list" },
  { href: "/painel/bloqueios", label: "Bloqueios e folgas", short: "Bloqueios", icon: "clock" },
  { href: "/painel/equipe", label: "Equipe e comissões", short: "Equipe", icon: "team", owner: true },
  { href: "/painel/servicos", label: "Serviços e horários", short: "Serviços", icon: "scissors", owner: true },
  { href: "/painel/clientes", label: "Clientes", short: "Clientes", icon: "people", owner: true },
];

export default function PanelApp(props: {
  me: Profile; myPro: Professional | null; pros: Professional[]; services: Service[]; hours: BusinessHour[]; children: React.ReactNode;
}) {
  const sb = supabaseBrowser();
  const path = usePathname();
  const router = useRouter();
  const isOwner = props.me.role === "owner";
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState(dayKey());
  const [bump, setBump] = useState(0);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<Ctx["panel"]>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [banner, setBanner] = useState<{ t: string; b: string; id: string } | null>(null);

  const toast = useCallback((m: string) => {
    setToastMsg(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);
  const proById = useCallback((id: string | null | undefined) => props.pros.find((p) => p.id === id), [props.pros]);

  // tempo real: qualquer mudança em agendamentos/bloqueios atualiza as telas
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const ch = sb.channel("painel")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (payload: { eventType: string; new: Record<string, string> }) => {
        setBump((n) => n + 1);
        if (payload.eventType === "INSERT") {
          const r = payload.new; const p = props.pros.find((x) => x.id === r.professional_id);
          setBanner({ t: "Novo agendamento ✂️", b: `${(r.client_name || "").split(" ")[0]} com ${p?.name ?? ""} · ${dayLabel(dayKey(r.starts_at)).toLowerCase()} às ${hm(r.starts_at)}`, id: r.id });
          setTimeout(() => setBanner(null), 5500);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "time_blocks" }, () => setBump((n) => n + 1))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, props.pros]);

  const value = useMemo<Ctx>(() => ({
    me: props.me, myPro: props.myPro, isOwner, pros: props.pros, services: props.services, hours: props.hours,
    pro: proById, svc: (id) => props.services.find((s) => s.id === id),
    period, setPeriod, date, setDate,
    range: () => {
      const n = period === "day" ? 1 : period === "week" ? 7 : 30;
      const from = addDays(date, -(n - 1));
      return { from, to: date, n, prevFrom: addDays(from, -n), prevTo: addDays(from, -1) };
    },
    bump, refresh: () => setBump((n) => n + 1),
    toast, panel,
    openPanel: (title, body) => setPanel({ title, body }),
    closePanel: () => setPanel(null),
  }), [props, isOwner, proById, period, date, bump, toast, panel]);

  const nav = NAV.filter((n) => !n.owner || isOwner);
  const mobileNav = [...nav.slice(0, 4), { href: "/painel/mais", label: "Mais", short: "Mais", icon: "info" as IconName }];
  const active = (href: string) => (href === "/painel" ? path === "/painel" : path.startsWith(href));

  async function logout() { await sb.auth.signOut(); router.replace("/painel/login"); }

  return (
    <C.Provider value={value}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><img src="/logo.png" alt="" /><div><b>Saraiva</b><span>Painel da barbearia</span></div></div>
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`nav ${active(n.href) ? "on" : ""}`} style={{ textDecoration: "none" }}><Icon name={n.icon} />{n.label}</Link>
          ))}
          <div className="role" style={{ marginTop: "auto" }}>
            <PushToggle />
            <div className="user-card">
              <span className="av">{props.myPro?.photo_url ? <img src={props.myPro.photo_url} alt="" /> : initials(props.me.name || "?")}</span>
              <div><b>{props.me.name || "Sem nome"}</b><span>{isOwner ? "Dono" : props.myPro?.name ?? "Equipe"}</span></div>
              <button onClick={logout}>Sair</button>
            </div>
          </div>
        </aside>
        <main className="main"><div className="page" key={path}>{props.children}</div></main>
      </div>
      <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${mobileNav.length},1fr)` }}>
        {mobileNav.map((n) => (
          <Link key={n.href} href={n.href} className={active(n.href) ? "on" : ""} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 500, color: active(n.href) ? "#fff" : "#8e8e93", padding: "4px 0" }}>
            <Icon name={n.icon} /><span>{n.short}</span>
          </Link>
        ))}
      </nav>

      <div className={`scrim ${panel ? "on" : ""}`} onClick={() => setPanel(null)} />
      <aside className={`panel ${panel ? "on" : ""}`}>
        <div className="ph"><b>{panel?.title}</b><button onClick={() => setPanel(null)}>Fechar</button></div>
        <div className="pb">{panel?.body}</div>
      </aside>

      <div className={`push ${banner ? "on" : ""}`} onClick={() => { setBanner(null); router.push("/painel/agenda"); }}>
        {banner && <><img src="/icons/icon-192.png" alt="" /><div className="m"><div className="h"><span>Saraiva · Painel</span><span>agora</span></div><b>{banner.t}</b><p>{banner.b}</p></div></>}
      </div>
      <div className={`toast ${toastMsg ? "on" : ""}`}>{toastMsg}</div>
    </C.Provider>
  );
}
