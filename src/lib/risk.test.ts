import { describe, it, expect } from "vitest";
import { calcRisk, weightedAvgEntry } from "./risk";

describe("ordem única", () => {
  it("dimensiona pela distância em preço", () => {
    // Banca 1000, risco 2% = $20. Entra 100, stop 98 -> distância 2.
    const r = calcRisk({
      balance: 1000,
      riskPct: 2,
      direction: "long",
      legs: [{ price: 100, allocPct: 100 }],
      stop: { kind: "price", stopPrice: 98 },
    });
    expect(r.ok).toBe(true);
    expect(r.riskAmount).toBe(20);
    expect(r.stopDistance).toBe(2);
    expect(r.totalUnits).toBe(10); // 20 / 2
    expect(r.totalNotional).toBe(1000); // 10 * 100
  });

  it("dimensiona pela distância em %", () => {
    const r = calcRisk({
      balance: 1000,
      riskPct: 3,
      direction: "long",
      legs: [{ price: 50, allocPct: 100 }],
      stop: { kind: "distancePct", pct: 5 },
    });
    // risco 30, distância = 5% de 50 = 2.5 -> units = 12
    expect(r.stopDistance).toBeCloseTo(2.5);
    expect(r.totalUnits).toBeCloseTo(12);
    expect(r.stopPrice).toBeCloseTo(47.5);
  });

  it("a perda no stop bate exatamente com o risco", () => {
    const r = calcRisk({
      balance: 5000,
      riskPct: 1.5,
      direction: "short",
      legs: [{ price: 200, allocPct: 100 }],
      stop: { kind: "price", stopPrice: 210 },
    });
    const perda = r.totalUnits * Math.abs(r.stopPrice - r.avgEntry);
    expect(perda).toBeCloseTo(r.riskAmount);
    expect(r.riskAmount).toBe(75);
  });
});

describe("ordens escaladas (preço médio)", () => {
  it("usa o preço médio ponderado e mantém o risco total", () => {
    // Duas entradas iguais: 100 e 90 -> médio 95. Stop 85 -> distância 10.
    const r = calcRisk({
      balance: 1000,
      riskPct: 2,
      direction: "long",
      legs: [
        { price: 100, allocPct: 50 },
        { price: 90, allocPct: 50 },
      ],
      stop: { kind: "price", stopPrice: 85 },
    });
    expect(r.avgEntry).toBeCloseTo(95);
    expect(r.stopDistance).toBeCloseTo(10);
    expect(r.totalUnits).toBeCloseTo(2); // 20 / 10
    // Se stopar tudo, perde exatamente o risco definido:
    const perda = r.totalUnits * (r.avgEntry - r.stopPrice);
    expect(perda).toBeCloseTo(r.riskAmount);
    // Pernas somam o total.
    expect(r.legs[0].units + r.legs[1].units).toBeCloseTo(r.totalUnits);
  });

  it("alocação desigual desloca o preço médio", () => {
    const avg = weightedAvgEntry([
      { price: 100, allocPct: 75 },
      { price: 80, allocPct: 25 },
    ]);
    expect(avg).toBeCloseTo(95); // 0.75*100 + 0.25*80
  });
});

describe("alavancagem e R:R", () => {
  it("calcula margem necessária", () => {
    const r = calcRisk({
      balance: 1000,
      riskPct: 2,
      direction: "long",
      legs: [{ price: 100, allocPct: 100 }],
      stop: { kind: "price", stopPrice: 98 },
      leverage: 10,
    });
    expect(r.totalNotional).toBe(1000);
    expect(r.requiredMargin).toBe(100); // 1000 / 10
    expect(r.marginPctOfBalance).toBe(10);
  });

  it("calcula múltiplo de R até o alvo", () => {
    const r = calcRisk({
      balance: 1000,
      riskPct: 2,
      direction: "long",
      legs: [{ price: 100, allocPct: 100 }],
      stop: { kind: "price", stopPrice: 98 }, // R = 2
      takeProfit: 106, // reward = 6 -> 3R
    });
    expect(r.rMultipleToTp).toBeCloseTo(3);
    expect(r.profitAtTp).toBeCloseTo(60); // 6 * 10 units
  });
});

describe("validações", () => {
  it("rejeita stop do lado errado em long", () => {
    const r = calcRisk({
      balance: 1000,
      riskPct: 2,
      direction: "long",
      legs: [{ price: 100, allocPct: 100 }],
      stop: { kind: "price", stopPrice: 105 },
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/ABAIXO/);
  });

  it("rejeita banca zero", () => {
    const r = calcRisk({
      balance: 0,
      riskPct: 2,
      direction: "long",
      legs: [{ price: 100, allocPct: 100 }],
      stop: { kind: "distancePct", pct: 2 },
    });
    expect(r.ok).toBe(false);
  });
});
