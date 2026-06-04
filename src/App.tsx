import { useEffect, useMemo, useState } from "react";
import {
  calcRisk,
  weightedAvgEntry,
  type Direction,
  type EntryLeg,
} from "./lib/risk";
import { money, price, qty, pct } from "./lib/format";
import { useLocalStorage } from "./lib/useLocalStorage";
import PriceLadder from "./PriceLadder";
import ScaledOrders, { buildGrid, type GridRow } from "./ScaledOrders";

const RISK_CHIPS = [1, 2, 3];
type EntryMode = "single" | "grid";

export default function App() {
  // Configurações — salvas no navegador, ficam fora do caminho.
  const [balance, setBalance] = useLocalStorage("rc.balance", 1000);
  const [riskPct, setRiskPct] = useLocalStorage("rc.riskPct", 2);
  const [leverage, setLeverage] = useLocalStorage("rc.leverage", 1);

  // Trade atual.
  const [direction, setDirection] = useLocalStorage<Direction>("rc.dir", "long");
  const [entryMode, setEntryMode] = useLocalStorage<EntryMode>("rc.mode", "single");
  const [entryPrice, setEntryPrice] = useLocalStorage("rc.entry", 100);
  const [gridFrom, setGridFrom] = useLocalStorage("rc.gridFrom", 100);
  const [gridTo, setGridTo] = useLocalStorage("rc.gridTo", 96);
  const [gridCount, setGridCount] = useLocalStorage("rc.gridCount", 5);
  const [gridRows, setGridRows] = useLocalStorage<GridRow[]>(
    "rc.gridRows",
    buildGrid(100, 96, 5),
  );
  const [stop, setStop] = useLocalStorage("rc.stop", 98);
  const [takeProfit, setTakeProfit] = useLocalStorage<number | null>("rc.tp", null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const scaled = entryMode === "grid";

  const entries: EntryLeg[] = useMemo(
    () =>
      scaled
        ? gridRows.map((r) => ({ price: r.price, allocPct: r.ratio }))
        : [{ price: entryPrice, allocPct: 100 }],
    [scaled, gridRows, entryPrice],
  );

  const avg = useMemo(() => weightedAvgEntry(entries), [entries]);

  const result = useMemo(
    () =>
      calcRisk({
        balance,
        riskPct,
        direction,
        legs: entries,
        stop: { kind: "price", stopPrice: stop },
        leverage: leverage || 1,
        takeProfit: takeProfit ?? undefined,
      }),
    [balance, riskPct, direction, entries, stop, leverage, takeProfit],
  );

  const isLong = direction === "long";

  // Alavancagem máxima segura (liquidar depois do stop) e trava.
  const safeMaxLev = Number.isFinite(result.maxSafeLeverage)
    ? Math.max(1, Math.floor(result.maxSafeLeverage * 100) / 100)
    : Infinity;
  const clampLev = (v: number) =>
    Math.max(1, Number.isFinite(safeMaxLev) ? Math.min(v, safeMaxLev) : v);
  const atMaxLev = leverage >= safeMaxLev - 1e-9;

  // Se o stop se aproxima e a alavancagem atual passa a liquidar antes, trava.
  useEffect(() => {
    if (Number.isFinite(safeMaxLev) && leverage > safeMaxLev) setLeverage(safeMaxLev);
  }, [safeMaxLev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Linha de liquidação: só mostra quando está perto do stop (relevante).
  const liqFrac = leverage > 0 ? 1 / leverage : Infinity;
  const stopFrac = avg > 0 ? Math.abs(avg - stop) / avg : Infinity;
  const showLiq =
    leverage > 1 && Number.isFinite(result.liquidationPrice) && liqFrac <= stopFrac * 2;

  // Mantém o stop sempre do lado certo do preço médio.
  const ensureStopSide = (a: number, dir: Direction, s: number) => {
    if (!(a > 0)) return s;
    if (dir === "long" && s >= a) return +(a * 0.98).toFixed(4);
    if (dir === "short" && s <= a) return +(a * 1.02).toFixed(4);
    return s;
  };
  const adjustStop = (a: number, dir: Direction = direction) =>
    setStop((s) => ensureStopSide(a, dir, s));

  const flipDirection = (dir: Direction) => {
    setDirection(dir);
    setStop((s) => ensureStopSide(avg, dir, +(2 * avg - s).toFixed(4)));
  };

  const editSingleEntry = (price: number) => {
    setEntryPrice(price);
    adjustStop(price);
  };

  // Arrastar a linha de entrada/médio no gráfico.
  const dragEntry = (target: number) => {
    if (!scaled) {
      editSingleEntry(target);
      return;
    }
    // escalonado: desloca a grade inteira mantendo os ratios
    const delta = target - avg;
    setGridRows(gridRows.map((r) => ({ ...r, price: +(r.price + delta).toFixed(4) })));
    setGridFrom((f) => +(f + delta).toFixed(4));
    setGridTo((t) => +(t + delta).toFixed(4));
    adjustStop(target);
  };

  // --- Grade escalonada ---
  const rebuildGrid = (from: number, to: number, count: number) => {
    const rows = buildGrid(from, to, count);
    setGridRows(rows);
    adjustStop(weightedAvgEntry(rows.map((r) => ({ price: r.price, allocPct: r.ratio }))));
  };
  const editGridRow = (i: number, patch: Partial<GridRow>) => {
    const rows = gridRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setGridRows(rows);
    adjustStop(weightedAvgEntry(rows.map((r) => ({ price: r.price, allocPct: r.ratio }))));
  };

  const switchMode = (mode: EntryMode) => {
    if (mode === "grid" && entryMode !== "grid") {
      // entra na grade a partir do preço atual
      const from = entryPrice;
      const to = +(entryPrice * (isLong ? 0.96 : 1.04)).toFixed(2);
      setGridFrom(from);
      setGridTo(to);
      rebuildGrid(from, to, gridCount);
    }
    setEntryMode(mode);
  };

  return (
    <div className="min-h-full text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-12 pt-4">
        {/* Configurações (banca + risco) escondidas atrás de um toque */}
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2.5 text-sm"
        >
          <span className="text-slate-300">
            Banca <b className="text-white">{money(balance, 0)}</b>
            <span className="mx-1.5 text-slate-600">·</span>
            risco <b className="text-white">{riskPct}%</b>
            <span className="ml-1.5 text-slate-500">({money(result.riskAmount)})</span>
          </span>
          <span className="text-slate-500">{settingsOpen ? "fechar" : "✎"}</span>
        </button>

        {settingsOpen && (
          <div className="mt-2 space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div>
              <Label>Tamanho da banca</Label>
              <Editable value={balance} onChange={setBalance} big />
            </div>
            <div>
              <Label>Quanto arriscar por trade</Label>
              <div className="flex gap-2">
                {RISK_CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setRiskPct(c)}
                    className={`flex-1 rounded-lg border py-2.5 text-base font-semibold ${
                      riskPct === c
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    {c}%
                  </button>
                ))}
                <div className="relative w-20">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={riskPct}
                    onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="h-full w-full rounded-lg border border-slate-700 bg-slate-900 px-2 text-center text-base outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Long / Short */}
        <div className="mt-4 flex gap-2">
          <BigToggle active={isLong} tone="emerald" onClick={() => flipDirection("long")}>
            ▲ Comprar
          </BigToggle>
          <BigToggle active={!isLong} tone="rose" onClick={() => flipDirection("short")}>
            ▼ Vender
          </BigToggle>
        </div>

        {/* Entrada + Stop precisos (toque pra digitar) */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
            <Label>{scaled ? "Preço médio" : "Entrada"}</Label>
            {scaled ? (
              <p className="text-xl font-bold text-sky-300">{price(avg)}</p>
            ) : (
              <Editable value={entryPrice} onChange={editSingleEntry} tone="sky" price />
            )}
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <Label>Stop</Label>
            <Editable
              value={stop}
              onChange={(v) => setStop(ensureStopSide(avg, direction, v))}
              tone="rose"
              price
            />
          </div>
        </div>

        {/* Alvo / take profit — acima do gráfico pois aparece desenhado nele */}
        <div className="mt-2">
          {takeProfit && takeProfit > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex-1">
                <Label>
                  Alvo
                  {result.rMultipleToTp !== undefined && (
                    <span
                      className={`ml-2 ${result.rMultipleToTp >= 1 ? "text-emerald-400" : "text-amber-400"}`}
                    >
                      {result.rMultipleToTp.toFixed(1)}R
                    </span>
                  )}
                </Label>
                <Editable value={takeProfit} onChange={setTakeProfit} tone="emerald" price />
              </div>
              <button
                onClick={() => setTakeProfit(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-rose-500 hover:text-rose-400"
                aria-label="Remover alvo"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setTakeProfit(+(avg * (isLong ? 1.06 : 0.94)).toFixed(4))}
              className="w-full rounded-xl border border-dashed border-emerald-500/30 py-2.5 text-sm text-emerald-400/80 hover:border-emerald-500/60 hover:text-emerald-400"
            >
              + definir alvo (take profit)
            </button>
          )}
        </div>

        {/* O herói: gráfico arrastável */}
        <div className="mt-3">
          <PriceLadder
            entries={entries}
            avg={avg}
            stop={stop}
            takeProfit={takeProfit ?? undefined}
            liquidation={showLiq ? result.liquidationPrice : undefined}
            direction={direction}
            onEntry={dragEntry}
            onStop={setStop}
            onTakeProfit={(p) => setTakeProfit(+p.toFixed(4))}
          />
        </div>

        {/* Resposta gigante */}
        {result.ok ? (
          <div className="mt-3 rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/15 to-slate-900/30 p-5 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
              {isLong ? "Compre" : "Venda"}
            </p>
            <p className="mt-1 text-4xl font-black text-white">{qty(result.totalUnits)}</p>
            <p className="text-sm text-slate-400">moedas</p>
            <p className="mt-2 text-lg font-semibold text-slate-200">
              = {money(result.totalNotional)}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span>
                arrisca <b className="text-rose-300">{money(result.riskAmount)}</b>
              </span>
              <span className="text-slate-700">·</span>
              <span>stop {pct(result.stopDistancePct)}</span>
              <span className="text-slate-700">·</span>
              <span>
                margem <b className="text-slate-200">{money(result.requiredMargin)}</b>
                {leverage > 1 && <span className="text-slate-500"> ({leverage}x)</span>}
              </span>
              {leverage > 1 && Number.isFinite(result.liquidationPrice) && (
                <>
                  <span className="text-slate-700">·</span>
                  <span>
                    liq <b className="text-amber-300">{price(result.liquidationPrice)}</b>
                  </span>
                </>
              )}
              {result.rMultipleToTp !== undefined && (
                <>
                  <span className="text-slate-700">·</span>
                  <span>
                    alvo{" "}
                    <b
                      className={
                        result.rMultipleToTp >= 1 ? "text-emerald-300" : "text-amber-300"
                      }
                    >
                      {result.rMultipleToTp.toFixed(1)}R
                    </b>
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-center text-sm text-amber-300">
            {result.errors[0] ?? "Preencha os valores."}
          </div>
        )}

        {/* Opções avançadas */}
        <button
          onClick={() => setOptionsOpen((o) => !o)}
          className="mt-4 w-full rounded-xl border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 hover:border-slate-600 hover:text-slate-300"
        >
          {optionsOpen ? "− menos opções" : "+ mais opções"}
        </button>

        {optionsOpen && (
          <div className="mt-2 space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            {/* Tipo de entrada */}
            <div>
              <Label>Entrada</Label>
              <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
                {(["single", "grid"] as EntryMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                      entryMode === m
                        ? "bg-slate-700 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {m === "single" ? "Única" : "Escalonada"}
                  </button>
                ))}
              </div>
            </div>

            {scaled && (
              <ScaledOrders
                from={gridFrom}
                to={gridTo}
                count={gridCount}
                rows={gridRows}
                direction={direction}
                values={result.legs.map((l) => l.notional)}
                avg={avg}
                totalNotional={result.totalNotional}
                margin={result.requiredMargin}
                leverage={leverage}
                onFrom={(v) => {
                  setGridFrom(v);
                  rebuildGrid(v, gridTo, gridCount);
                }}
                onTo={(v) => {
                  setGridTo(v);
                  rebuildGrid(gridFrom, v, gridCount);
                }}
                onCount={(v) => {
                  setGridCount(v);
                  rebuildGrid(gridFrom, gridTo, v);
                }}
                onEditRow={editGridRow}
              />
            )}

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <Label>Alavancagem</Label>
                {Number.isFinite(safeMaxLev) && (
                  <span className="text-xs text-slate-500">
                    máx <b className="text-slate-300">{safeMaxLev}x</b> pelo stop
                  </span>
                )}
              </div>
              <Editable value={leverage} onChange={(v) => setLeverage(clampLev(v))} suffix="x" />
              {/* botões rápidos limitados pela trava */}
              <div className="mt-2 flex gap-2">
                {[1, 3, 5, 10, 20].map((L) => {
                  const blocked = Number.isFinite(safeMaxLev) && L > safeMaxLev;
                  return (
                    <button
                      key={L}
                      disabled={blocked}
                      onClick={() => setLeverage(L)}
                      className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold ${
                        leverage === L
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                          : blocked
                            ? "cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-700"
                            : "border-slate-700 bg-slate-900 text-slate-400"
                      }`}
                    >
                      {L}x
                    </button>
                  );
                })}
              </div>
              <p
                className={`mt-2 text-xs ${atMaxLev ? "text-amber-300" : "text-slate-500"}`}
              >
                {atMaxLev
                  ? "⚠ No limite: acima disso você seria liquidado antes do stop."
                  : `Liquidação em ${price(result.liquidationPrice)} (depois do stop ✓).`}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-600">
                Estimativa simplificada (≈ 1 ÷ alavancagem). Não considera taxas nem a
                margem de manutenção da corretora — a liquidação real costuma vir um
                pouco antes. Use o limite como teto, não como meta.
              </p>
            </div>
          </div>
        )}

        {/* Disclaimer geral */}
        <p className="mt-6 text-center text-[11px] leading-snug text-slate-600">
          Ferramenta de apoio ao gerenciamento de risco — não é recomendação de
          investimento. Os cálculos (inclusive a liquidação) são estimativas e podem
          divergir da sua corretora. Confira sempre antes de operar.
        </p>
      </div>
    </div>
  );
}

