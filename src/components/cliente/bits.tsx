"use client";
import { Icon } from "@/components/icons";
import { SHOP, mapsUrl, minutesOfDay, weekday, dayKey } from "@/lib/format";
import type { BusinessHour } from "@/lib/types";

const tmin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);

export function isOpenNow(hours: BusinessHour[]) {
  const h = hours.find((x) => x.weekday === weekday(dayKey()));
  if (!h || h.closed) return false;
  const m = minutesOfDay(new Date());
  return m >= tmin(h.open_time) && m < tmin(h.close_time);
}

export function MapCard() {
  return (
    <div className="map">
      <a href={mapsUrl()} target="_blank" rel="noopener" style={{ display: "block" }}>
        <div className="mapart">
          <svg className="streets" viewBox="0 0 400 190" preserveAspectRatio="xMidYMid slice">
            <rect width="400" height="190" fill="#1b1d21" />
            <g fill="#23262b"><rect x="20" y="18" width="70" height="44" rx="4" /><rect x="104" y="18" width="80" height="44" rx="4" /><rect x="250" y="12" width="60" height="50" rx="4" /><rect x="322" y="12" width="70" height="50" rx="4" /><rect x="20" y="128" width="90" height="48" rx="4" /><rect x="236" y="128" width="70" height="48" rx="4" /><rect x="318" y="128" width="78" height="48" rx="4" /></g>
            <rect x="150" y="122" width="60" height="56" rx="6" fill="#1f2a22" />
            <g stroke="#34383f" strokeWidth="9" fill="none" strokeLinecap="round"><path d="M-10 74 H410" /><path d="M-10 118 H410" /><path d="M98 -10 V200" /><path d="M226 -10 V200" /><path d="M318 -10 V200" /></g>
            <path d="M-10 96 C120 92 260 100 410 94" stroke="#4a4e57" strokeWidth="13" fill="none" />
            <text x="16" y="91" fill="#8e8e93" fontSize="9">R. Cônego de Castro</text>
            <circle cx="200" cy="96" r="38" fill="rgba(255,255,255,.06)"><animate attributeName="r" values="18;46;18" dur="3s" repeatCount="indefinite" /><animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite" /></circle>
          </svg>
          <div className="pin"><img src="/logo.png" alt="" /></div>
        </div>
      </a>
      <div className="addr"><div className="a">{SHOP.street}</div><div className="b">{SHOP.district} · CEP {SHOP.cep}</div></div>
      <div className="acts">
        <a className="btn primary" href={mapsUrl()} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><Icon name="map" /> Como chegar</a>
        <a className="btn wa" href={`https://wa.me/${SHOP.whatsapp}`} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><Icon name="wa" /> WhatsApp</a>
      </div>
    </div>
  );
}
