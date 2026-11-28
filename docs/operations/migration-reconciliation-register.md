# Registre de réconciliation des migrations — MIZANE DEV

**Contrôle :** 27 novembre 2026  
**Projet Supabase :** MIZANE-DEV (`rudsovhdvinvyrwjamfo`)  
**Branche examinée :** `feat/stock-integrated-dev` — `a3b37718825a60d8b28cf10239256287588f1628`  
**Branche de comparaison :** source de la PR #60, `feat/cloud-accounting-dev`  
**Périmètre :** lecture seule. Aucune migration n'a été appliquée, rejouée, supprimée ou réparée.

## 1. Comptage observé

| Source | Nombre |
|---|---:|
| Fichiers SQL dans `supabase/migrations` sur DEV | 71 |
| Entrées retournées par l'historique Supabase DEV | 75 |
| Entrées Supabase sans fichier correspondant sur DEV | 4 |

La correspondance de nom normalisé ne constitue pas une preuve d'identité du SQL exécuté. Le registre sépare donc la présence du fichier, le rapprochement de nom et la preuve du contenu réellement appliqué.

## 2. Entrées Supabase sans fichier correspondant sur DEV

| Version Supabase | Nom Supabase | Candidat retrouvé | SHA Git du candidat | Décision |
|---|---|---|---|---|
| `20261117085906` | `validate_incremental_write_batches` | Aucun fichier dans DEV ou dans l'inventaire de la branche source PR #60 | — | Orpheline, contenu appliqué non récupéré |
| `20261117230505` | `guard_accounting_sync_settings_delete` | `20261117224000_guard_accounting_sync_settings_delete.sql` sur la branche PR #60 | `e6058bf727226a377b6a8bb61058339d810b93c4` | Candidat de nom seulement ; hash du SQL appliqué indisponible |
| `20261121095043` | `index_accounting_period_actors` | `20261121000100_index_accounting_period_actors.sql` sur la branche PR #60 | `945560fa8f56d8e28362262e14ee76981b15bf60` | Candidat de nom seulement ; hash du SQL appliqué indisponible |
| `20261122221330` | `fix_invitation_email_validation` | Aucun fichier dans DEV ou dans l'inventaire de la branche source PR #60 | — | Orpheline, contenu appliqué non récupéré |

Les SHA indiqués sont les identifiants Git blob des fichiers candidats, pas des empreintes du SQL conservé par Supabase. L'outil d'historique des migrations retourne les versions et noms, mais pas le texte SQL appliqué. Il est donc impossible de certifier une égalité octet par octet à partir de ces seules données.

## 3. Vérifications ciblées

1. Le candidat `index_accounting_period_actors` ajoute les index `accounting_periods_closed_by_idx` et `accounting_periods_reopened_by_idx`. Le fichier DEV `20261115141332_index_foreign_key_columns.sql` ne crée que les index `audit_logs.actor_user_id`, `companies.created_by` et `company_invitations.invited_by` : il ne remplace donc pas le candidat.
2. Le candidat `guard_accounting_sync_settings_delete` contient une version de `public.push_accounting_changes` qui interdit la suppression de `settings`. Aucun fichier DEV ne porte ce nom ; le rapprochement avec une fonction déjà présente ne peut pas être certifié sans le SQL exact déployé.
3. Les deux fichiers DEV nommés `accounting_incremental_write_engine` ont des versions et des contenus distincts. L'historique Supabase comporte deux entrées de ce nom, aux versions `20261117085831` et `20261117085834`. Le doublon de nom ne doit pas être supprimé ou fusionné sans comparer leur contenu et leur ordre.
4. Le fichier DEV `20261122100000_atomic_company_invitations.sql` ne suffit pas à prouver que la migration `fix_invitation_email_validation` a été appliquée avec le même contenu.

## 4. Actions de clôture nécessaires

1. Récupérer le SQL réellement exécuté pour les quatre versions depuis un export fiable, une sauvegarde ou l'historique de déploiement conservé.
2. Calculer une empreinte SHA-256 du contenu appliqué et du fichier candidat.
3. Comparer les contenus et les effets de chaque migration, y compris les fonctions remplacées et les index créés.
4. Faire valider les correspondances par revue humaine.
5. Conserver un fichier canonique par migration appliquée et un registre de décision auditable.

**Interdiction opérationnelle :** ne pas rejouer les migrations déjà enregistrées dans Supabase pour tenter de réparer les noms ou les horodatages. Ne pas insérer ou supprimer manuellement des lignes de l'historique sans preuve du SQL appliqué et procédure de restauration.

## 5. Références de contrôle

- Branche DEV : https://github.com/mounzirgampene-dot/Mizane/tree/feat/stock-integrated-dev
- PR #60 (branche source de comparaison) : https://github.com/mounzirgampene-dot/Mizane/pull/60
- Rapport de stabilisation : [phase-0-stabilization-report.md](./phase-0-stabilization-report.md)
