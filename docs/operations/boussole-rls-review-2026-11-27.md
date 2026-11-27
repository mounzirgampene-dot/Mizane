# Revue technique RLS de la Boussole — 27 novembre 2026

## Périmètre et méthode

Revue en lecture seule de MIZANE-DEV (`rudsovhdvinvyrwjamfo`) et de la migration proposée dans la PR #170. Aucun DDL, aucune migration, aucun changement de privilège et aucune modification de configuration Auth n'ont été exécutés.

## Helper d'appartenance

La base contient bien `private.is_active_company_member(target_company uuid)`, avec les propriétés suivantes vérifiées dans les catalogues PostgreSQL :

- Retourne `boolean`, fonction SQL `STABLE`.
- `SECURITY DEFINER`, propriétaire `postgres`.
- `search_path` fixé à la chaîne vide.
- Vérifie une ligne `public.company_memberships` correspondant à `auth.uid()`, à l'entreprise cible et au statut `active`.
- `authenticated` dispose de USAGE sur `private` et EXECUTE sur ce helper.
- `anon` ne dispose ni de USAGE sur `private`, ni d'EXECUTE sur ce helper.
- `public.companies` et `public.company_memberships` ont RLS et FORCE RLS activés.

Un contrôle fonctionnel SQL sans écriture a renvoyé `true` pour une appartenance active réelle et `false` pour un UUID utilisateur sans appartenance. Les identifiants n'ont pas été exportés dans ce rapport.

## Contrôle des politiques proposées

La migration sépare les politiques publiques globales des politiques professionnelles :

- Les politiques `anon` portent seulement sur les documents globaux publiés, les versions correspondantes, les synonymes actifs et les relations entre documents globaux publiés.
- Les politiques `authenticated` appellent le helper privé uniquement pour les documents d'entreprise et les relations contenant des documents d'entreprise.
- Les préférences sont filtrées par `user_id = auth.uid()`.
- Les événements de consentement sont insérables et lisibles par leur propriétaire ; aucun privilège UPDATE ou DELETE n'est accordé. L'insertion est limitée aux colonnes métier : `id` et `created_at` restent générés par PostgreSQL, afin qu'un client ne puisse pas antidater ni dater dans le futur un événement de consentement.
- RLS et FORCE RLS sont prévus sur les six tables.
- Les privilèges Data API sont explicites, conformément au changement Supabase effectif sur les projets existants depuis le 30 octobre 2026.

La définition du helper est cohérente avec l'appel `private.is_active_company_member(company_id)` utilisé par la migration.

## Limite bloquante avant application

Les six tables Boussole sont absentes de MIZANE-DEV à la date de cette revue. Il est donc impossible de tester les politiques réelles avec les rôles PostgreSQL `anon` et `authenticated` sans appliquer d'abord le schéma.

Les tests helper ci-dessus ne constituent pas un test RLS des tables Boussole. Il reste à effectuer après installation sur DEV, avec des comptes de test dédiés :

1. Lecture globale publiée par `anon`.
2. Refus de lecture des brouillons et documents d'entreprise par `anon`.
3. Lecture par un membre actif de sa propre entreprise.
4. Refus pour un membre révoqué et un utilisateur d'une autre entreprise.
5. Isolation des versions et relations.
6. Lecture/écriture des préférences du propriétaire seulement.
7. Insertion de consentement pour soi-même ; refus pour un autre utilisateur.
8. Vérification qu'UPDATE et DELETE des consentements échouent.

**Décision :** ne pas appliquer la migration et ne pas fusionner la PR #170 sur la seule base des tests statiques. La PR reste en brouillon jusqu'à validation SQL/RLS réelle sur DEV.

## Advisors observés — état antérieur

Le contrôle Advisor de MIZANE-DEV du 27 novembre 2026 a retourné les constats existants suivants :

- 3 alertes informatives `rls_enabled_no_policy` sur des tables de synchronisation/comptabilité déjà présentes.
- 4 avertissements `SECURITY DEFINER` dans le schéma public, sur des RPC métier déjà existantes.
- 1 avertissement relatif à la protection Auth contre les mots de passe compromis, actuellement désactivée.
- 2 clés étrangères de `accounting_notifications` sans index couvrant.
- 35 index signalés inutilisés.

Ces éléments ne sont pas créés par la migration Boussole, qui n'a pas été appliquée. Ils restent à traiter dans un chantier distinct, après analyse d'impact ; aucun privilège ni paramètre Auth n'a été modifié pendant cette revue.
