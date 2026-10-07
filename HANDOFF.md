# HANDOFF : état du projet PORTFOLIO_V3

Dernier état : étapes 1-3 terminées ; étape 4 (administration) en cours : blocs A, B, invitations et C FAITS.
Prochain bloc : **D (garde-fous auto-action + matrice d'accès)**, puis E.
Propriétaire : Julien (GitHub `Julien-D234`), dépôt `Julien-D234/PORTFOLIO_V3` (public). Langue de travail : français.

## Objectif
Plateforme perso : portfolio (projets), mini-jeux (projets séparés qui remontent des stats), comptes sans inscription
publique (admin crée les comptes), rôles user/admin, i18n fr/en (extensible). **Sécurité d'abord.**
Hébergement futur : VPS OVH + Docker + Caddy ; domaine et accès VPS pas encore disponibles.

## Instruction initiale (1er chat, à respecter)
- **Rôle** : architecte logiciel senior + développeur full-stack expert en sécurité web.
- **Contexte** : base d'une plateforme perso = portfolio de projets + hébergement de mini-jeux (projets séparés, développés plus tard).
  Stack à choisir : moderne, maintenable par un développeur seul (2 propositions argumentées front/back/BDD/auth faites et validées).
- **Ordre des fonctionnalités voulu** : accueil (sans texte ni info perso) → auth robuste + rôles user/admin → page de connexion (pas d'inscription
  publique) → admin sécurisée des comptes → page projets (design plus tard) → page de sélection des mini-jeux (design plus tard) → profil avec stats des jeux.
- **Règles strictes** : sécurité d'abord (protection des routes par rôle = priorité absolue) ; ne pas coder avant validation de Julien (plan/choix
  proposés puis validés) ; penser l'intégration des futurs mini-jeux (remontée des stats vers la BDD principale, donc profils) ;
  expliquer le raisonnement étape par étape.

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
3. ~~Connexion~~ FAIT : `/[lang]/login`, `/[lang]/change-password`, déconnexion POST, `safeRedirect` (`src/lib/auth-forms.ts`,
   liste blanche), erreur 401 identique, 429/banni gérés, verrouillage de compte (10 échecs → 15 min, `failedLoginCount`/`lockedUntil`,
   hooks dans `create-auth.ts`, audit `login_failed`/`account_locked`). Tests Vitest uniquement (Playwright écarté par Julien).
   Les formulaires appellent `/api/auth/*` en `fetch` depuis le client (et non `auth.api.*` côté serveur) : le rate-limit Better Auth
   ne s'applique pas aux appels serveur directs. Les gardes redirigeaient déjà vers change-password si `mustChangePassword`.
