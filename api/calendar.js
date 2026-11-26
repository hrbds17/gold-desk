// GET /api/calendar
// Prochaines annonces US à fort impact. Sert au garde-fou du signal (pas de signal juste avant une annonce).
function normalize(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((e) => e && e.time && e.name)
    .map((e) => ({
      t: e.time,
      title: String(e.name),
      impact: String(e.importance || "").toLowerCase(),
      exact: !e.timeMode || e.timeMode === "exact",
      forecast: e.forecast == null ? null : e.forecast,
      previous: e.previous == null ? null : e.previous,
    }))
    .filter((e) => Number.isFinite(Date.parse(e.t)));
}

module.exports = async function handler(req, res) {
  try {
    const r = await fetch("https://biquote.io/api/calendar/upcoming?limit=15&countries=US&importance=high", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error("source " + r.status);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({ source: "biquote.io", events: normalize(await r.json()) });
  } catch (e) {
    res.status(502).json({ error: "Calendrier injoignable.", events: [] });
  }
};
module.exports.normalize = normalize;
