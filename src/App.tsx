import { useMemo, useState } from "react";
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
import HelpSheet from "./HelpSheet";
import AssetPicker from "./AssetPicker";

const RISK_CHIPS = [1, 2, 3];
const RR_CHIPS = [1, 2, 3, 5]; // atalhos de risco:retorno (R)
const DEFAULT_STOP_PCT = 2; // stop padrão ao selecionar um ativo (% da entrada)
const MAX_LEVERAGE = 125; // teto sano de alavancagem (não trava no "seguro")
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
  const [asset, setAsset] = useLocalStorage<string | null>("rc.asset", null);
  const [assetDecimals, setAssetDecimals] = useLocalStorage<number | null>(
    "rc.assetDp",
    null,
  );
  const [guidesShown, setGuidesShown] = useLocalStorage("rc.guides", true);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  // Precisão dos preços: a do ativo (via tickSize) ou 4 casas no modo manual.
  const dp = assetDecimals ?? 4;
  const roundP = (x: number) => +x.toFixed(dp);
  const fmtP = assetDecimals ?? undefined; // p/ formatar (undefined = padrão 2-4)

  // Alavancagem máxima SEGURA (liquida depois do stop). É só um aviso — NÃO
  // trava. O usuário pode passar disso e ver a liquidação subir no gráfico.
  const safeMaxLev = Number.isFinite(result.maxSafeLeverage)
    ? Math.max(1, Math.floor(result.maxSafeLeverage * 100) / 100)
    : Infinity;
  const clampLev = (v: number) => Math.max(1, Math.min(v, MAX_LEVERAGE));
  const liqBeforeStop = result.liquidatedBeforeStop; // liquida ANTES do stop?

  // Linha de liquidação: mostra quando está perto/dentro da zona do stop.
  const liqFrac = leverage > 0 ? 1 / leverage : Infinity;
  const stopFrac = avg > 0 ? Math.abs(avg - stop) / avg : Infinity;
  const showLiq =
    leverage > 1 && Number.isFinite(result.liquidationPrice) && liqFrac <= stopFrac * 2;

  // Mantém o stop sempre do lado certo do preço médio.
  const ensureStopSide = (a: number, dir: Direction, s: number) => {
    if (!(a > 0)) return s;
    if (dir === "long" && s >= a) return roundP(a * 0.98);
    if (dir === "short" && s <= a) return roundP(a * 1.02);
    return s;
  };
  const adjustStop = (a: number, dir: Direction = direction) =>
    setStop((s) => ensureStopSide(a, dir, s));

  const flipDirection = (dir: Direction) => {
    setDirection(dir);
    setStop((s) => ensureStopSide(avg, dir, roundP(2 * avg - s)));
  };

  const editSingleEntry = (price: number) => {
    setEntryPrice(price);
    adjustStop(price);
  };

  // Define o alvo a partir de um múltiplo de risco:retorno (ex: 2:1 = 2R).
  const setTpFromR = (R: number) => {
    const dist = Math.abs(avg - stop);
    if (!(avg > 0) || !(dist > 0)) return;
    const tp = isLong ? avg + R * dist : avg - R * dist;
    setTakeProfit(roundP(tp));
  };

  // Arrastar a linha de entrada/médio no gráfico.
  const dragEntry = (target: number) => {
    if (!scaled) {
      editSingleEntry(target);
      return;
    }
    // escalonado: desloca a grade inteira mantendo os ratios
    const delta = target - avg;
    setGridRows(gridRows.map((r) => ({ ...r, price: roundP(r.price + delta) })));
    setGridFrom((f) => roundP(f + delta));
    setGridTo((t) => roundP(t + delta));
    adjustStop(target);
  };

  // Preenche a entrada com o preço ao vivo do ativo. O stop já vem em 2% da
  // entrada (abaixo p/ compra, acima p/ venda). O alvo, se houver, é recalculado
  // preservando o R (ex: 3:1 continua 3:1 na nova distância).
  const applyAssetPrice = (p: number, symbol: string, decimals?: number) => {
    setAsset(symbol);
    if (decimals != null) setAssetDecimals(decimals);
    if (!(p > 0)) return;
    // arredonda na precisão do ativo (entrada, stop e alvo ficam consistentes)
    const d = decimals ?? assetDecimals ?? 4;
    const r = (x: number) => +x.toFixed(d);
    const entry = r(p);
    const oldR = result.rMultipleToTp;

    // entrada
    if (scaled && avg > 0) {
      const ratio = entry / avg;
      setGridRows(gridRows.map((row) => ({ ...row, price: r(row.price * ratio) })));
      setGridFrom((f) => r(f * ratio));
      setGridTo((t) => r(t * ratio));
    } else if (!scaled) {
      setEntryPrice(entry);
    }

    // stop padrão: 2% da entrada conforme a direção
    const factor = isLong ? 1 - DEFAULT_STOP_PCT / 100 : 1 + DEFAULT_STOP_PCT / 100;
    const newStop = r(entry * factor);
    setStop(newStop);

    // alvo: preserva o R recalculando pela nova distância
    if (takeProfit && takeProfit > 0 && oldR && Number.isFinite(oldR)) {
      const dist = Math.abs(entry - newStop);
      const tp = isLong ? entry + oldR * dist : entry - oldR * dist;
      setTakeProfit(r(tp));
    }
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
        {/* Cabeçalho: marca + ajuda */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <h1 className="text-base font-bold tracking-tight text-white">
                Risk<span className="text-emerald-400">Calc</span>
              </h1>
              <a
                href="https://abdallacrypto.com"
                target="_blank"
                rel="noopener"
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                by @abdallacrypto
              </a>
            </div>
            <p className="text-[11px] text-slate-500">
              o tamanho certo da posição, sem fazer conta
            </p>
          </div>
          <button
            onClick={() => setHelpOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
              ?
            </span>
            Como funciona
          </button>
        </div>

        <StepHeader n={1} label="Sua conta" className="mt-5" />
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
        {guidesShown && (
          <Guide
            className="mt-1"
            text="Aqui você define quanto cada stop pode te custar"
            onDismiss={() => setGuidesShown(false)}
          />
        )}

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
            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <Label>Dicas de uso na tela</Label>
              <button
                onClick={() => setGuidesShown((g) => !g)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  guidesShown
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                    : "border-slate-700 bg-slate-900 text-slate-400"
                }`}
              >
                {guidesShown ? "ativadas" : "desativadas"}
              </button>
            </div>
          </div>
        )}

        <StepHeader n={2} label="Seu trade" />
        {/* Long / Short */}
        <div className="flex gap-2">
          <BigToggle active={isLong} tone="emerald" onClick={() => flipDirection("long")}>
            ▲ Comprar
          </BigToggle>
          <BigToggle active={!isLong} tone="rose" onClick={() => flipDirection("short")}>
            ▼ Vender
          </BigToggle>
        </div>

        {/* Ativo com preço ao vivo (opcional) */}
        <div className="mt-3">
          <AssetPicker selected={asset} onPrice={applyAssetPrice} />
        </div>

        {/* Entrada + Stop precisos (toque pra digitar) */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
            <Label>{scaled ? "Preço médio" : "Entrada"}</Label>
            {scaled ? (
              <p className="text-xl font-bold text-sky-300">{price(avg, fmtP)}</p>
            ) : (
              <Editable
                value={entryPrice}
                onChange={editSingleEntry}
                tone="sky"
                price
                decimals={fmtP}
              />
            )}
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <Label>Stop</Label>
            <Editable
              value={stop}
              onChange={(v) => setStop(ensureStopSide(avg, direction, v))}
              tone="rose"
              price
              decimals={fmtP}
            />
          </div>
        </div>

        {/* Alvo / take profit — acima do gráfico pois aparece desenhado nele */}
        <div className="mt-2">
          {takeProfit && takeProfit > 0 ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2">
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
                  <Editable
                    value={takeProfit}
                    onChange={setTakeProfit}
                    tone="emerald"
                    price
                    decimals={fmtP}
                  />
                  {result.profitAtTp !== undefined && (
                    <p className="mt-0.5 text-sm text-slate-400">
                      ganha{" "}
                      <b className="text-emerald-300">+{money(result.profitAtTp)}</b> se bater
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setTakeProfit(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-rose-500 hover:text-rose-400"
                  aria-label="Remover alvo"
                >
                  ×
                </button>
              </div>
              <div className="mt-3">
                <RrChips
                  activeR={result.rMultipleToTp}
                  riskAmount={result.riskAmount}
                  onPick={setTpFromR}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3">
              <Label>Alvo / take profit (opcional)</Label>
              <p className="mb-2 text-xs text-slate-500">
                Escolha o risco:retorno — preenchemos o preço pra você.
              </p>
              <RrChips activeR={undefined} riskAmount={result.riskAmount} onPick={setTpFromR} />
            </div>
          )}
        </div>

        {/* O herói: gráfico arrastável */}
        <div className="mt-4">
          {guidesShown && (
            <Guide
              className="mb-1.5"
              text="Aqui você visualiza entrada, stop e alvo (opcional)"
              onDismiss={() => setGuidesShown(false)}
            />
          )}
          <PriceLadder
            entries={entries}
            avg={avg}
            stop={stop}
            takeProfit={takeProfit ?? undefined}
            liquidation={showLiq ? result.liquidationPrice : undefined}
            liquidationDanger={liqBeforeStop}
            decimals={fmtP}
            direction={direction}
            onEntry={dragEntry}
            onStop={setStop}
            onTakeProfit={(p) => setTakeProfit(roundP(p))}
          />
          <p className="mt-1.5 text-center text-[11px] text-slate-600">
            Simulação visual da sua operação — não é o gráfico de preço do mercado
          </p>
        </div>

        <StepHeader n={3} label="Resultado" />
        {/* Resposta gigante */}
        <div>
          {guidesShown && (
            <Guide
              center
              className="mb-1.5"
              text="Aqui o RiskCalc dimensiona o tamanho da posição"
              onDismiss={() => setGuidesShown(false)}
            />
          )}
          {result.ok ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/15 to-slate-900/30 p-5 text-center">
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
                  <span className={liqBeforeStop ? "text-rose-300" : undefined}>
                    {liqBeforeStop && "⚠ "}liq{" "}
                    <b className={liqBeforeStop ? "text-rose-300" : "text-amber-300"}>
                      {price(result.liquidationPrice, fmtP)}
                    </b>
                  </span>
                </>
              )}
              {result.rMultipleToTp !== undefined && (
                <>
                  <span className="text-slate-700">·</span>
                  <span>
                    ganha{" "}
                    <b className="text-emerald-300">+{money(result.profitAtTp ?? NaN)}</b>{" "}
                    <span
                      className={
                        result.rMultipleToTp >= 1 ? "text-emerald-300/70" : "text-amber-300/70"
                      }
                    >
                      ({result.rMultipleToTp.toFixed(1)}R)
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-center text-sm text-amber-300">
            {result.errors[0] ?? "Preencha os valores."}
          </div>
          )}
        </div>

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
                decimals={fmtP}
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
                    seguro até <b className="text-slate-300">{safeMaxLev}x</b>
                  </span>
                )}
              </div>
              <Editable value={leverage} onChange={(v) => setLeverage(clampLev(v))} suffix="x" />
              {/* botões rápidos — acima do seguro ficam em vermelho, mas clicáveis */}
              <div className="mt-2 flex gap-2">
                {[1, 3, 5, 10, 20].map((L) => {
                  const unsafe = Number.isFinite(safeMaxLev) && L > safeMaxLev;
                  const active = leverage === L;
                  return (
                    <button
                      key={L}
                      onClick={() => setLeverage(L)}
                      className={`flex-1 rounded-lg border py-1.5 text-sm font-semibold ${
                        active
                          ? unsafe
                            ? "border-rose-500 bg-rose-500/15 text-rose-300"
                            : "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                          : unsafe
                            ? "border-rose-500/40 bg-slate-900 text-rose-400/80"
                            : "border-slate-700 bg-slate-900 text-slate-400"
                      }`}
                    >
                      {L}x
                    </button>
                  );
                })}
              </div>
              <p
                className={`mt-2 text-xs ${liqBeforeStop ? "font-semibold text-rose-300" : "text-slate-500"}`}
              >
                {liqBeforeStop
                  ? `⚠ Você seria LIQUIDADO em ${price(result.liquidationPrice, fmtP)} — antes do stop. Perde tudo antes do plano funcionar.`
                  : `Liquidação em ${price(result.liquidationPrice, fmtP)} (depois do stop ✓).`}
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

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

/* ---------- UI primitives ---------- */

/** Atalhos de risco:retorno — preenchem o alvo e já mostram o ganho em $. */
function RrChips({
  activeR,
  riskAmount,
  onPick,
}: {
  activeR: number | undefined;
  riskAmount: number;
  onPick: (r: number) => void;
}) {
  const showGain = Number.isFinite(riskAmount) && riskAmount > 0;
  return (
    <div className="flex gap-2">
      {RR_CHIPS.map((R) => {
        const active = activeR !== undefined && Math.abs(activeR - R) < 0.05;
        return (
          <button
            key={R}
            onClick={() => onPick(R)}
            className={`flex-1 rounded-lg border py-1.5 ${
              active
                ? "border-emerald-500 bg-emerald-500/15"
                : "border-slate-700 bg-slate-900 hover:border-slate-600"
            }`}
          >
            <div
              className={`text-sm font-semibold ${active ? "text-emerald-300" : "text-slate-300"}`}
            >
              {R}:1
            </div>
            {showGain && (
              <div className={`text-[11px] ${active ? "text-emerald-300/80" : "text-slate-500"}`}>
                +{money(R * riskAmount, 0)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Legenda-guia dispensável (cinza claro + × pra ocultar todas). */
function Guide({
  text,
  onDismiss,
  center,
  className = "",
}: {
  text: string;
  onDismiss: () => void;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-1 ${center ? "justify-center" : ""} ${className}`}>
      <p className="px-1 text-[11px] leading-snug text-slate-500">{text}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-[13px] leading-none text-slate-600 hover:text-slate-300"
        aria-label="Ocultar dicas"
        title="Ocultar dicas"
      >
        ×
      </button>
    </div>
  );
}

/** Cabeçalho de etapa: círculo numerado + rótulo, pra guiar o fluxo 1→2→3. */
function StepHeader({
  n,
  label,
  className = "mt-5",
}: {
  n: number;
  label: string;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-center gap-2 ${className}`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-300">
        {n}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
    </div>
  );
}

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
  decimals,
}: {
  value: number;
  onChange: (v: number) => void;
  tone?: "sky" | "rose" | "emerald";
  suffix?: string;
  big?: boolean;
  price?: boolean;
  decimals?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [buf, setBuf] = useState("");
  const dp = decimals ?? 4; // casas pra arredondar/editar

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
    if (Number.isFinite(n)) onChange(+n.toFixed(dp)); // arredonda na precisão do ativo
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
    setBuf(String(+value.toFixed(dp))); // sem casas extras de ponto flutuante
    setEditing(true);
  };

  return (
    <button
      onClick={start}
      onFocus={start}
      className={`flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left font-bold ${size} ${color}`}
    >
      <span>
        {suffix ? `${value}${suffix}` : priceMode ? price(value, decimals) : money(value)}
      </span>
      {priceMode && (
        <svg
          className="h-3.5 w-3.5 shrink-0 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      )}
    </button>
  );
}
