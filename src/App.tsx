import { useMemo, useState } from "react";
import {
  calcRisk,
  type Direction,
  type EntryLeg,
  type StopMode,
} from "./lib/risk";
import { money, num, pct } from "./lib/format";

type Mode = "single" | "scaled";
type StopInput = "price" | "distance";
type DistUnit = "pct" | "pts";

const RISK_CHIPS = [1, 2, 3];

function toNum(s: string): number {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export default function App() {
  const [balance, setBalance] = useState("1000");
  const [riskPct, setRiskPct] = useState(2);
  const [leverage, setLeverage] = useState("1");
  const [direction, setDirection] = useState<Direction>("long");
  const [mode, setMode] = useState<Mode>("single");

  // Entradas: ordem única usa legs[0]; escalada usa todas.
  const [legs, setLegs] = useState<{ price: string; allocPct: string }[]>([
    { price: "100", allocPct: "100" },
  ]);

  const [stopInput, setStopInput] = useState<StopInput>("price");
  const [distUnit, setDistUnit] = useState<DistUnit>("pct");
  const [stopPrice, setStopPrice] = useState("98");
  const [distance, setDistance] = useState("2");
  const [takeProfit, setTakeProfit] = useState("");

  const activeLegs: EntryLeg[] = useMemo(() => {
    const used = mode === "single" ? legs.slice(0, 1) : legs;
    return used.map((l) => ({
      price: toNum(l.price),
      allocPct: mode === "single" ? 100 : toNum(l.allocPct),
    }));
  }, [legs, mode]);

  const stop: StopMode = useMemo(() => {
    if (stopInput === "price") return { kind: "price", stopPrice: toNum(stopPrice) };
    return distUnit === "pct"
      ? { kind: "distancePct", pct: toNum(distance) }
      : { kind: "distancePoints", points: toNum(distance) };
  }, [stopInput, distUnit, stopPrice, distance]);

  const result = useMemo(
    () =>
      calcRisk({
        balance: toNum(balance),
        riskPct,
        direction,
        legs: activeLegs,
        stop,
        leverage: toNum(leverage) || 1,
        takeProfit: takeProfit.trim() ? toNum(takeProfit) : undefined,
      }),
    [balance, riskPct, direction, activeLegs, stop, leverage, takeProfit],
  );

  const updateLeg = (i: number, patch: Partial<{ price: string; allocPct: string }>) =>
    setLegs((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLeg = () =>
    setLegs((ls) => [...ls, { price: "", allocPct: "" }]);
  const removeLeg = (i: number) =>
    setLegs((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  return (
    <div className="min-h-full text-slate-100">
      <div className="mx-auto max-w-md px-4 pb-32 pt-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Risk<span className="text-emerald-400">Calc</span>
          </h1>
          <p className="text-sm text-slate-400">
            Dimensione a posição certa antes de entrar no trade.
          </p>
        </header>

        {/* Conta */}
        <Card title="Conta">
          <Field label="Banca (USD)">
            <Money value={balance} onChange={setBalance} placeholder="1000" />
          </Field>

          <Field label="Risco por trade">
            <div className="flex gap-2">
              {RISK_CHIPS.map((c) => (
                <Chip
                  key={c}
                  active={riskPct === c}
                  onClick={() => setRiskPct(c)}
                >
                  {c}%
                </Chip>
              ))}
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={riskPct}
                  onChange={(e) => setRiskPct(toNum(e.target.value) || 0)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-7 text-right text-sm outline-none focus:border-emerald-500"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                  %
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ={" "}
              <span className="text-slate-300">
                {money((toNum(balance) || 0) * (riskPct / 100))}
              </span>{" "}
              em risco
            </p>
          </Field>

          <Field label="Alavancagem (opcional)">
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-8 text-sm outline-none focus:border-emerald-500"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                x
              </span>
            </div>
          </Field>
        </Card>

        {/* Trade */}
        <Card title="Trade">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Segmented
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
              options={[
                { value: "long", label: "Long", tone: "emerald" },
                { value: "short", label: "Short", tone: "rose" },
              ]}
            />
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { value: "single", label: "Única" },
                { value: "scaled", label: "Escalada" },
              ]}
            />
          </div>

          {/* Entradas */}
          {mode === "single" ? (
            <Field label="Preço de entrada">
              <Money
                value={legs[0].price}
                onChange={(v) => updateLeg(0, { price: v })}
                placeholder="100"
              />
            </Field>
          ) : (
            <Field label="Ordens de entrada (preço + % do total)">
              <div className="space-y-2">
                {legs.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Money
                        value={l.price}
                        onChange={(v) => updateLeg(i, { price: v })}
                        placeholder="preço"
                      />
                    </div>
                    <div className="relative w-24">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={l.allocPct}
                        onChange={(e) => updateLeg(i, { allocPct: e.target.value })}
                        placeholder="%"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 pr-7 text-right text-sm outline-none focus:border-emerald-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        %
                      </span>
                    </div>
                    <button
                      onClick={() => removeLeg(i)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-rose-500 hover:text-rose-400 disabled:opacity-30"
                      disabled={legs.length <= 1}
                      aria-label="Remover ordem"
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  onClick={addLeg}
                  className="w-full rounded-lg border border-dashed border-slate-700 py-2 text-sm text-slate-400 hover:border-emerald-500 hover:text-emerald-400"
                >
                  + Adicionar ordem
                </button>
                {result.ok && (
                  <p className="text-xs text-slate-500">
                    Preço médio:{" "}
                    <span className="text-slate-300">{money(result.avgEntry)}</span>
                  </p>
                )}
              </div>
            </Field>
          )}

          {/* Stop */}
          <Field label="Stop loss">
            <div className="mb-2">
              <Segmented
                value={stopInput}
                onChange={(v) => setStopInput(v as StopInput)}
                options={[
                  { value: "price", label: "Preço do stop" },
                  { value: "distance", label: "Distância" },
                ]}
              />
            </div>
            {stopInput === "price" ? (
              <Money value={stopPrice} onChange={setStopPrice} placeholder="98" />
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                  />
                </div>
                <Segmented
                  value={distUnit}
                  onChange={(v) => setDistUnit(v as DistUnit)}
                  options={[
                    { value: "pct", label: "%" },
                    { value: "pts", label: "pts" },
                  ]}
                />
              </div>
            )}
          </Field>

          <Field label="Take profit (opcional)">
            <Money
              value={takeProfit}
              onChange={setTakeProfit}
              placeholder="alvo p/ ver o R:R"
            />
          </Field>
        </Card>

        {result.ok ? (
          <Results result={result} direction={direction} />
        ) : (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
            {result.errors[0] ?? "Preencha os campos para calcular."}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Resultado ---------- */

function Results({
  result,
  direction,
}: {
  result: ReturnType<typeof calcRisk>;
  direction: Direction;
}) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-slate-900/40 p-5">
      <p className="text-xs uppercase tracking-wider text-emerald-300/80">
        Tamanho da posição
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-white">
          {num(result.totalUnits)}
        </span>
        <span className="text-sm text-slate-400">unidades</span>
      </div>
      <p className="mt-0.5 text-sm text-slate-300">
        {money(result.totalNotional)} de exposição
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Stat label="Risco ($)" value={money(result.riskAmount)} />
        <Stat
          label="Stop"
          value={`${money(result.stopPrice)} · ${pct(result.stopDistancePct)}`}
        />
        <Stat label="Margem usada" value={money(result.requiredMargin)} />
        <Stat label="Margem / banca" value={pct(result.marginPctOfBalance)} />
      </div>

      {result.rMultipleToTp !== undefined && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-sm">
          <span className="text-slate-400">Alvo</span>
          <span className="text-slate-200">
            <span
              className={
                result.rMultipleToTp >= 1
                  ? "font-semibold text-emerald-400"
                  : "font-semibold text-amber-400"
              }
            >
              {num(result.rMultipleToTp, 2)}R
            </span>{" "}
            · {money(result.profitAtTp ?? NaN)}
          </span>
        </div>
      )}

      {result.legs.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">
            Por ordem
          </p>
          <div className="space-y-1.5">
            {result.legs.map((l, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2 text-sm"
              >
                <span className="text-slate-400">
                  {direction === "long" ? "Compra" : "Venda"} @ {money(l.price)}
                </span>
                <span className="text-slate-200">
                  {num(l.units)} un · {money(l.notional)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- UI primitives ---------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="mb-1.5 block text-sm text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function Money({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
        $
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-7 pr-3 text-sm outline-none focus:border-emerald-500"
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
          : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; tone?: "emerald" | "rose" }[];
}) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        const tone =
          o.tone === "rose"
            ? "bg-rose-500/20 text-rose-300"
            : o.tone === "emerald"
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-slate-700 text-white";
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition ${
              active ? tone : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-900/50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-100">{value}</p>
    </div>
  );
}
