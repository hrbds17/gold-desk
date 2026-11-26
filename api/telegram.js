// GET /api/telegram
// Derniers messages d'un canal Telegram PUBLIC, lus sur sa page d'aperçu t.me/s/<canal>.
// Variable d'environnement Vercel : TELEGRAM_CHANNEL (nom du canal sans @).
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""; }
    return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
  });
}
function toText(html) {
  return decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function parse(html) {
  const out = [];
  const parts = String(html).split(/<div class="tgme_widget_message_wrap/).slice(1);
  for (const part of parts) {
    const post = (part.match(/data-post="([A-Za-z0-9_]+\/\d+)"/) || [])[1];
    const time = (part.match(/<time[^>]*datetime="([^"]+)"/) || [])[1];
    const body = (part.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
    if (!post || !time || !Number.isFinite(Date.parse(time))) continue;
    const text = body ? toText(body) : "";
    out.push({ id: post, t: time, text: text.slice(0, 1200), media: /tgme_widget_message_(photo|video)/.test(part), url: "https://t.me/" + post });
  }
  return out.sort((a, b) => Date.parse(b.t) - Date.parse(a.t)).slice(0, 15);
}

module.exports = async function handler(req, res) {
  const ch = String(process.env.TELEGRAM_CHANNEL || "").replace(/^@/, "").trim();
  if (!ch) return res.status(503).json({ error: "Ajoute la variable TELEGRAM_CHANNEL (nom du canal, sans @) dans Vercel, puis redéploie.", posts: [] });
  if (!/^[A-Za-z0-9_]{4,32}$/.test(ch)) return res.status(503).json({ error: "TELEGRAM_CHANNEL n'est pas un nom de canal valide.", posts: [] });
  try {
    const r = await fetch("https://t.me/s/" + ch, { headers: { accept: "text/html", "accept-language": "fr,en;q=0.8" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("t.me " + r.status);
    const posts = parse(await r.text());
    if (!posts.length) return res.status(502).json({ error: "Aucun message lisible. Le canal doit être public, avec l'aperçu web activé.", posts: [] });
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ channel: ch, posts });
  } catch (e) {
    res.status(502).json({ error: "Telegram injoignable pour l'instant.", posts: [] });
  }
};
module.exports.parse = parse;
