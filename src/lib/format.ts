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
