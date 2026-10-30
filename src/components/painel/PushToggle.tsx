"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Liga/desliga as notificações push deste aparelho. */
export default function PushToggle() {
  const sb = supabaseBrowser();
  const [state, setState] = useState<"loading" | "unsupported" | "ios-install" | "off" | "on" | "denied">("loading");

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    });
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("push_subscriptions").upsert(
      { user_id: user!.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
      { onConflict: "endpoint" },
    );
    setState("on");
  }
  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off");
  }

  const label: Record<typeof state, string> = {
    loading: "…", unsupported: "Este navegador não suporta", "ios-install": "No iPhone: Compartilhar → Adicionar à Tela de Início",
    off: "Desligadas neste aparelho", on: "Ligadas neste aparelho", denied: "Bloqueadas nas configurações do navegador",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Notificações</div>
        <div style={{ fontSize: 11.5, color: "var(--l2)" }}>{label[state]}</div>
      </div>
      {(state === "on" || state === "off") && (
        <button className={`switch ${state === "on" ? "on" : ""}`} aria-label="Notificações" onClick={state === "on" ? disable : enable} />
      )}
    </div>
  );
}
