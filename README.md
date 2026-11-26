# Gold Desk XAUUSD

Dashboard perso pour l'or : graphique, calendrier économique et news via les widgets gratuits TradingView, signaux achat/vente calculés par un moteur de règles (ICT/SMC + indicateurs classiques), lecture du setup par Claude à la demande.

## Structure

- `public/index.html` : la page.
- `public/engine.js` : moteur de signal (sweep, order blocks, FVG, EMA, RSI, MACD, kill zones, plan entrée/stop/TP).
- `api/candles.js` : bougies XAUUSD (source : biquote.io, gratuite, sans clé). Pour changer de source, réécrire `fetchBars()`.
- `api/calendar.js` : prochaines annonces US à fort impact, pour bloquer les signaux juste avant une annonce.
- `api/analyse.js` : appel à l'API Claude.
- `api/telegram.js` : derniers messages d'un canal Telegram public.
- `api/impact.js` : Claude lit ces messages et indique si chaque info est favorable ou non à l'or.

## Déploiement sur Vercel

1. Vercel → Add New → Project → importer ce repo. Framework : Other. Aucun réglage de build.
2. Settings → Environment Variables :
   - `ANTHROPIC_API_KEY` : ta clé API Claude.
   - `DESK_CODE` : un code de ton choix. La page le demande au premier clic sur « Demander une lecture à Claude ». Il empêche quelqu'un d'autre de consommer ta clé.
   - `TELEGRAM_CHANNEL` (optionnel) : pour afficher un autre canal Telegram public que celui par défaut (`actuminuteoff`), nom sans @.
   - `CLAUDE_MODEL` (optionnel) : par défaut `claude-haiku-5-5`.
3. Redéployer après avoir ajouté les variables.

Sans ces variables, tout fonctionne sauf la lecture Claude.

## Tests

`npm test` vérifie le moteur et les fonctions avec des données simulées.

## Limites

- Les signaux sont indicatifs : règles fixes, non backtestées.
- Les bougies viennent de biquote.io, pas de ton broker : de petits écarts de prix avec Vantage sont normaux.
- Les niveaux du signal s'affichent sur le mini graphique, pas sur le widget TradingView (il n'accepte pas de tracés externes).
