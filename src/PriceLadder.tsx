import { useRef, useState } from "react";
import type { Direction } from "./lib/risk";
import { money, pct } from "./lib/format";

interface EntryLine {
  price: number;
  label?: string;
}

interface Props {
  entries: EntryLine[]; // entradas individuais (uma ou várias)
  avg: number; // preço médio (âncora)
  stop: number; // preço do stop (arrastável)
  takeProfit?: number; // alvo opcional
  direction: Direction;
  onStop: (price: number) => void; // arrastar o stop
}

interface Window {
  high: number;
  low: number;
}

/** Gráfico vertical de preço. O trader arrasta o stop com o dedo e vê tudo
 *  se reposicionar ao vivo. */
export default function PriceLadder({
  entries,
  avg,
  stop,
  takeProfit,
  direction,
  onStop,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const freeze = useRef<Window | null>(null);

  const prices = [
    ...entries.map((e) => e.price),
    stop,
    ...(takeProfit && takeProfit > 0 ? [takeProfit] : []),
  ].filter((p) => Number.isFinite(p) && p > 0);

  const computeWindow = (): Window => {
    if (prices.length === 0) return { high: avg * 1.05, low: avg * 0.95 };
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const range = Math.max(hi - lo, avg * 0.02);
    const pad = Math.max(range * 0.55, avg * 0.03);
    return { high: hi + pad, low: Math.max(0, lo - pad) };
  };

  const win = dragging && freeze.current ? freeze.current : computeWindow();
  const span = win.high - win.low || 1;

  // preço -> fração 0..1 a partir do topo
  const frac = (p: number) => clamp((win.high - p) / span, 0, 1);
  const topPct = (p: number) => `${frac(p) * 100}%`;

  const priceFromClientY = (clientY: number): number => {
    const rect = ref.current!.getBoundingClientRect();
    const f = clamp((clientY - rect.top) / rect.height, 0, 1);
    return win.high - f * span;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    freeze.current = computeWindow();
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    let p = priceFromClientY(e.clientY);
    // mantém o stop do lado certo do preço médio
    const guard = avg * 0.0005;
    if (direction === "long") p = Math.min(p, avg - guard);
    else p = Math.max(p, avg + guard);
    onStop(Math.max(p, 0));
  };
  const endDrag = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    freeze.current = null;
    setDragging(false);
  };

  const isLong = direction === "long";
  const stopDistPct = avg > 0 ? (Math.abs(avg - stop) / avg) * 100 : NaN;
  const multipleEntries = entries.length > 1;

  return (
    <div
      ref={ref}
      className="relative h-[360px] w-full select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
      style={{ touchAction: "none" }}
    >
      {/* zona de risco entre o médio e o stop */}
      <div
        className={`absolute inset-x-0 ${isLong ? "bg-rose-500/10" : "bg-rose-500/10"}`}
        style={{
          top: topPct(Math.max(avg, stop)),
          bottom: `${(1 - frac(Math.min(avg, stop))) * 100}%`,
        }}
      />
      {/* zona de lucro até o alvo */}
      {takeProfit && takeProfit > 0 && (
        <div
          className="absolute inset-x-0 bg-emerald-500/10"
          style={{
            top: topPct(Math.max(avg, takeProfit)),
            bottom: `${(1 - frac(Math.min(avg, takeProfit))) * 100}%`,
          }}
        />
      )}

      {/* entradas individuais (quando escalado) */}
      {multipleEntries &&
        entries.map((e, i) => (
          <Line key={i} top={topPct(e.price)} color="slate" thin>
            {entries.length <= 4 && (
              <span className="text-[11px] text-slate-400">{money(e.price)}</span>
            )}
          </Line>
        ))}

      {/* alvo */}
      {takeProfit && takeProfit > 0 && (
        <Line top={topPct(takeProfit)} color="emerald" dashed>
          <Tag color="emerald">Alvo {money(takeProfit)}</Tag>
        </Line>
      )}

      {/* preço médio / entrada (âncora) */}
      <Line top={topPct(avg)} color="sky">
        <Tag color="sky">
          {multipleEntries ? "Médio" : "Entrada"} {money(avg)}
        </Tag>
      </Line>

      {/* STOP — arrastável */}
      <div
        className="absolute inset-x-0 z-10 flex cursor-grab items-center active:cursor-grabbing"
        style={{ top: topPct(stop), transform: "translateY(-50%)", touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="h-9 w-full" /> {/* área de toque alta */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-rose-400" />
        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg bg-rose-500 px-2 py-1 text-xs font-semibold text-white shadow-lg">
          <GripIcon />
          Stop {money(stop)} · {pct(stopDistPct)}
        </div>
      </div>

      {/* dica de arrastar */}
      {!dragging && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400">
          arraste o stop ↕
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function Line({
  top,
  color,
  children,
  thin,
  dashed,
}: {
  top: string;
  color: "sky" | "emerald" | "slate";
  children?: React.ReactNode;
  thin?: boolean;
  dashed?: boolean;
}) {
  const border =
    color === "sky"
      ? "border-sky-400"
      : color === "emerald"
        ? "border-emerald-400"
        : "border-slate-600";
  return (
    <div className="absolute inset-x-0" style={{ top, transform: "translateY(-50%)" }}>
      <div
        className={`${border} ${thin ? "border-t" : "border-t-2"} ${dashed ? "border-dashed" : ""}`}
      />
      {children && <div className="absolute left-2 top-1/2 -translate-y-1/2">{children}</div>}
    </div>
  );
}

function Tag({
  color,
  children,
}: {
  color: "sky" | "emerald";
  children: React.ReactNode;
}) {
  const cls =
    color === "sky"
      ? "bg-sky-500/90 text-white"
      : "bg-emerald-500/90 text-white";
  return (
    <span className={`rounded-lg px-2 py-1 text-xs font-semibold shadow ${cls}`}>
      {children}
    </span>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="2" r="1" />
      <circle cx="7.5" cy="2" r="1" />
      <circle cx="2.5" cy="5" r="1" />
      <circle cx="7.5" cy="5" r="1" />
      <circle cx="2.5" cy="8" r="1" />
      <circle cx="7.5" cy="8" r="1" />
    </svg>
  );
}
