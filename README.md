# TrackNField Mobile (Expo)

## Installation

```bash
npm install
```

## Environnements (DEV / PROD)

Le projet utilise des fichiers `.env.*` pour switcher rapidement d'environnement.

- DEV: `.env.development` (à partir de `.env.development.example`)
- PROD: `.env.production` (à partir de `.env.production.example`)

Rappel: toutes les variables `EXPO_PUBLIC_*` sont embarquées dans l'app (pas de secrets).

## Démarrer Expo

DEV (le plus courant):

```bash
npm run start:dev
```

PROD (utilise l'API de prod mais tourne en dev client):

```bash
npm run start:prod
```

Optionnel: simuler un bundle "production" (minify + no-dev) avec la config prod:

```bash
npm run start:prod:bundle
```

## Lancer Android / iOS avec un env

```bash
npm run android:dev
npm run android:prod
```

```bash
npm run ios:dev
npm run ios:prod
```

## Notes

- Si tu n'as pas de dev build installé: `npx expo run:android` (ou `npm run android:dev`) puis ré-ouvre via `npm run start:dev`.
- Les scripts d'env chargent explicitement le fichier choisi et désactivent le chargement automatique de `.env` par Expo pour éviter les surprises.
