export const money = (n: number, max = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: max,
      })
    : "—";

/** Preço — mostra até 4 casas decimais (cripto), nunca mais que isso. */
export const price = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    : "—";

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
