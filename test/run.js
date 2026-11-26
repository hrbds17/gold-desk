const assert = require("assert");
const { analyze, stepTrade, backtest, summarize } = require("../public/engine.js");
const candles = require("../api/candles.js");
const calendar = require("../api/calendar.js");
const analyse = require("../api/analyse.js");
const telegram = require("../api/telegram.js");

function gen(n, step, seed) { let p = 3560, t = Date.now() - n * step, r = seed; const o = [];
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; };
  for (let i = 0; i < n; i++) { const op = p; p += rnd() * 8 + Math.sin(i / 25) * 1.2; o.push({ t: t + i * step, o: op, h: Math.max(op, p) + Math.abs(rnd()) * 4, l: Math.min(op, p) - Math.abs(rnd()) * 4, c: p }); } return o; }
function res() { return { code: 0, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; } }; }

(async () => {
  // moteur : plans cohérents, tailles d'historique réelles (192 M15, 180 H4)
  const seen = {}; let nScen = 0, btInfo = null;
  for (let s = 1; s <= 300; s++) {
    const a = analyze(gen(192, 9e5, s * 7919), gen(180, 144e5, s * 104729), Date.now(), [], { ltf: "M15", htf: "H4" });
    seen[a.verdict] = (seen[a.verdict] || 0) + 1;
    if (a.plan) { const p = a.plan, d = p.dir;
      assert(d * (p.entry - p.sl) > 0 && d * (p.tp1 - p.entry) > 0 && d * (p.tp2 - p.entry) >= d * (p.tp1 - p.entry) - 1e-9, "plan incohérent");
      assert(p.dist >= a.atr * 0.99 && p.dist <= a.atr * 3.51, "stop hors bornes"); }
    for (const p of a.scenarios) { const d = p.dir; nScen++;
      assert(d * (p.entry - p.sl) > 0 && d * (p.tp1 - p.entry) > 0 && d * (p.tp2 - p.entry) >= d * (p.tp1 - p.entry) - 1e-9, "scénario incohérent");
      assert(d === 1 ? p.entry <= a.price + 1e-9 : p.entry >= a.price - 1e-9, "entrée du mauvais côté du prix");
      assert(p.dist >= a.atr * 0.99 && p.dist <= a.atr * 3.51 && typeof p.basis === "string"); }
  }
  // garde-fou annonce : jamais de signal 10 min avant une annonce forte
  for (let s = 1; s <= 300; s++) {
    const a = analyze(gen(192, 9e5, s * 7919), gen(180, 144e5, s * 104729), Date.now(), [{ t: new Date(Date.now() + 6e5).toISOString(), impact: "high", title: "NFP" }], { ltf: "M15", htf: "H4" });
    assert.strictEqual(a.verdict, "wait");
  }
  assert.strictEqual(analyze(gen(30, 9e5, 5), [], Date.now(), [], { ltf: "M15", htf: "H4" }), null);

  // tendance uniquement : aucun scénario ni signal contre la tendance de fond
  for (let s = 1; s <= 200; s++) {
    const a = analyze(gen(192, 9e5, s * 7919), gen(180, 144e5, s * 104729), Date.now(), [], { ltf: "M15", htf: "H4" }, { trendOnly: true });
    if (a.bias !== 0) { for (const p of a.scenarios) assert.strictEqual(p.dir, a.bias); if (a.plan) assert.strictEqual(a.plan.dir, a.bias); }
  }
  // suivi d'un trade
  let tr = { dir: 1, entry: 100, sl: 98, tp1: 103, tp2: 106, state: "pending", tp1Hit: false };
  stepTrade(tr, { t: 1, o: 102, h: 103, l: 101, c: 102 }); assert.strictEqual(tr.state, "pending");
  stepTrade(tr, { t: 2, o: 101, h: 101, l: 99.5, c: 100.5 }); assert.strictEqual(tr.state, "open");
  stepTrade(tr, { t: 3, o: 100.5, h: 103.5, l: 100, c: 103 }); assert.strictEqual(tr.tp1Hit, true); assert.strictEqual(tr.state, "open");
  stepTrade(tr, { t: 4, o: 103, h: 106.2, l: 102, c: 106 }); assert.strictEqual(tr.result, "tp2"); assert.strictEqual(tr.r, 3);
  tr = { dir: -1, entry: 100, sl: 102, tp1: 97, tp2: 94, state: "open", tp1Hit: false };
  stepTrade(tr, { t: 1, o: 100, h: 102.5, l: 93, c: 95 }); assert.strictEqual(tr.result, "sl"); assert.strictEqual(tr.r, -1);
  // backtest : tourne, trades cohérents, pas de regard vers le futur (résultat identique si on ajoute des bougies après)
  const L = gen(600, 9e5, 4242), H = gen(200, 144e5, 777).map((c, i) => Object.assign(c, { t: L[0].t - 60 * 144e5 + i * 144e5 }));
  const bt = backtest(L, H, { ltf: "M15", htf: "H4" }, {}); assert(bt.length > 5, "trop peu de trades simulés");
  for (const x of bt) { assert(x.state === "done" && (x.r === -1 || x.r > 0)); assert(x.exitT >= x.t); }
  const btShort = backtest(L.slice(0, 400), H, { ltf: "M15", htf: "H4" }, {});
  assert.deepStrictEqual(bt.filter((x) => x.exitT < L[395].t).map((x) => [x.t, x.r]), btShort.filter((x) => x.exitT < L[395].t).map((x) => [x.t, x.r]));
  const sm = summarize(bt); assert.strictEqual(sm.n, bt.length); assert(sm.winRate >= 0 && sm.winRate <= 1);
  btInfo = sm;

  // /api/candles : normalisation (barre ouverte en premier, tri ascendant)
  const realFetch = global.fetch;
  global.fetch = async (url) => { assert(String(url).includes("/api/XAUUSD/ohlc?interval=15m&limit=192")); return { ok: true, json: async () => ({ symbol: "XAUUSD", interval: "15m", bars: [
    { openTime: "2026-11-26T08:15:00Z", open: 3564.8, high: 3566.8, low: 3562.4, close: 3566.5, isOpen: true },
    { openTime: "2026-11-26T08:00:00Z", open: 3565.0, high: 3570.2, low: 3563.5, close: 3564.8 },
    { openTime: "bad", open: 1, high: 1, low: 1, close: 1 }] }) }; };
  let r = res(); await candles({ query: { tf: "15m" } }, r);
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.candles.length, 2); assert(r.body.candles[0].t < r.body.candles[1].t); assert.strictEqual(r.body.candles[1].open, true);
  r = res(); await candles({ query: { tf: "7m" } }, r); assert.strictEqual(r.code, 400);
  global.fetch = async () => ({ ok: false, status: 500 }); r = res(); await candles({ query: { tf: "1h" } }, r); assert.strictEqual(r.code, 502);

  // /api/calendar
  global.fetch = async () => ({ ok: true, json: async () => [{ time: "2026-12-04T13:30:00Z", name: "Nonfarm Payrolls", importance: "high", timeMode: "exact", forecast: null }, { time: "x", name: "bad" }] });
  r = res(); await calendar({}, r); assert.strictEqual(r.body.events.length, 1); assert.strictEqual(r.body.events[0].exact, true);

  // /api/analyse : garde-fous puis appel
  delete process.env.ANTHROPIC_API_KEY; delete process.env.DESK_CODE;
  r = res(); await analyse({ method: "POST", headers: {}, body: {} }, r); assert.strictEqual(r.code, 503);
  process.env.ANTHROPIC_API_KEY = "test-key"; process.env.DESK_CODE = "abc123";
  r = res(); await analyse({ method: "GET", headers: {} }, r); assert.strictEqual(r.code, 405);
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "nope" }, body: { state: {} } }, r); assert.strictEqual(r.code, 401);
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: { state: { x: "y".repeat(9000) } } }, r); assert.strictEqual(r.code, 413);
  let sent = null;
  global.fetch = async (url, o) => { sent = { url, o }; return { ok: true, json: async () => ({ content: [{ type: "text", text: "Lecture test" }] }) }; };
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: JSON.stringify({ state: { prix: 3566.5 } }) }, r);
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.text, "Lecture test");
  assert.strictEqual(sent.url, "https://api.anthropic.com/v1/messages"); assert.strictEqual(sent.o.headers["x-api-key"], "test-key");
  const b = JSON.parse(sent.o.body); assert.strictEqual(b.model, "claude-haiku-5-5"); assert.strictEqual(b.max_tokens, 1200); assert.deepStrictEqual(b.thinking, { type: "disabled" });
  // réponse sans texte (réflexion seule) : erreur explicite, plus de « Réponse vide »
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "thinking", thinking: "..." }] }) });
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: { state: { prix: 1 } } }, r);
  assert.strictEqual(r.code, 502); assert(/coupée/.test(r.body.error));
  // modèle qui refuse thinking désactivé : second appel sans ce réglage
  const bodies = [];
  global.fetch = async (url, o) => { const bb = JSON.parse(o.body); bodies.push(bb); return bb.thinking ? { ok: false, status: 400, json: async () => ({ error: { message: "thinking" } }) } : { ok: true, status: 200, json: async () => ({ content: [{ type: "thinking", thinking: "x" }, { type: "text", text: "OK2" }] }) }; };
  r = res(); await analyse({ method: "POST", headers: { "x-desk-code": "abc123" }, body: { state: { prix: 1 } } }, r);
  assert.strictEqual(r.body.text, "OK2"); assert.strictEqual(bodies.length, 2); assert.strictEqual(bodies[1].max_tokens, 6200); assert(!("thinking" in bodies[1]));
  // /api/telegram
  const page = '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="goldnews/41"><div class="tgme_widget_message_text js-message_text" dir="auto">Gold &amp; USD<br/>Fed <b>hike</b> priced &#33;</div><a class="tgme_widget_message_date" href="https://t.me/goldnews/41"><time datetime="2026-11-26T08:00:00+00:00" class="time">08:00</time></a></div></div>'
    + '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="goldnews/42"><a class="tgme_widget_message_photo_wrap"></a><a class="tgme_widget_message_date"><time datetime="2026-11-26T09:00:00+00:00">09:00</time></a></div></div>';
  delete process.env.TELEGRAM_CHANNEL; global.fetch = async (url) => { assert.strictEqual(url, "https://t.me/s/actuminuteoff"); return { ok: true, text: async () => page }; };
  r = res(); await telegram({}, r); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.channel, "actuminuteoff");
  process.env.TELEGRAM_CHANNEL = "../etc"; r = res(); await telegram({}, r); assert.strictEqual(r.code, 503);
  process.env.TELEGRAM_CHANNEL = "@goldnews";
  global.fetch = async (url) => { assert.strictEqual(url, "https://t.me/s/goldnews"); return { ok: true, text: async () => page }; };
  r = res(); await telegram({}, r); assert.strictEqual(r.code, 200); assert.strictEqual(r.body.posts.length, 2);
  assert.strictEqual(r.body.posts[0].id, "goldnews/42"); assert.strictEqual(r.body.posts[0].media, true);
  assert.strictEqual(r.body.posts[1].text, "Gold & USD\nFed hike priced !"); assert.strictEqual(r.body.posts[1].url, "https://t.me/goldnews/41");
  global.fetch = async () => ({ ok: true, text: async () => "<html>rien</html>" }); r = res(); await telegram({}, r); assert.strictEqual(r.code, 502);
  // /api/impact : Claude classe les messages, la sortie est validée
  const impact = require("../api/impact.js");
  process.env.TELEGRAM_CHANNEL = "goldnews";
  let claudeBody = null;
  global.fetch = async (url, o) => {
    if (String(url).startsWith("https://t.me/")) return { ok: true, text: async () => page };
    claudeBody = JSON.parse(o.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: 'Voici :\n[{"n":1,"impact":"Baissier","raison":"Hausse de taux attendue, dollar soutenu."},{"n":2,"impact":"achète tout","raison":"x"},{"n":9,"impact":"haussier","raison":"hors liste"}]' }] }) };
  };
  r = res(); await impact({ method: "POST", headers: { "x-desk-code": "nope" }, body: {} }, r); assert.strictEqual(r.code, 401);
  r = res(); await impact({ method: "POST", headers: { "x-desk-code": "abc123" }, body: { ids: ["goldnews/41", "goldnews/42", "autre/1"] } }, r);
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(Object.keys(r.body.impacts), ["goldnews/41"]);
  assert.strictEqual(r.body.impacts["goldnews/41"].impact, "down");
  const sentPosts = JSON.parse(claudeBody.messages[0].content); assert.strictEqual(sentPosts.length, 1); assert.strictEqual(sentPosts[0].texte, "Gold & USD\nFed hike priced !");
  global.fetch = async (url) => String(url).startsWith("https://t.me/") ? { ok: true, text: async () => page } : { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "pas du json" }] }) };
  r = res(); await impact({ method: "POST", headers: { "x-desk-code": "abc123" }, body: {} }, r); assert.strictEqual(r.code, 502);
  global.fetch = realFetch;
  console.log("OK", seen, "scénarios:", nScen, "backtest synthétique:", btInfo.n, "trades");
})().catch((e) => { console.error("ECHEC", e); process.exit(1); });