/* ---------- UI primitives ---------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
      {children}
    </p>
  );
}

function BigToggle({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "emerald" | "rose";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "emerald"
      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
      : "border-rose-500 bg-rose-500/20 text-rose-300";
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl border py-3 text-base font-bold transition ${
        active ? activeCls : "border-slate-700 bg-slate-900 text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

/** Valor que vira input ao toque — mostra $ formatado, edita o número cru. */
function Editable({
  value,
  onChange,
  tone,
  suffix,
  big,
  price: priceMode,
}: {
  value: number;
  onChange: (v: number) => void;
  tone?: "sky" | "rose" | "emerald";
  suffix?: string;
  big?: boolean;
  price?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [buf, setBuf] = useState("");

  const color =
    tone === "sky"
      ? "text-sky-300"
      : tone === "rose"
        ? "text-rose-300"
        : tone === "emerald"
          ? "text-emerald-300"
          : "text-white";
  const size = big ? "text-2xl" : "text-xl";

  const commit = () => {
    const n = parseFloat(buf.replace(",", "."));
    if (Number.isFinite(n)) onChange(+n.toFixed(4)); // nunca mais que 4 casas
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        value={buf}
        onChange={(e) => setBuf(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 font-bold outline-none focus:border-emerald-500 ${size} ${color}`}
      />
    );
  }

  // Toque (mobile) e foco (Tab no teclado) entram em edição.
  // No mobile, tocar num <button> não dispara onFocus — por isso os dois.
  const start = () => {
    setBuf(String(+value.toFixed(4))); // sem casas extras de ponto flutuante
    setEditing(true);
  };

  return (
    <button
      onClick={start}
      onFocus={start}
      className={`w-full rounded-lg px-1 py-1 text-left font-bold ${size} ${color}`}
    >
      {suffix ? `${value}${suffix}` : priceMode ? price(value) : money(value)}
    </button>
  );
}
