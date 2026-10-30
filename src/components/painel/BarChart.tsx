"use client";

import { useEffect, useRef, useState } from "react";

export interface Bar { label: string; value: number; tip: string; hi?: boolean }
const niceStep = (v: number) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };

/** Barras de série única (sem legenda), com tooltip. Valores em reais. */
export default function BarChart({ data }: { data: Bar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 600)); ro.observe(el); return () => ro.disconnect();
  }, []);
  const H = 240, pl = 44, pr = 6, pt = 18, pb = 24;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const iw = w - pl - pr, ih = H - pt - pb, bw = iw / Math.max(1, data.length), gap = Math.max(2, Math.min(10, bw * 0.28));
  const every = data.length > 16 ? Math.ceil(data.length / 10) : 1;
  const ticks: number[] = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Gráfico de barras">
        {ticks.map((v) => { const y = pt + ih - (v / top) * ih; return (
          <g key={v}><line className="gl" x1={pl} x2={w - pr} y1={y} y2={y} /><text className="al" x={pl - 8} y={y + 4} textAnchor="end">{v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")}k` : v}</text></g>); })}
        {data.map((d, i) => {
          const x = pl + i * bw + gap / 2, bwid = Math.max(2, bw - gap), h = (d.value / top) * ih, y = pt + ih - h, r = Math.min(4, bwid / 2, h);
          const path = h > 0 ? `M${x},${pt + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bwid - r} Q${x + bwid},${y} ${x + bwid},${y + r} V${pt + ih} Z` : "";
          return (
            <g key={i} onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, html: d.tip })} onClick={(e) => setTip({ x: e.clientX, y: e.clientY, html: d.tip })}>
              <rect className="hit" x={pl + i * bw} y={pt} width={bw} height={ih} />
              {path && <path className={`bar ${d.hi ? "hi" : ""}`} d={path} style={{ transformOrigin: `${x}px ${pt + ih}px`, animation: `barUp .7s ${i * 0.02}s var(--ease) both` }} />}
              {i % every === 0 && <text className="al" x={x + bwid / 2} y={H - 6} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <style>{"@keyframes barUp{from{transform:scaleY(0)}to{transform:scaleY(1)}}"}</style>
      {tip && <div className="tip on" style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 250), top: tip.y - 60 }} dangerouslySetInnerHTML={{ __html: tip.html }} />}
    </div>
  );
}
