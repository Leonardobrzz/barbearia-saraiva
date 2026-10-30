"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) return setErr("E-mail ou senha incorretos.");
    router.replace("/painel"); router.refresh();
  }

  return (
    <div className="login">
      <form className="box" onSubmit={go}>
        <img src="/logo.png" alt="" />
        <h1>Painel Saraiva</h1>
        <p>Acesso do dono e dos barbeiros</p>
        <div className="field"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></div>
        <div className="field"><label>Senha</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" required /></div>
        <div className="err">{err}</div>
        <button className="btn primary full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        <p style={{ fontSize: 13, marginTop: 18 }}>Esqueceu a senha? Fale com o dono da barbearia.</p>
      </form>
    </div>
  );
}
