// Lógica pura de dimensionamento de posição com base em risco.
// Tudo aqui é testável sem React.

export type Direction = "long" | "short";

/** Como o trader informa o stop. */
export type StopMode =
  | { kind: "price"; stopPrice: number } // preço absoluto do stop
  | { kind: "distancePct"; pct: number } // distância em % do preço médio
  | { kind: "distancePoints"; points: number }; // distância em pontos/preço

/** Uma perna de entrada (para ordens escaladas). `allocPct` = fração do
 *  tamanho TOTAL em quantidade/unidades (a soma das pernas deve dar 100). */
export interface EntryLeg {
  price: number;
  allocPct: number;
}

export interface RiskInput {
  balance: number; // tamanho da banca
  riskPct: number; // % da banca arriscada no trade
  direction: Direction;
  legs: EntryLeg[]; // 1 perna = ordem única; N pernas = escalada
  stop: StopMode;
  leverage?: number; // alavancagem disponível (cripto). default 1
  takeProfit?: number; // preço de alvo opcional, p/ calcular R:R
}

export interface LegResult {
  price: number;
  allocPct: number;
  units: number; // quantidade nessa perna
  notional: number; // valor ($) nessa perna
}

export interface RiskResult {
  ok: boolean;
  errors: string[];
  riskAmount: number; // quanto se perde se stopar ($)
  avgEntry: number; // preço médio ponderado das entradas
  stopPrice: number; // preço do stop (derivado ou informado)
  stopDistance: number; // distância em preço do médio até o stop
  stopDistancePct: number; // mesma distância em %
  totalUnits: number; // quantidade total da posição
  totalNotional: number; // valor total da posição ($)
  requiredMargin: number; // margem necessária com a alavancagem
  marginPctOfBalance: number; // margem como % da banca
  legs: LegResult[];
  rMultipleToTp?: number; // R:R até o take profit, se informado
  profitAtTp?: number; // lucro estimado no alvo ($)
  liquidationPrice: number; // preço de liquidação estimado (simplificado)
  maxSafeLeverage: number; // alavancagem máxima p/ liquidar DEPOIS do stop
  liquidatedBeforeStop: boolean; // true se a liquidação acontece antes do stop
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Preço médio ponderado pela alocação em unidades. */
export function weightedAvgEntry(legs: EntryLeg[]): number {
  const totalAlloc = sum(legs.map((l) => l.allocPct));
  if (totalAlloc <= 0) return NaN;
  return sum(legs.map((l) => (l.allocPct / totalAlloc) * l.price));
}

/** Distância (em preço) do médio até o stop, sempre positiva. */
function resolveStopDistance(avgEntry: number, stop: StopMode): number {
  switch (stop.kind) {
    case "price":
      return Math.abs(avgEntry - stop.stopPrice);
    case "distancePct":
      return (Math.abs(stop.pct) / 100) * avgEntry;
    case "distancePoints":
      return Math.abs(stop.points);
  }
}

/** Preço do stop a partir do médio + direção + distância. */
function resolveStopPrice(
  avgEntry: number,
  direction: Direction,
  stop: StopMode,
  distance: number,
): number {
  if (stop.kind === "price") return stop.stopPrice;
  return direction === "long" ? avgEntry - distance : avgEntry + distance;
}

export function calcRisk(input: RiskInput): RiskResult {
  const errors: string[] = [];
  const {
    balance,
    riskPct,
    direction,
    legs,
    stop,
    leverage = 1,
    takeProfit,
  } = input;

  if (!(balance > 0)) errors.push("Banca deve ser maior que zero.");
  if (!(riskPct > 0)) errors.push("Risco por trade deve ser maior que zero.");
  if (legs.length === 0) errors.push("Adicione ao menos uma ordem de entrada.");
  if (legs.some((l) => !(l.price > 0)))
    errors.push("Todo preço de entrada deve ser maior que zero.");
  if (sum(legs.map((l) => l.allocPct)) <= 0)
    errors.push("A alocação total das ordens deve ser maior que zero.");

  const avgEntry = weightedAvgEntry(legs);
  const stopDistance = resolveStopDistance(avgEntry, stop);
  const stopPrice = resolveStopPrice(avgEntry, direction, stop, stopDistance);

  if (!(stopDistance > 0))
    errors.push("A distância até o stop precisa ser maior que zero.");

  // Stop tem que estar do lado certo do preço médio.
  if (Number.isFinite(avgEntry) && Number.isFinite(stopPrice)) {
    if (direction === "long" && stopPrice >= avgEntry)
      errors.push("Em long, o stop deve ficar ABAIXO do preço médio.");
    if (direction === "short" && stopPrice <= avgEntry)
      errors.push("Em short, o stop deve ficar ACIMA do preço médio.");
  }
  if (!(leverage > 0)) errors.push("Alavancagem deve ser maior que zero.");

  const riskAmount = balance * (riskPct / 100);

  // Liquidação (modelo simplificado: ignora taxas e margem de manutenção).
  // A perda que zera a margem = notional / alavancagem, ou seja, o preço se
  // move ~1/alavancagem antes de liquidar. Logo, p/ liquidar DEPOIS do stop:
  //   alavancagem_máx = 1 / (distância do stop em fração)
  const stopFrac = avgEntry > 0 ? stopDistance / avgEntry : NaN;
  const maxSafeLeverage = stopFrac > 0 ? 1 / stopFrac : Infinity;
  const liqFrac = leverage > 0 ? 1 / leverage : Infinity;
  const liquidationPrice =
    direction === "long" ? avgEntry * (1 - liqFrac) : avgEntry * (1 + liqFrac);
  const liquidatedBeforeStop = leverage > maxSafeLeverage + 1e-9;

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      riskAmount,
      avgEntry,
      stopPrice,
      stopDistance,
      stopDistancePct: (stopDistance / avgEntry) * 100,
      totalUnits: 0,
      totalNotional: 0,
      requiredMargin: 0,
      marginPctOfBalance: 0,
      legs: [],
      liquidationPrice,
      maxSafeLeverage,
      liquidatedBeforeStop,
    };
  }

  // O coração: tamanho total tal que (perda no stop) == risco escolhido.
  const totalUnits = riskAmount / stopDistance;
  const totalNotional = totalUnits * avgEntry;
  const requiredMargin = totalNotional / leverage;

  const totalAlloc = sum(legs.map((l) => l.allocPct));
  const legResults: LegResult[] = legs.map((l) => {
    const frac = l.allocPct / totalAlloc;
    const units = frac * totalUnits;
    return {
      price: l.price,
      allocPct: l.allocPct,
      units,
      notional: units * l.price,
    };
  });

  let rMultipleToTp: number | undefined;
  let profitAtTp: number | undefined;
  if (takeProfit && takeProfit > 0) {
    const reward =
      direction === "long" ? takeProfit - avgEntry : avgEntry - takeProfit;
    rMultipleToTp = reward / stopDistance; // em múltiplos de R
    profitAtTp = reward * totalUnits;
  }

  return {
    ok: true,
    errors: [],
    riskAmount,
    avgEntry,
    stopPrice,
    stopDistance,
    stopDistancePct: (stopDistance / avgEntry) * 100,
    totalUnits,
    totalNotional,
    requiredMargin,
    marginPctOfBalance: (requiredMargin / balance) * 100,
    legs: legResults,
    rMultipleToTp,
    profitAtTp,
    liquidationPrice,
    maxSafeLeverage,
    liquidatedBeforeStop,
  };
}
