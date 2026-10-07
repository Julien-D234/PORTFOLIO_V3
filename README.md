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

## Structure

```
src/app/[lang]/   pages localisées (accueil vide pour l'instant)
src/app/api/      routes d'API (health ; auth et stats des jeux à venir)
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
