import { money } from "./lib/format";
import type { Direction } from "./lib/risk";

export interface GridRow {
  price: number;
  ratio: number;
}

/** Gera N ordens igualmente espaçadas entre dois preços, com ratio igual. */
export function buildGrid(from: number, to: number, count: number): GridRow[] {
  const n = Math.max(1, Math.min(100, Math.floor(count || 1)));
  const ratio = +(100 / n).toFixed(2);
  if (n === 1) return [{ price: round(from), ratio: 100 }];
  return Array.from({ length: n }, (_, i) => ({
    price: round(from + (to - from) * (i / (n - 1))),
    ratio,
  }));
}

const round = (n: number) => +n.toFixed(2);
const COUNT_CHIPS = [2, 5, 10, 20];

interface Props {
  from: number;
  to: number;
  count: number;
  rows: GridRow[];
  direction: Direction;
  values: number[]; // valor ($) por ordem, vindo do dimensionamento por risco
  avg: number;
  totalNotional: number;
  margin: number;
  leverage: number;
  onFrom: (v: number) => void;
  onTo: (v: number) => void;
  onCount: (v: number) => void;
  onEditRow: (i: number, patch: Partial<GridRow>) => void;
}

export default function ScaledOrders({
  from,
  to,
  count,
  rows,
  direction,
  values,
  avg,
  totalNotional,
  margin,
  leverage,
  onFrom,
  onTo,
  onCount,
  onEditRow,
}: Props) {
  return (
    <div className="space-y-3">
      {/* Faixa de preço */}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
          Faixa de preço
        </p>
        <div className="flex items-center gap-2">
          <Cell label="De" value={from} onChange={onFrom} />
          <span className="text-slate-600">—</span>
          <Cell label="Até" value={to} onChange={onTo} />
        </div>
      </div>

      {/* Quantidade de ordens */}
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
          Quantas ordens (2–100)
        </p>
        <div className="flex gap-2">
          {COUNT_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => onCount(c)}
              className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                count === c
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              {c}
            </button>
          ))}
          <input
            type="number"
            inputMode="numeric"
            value={count}
            onChange={(e) => onCount(parseInt(e.target.value) || 1)}
            className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 text-center text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Tabela Preço · Valor · Ratio */}
      <div className="overflow-hidden rounded-xl border border-slate-800">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-px bg-slate-800 text-xs font-medium uppercase tracking-wider text-slate-500">
          <div className="bg-slate-900 px-3 py-2">Preço</div>
          <div className="bg-slate-900 px-3 py-2">Valor</div>
          <div className="bg-slate-900 px-3 py-2 text-right">Ratio</div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_auto] items-center gap-px border-t border-slate-800/60"
            >
              <input
                type="number"
                inputMode="decimal"
                value={r.price}
                onChange={(e) => onEditRow(i, { price: parseFloat(e.target.value) || 0 })}
                className="bg-transparent px-3 py-2 text-sm text-slate-100 outline-none focus:bg-slate-800/50"
              />
              <div className="px-3 py-2 text-sm text-slate-400">
                {money(values[i] ?? NaN)}
              </div>
              <div className="flex items-center">
                <input
                  type="number"
                  inputMode="decimal"
                  value={r.ratio}
                  onChange={(e) => onEditRow(i, { ratio: parseFloat(e.target.value) || 0 })}
                  className="w-14 bg-transparent px-2 py-2 text-right text-sm text-slate-100 outline-none focus:bg-slate-800/50"
                />
                <span className="pr-3 text-xs text-slate-500">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resumo */}
      <div className="space-y-1.5 rounded-xl bg-slate-900/60 p-3 text-sm">
        <Row
          label={`Preço médio (${direction === "long" ? "compra" : "venda"})`}
          value={money(avg)}
          strong
        />
        <Row label="Custo total" value={money(totalNotional)} />
        <Row
          label={leverage > 1 ? `Margem (${leverage}x)` : "Margem"}
          value={money(margin)}
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent text-base font-semibold text-slate-100 outline-none"
      />
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className={strong ? "font-bold text-white" : "text-slate-200"}>{value}</span>
    </div>
  );
}
