"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { BusinessHour, Professional, Profile, Service } from "@/lib/types";
import { Icon } from "@/components/icons";
import BookingSheet, { type BookingOpts } from "./BookingSheet";

export interface Catalog {
  pros: Professional[];
  services: Service[];
  hours: BusinessHour[];
}
interface ActionBtn { label: string; danger?: boolean; run: () => void }
interface Ctx extends Catalog {
  user: User | null;
  profile: Profile | null;
  authReady: boolean;
  refreshProfile: () => Promise<void>;
  openBooking: (o?: BookingOpts) => void;
  toast: (msg: string, ok?: boolean) => void;
  ask: (msg: string, buttons: ActionBtn[]) => void;
  pro: (id: string | null | undefined) => Professional | undefined;
  bump: number; // muda quando um agendamento é criado/cancelado
  setBump: (fn: (n: number) => number) => void;
}
const C = createContext<Ctx | null>(null);
export const useClient = () => {
  const c = useContext(C);
  if (!c) throw new Error("useClient fora do ClientApp");
  return c;
};

const TITLES: Record<string, string> = { "/": "Barbearia Saraiva", "/horarios": "Meus horários", "/perfil": "Perfil", "/barbearia": "A Barbearia" };

export default function ClientApp({ catalog, children }: { catalog: Catalog; children: React.ReactNode }) {
  const sb = supabaseBrowser();
  const path = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [booking, setBooking] = useState<BookingOpts | null>(null);
  const [toastMsg, setToastMsg] = useState<{ m: string; ok: boolean } | null>(null);
  const [action, setAction] = useState<{ msg: string; buttons: ActionBtn[] } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [bump, setBump] = useState(0);
  const viewRef = useRef<HTMLElement>(null);
  const tt = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); return; }
    const { data } = await sb.from("profiles").select("*").eq("id", u.id).single();
    setProfile(data as Profile | null);
  }, [sb]);

  useEffect(() => {
    sb.auth.getUser().then(({ data }: { data: { user: User | null } }) => {
      setUser(data.user); loadProfile(data.user).finally(() => setAuthReady(true));
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, s: { user: User } | null) => {
      setUser(s?.user ?? null); loadProfile(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, loadProfile]);

  useEffect(() => { viewRef.current?.scrollTo({ top: 0 }); setScrolled(false); }, [path]);

  // registra o service worker (cache das fotos/ícones)
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const toast = useCallback((m: string, ok = true) => {
    setToastMsg({ m, ok }); clearTimeout(tt.current);
    tt.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...catalog, user, profile, authReady,
    refreshProfile: () => loadProfile(user),
    openBooking: (o = {}) => { haptic(12); setBooking(o); },
    toast,
    ask: (msg, buttons) => setAction({ msg, buttons }),
    pro: (id) => catalog.pros.find((p) => p.id === id),
    bump, setBump,
  }), [catalog, user, profile, authReady, loadProfile, toast, bump]);

  const tabs = [
    { href: "/", label: "Início", icon: "home" as const },
    { href: "#agendar", label: "Agendar", icon: "scissors" as const },
    { href: "/horarios", label: "Horários", icon: "cal" as const },
    { href: "/perfil", label: "Perfil", icon: "person" as const },
    { href: "/barbearia", label: "Barbearia", icon: "info" as const },
  ];

  return (
    <C.Provider value={value}>
      <header className={`navbar ${scrolled ? "scrolled" : ""}`} id="navbar">
        <div className="t">{TITLES[path] ?? ""}</div>
      </header>
      <main id="view" ref={viewRef} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 38)}>
        <div className="page" key={path}>{children}</div>
      </main>
      <nav className="tabbar">
        {tabs.map((t) =>
          t.href === "#agendar" ? (
            <button key={t.href} className="tab" onClick={() => value.openBooking()}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ) : (
            <Link key={t.href} href={t.href} className={`tab ${path === t.href ? "on" : ""}`} onClick={() => haptic()} style={{ textDecoration: "none" }}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </Link>
          ),
        )}
      </nav>

      <BookingSheet opts={booking} onClose={() => setBooking(null)} />

      <div className={`scrim2 ${action ? "on" : ""}`} onClick={() => setAction(null)} />
      <div className={`action ${action ? "on" : ""}`}>
        {action && (
          <>
            <div className="g">
              <div className="msg">{action.msg}</div>
              {action.buttons.map((b, i) => (
                <button key={i} className={b.danger ? "d" : ""} onClick={() => { setAction(null); b.run(); }}>{b.label}</button>
              ))}
            </div>
            <div className="g"><button className="b" onClick={() => setAction(null)}>Voltar</button></div>
          </>
        )}
      </div>
      <div className={`toast ${toastMsg ? "on" : ""}`}>
        {toastMsg && <><Icon name={toastMsg.ok ? "check" : "x"} />{toastMsg.m}</>}
      </div>
    </C.Provider>
  );
}

export function haptic(n: number | number[] = 8) {
  try { navigator.vibrate?.(n); } catch { /* sem vibração */ }
}
