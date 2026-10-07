# PORTFOLIO_V3

Plateforme personnelle : portfolio, mini-jeux, comptes et statistiques.
Stack : Next.js (App Router) · TypeScript strict · Tailwind · PostgreSQL + Drizzle · Better Auth · i18n fr/en.

## Démarrage

```bash
nvm use                    # Node 22 (.nvmrc)
npm install --include=dev
npm run dev                # http://localhost:3000  → redirige vers /fr ou /en
npm run check              # lint + typecheck + tests
```

Stack complète en conteneurs (app + Postgres) :

```bash
cp .env.example .env       # puis changer le mot de passe
docker compose up --build
```

## Base de données et comptes

```bash
npm run dev:db          # Postgres en mémoire (PGlite) sur :5432, sans Docker (données perdues à l'arrêt)
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
export BETTER_AUTH_SECRET=$(openssl rand -base64 32) BETTER_AUTH_URL=http://localhost:3000
npm run db:migrate      # applique drizzle/*.sql
npm run create-admin -- --email moi@exemple.fr --name "Moi"   # 1er admin, mot de passe saisi en masqué
npm run db:generate     # après modification de src/server/db/schema.ts
```

## Modèle d'accès

- Pas d'inscription publique : seuls les admins créent des comptes (mot de passe temporaire, changement forcé).
- Contrôle d'accès **côté serveur** via `src/server/guards.ts` (`requireUser`, `requireAdmin`, `requireApi`) ;
  `proxy.ts` ne fait que de la redirection de confort.
- Un non-admin reçoit un 404 sur les pages d'administration.
- Garde-fous : dernier admin intouchable, usurpation d'identité désactivée, bannissement immédiat, audit des actions admin.

## Structure

```
src/app/[lang]/   pages localisées (accueil vide pour l'instant)
src/app/api/      routes d'API (health, auth ; stats des jeux à venir)
src/server/       db (Drizzle), auth (Better Auth), guards, audit
scripts/          create-admin, migrate, dev-db
drizzle/          migrations SQL versionnées
src/i18n/         langues et dictionnaires (typés)
src/lib/csp.ts    Content-Security-Policy à nonce
src/proxy.ts      redirection de langue + CSP
messages/         fr.json, en.json (mêmes clés, vérifié par un test)
docker/           Caddyfile + surcharge de production
```

## Ajouter une langue

1. `src/i18n/config.ts` : ajouter le code dans `locales`.
2. Créer `messages/<code>.json` avec les mêmes clés que `fr.json`.
3. L'ajouter dans `src/i18n/dictionaries.ts`.

## Sécurité (socle)

CSP stricte avec nonce par requête, HSTS, X-Frame-Options, nosniff, Referrer-Policy,
Permissions-Policy, COOP/CORP ; conteneur non-root, FS en lecture seule, capabilities supprimées,
base Postgres non exposée ; `npm audit` et Dependabot en CI.

## Déploiement

Préparé mais désactivé (`.github/workflows/deploy.yml`) en attendant le VPS OVH et le domaine.
