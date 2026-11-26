// GET /api/candles?tf=15m
// Bougies XAUUSD normalisées. La source est isolée ici : pour en changer, il suffit de réécrire fetchBars().
const LIMITS = { "5m": 288, "15m": 192, "30m": 192, "1h": 168, "4h": 180, "1d": 300 };
const SYMBOL = "XAUUSD";

async function fetchBars(tf) {
  const url = "https://biquote.io/api/" + SYMBOL + "/ohlc?interval=" + tf + "&limit=" + LIMITS[tf];
  const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("source " + r.status);
  const j = await r.json();
  return Array.isArray(j) ? j : j && Array.isArray(j.bars) ? j.bars : [];
}

function normalize(bars) {
  return bars
    .map((b) => ({ t: Date.parse(b.openTime), o: +b.open, h: +b.high, l: +b.low, c: +b.close, open: !!b.isOpen }))
    .filter((c) => [c.t, c.o, c.h, c.l, c.c].every(Number.isFinite))
    .sort((a, b) => a.t - b.t);
}

module.exports = async function handler(req, res) {
  const tf = String((req.query && req.query.tf) || "15m");
  if (!LIMITS[tf]) return res.status(400).json({ error: "tf invalide" });
  try {
    const candles = normalize(await fetchBars(tf));
    if (!candles.length) return res.status(502).json({ error: "La source de prix n'a renvoyé aucune bougie." });
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    res.status(200).json({ source: "biquote.io", symbol: SYMBOL, interval: tf, fetchedAt: Date.now(), candles });
  } catch (e) {
    res.status(502).json({ error: "Source de prix injoignable (" + (e && e.message ? e.message : "erreur") + ")." });
  }
};
module.exports.normalize = normalize;
