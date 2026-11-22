# Tests de charge MIZANE

## Objectif

Mesurer le comportement de l'API de lecture comptable lorsque plusieurs utilisateurs consultent simultanément une entreprise. Le scénario est strictement en lecture seule : il appelle uniquement `read-accounting` et ne crée, ne modifie ni ne supprime aucune donnée.

## Pré-requis

Installer k6 : https://grafana.com/docs/k6/latest/set-up/install-k6/

Utiliser exclusivement le projet Supabase DEV et un compte de test ayant un accès actif à une entreprise de test. Ne jamais lancer ce scénario contre la production.

Définir les variables d'environnement dans le terminal sans les enregistrer dans Git :

- `SUPABASE_URL` : URL du projet DEV.
- `SUPABASE_ANON_KEY` : clé publique anon du projet DEV.
- `ACCESS_TOKEN` : JWT temporaire d'un utilisateur de test autorisé.
- `COMPANY_ID` : UUID de l'entreprise de test.
- `MAX_VUS` : nombre maximal d'utilisateurs virtuels (50 par défaut).

## Exécution

PowerShell :

```powershell
$env:SUPABASE_URL = "https://VOTRE-PROJET.supabase.co"
$env:SUPABASE_ANON_KEY = "CLE_ANON_DEV"
$env:ACCESS_TOKEN = "JWT_TEMPORAIRE_DU_COMPTE_TEST"
$env:COMPANY_ID = "UUID_ENTREPRISE_TEST"
$env:MAX_VUS = "50"
k6 run tests/load/read-accounting.k6.js
```

Ne pas communiquer le JWT ni la clé à un tiers et ne pas les placer dans un fichier versionné.

## Seuils de départ

- Taux d'erreur HTTP inférieur à 1 %.
- 95e percentile inférieur à 2 secondes.
- 99e percentile inférieur à 5 secondes.
- Montée progressive jusqu'à 50 utilisateurs virtuels, avec possibilité de modifier `MAX_VUS`.

Ces seuils sont des objectifs initiaux de test, pas une garantie de capacité contractuelle. Augmenter progressivement la charge seulement après examen des métriques Supabase et Cloudflare. Arrêter le test si les erreurs augmentent fortement, si le service devient instable ou si les coûts/quotas approchent leurs limites.

## Ce que ce test ne mesure pas

Ce scénario ne valide pas les écritures concurrentes. Les tests d'écriture doivent utiliser une entreprise jetable et des comptes de test dédiés, avec vérification des soldes, de l'idempotence et de l'isolation entre entreprises. Ne jamais générer des écritures fictives dans une comptabilité réelle.
