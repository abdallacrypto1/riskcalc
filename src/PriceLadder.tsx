import { useRef, useState } from "react";
import type { Direction } from "./lib/risk";
import { price, pct } from "./lib/format";

interface EntryLine {
  price: number;
}

type Handle = "entry" | "stop" | "tp";

interface Props {
  entries: EntryLine[]; // entradas individuais (uma ou várias)
  avg: number; // preço médio (âncora)
  stop: number; // preço do stop (arrastável)
  takeProfit?: number; // alvo opcional (arrastável)
  liquidation?: number; // preço de liquidação (mostra quando perto do stop)
  direction: Direction;
  onEntry?: (price: number) => void; // arrastar a entrada / médio
  onStop: (price: number) => void; // arrastar o stop
  onTakeProfit?: (price: number) => void; // arrastar o alvo
}

interface Window {
  high: number;
  low: number;
}

/** Gráfico vertical de preço. O trader arrasta entrada, stop e alvo com o dedo
 *  e vê tudo se reposicionar ao vivo. */
export default function PriceLadder({
  entries,
  avg,
  stop,
  takeProfit,
  liquidation,
  direction,
  onEntry,
  onStop,
  onTakeProfit,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Handle | null>(null);
  const freeze = useRef<Window | null>(null);

  const isLong = direction === "long";
  const hasTp = !!takeProfit && takeProfit > 0;
  const hasLiq = !!liquidation && liquidation > 0;

  const prices = [
    ...entries.map((e) => e.price),
    stop,
    ...(hasTp ? [takeProfit!] : []),
    ...(hasLiq ? [liquidation!] : []),
  ].filter((p) => Number.isFinite(p) && p > 0);

  const computeWindow = (): Window => {
    if (prices.length === 0) return { high: avg * 1.05, low: avg * 0.95 };
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const range = Math.max(hi - lo, avg * 0.02);
    const pad = Math.max(range * 0.55, avg * 0.03);
    return { high: hi + pad, low: Math.max(0, lo - pad) };
  };

  const win = drag && freeze.current ? freeze.current : computeWindow();
  const span = win.high - win.low || 1;

  const frac = (p: number) => clamp((win.high - p) / span, 0, 1);
  const topPct = (p: number) => `${frac(p) * 100}%`;

  const priceFromClientY = (clientY: number): number => {
    const rect = ref.current!.getBoundingClientRect();
    const f = clamp((clientY - rect.top) / rect.height, 0, 1);
    return win.high - f * span;
  };

  const g = avg * 0.0005; // folga mínima entre as linhas

  const clampFor = (kind: Handle, p: number): number => {
    p = Math.max(p, 0);
    if (kind === "stop") return isLong ? Math.min(p, avg - g) : Math.max(p, avg + g);
    if (kind === "entry") return isLong ? Math.max(p, stop + g) : Math.min(p, stop - g);
    // tp
    return isLong ? Math.max(p, avg + g) : Math.min(p, avg - g);
  };

  const emit = (kind: Handle, raw: number) => {
    const p = +raw.toFixed(4);
    if (kind === "stop") onStop(p);
    else if (kind === "entry") onEntry?.(p);
    else onTakeProfit?.(p);
  };

  const handlers = (kind: Handle) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      freeze.current = computeWindow();
      setDrag(kind);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (drag !== kind) return;
      emit(kind, clampFor(kind, priceFromClientY(e.clientY)));
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      freeze.current = null;
      setDrag(null);
    },
    onPointerCancel: () => {
      freeze.current = null;
      setDrag(null);
    },
  });

  const stopDistPct = avg > 0 ? (Math.abs(avg - stop) / avg) * 100 : NaN;
  const multipleEntries = entries.length > 1;

  return (
    <div
      ref={ref}
      className="relative h-[320px] w-full select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40"
    >
      {/* zona de risco entre o médio e o stop */}
      <div
        className="absolute inset-x-0 bg-rose-500/10"
        style={{
          top: topPct(Math.max(avg, stop)),
          bottom: `${(1 - frac(Math.min(avg, stop))) * 100}%`,
        }}
      />
      {/* zona de lucro até o alvo */}
      {hasTp && (
        <div
          className="absolute inset-x-0 bg-emerald-500/10"
          style={{
            top: topPct(Math.max(avg, takeProfit!)),
            bottom: `${(1 - frac(Math.min(avg, takeProfit!))) * 100}%`,
          }}
        />
      )}

      {/* entradas individuais (quando escalado) — linhas finas, não arrastáveis */}
      {multipleEntries &&
        entries.map((e, i) => (
          <div
            key={i}
            className="absolute inset-x-0"
            style={{ top: topPct(e.price), transform: "translateY(-50%)" }}
          >
            <div className="border-t border-slate-600" />
            {entries.length <= 4 && (
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                {price(e.price)}
              </span>
            )}
          </div>
        ))}

      {/* ALVO — arrastável */}
      {hasTp && (
        <DragLine
          top={topPct(takeProfit!)}
          z="z-20"
          line="border-emerald-400 border-dashed"
          side="left"
          pill="bg-emerald-500 text-white"
          handlers={onTakeProfit ? handlers("tp") : undefined}
        >
          Alvo {price(takeProfit!)}
        </DragLine>
      )}

      {/* ENTRADA / MÉDIO — arrastável */}
      <DragLine
        top={topPct(avg)}
        z="z-20"
        line="border-sky-400"
        side="left"
        pill="bg-sky-500 text-white"
        handlers={onEntry ? handlers("entry") : undefined}
      >
        {multipleEntries ? "Médio" : "Entrada"} {price(avg)}
      </DragLine>

      {/* STOP — arrastável */}
      <DragLine
        top={topPct(stop)}
        z="z-30"
        line="border-rose-400 border-dashed"
        side="right"
        pill="bg-rose-500 text-white"
        handlers={handlers("stop")}
      >
        Stop {price(stop)} · {pct(stopDistPct)}
      </DragLine>

      {/* LIQUIDAÇÃO — informativa, não arrastável */}
      {hasLiq && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: topPct(liquidation!), transform: "translateY(-50%)" }}
        >
          <div className="border-t-2 border-dotted border-amber-400/80" />
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-xs font-semibold text-black shadow-lg">
            ⚠ Liquidação {price(liquidation!)}
          </div>
        </div>
      )}

      {/* dica de arrastar */}
      {!drag && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-400">
          arraste as linhas ↕
        </div>
      )}
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function DragLine({
  top,
  z,
  line,
  side,
  pill,
  handlers,
  children,
}: {
  top: string;
  z: string;
  line: string;
  side: "left" | "right";
  pill: string;
  handlers?: ReturnType<() => Record<string, unknown>>;
  children: React.ReactNode;
}) {
  const draggable = !!handlers;
  return (
    <div
      className={`absolute inset-x-0 ${z} flex items-center ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ top, transform: "translateY(-50%)", touchAction: "none" }}
      {...handlers}
    >
      <div className="h-9 w-full" /> {/* área de toque alta */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 ${line}`}
      />
      <div
        className={`pointer-events-none absolute ${side === "left" ? "left-2" : "right-2"} top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold shadow-lg ${pill}`}
      >
        {draggable && <GripIcon />}
        {children}
      </div>
    </div>
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
