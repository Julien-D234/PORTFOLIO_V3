# HANDOFF : état du projet PORTFOLIO_V3

Dernier état : étapes 1 et 2 terminées, CI verte. Prochaine étape : **3 (page de connexion)**.
Propriétaire : Julien (GitHub `Julien-D234`), dépôt `Julien-D234/PORTFOLIO_V3` (public). Langue de travail : français.

## Objectif
Plateforme perso : portfolio (projets), mini-jeux (projets séparés qui remontent des stats), comptes sans inscription
publique (admin crée les comptes), rôles user/admin, i18n fr/en (extensible). **Sécurité d'abord.**
Hébergement futur : VPS OVH + Docker + Caddy ; domaine et accès VPS pas encore disponibles.

## Stack (validée)
Next.js 16.4 (App Router, **`proxy.ts` et non `middleware.ts`**, lire `node_modules/next/dist/docs/` avant de coder),
TypeScript strict, Tailwind 4, PostgreSQL + Drizzle, Better Auth 1.7 (plugin `admin`), Zod 4, Argon2id (@node-rs/argon2),
Vitest, PGlite pour les tests. i18n maison (pas next-intl) : `src/i18n/`, `messages/{fr,en}.json` (mêmes clés, testé).

## Fait
1. Socle : CSP à nonce (`src/proxy.ts`, `src/lib/csp.ts`), en-têtes de sécurité (`next.config.ts`), redirection de langue,
   Docker (Dockerfile, compose, Caddyfile), CI GitHub (`.github/workflows/ci.yml`), `deploy.yml` désactivé (manuel).
2. Auth : `src/server/auth/create-auth.ts` (fabrique testable), schéma `src/server/db/schema.ts`, migration `drizzle/0000_init.sql`,
   gardes `src/server/guards.ts` (`requireUser`, `requireAdmin`, `requireApi`), logique pure `src/server/auth/authz.ts`,
   scripts `create-admin`, `db:migrate`, `dev:db`. 47 tests (`tests/`).

Garde-fous en place : pas de sign-up public, mdp 12-128 car. (aussi appliqué aux endpoints admin via hook), sessions sans cache cookie
(ban immédiat), impersonation bloquée, dernier admin protégé (`LAST_ADMIN`), `mustChangePassword` posé à la création/reset par
un admin et levé après `/change-password`, audit_log, rate-limit en base (5 connexions/min), non-admin → 404 sur pages admin.

## Reste à faire (ordre)
3. **Connexion** : `/[lang]/login`, `/[lang]/change-password` (forcé), déconnexion POST, redirection `next` en liste blanche,
   erreurs génériques (401 identique compte inconnu/mauvais mdp), gestion 429 et banni, tests (Playwright si possible, sinon composants).
   Option : verrouillage de compte après N échecs (non fait ; seul le rate-limit par IP existe).
4. **Administration** : liste/création/rôle/ban/reset mdp/révocation sessions/lecture audit, derrière `requireAdmin`.
5. **Projets** : `project` + `project_translation` (fr/en), page publique + gestion admin.
6. **Mini-jeux** : `game`, `game_session`, `game_stat` (JSONB), page de sélection, JWT court (10 min) userId+gameId,
   `POST /api/v1/games/{slug}/stats` + clé d'API par jeu (hachée, révocable), plafonds de plausibilité, rate-limit. Revue sécurité dédiée.
7. **Profil** : stats par jeu, changement mdp/langue.
8. **Production** : déploiement SSH/GHCR, migrations au démarrage (pas encore dans l'image), sauvegardes Postgres, durcissement VPS.

## Pièges connus (environnement de dev de l'agent)
- `NODE_ENV=production` est défini dans le shell : `npm install` ignore les devDependencies → toujours `npm install --include=dev`
  (les scripts de CI utilisent `npm ci --include=dev`).
- Pas de daemon Docker ni de psql : tester la DB avec PGlite (`tests/helpers/auth-env.ts`) ou `npm run dev:db` (serveur PGlite sur un port).
- Les scripts sont en `.mts` (package CJS, top-level await) et importent `./lib.mts` ; `allowImportingTsExtensions` activé.
- `npm run typecheck` lance `next typegen` d'abord (les types `LayoutProps`/`PageProps` sont générés).
- `public/` ne doit pas être vide (le Dockerfile le copie).
- Ne jamais `pkill -f` avec un motif présent dans sa propre commande ; ne pas lancer de serveurs avec `nohup` (utiliser le mode background du terminal).
- Un ancien `next-server` peut occuper le port 3100 : vérifier `curl /api/health` avant de conclure qu'une route est 404.
- Better Auth : `internalAdapter.createUser(data, { method: "admin" })` (2ᵉ argument requis par le typage) ; le plugin admin n'applique pas
  `minPasswordLength` (d'où le hook) ; cookies préfixés `__Secure-` en prod (pas `__Host-`).
- IP du rate-limit lue dans `X-Forwarded-For` : sûr uniquement derrière Caddy.

## Commandes
```
npm install --include=dev
npm run check            # lint + typecheck + tests
npm run build
npm run dev:db           # Postgres PGlite (PORT=5544 pour changer le port)
npm run db:generate      # après modif du schéma
npm run db:migrate && npm run create-admin -- --email x@y.z --name "Nom"
```
Variables : voir `.env.example` (DATABASE_URL, BETTER_AUTH_SECRET ≥ 32 car., BETTER_AUTH_URL).

## Git / GitHub
Push sur `main` (pas de `develop` pour l'instant). Token GitHub fine-grained fourni par Julien par session (Contents, Workflows,
Actions : lecture/écriture), à passer via `git -c http.extraheader="Authorization: Basic <base64(x-access-token:TOKEN)>" push`.
Ne jamais l'écrire dans la config git, un fichier ou l'URL du remote ; masquer les traces dans l'historique du shell.
Suivre la CI après chaque push (API Actions) : le job `docker` a déjà révélé des erreurs invisibles en local.
