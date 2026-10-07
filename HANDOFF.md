# HANDOFF : état du projet PORTFOLIO_V3

Dernier état : étapes 1, 2 et 3 terminées, poussées, CI verte (70210ef). Prochaine étape : **4 (administration)**, plan validé ci-dessous.
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
3. ~~Connexion~~ FAIT : `/[lang]/login`, `/[lang]/change-password`, déconnexion POST, `safeRedirect` (`src/lib/auth-forms.ts`,
   liste blanche), erreur 401 identique, 429/banni gérés, verrouillage de compte (10 échecs → 15 min, `failedLoginCount`/`lockedUntil`,
   hooks dans `create-auth.ts`, audit `login_failed`/`account_locked`). Tests Vitest uniquement (Playwright écarté par Julien).
   Les formulaires appellent `/api/auth/*` en `fetch` depuis le client (et non `auth.api.*` côté serveur) : le rate-limit Better Auth
   ne s'applique pas aux appels serveur directs. Les gardes redirigeaient déjà vers change-password si `mustChangePassword`.
4. **Administration** (plan VALIDÉ par Julien, rien n'est codé) : tout derrière `requireAdmin` (non-admin → 404).
   - **A. Lecture** `src/server/admin/queries.ts` : `listUsers` (pagination, recherche e-mail/nom), `getUser` (+ sessions actives), `listAudit`
     (pagination, filtre action/cible). Requêtes DB directes, jamais de hash de mot de passe. Tests PGlite.
   - **B. Pages fr/en** : `/[lang]/admin` (tableau de bord), `/admin/users` (rôle, statut actif/banni/verrouillé/mdp à changer),
     `/admin/users/new`, `/admin/users/[id]` (détail, sessions, actions), `/admin/audit` (lecture seule). Clés i18n dans les 2 langues.
   - **C. Actions** en `fetch` client vers `/api/auth/admin/*` (rate-limit + hooks existants s'appliquent) : rôle, ban (motif + durée optionnelle),
     déban, révocation des sessions, suppression. Confirmation pour les actions destructives ; **suppression : l'admin retape l'e-mail**.
     Erreurs `LAST_ADMIN`, `PASSWORD_POLICY`, 403 traduites. Ajouter un déverrouillage manuel : `POST /api/admin/users/[id]/unlock`
     (`requireApi("admin")`, remet `failedLoginCount`=0 et `lockedUntil`=null, audité).
   - **D. Garde-fous** : un admin ne peut pas se bannir, se supprimer ni se retirer son propre rôle (en plus de `LAST_ADMIN`) ; audit de
     chaque action sans secret ; test de matrice anonyme/user/admin sur toutes les pages et endpoints.
   - **Invitation (remplace le mot de passe provisoire)** : à la création, le compte reçoit un mdp aléatoire inconnu ; le serveur génère un
     lien à usage unique `/[lang]/welcome?token=…` affiché UNE fois à l'admin (pas d'e-mail : pas de SMTP/domaine, l'admin transmet le lien).
     L'utilisateur choisit son mdp (12-128) et est connecté ; `mustChangePassword` reste false. Même mécanisme pour le reset : bouton
     « Regénérer un lien » (invalide l'ancien). Table `invitation` (hash SHA-256 du jeton, userId, expiresAt, usedAt) + migration ;
     jeton 256 bits aléatoires, seul le hash est stocké, expiration 48 h (confirmé par Julien), usage unique, réponse identique pour
     invalide/expiré/utilisé, `POST /api/welcome` rate-limité, jeton retiré de l'URL + `Referrer-Policy: no-referrer`, usage du lien
     révoque les sessions existantes, création/consommation auditées sans le jeton. Le formulaire de création ne demande plus de mdp.
   - **E. Clôture** : check + build + smoke curl (anonyme/user/admin), revue sécurité (accès, IDOR sur `[id]`, injection dans la recherche,
     fuite de données), HANDOFF, un commit par bloc, push, suivi CI.
   - **Ordre** : A, B, table `invitation` + lien + page welcome, C, D, E. Un futur envoi d'e-mail du lien se branchera quand le domaine/SMTP existera.
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

## Git / GitHub
Push sur `main` (pas de `develop` pour l'instant). Le token GitHub fine-grained (Contents, Workflows, Actions : lecture/écriture)
est dans la variable d'environnement **`GITHUB_PORTFOLIOV3_RHETORIC`** (fichier `/opt/data/.env`, chargée au démarrage de la session).
Ne jamais afficher sa valeur ni l'écrire dans la config git, un fichier ou l'URL du remote. Pousser ainsi :
```
B=$(printf 'x-access-token:%s' "$GITHUB_PORTFOLIOV3_RHETORIC" | base64 -w0)
git -c http.extraheader="Authorization: Basic $B" push
```
Si la variable est absente de l'environnement, la lire sans l'afficher depuis `/opt/data/.env`. Si le token a expiré ou été révoqué,
demander à Julien d'en créer un nouveau et de remplacer la ligne dans `.env`. Suivre la CI après chaque push (API Actions) :
le job `docker` a déjà révélé des erreurs invisibles en local.
