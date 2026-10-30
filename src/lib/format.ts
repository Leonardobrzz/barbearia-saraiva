import type { Payment, Status } from "./types";

export const TZ = "America/Fortaleza";
export const SHOP = {
  name: "Barbearia Saraiva",
  street: "Rua Cônego de Castro, 5978",
  district: "Parque Santa Rosa · Fortaleza/CE",
  cep: "60763-003",
  phone: "(85) 98830-0850",
  whatsapp: process.env.NEXT_PUBLIC_SHOP_WHATSAPP || "5585988300850",
};

export const brl = (cents: number) =>
  "R$ " + Math.round((cents || 0) / 100).toLocaleString("pt-BR");
export const brl2 = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const durTxt = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}min` : ""}` : `${m} min`;

/** "YYYY-MM-DD" no fuso da barbearia */
export function dayKey(d: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(typeof d === "string" ? new Date(d) : d);
}
/** "HH:MM" no fuso da barbearia */
export function hm(d: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
    .format(typeof d === "string" ? new Date(d) : d);
}
/** minutos desde 00:00 no fuso da barbearia */
export function minutesOfDay(d: Date | string) {
  const [h, m] = hm(d).split(":").map(Number);
  return h * 60 + m;
}
export const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
};
export const weekday = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** ISO para "data local + HH:MM" na barbearia (UTC-3 fixo, sem horário de verão) */
export const localToIso = (key: string, time: string) => new Date(`${key}T${time}:00-03:00`).toISOString();

export const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const WDL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const MO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MOL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dayLabel(key: string) {
  const today = dayKey();
  if (key === today) return "Hoje";
  if (key === addDays(today, 1)) return "Amanhã";
  if (key === addDays(today, -1)) return "Ontem";
  const [, m, d] = key.split("-").map(Number);
  const w = WDL[weekday(key)];
  return `${w[0].toUpperCase() + w.slice(1)}, ${d} de ${MOL[m - 1]}`;
}
export const shortDate = (key: string) => {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MO[m - 1]}`;
};

export const STATUS: Record<Status, { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "conf" },
  in_service: { label: "Em atendimento", cls: "now" },
  done: { label: "Atendido", cls: "done" },
  no_show: { label: "Faltou", cls: "miss" },
  cancelled: { label: "Cancelado", cls: "canc" },
};
export const PAYMENT: Record<Payment, string> = {
  pix: "Pix", credit: "Cartão de crédito", debit: "Cartão de débito", cash: "Dinheiro",
};

export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}
/** "(85) 99999-8888" -> "+5585999998888" */
export const toE164 = (v: string) => "+55" + v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
export const initials = (n: string) =>
  n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const waLink = (phoneDigits: string, text: string) =>
  `https://wa.me/${phoneDigits.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
export const mapsUrl = () =>
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(`${SHOP.street}, Parque Santa Rosa, Fortaleza - CE, ${SHOP.cep}`);
export function errMsg(e: unknown) {
  const m = (e as { message?: string })?.message || "Algo deu errado";
  return m.replace(/^.*?ERROR:\s*/, "");
}
