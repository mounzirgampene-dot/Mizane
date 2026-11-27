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

## Limite bloquante avant validation transactionnelle (état initial)

À l'ouverture de cette revue, les six tables Boussole étaient absentes de MIZANE-DEV. Une validation transactionnelle a ensuite été exécutée en créant le schéma et des fixtures temporaires dans une transaction explicitement annulée.

Les tests helper ci-dessus ne constituent pas un test RLS des tables Boussole. Il reste à effectuer après installation sur DEV, avec des comptes de test dédiés :

1. Lecture globale publiée par `anon`.
2. Refus de lecture des brouillons et documents d'entreprise par `anon`.
3. Lecture par un membre actif de sa propre entreprise.
4. Refus pour un membre révoqué et un utilisateur d'une autre entreprise.
5. Isolation des versions et relations.
6. Lecture/écriture des préférences du propriétaire seulement.
7. Insertion de consentement pour soi-même ; refus pour un autre utilisateur.
8. Vérification qu'UPDATE et DELETE des consentements échouent.

**Décision initiale :** l'application était bloquée jusqu'à validation réelle. Cette condition a été levée par les tests transactionnels décrits ci-dessous.

## Advisors observés — état antérieur

Le contrôle Advisor de MIZANE-DEV du 27 novembre 2026 a retourné les constats existants suivants :

- 3 alertes informatives `rls_enabled_no_policy` sur des tables de synchronisation/comptabilité déjà présentes.
- 4 avertissements `SECURITY DEFINER` dans le schéma public, sur des RPC métier déjà existantes.
- 1 avertissement relatif à la protection Auth contre les mots de passe compromis, actuellement désactivée.
- 2 clés étrangères de `accounting_notifications` sans index couvrant.
- 35 index signalés inutilisés.

Ces éléments ne sont pas créés par la migration Boussole, qui n'a pas été appliquée. Ils restent à traiter dans un chantier distinct, après analyse d'impact ; aucun privilège ni paramètre Auth n'a été modifié pendant cette revue.

## Validation transactionnelle réelle sur MIZANE-DEV — 27 novembre 2026

La migration `20261127105326_boussole_foundation.sql` a d'abord été exécutée dans une transaction de validation avec des données synthétiques, puis intégralement annulée. Les tests ont utilisé les rôles PostgreSQL réels `anon` et `authenticated`, des claims JWT simulés et trois identités Auth synthétiques. Aucun compte utilisateur réel n'a été utilisé et toutes les écritures de test ont été annulées.

Résultats contrôlés :

1. `anon` lit uniquement un document global publié, sa version publiée et les synonymes actifs ; aucun brouillon, document privé, relation privée ou préférence n'est visible.
2. Le membre actif de l'entreprise A lit le document global et le document de A, mais pas celui de B.
3. Les versions et relations suivent le même cloisonnement que les documents.
4. Un membre suspendu ne conserve que l'accès aux contenus globaux.
5. Le membre de l'entreprise B ne voit aucun document de l'entreprise A.
6. Les préférences sont lisibles et modifiables par leur propriétaire uniquement.
7. Un utilisateur ne peut pas enregistrer un consentement pour un autre compte.
8. UPDATE et DELETE des événements de consentement sont refusés.
9. Les colonnes `id` et `created_at` des consentements ne peuvent pas être fournies par le client.
10. L'écriture éditoriale directe dans les documents est refusée.

**Résultat : PASS.** Le script reproductible est `supabase/tests/boussole_rls_smoke.sql`. Il utilise des identifiants UUID aléatoires et termine par `ROLLBACK` ; les données de test et les profils créés par le trigger Auth ne persistent pas.

Après ce résultat, la migration a été appliquée à **MIZANE-DEV uniquement** par la migration Supabase `20261127105326_boussole_foundation`. Contrôle post-application : les six tables existent, chacune est vide, et aucun fixture n'a persisté. La migration n'a pas été appliquée à Supabase Production.

## Advisors après migration

Le contrôle sécurité post-migration conserve exactement les alertes préexistantes :
- 3 alertes informatives `rls_enabled_no_policy` sur des tables de synchronisation/comptabilité antérieures.
- 4 avertissements `SECURITY DEFINER` sur des RPC métier préexistantes.
- 1 avertissement Auth sur la protection contre les mots de passe compromis désactivée.

Aucune nouvelle alerte de sécurité relative aux six tables Boussole n'a été signalée. Les autres constats de performance déjà documentés restent hors du périmètre de cette migration.