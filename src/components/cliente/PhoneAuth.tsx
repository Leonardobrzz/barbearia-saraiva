"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { errMsg, maskPhone, toE164 } from "@/lib/format";
import { useClient, haptic } from "./ClientApp";

/** Login/cadastro só com nome + telefone, confirmado por código SMS. */
export default function PhoneAuth({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const sb = supabaseBrowser();
  const { toast, refreshProfile } = useClient();
  const [step, setStep] = useState<"form" | "code">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function sendCode() {
    setErr("");
    if (name.trim().length < 2) return setErr("Digite seu nome.");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) return setErr("Digite um telefone válido com DDD.");
    setBusy(true);
    const { error } = await sb.auth.signInWithOtp({
      phone: toE164(phone),
      options: { data: { name: name.trim() }, channel: "sms" },
    });
    setBusy(false);
    if (error) return setErr(errMsg(error));
    haptic(); setStep("code");
  }

  async function verify() {
    setErr("");
    if (code.replace(/\D/g, "").length < 6) return setErr("Digite o código de 6 dígitos.");
    setBusy(true);
    const { data, error } = await sb.auth.verifyOtp({ phone: toE164(phone), token: code.replace(/\D/g, ""), type: "sms" });
    if (error || !data.user) { setBusy(false); return setErr("Código inválido ou expirado."); }
    // conta já existia sem nome? completa com o nome digitado
    const { data: prof } = await sb.from("profiles").select("name").eq("id", data.user.id).single();
    if (!prof?.name) await sb.from("profiles").update({ name: name.trim() }).eq("id", data.user.id);
    await refreshProfile();
    setBusy(false);
    haptic([10, 40, 20]);
    toast(`Bem-vindo, ${(prof?.name || name).split(" ")[0]}!`);
    onDone?.();
  }

  return (
    <div className={compact ? "" : "auth"}>
      {step === "form" ? (
        <>
          <div className="field"><label>Seu nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Como podemos te chamar?" />
          </div>
          <div className="field"><label>WhatsApp</label>
            <input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="(85) 9 0000-0000"
              onKeyDown={(e) => e.key === "Enter" && sendCode()} />
          </div>
          <div className="err">{err}</div>
          <button className="btn primary" disabled={busy} onClick={sendCode}>{busy ? "Enviando…" : "Receber código por SMS"}</button>
          <p className="hint">Se o número já tiver conta, você entra nela. Se não, criamos uma pra guardar seu histórico.</p>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>Enviamos um código para <b>{phone}</b></p>
          <div className="field"><label>Código</label>
            <input className="otp" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus onKeyDown={(e) => e.key === "Enter" && verify()} />
          </div>
          <div className="err">{err}</div>
          <button className="btn primary" disabled={busy} onClick={verify}>{busy ? "Confirmando…" : "Confirmar"}</button>
          <p className="hint"><button onClick={() => { setStep("form"); setCode(""); }} style={{ color: "var(--l2)", textDecoration: "underline" }}>Trocar número</button></p>
        </>
      )}
    </div>
  );
}
