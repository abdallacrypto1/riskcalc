export const money = (n: number, max = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: max,
      })
    : "—";

/** Preço. Com `decimals` definido, fixa nessa precisão (a do ativo, via tickSize).
 *  Sem ele (modo manual), mostra de 2 a 4 casas. */
export const price = (n: number, decimals?: number) => {
  if (!Number.isFinite(n)) return "—";
  const opts =
    decimals != null
      ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : { minimumFractionDigits: 2, maximumFractionDigits: 4 };
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    ...opts,
  });
};

export const num = (n: number, max = 6) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: max })
    : "—";

export const pct = (n: number, max = 2) =>
  Number.isFinite(n) ? `${n.toLocaleString("en-US", { maximumFractionDigits: max })}%` : "—";

/** Quantidade de moedas — no máximo 4 casas decimais. */
export const qty = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const max = n >= 1000 ? 2 : 4;
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
};
