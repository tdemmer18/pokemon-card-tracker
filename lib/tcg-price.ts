export type TcgCardPrice = {
  market: number | null;
  low: number | null;
  high: number | null;
};

type TcgplayerVariantPrice = {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
};

export type Tcgplayer = {
  prices?: Record<string, TcgplayerVariantPrice | null>;
};

const VARIANT_PRIORITY = [
  "holofoil",
  "reverseHolofoil",
  "normal",
  "1stEditionHolofoil",
  "1stEditionNormal",
  "1stEdition",
  "unlimitedHolofoil",
  "unlimited",
];

export function extractTcgPrice(tcgplayer?: Tcgplayer): TcgCardPrice | null {
  const prices = tcgplayer?.prices;
  if (!prices) return null;
  const keys = Object.keys(prices);
  if (keys.length === 0) return null;
  const variantKey = VARIANT_PRIORITY.find((key) => prices[key]) ?? keys[0];
  const variant = prices[variantKey];
  if (!variant) return null;
  const market = variant.market ?? variant.mid ?? null;
  const low = variant.low ?? null;
  const high = variant.high ?? null;
  if (market === null && low === null && high === null) return null;
  return { market, low, high };
}
