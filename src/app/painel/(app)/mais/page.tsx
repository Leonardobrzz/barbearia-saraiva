"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "@/components/icons";
import { NAV, usePanel } from "@/components/painel/PanelApp";
import PushToggle from "@/components/painel/PushToggle";

export default function Mais() {
  const { isOwner, me, myPro } = usePanel();
  const router = useRouter();
  const items = NAV.filter((n) => !n.owner || isOwner).slice(4);
  return (<>
    <div className="top"><div><div className="eyebrow">{me.name || myPro?.name}</div><h1>Mais</h1></div></div>
    {items.length > 0 && <div className="mais" style={{ marginBottom: 14 }}>{items.map((n) => <Link key={n.href} href={n.href}><Icon name={n.icon} />{n.label}</Link>)}</div>}
    <div className="card" style={{ marginBottom: 14 }}><PushToggle /></div>
    <div className="mais">
      <button onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/painel/login"); }} style={{ color: "var(--crit-t)" }}>Sair da conta</button>
    </div>
  </>);
}