4. **Administration** (plan VALIDÉ par Julien) : tout derrière `requireAdmin` (non-admin → 404 ; anonyme → 307 vers login).
   - **A. FAIT** `src/server/admin/queries.ts` : `listUsers`, `getUser` (+ sessions actives), `listAudit`, `listAuditActions`. Colonnes énumérées
     (jamais de hash ni de jeton de session), pagination bornée (20 défaut, 100 max), recherche littérale (`escapeLike`). `tests/admin-queries.test.ts`.
   - **B. FAIT** pages fr/en : `/[lang]/admin` (+ `layout.tsx` avec `requireAdmin`, rappelé dans chaque page), `/admin/users` (recherche, pagination,
     statut actif/banni/verrouillé + « mdp à changer »), `/admin/users/new`, `/admin/users/[id]` (détail + sessions, SANS actions pour l'instant),
     `/admin/audit` (filtre action/cible). Helpers `src/lib/format.ts`, `src/components/admin/pagination.tsx`.
   - **Invitations FAITES** (remplacent le mot de passe provisoire) : table `invitation` (migration 0002, hash SHA-256 du jeton, `expiresAt` 48 h, `usedAt`),
     `src/server/admin/invitations.ts` (`createInvitedUser`, `issueInvitation`, `acceptInvitation`), `src/server/rate-limit.ts` (`allowRequest`, préfixe `app:`
     dans la table `rate_limit`), `src/server/http.ts` (`isSameOrigin` = défense CSRF, `clientIp`, `readJson` borné, `invitationLink`).
     Routes : `POST /api/admin/users` (création), `POST /api/admin/users/[id]/invitation` (regénération), `POST /api/welcome` (public, 10/min/IP,
     connexion immédiate via `auth.api.signInEmail` + copie des Set-Cookie). Page `/[lang]/welcome` + `WelcomeForm`.
     **Le jeton est dans le FRAGMENT** (`/fr/welcome#token=…`, jamais envoyé au serveur ni dans Referer), retiré de l'URL par le client ; en-têtes
     `Referrer-Policy: no-referrer` + `no-store` sur `/:lang/welcome` (next.config.ts). Même réponse `INVALID_LINK` pour jeton mal formé/inconnu/expiré/
     utilisé/compte banni ; politique de mot de passe vérifiée AVANT consommation ; consommation atomique ; usage = révoque les sessions, lève le
     verrouillage. La création passe par `internalAdapter` (pas par l'endpoint Better Auth : pas de `mustChangePassword`). Regénérer un lien ne change
     PAS le mot de passe actuel (valable jusqu'à usage du lien). Audit : `user.created`, `invitation.created|regenerated|used` (sans jeton).
     Tests : `tests/invitations.test.ts`. Pas d'e-mail (pas de SMTP/domaine) : l'admin transmet le lien.
   - **C. FAIT** `src/components/admin/user-actions.tsx` (client, `fetch` vers `/api/auth/admin/{set-role,ban-user,unban-user,revoke-user-sessions,remove-user}`,
     confirmations `window.confirm`, suppression = retaper l'e-mail, ban = motif + durée 1h/1j/7j/30j/définitif, erreurs `LAST_ADMIN`/`PASSWORD_POLICY`/401/403/404/429
     traduites) + `POST /api/admin/users/[id]/unlock` (`src/server/admin/actions.ts` `unlockUser`, audit `user.unlocked`). Intégré dans `/admin/users/[id]` ;
     sur son propre compte l'admin voit un message à la place des actions (le serveur ne l'impose pas encore : c'est le bloc D). i18n `admin.actions.*`.
     Tests : `tests/admin-actions.test.ts`.
   - **D. À FAIRE** (côté SERVEUR, hook `before`) un admin ne peut pas se bannir, se supprimer ni se retirer son propre rôle (en plus de `LAST_ADMIN`, hook `before` de
     `create-auth.ts`) ; audit de chaque action sans secret ; test de matrice anonyme/user/admin sur toutes les pages et endpoints.
   - **E. À FAIRE** clôture : check + build + smoke curl (anonyme/user/admin), revue sécurité (accès, IDOR sur `[id]`, injection recherche, fuite de
     données), HANDOFF, un commit par bloc, push, suivi CI.
   - Futur : envoi du lien par e-mail quand domaine/SMTP existeront.
5. **Projets** : `project` + `project_translation` (fr/en), page publique + gestion admin.
6. **Mini-jeux** : `game`, `game_session`, `game_stat` (JSONB), page de sélection, JWT court (10 min) userId+gameId,
   `POST /api/v1/games/{slug}/stats` + clé d'API par jeu (hachée, révocable), plafonds de plausibilité, rate-limit. Revue sécurité dédiée.
7. **Profil** : stats par jeu, changement mdp/langue.
8. **Production** : déploiement SSH/GHCR, migrations au démarrage (pas encore dans l'image), sauvegardes Postgres, durcissement VPS.

## Pièges connus (environnement de dev de l'agent)
- Tests : chaque fichier lance une base PGlite + Argon2 ; `vitest.config.mts` borne `maxWorkers: 3` et allonge `hookTimeout` (sinon timeouts de
  `beforeAll` en parallèle). Les tests d'`auth-env` passent par `createInvitedUser` etc. avec `env.auth` sans plugin `nextCookies`.
- Route Handlers : `RouteContext<"/api/…/[id]/…">` est global (types générés par `next typegen`) ; `params` est une Promise.
- Smoke test : un compte créé par invitation n'a pas de mot de passe connu ; pour tester `/api/welcome`, créer via `POST /api/admin/users` (cookie admin)
  et lire `link` dans la réponse JSON (fragment `#token=`).
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
- `npm run dev:db` n'accepte qu'une connexion : lancer Next avec `DB_POOL_MAX=1` (le singleton DB est sur `globalThis`).
- Le navigateur de l'agent bloque localhost : smoke tests via curl.
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

## Smoke test local (sans Docker)
```
PORT=5544 npm run dev:db                      # terminal background
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5544/postgres BETTER_AUTH_SECRET=<32+ car.> BETTER_AUTH_URL=http://localhost:3100
npm run db:migrate && ADMIN_PASSWORD=<mdp> npm run create-admin -- --email a@b.dev --name X
npm run build && DB_POOL_MAX=1 npx next start -p 3100   # terminal background (exec, sinon le PID du wrapper diffère)
```
Puis curl avec `-H "origin: http://localhost:3100"` sur les POST `/api/auth/*` (cookie jar `-c/-b`). Arrêter les serveurs en
tuant les PID relevés avec `ps -eo pid,args | grep "[n]ext-server"` (jamais `pkill -f`/`pgrep -f` dans la même commande).
Les commandes `curl | python3` déclenchent une demande d'approbation : écrire la réponse dans un fichier puis la lire.

## Git / GitHub
Push sur `main` (pas de `develop` pour l'instant). Identité git non configurée : committer avec
`git -c user.name=Julien-D234 -c user.email=Julien-D234@users.noreply.github.com commit …`. Le token GitHub fine-grained (Contents, Workflows, Actions : lecture/écriture)
est dans la variable d'environnement **`GITHUB_PORTFOLIOV3_RHETORIC`** (fichier `/opt/data/.env`, chargée au démarrage de la session).
Ne jamais afficher sa valeur ni l'écrire dans la config git, un fichier ou l'URL du remote. Pousser ainsi :
```
B=$(printf 'x-access-token:%s' "$GITHUB_PORTFOLIOV3_RHETORIC" | base64 -w0)
git -c http.extraheader="Authorization: Basic $B" push
```
Si la variable est absente de l'environnement, la lire sans l'afficher depuis `/opt/data/.env`. Si le token a expiré ou été révoqué,
demander à Julien d'en créer un nouveau et de remplacer la ligne dans `.env`. Suivre la CI après chaque push (API Actions) :
le job `docker` a déjà révélé des erreurs invisibles en local.
