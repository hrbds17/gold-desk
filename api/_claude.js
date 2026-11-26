// Aide partagée (le préfixe _ évite que Vercel en fasse une route) : contrôle du code d'accès et appel à l'API Claude.
const crypto = require("crypto");

function checkAccess(req) {
  const key = process.env.ANTHROPIC_API_KEY, code = process.env.DESK_CODE;
  if (!key || !code) return { status: 503, error: "Configure ANTHROPIC_API_KEY et DESK_CODE dans Vercel, puis redéploie." };
  const x = Buffer.from(String(req.headers["x-desk-code"] || "")), y = Buffer.from(String(code));
  if (!(x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y))) return { status: 401, error: "Code d'accès incorrect." };
  return null;
}

// Renvoie le texte de la réponse, ou lève une Error dont le message est affichable tel quel.
async function askClaude({ system, user, maxTokens }) {
  // Sur les modèles récents la réflexion est active par défaut et compte dans max_tokens :
  // on la coupe pour ces tâches courtes, et si le modèle refuse ce réglage on relance avec une marge large.
  const call = (extra) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(Object.assign({ model: process.env.CLAUDE_MODEL || "claude-haiku-5-5", system, messages: [{ role: "user", content: user }] }, extra)),
    signal: AbortSignal.timeout(25000),
  });
  let r, j;
  try {
    r = await call({ max_tokens: maxTokens, thinking: { type: "disabled" } });
    if (r.status === 400) r = await call({ max_tokens: maxTokens + 5000 });
    j = await r.json().catch(() => null);
  } catch (e) { throw new Error("L'API Claude n'a pas répondu à temps."); }
  if (!r.ok) throw new Error("L'API Claude a refusé la demande : " + (j && j.error && j.error.message ? j.error.message : "erreur " + r.status));
  const text = (j && Array.isArray(j.content) ? j.content : []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error((j && j.stop_reason === "refusal" ? "Claude a décliné cette demande."
    : j && j.stop_reason === "max_tokens" ? "La réponse a été coupée avant le texte (limite de longueur atteinte)."
    : "Claude n'a renvoyé aucun texte (arrêt : " + (j && j.stop_reason ? j.stop_reason : "inconnu") + ").") + " Réessaie.");
  return text;
}
module.exports = { checkAccess, askClaude };
