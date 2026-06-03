export const money = (n: number, max = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: max,
      })
    : "—";

export const num = (n: number, max = 6) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: max })
    : "—";

export const pct = (n: number, max = 2) =>
  Number.isFinite(n) ? `${n.toLocaleString("en-US", { maximumFractionDigits: max })}%` : "—";

/** Quantidade de moedas — mais casas quando o número é pequeno (cripto fracionária). */
export const qty = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const max = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
};
