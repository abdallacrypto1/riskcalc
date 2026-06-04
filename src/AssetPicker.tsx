import { useEffect, useRef, useState } from "react";
import { price } from "./lib/format";

interface Asset {
  base: string; // ex: BTC
  symbol: string; // ex: BTCUSDT
  price: number;
}

// Cache em nível de módulo — busca a lista uma vez por sessão.
let assetCache: Asset[] | null = null;
let cachePromise: Promise<Asset[]> | null = null;

const POPULAR = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA"];

async function loadAssets(): Promise<Asset[]> {
  if (assetCache) return assetCache;
  if (!cachePromise) {
    cachePromise = fetch("https://api.binance.com/api/v3/ticker/price")
      .then((r) => r.json())
      .then((arr: { symbol: string; price: string }[]) => {
        const list = arr
          .filter((x) => x.symbol.endsWith("USDT"))
          .map((x) => ({
            base: x.symbol.slice(0, -4),
            symbol: x.symbol,
            price: parseFloat(x.price),
          }))
          .filter((a) => a.price > 0 && /^[A-Z0-9]+$/.test(a.base));
        assetCache = list;
        return list;
      });
  }
  return cachePromise;
}

async function fetchPrice(symbol: string): Promise<number> {
  const r = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
  );
  if (!r.ok) throw new Error("price fetch failed");
  const d = await r.json();
  return parseFloat(d.price);
}

interface Props {
  selected: string | null; // símbolo selecionado (ex: BTCUSDT)
  onPrice: (price: number, symbol: string) => void;
}

export default function AssetPicker({ selected, onPrice }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const ensureLoaded = () => {
    if (assets.length || loading) return;
    setLoading(true);
    setError(false);
    loadAssets()
      .then((a) => {
        setAssets(a);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  };

  const q = query.trim().toUpperCase();
  const byPopularity = (a: Asset, b: Asset) => {
    const pa = POPULAR.indexOf(a.base);
    const pb = POPULAR.indexOf(b.base);
    if (pa !== -1 || pb !== -1)
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    if (a.base.length !== b.base.length) return a.base.length - b.base.length;
    return a.base.localeCompare(b.base);
  };
  const matches = (
    q
      ? assets.filter((a) => a.base.startsWith(q))
      : assets.filter((a) => POPULAR.includes(a.base))
  )
    .sort((a, b) => {
      if (q) {
        if (a.base === q) return -1;
        if (b.base === q) return 1;
      }
      return byPopularity(a, b);
    })
    .slice(0, 8);

  const pick = async (a: Asset) => {
    setQuery("");
    setOpen(false);
    onPrice(a.price, a.symbol); // preço do cache, imediato
    setBusy(true);
    try {
      const p = await fetchPrice(a.symbol);
      if (p > 0) onPrice(p, a.symbol); // atualiza pro preço exato
    } catch {
      /* mantém o do cache */
    }
    setBusy(false);
  };

  const refresh = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const p = await fetchPrice(selected);
      if (p > 0) onPrice(p, selected);
    } catch {
      /* ignora */
    }
    setBusy(false);
  };

  const selectedBase = selected ? selected.replace(/USDT$/, "") : null;

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              ensureLoaded();
            }}
            onFocus={() => {
              setOpen(true);
              ensureLoaded();
            }}
            placeholder={
              selectedBase ? `${selectedBase} · trocar ativo…` : "Buscar ativo (ex: BTC, ETH)"
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        {selected && (
          <button
            onClick={refresh}
            disabled={busy}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500 hover:text-emerald-300 disabled:opacity-40"
            aria-label="Atualizar preço"
            title="Atualizar preço ao vivo"
          >
            <svg
              className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {loading && (
            <div className="px-3 py-3 text-sm text-slate-500">Carregando ativos…</div>
          )}
          {error && (
            <div className="px-3 py-3 text-sm text-amber-300">
              Não consegui buscar os preços. Use o modo manual (digite a entrada).
            </div>
          )}
          {!loading && !error && matches.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              Nenhum ativo encontrado.
            </div>
          )}
          {!loading &&
            !error &&
            matches.map((a) => (
              <button
                key={a.symbol}
                onClick={() => pick(a)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-slate-800"
              >
                <span className="font-semibold text-slate-200">{a.base}</span>
                <span className="text-slate-400">{price(a.price)}</span>
              </button>
            ))}
          {!loading && !error && (
            <div className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-600">
              preços ao vivo via Binance
            </div>
          )}
        </div>
      )}
    </div>
  );
}
