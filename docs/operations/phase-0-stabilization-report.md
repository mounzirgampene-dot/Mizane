# Rapport de stabilisation — MIZANE DEV

**Date de vérification :** 27 novembre 2026  
**Dépôt :** `mounzirgampene-dot/Mizane`  
**Branche de référence :** `feat/stock-integrated-dev`  
**Commit DEV contrôlé avant cette actualisation :** `81a234125c1cda488b5de79c57366e16dfa3b259`  
**Projet Supabase contrôlé :** MIZANE-DEV (`rudsovhdvinvyrwjamfo`)  
**Périmètre :** DEV uniquement. Aucune intervention sur Supabase Production.

## 1. Résultat de la correction P0

Le risque de mélange de la comptabilité locale entre deux entreprises a été traité par la PR #162 :

- association explicite du magasin comptable local à un utilisateur et à une entreprise ;
- blocage de l'affichage de l'espace professionnel lorsque l'association ou l'appartenance ne peut pas être vérifiée ;
- blocage de la synchronisation automatique en cas d'association absente ou incohérente ;
- récupération explicite des données cloud avant l'utilisation locale d'une autre entreprise ;
- sauvegarde JSON téléchargée avant la restauration cloud ;
- association enregistrée après import initial confirmé et établissement du shadow de synchronisation ;
- rechargement de l'application lorsqu'un autre onglet change l'entreprise, l'utilisateur ou le magasin local ;
- test de régression pour les changements d'entreprise et d'utilisateur.

**Limite connue :** cette correction est une barrière de sécurité immédiate. Elle ne remplace pas encore une partition physique complète de tous les magasins locaux par utilisateur et entreprise. Les coffres documentaires IndexedDB locaux restent à traiter dans un lot dédié. Les anciennes données locales ne sont pas supprimées ; une restauration cloud peut les remplacer dans le magasin actif, mais une sauvegarde JSON est téléchargée au préalable. Les changements non synchronisés contenus dans cette sauvegarde ne sont pas fusionnés automatiquement.

## 2. Intégration et contrôles CI

| Élément | Résultat |
|---|---|
| PR #162 | Fusionnée dans `feat/stock-integrated-dev` |
| Commit de DEV | `84d71fc274631e97034578ccffd546a403f767bd` |
| Tests de résilience sur PR | Réussis — run [45958421598](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45958421598) |
| Tests de résilience après intégration | Réussis — run [45958614061](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45958614061) |
| Contrôle Cloudflare Preview | Réussi — run [45958613978](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45958613978) |
| Contrôle GitHub Pages sur PR | Tests réussis, déploiement ignoré — run [45958619395](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45958619395) |
| Contrôle de résilience sur PR après intégration | Réussi — run [45958619435](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45958619435) |
| Test de régression hors connexion sur PR #164 | Réussi — run [45959461582](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45959461582) |
| Tests après intégration hors connexion | Réussis — run [45959525904](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45959525904) |
| Contrôle Cloudflare Preview après intégration hors connexion | Réussi — run [45959525902](https://github.com/mounzirgampene-dot/Mizane/actions/runs/45959525902) |

Le job de déploiement GitHub Pages est conditionné à un déclenchement manuel sur `main`. Il a été ignoré. Aucun déploiement Production n'a été effectué.

## 3. État des demandes de fusion préexistantes

- PR #60 : toujours ouverte et en brouillon.
- PR #68 : toujours ouverte et en brouillon. Sa branche source `feat/stock-integrated-dev` contient maintenant la correction P0 intégrée.
- PR #162 : fusionnée exclusivement vers `feat/stock-integrated-dev`, jamais vers `main`.
- PR #163 : documentation de référence Boussole et rapport Phase 0 fusionnés vers DEV.
- PR #164 : précache hors connexion corrigé et fusionné vers DEV.
- PR #165 : preuves de stabilisation actualisées et fusionnées vers DEV.
- PR #166 : modèle de données et règles d'accès Boussole fusionnés vers DEV.
- PR #167 : isolation des coffres documentaires IndexedDB fusionnée vers DEV.

## 4. Réconciliation de l'historique des migrations

Inventaire observé :

- Fichiers SQL présents dans la branche : **71**.
- Entrées de migration présentes dans MIZANE-DEV : **75**.
- Correspondances par nom normalisé : **71** fichiers.
- Fichiers locaux sans correspondance de nom : **0**.
- Entrées Supabase sans fichier correspondant dans la branche : **4**.

La comparaison effectuée après normalisation des préfixes de version confirme que les 71 fichiers ont un nom correspondant dans l'historique DEV et que quatre entrées Supabase n'ont aucun fichier correspondant dans la branche. La correspondance par nom ne prouve pas l'identité du contenu SQL : les horodatages divergent et les contenus doivent encore être comparés par empreinte avant toute réconciliation définitive. Aucune migration n'a été réappliquée.

### 4.1. Entrées présentes dans Supabase DEV sans fichier correspondant

| Version Supabase | Nom |
|---|---|
| `20261117085906` | `validate_incremental_write_batches` |
| `20261117230505` | `guard_accounting_sync_settings_delete` |
| `20261121095043` | `index_accounting_period_actors` |
| `20261122221330` | `fix_invitation_email_validation` |

### 4.2. Correspondances fichier / version Supabase

| Fichier de la branche | Version dans Supabase DEV | Constat |
|---|---|---|
| `20261112000100_multi_company_core.sql` | `20261112000100` | identique |
| `20261112000200_atomic_member_management.sql` | `20261112000200` | identique |
| `20261113000100_atomic_invitation_acceptance.sql` | `20261113000100` | identique |
| `20261115141332_index_foreign_key_columns.sql` | `20261115141332` | identique |
| `20261116000100_cloud_accounting_schema.sql` | `20261116223418` | horodatage différent |
| `20261116000200_accounting_snapshot_import.sql` | `20261116223635` | horodatage différent |
| `20261116000300_restrict_snapshot_rpc.sql` | `20261116223814` | horodatage différent |
| `20261116000400_server_actor_snapshot_import.sql` | `20261116223907` | horodatage différent |
| `20261116000500_private_rls_helpers.sql` | `20261116223954` | horodatage différent |
| `20261117083340_accounting_sync_identity.sql` | `20261117083340` | identique |
| `20261117083520_preserve_client_sync_identity_on_snapshot_import.sql` | `20261117083520` | identique |
| `20261117090000_accounting_sync_change_log.sql` | `20261117084919` | horodatage différent |
| `20261117091000_accounting_sync_versions.sql` | `20261117085027` | horodatage différent |
| `20261117092000_accounting_incremental_write_engine.sql` | `20261117085831` | horodatage différent |
| `20261117110000_accounting_incremental_write_engine.sql` | `20261117085834` | horodatage différent |
| `20261117092344_preserve_next_entry_id_on_settings_update.sql` | `20261117092344` | identique |
| `20261117093000_company_ai_vault_credentials.sql` | `20261117135606` | horodatage différent |
| `20261117093000_refresh_incremental_sync_versions.sql` | `20261117090008` | horodatage différent |
| `20261117094000_idempotency_payload_fingerprint.sql` | `20261117090033` | horodatage différent |
| `20261117120000_accounting_secret_redaction_hardening.sql` | `20261117090124` | horodatage différent |
| `20261117130000_accounting_sync_internal_secret_redaction.sql` | `20261117090233` | horodatage différent |
| `20261117140000_accounting_import_next_entry_id.sql` | `20261117091221` | horodatage différent |
| `20261117150000_fix_company_ai_vault_upsert.sql` | `20261117150017` | horodatage différent |
| `20261117165406_accounting_deferred_integrity_guards.sql` | `20261117165406` | identique |
| `20261117170038_accounting_plan_account_reference_guards.sql` | `20261117170038` | identique |
| `20261117170259_index_accounting_sync_operation_actor.sql` | `20261117170259` | identique |
| `20261117173327_admin_company_deletion.sql` | `20261117173327` | identique |
| `20261117180045_accounting_activity_history.sql` | `20261117180045` | identique |
| `20261117180329_remove_duplicate_audit_index.sql` | `20261117180329` | identique |
| `20261119151649_work_history_access.sql` | `20261119151649` | identique |
| `20261119190000_billing_cloud_sync.sql` | `20261119221408` | horodatage différent |
| `20261120120000_accounting_period_locks.sql` | `20261120221145` | horodatage différent |
| `20261121122215_security_role_grants.sql` | `20261121122215` | identique |
| `20261121210605_accounting_entries_company_date_id_index.sql` | `20261121210605` | identique |
| `20261121230000_read_accounting_snapshot.sql` | `20261121230410` | horodatage différent |
| `20261121230500_read_accounting_snapshot_limits.sql` | `20261121230427` | horodatage différent |
| `20261122100000_atomic_company_invitations.sql` | `20261122221215` | horodatage différent |
| `20261123085959_stock_server_engine.sql` | `20261123085959` | identique |
| `20261123090112_stock_foreign_key_indexes.sql` | `20261123090112` | identique |
| `20261123090659_stock_traceability_and_units.sql` | `20261123090659` | identique |
| `20261123090728_fix_stock_lot_balance_decrease.sql` | `20261123090728` | identique |
| `20261123090856_stock_serial_guards_and_indexes.sql` | `20261123090856` | identique |
| `20261123091005_normalize_stock_serial_inputs.sql` | `20261123091005` | identique |
| `20261123094940_stock_auto_reservation_fulfillment.sql` | `20261123094940` | identique |
| `20261123110000_stock_physical_inventory.sql` | `20261123102658` | horodatage différent |
| `20261123113000_stock_physical_inventory_indexes.sql` | `20261123103047` | horodatage différent |
| `20261123120000_stock_inventory_freeze_guard_hardening.sql` | `20261123103310` | horodatage différent |
| `20261123121500_stock_inventory_freeze_guard_null_fix.sql` | `20261123103337` | horodatage différent |
| `20261123130000_stock_exact_valuation_reversals.sql` | `20261123104424` | horodatage différent |
| `20261123131500_fix_reversal_document_link.sql` | `20261123104445` | horodatage différent |
| `20261123133000_stock_cump_reversal_allocation_cleanup.sql` | `20261123104716` | horodatage différent |
| `20261123150000_stock_tracked_valuation_reversals.sql` | `20261123110025` | horodatage différent |
| `20261123160000_stock_catalog_write_serialization.sql` | `20261123110348` | horodatage différent |
| `20261123164851_stock_product_catalog_and_prices.sql` | `20261123164851` | identique |
| `20261123164907_stock_catalog_indexes_and_read_policy.sql` | `20261123164907` | identique |
| `20261123165146_stock_product_catalog_unit_conversion_guard.sql` | `20261123165146` | identique |
| `20261123170000_stock_reservation_invoice_link.sql` | `20261123110839` | horodatage différent |
| `20261123171500_stock_reservation_lock_order.sql` | `20261123110943` | horodatage différent |
| `20261123172036_stock_product_price_units.sql` | `20261123172036` | identique |
| `20261123173000_fix_stock_reservation_idempotency.sql` | `20261123111210` | horodatage différent |
| `20261123203000_accounting_notifications.sql` | `20261123203323` | horodatage différent |
| `20261123210000_accounting_anomaly_reporting.sql` | `20261123220539` | horodatage différent |
| `20261125060451_stock_periodic_inventory_valuation.sql` | `20261125060451` | identique |
| `20261125060559_stock_periodic_inventory_valuation_hardening.sql` | `20261125060559` | identique |
| `20261125060730_stock_periodic_inventory_function_security.sql` | `20261125060730` | identique |
| `20261125172040_tax_document_vault.sql` | `20261125172040` | identique |
| `20261125172307_tax_document_vault_fk_indexes.sql` | `20261125172307` | identique |
| `20261125172702_tax_document_vault_hardening.sql` | `20261125172702` | identique |
| `20261126000100_stock_replenishment_thresholds.sql` | `20261126160738` | horodatage différent |
| `20261126000200_accounting_document_vault.sql` | `20261126192548` | horodatage différent |
| `20261126000300_accounting_document_classification.sql` | `20261126194318` | horodatage différent |

### 4.3. Doublon de nom

Le nom `accounting_incremental_write_engine` figure deux fois dans la branche et deux fois dans l'historique Supabase DEV. Les deux entrées doivent être comparées par contenu SQL, ordre d'application et empreinte ; le nom identique ne suffit pas à conclure à un doublon d'exécution.

### 4.4. Décision de sécurité

Aucune migration n'a été réappliquée, supprimée, renommée ou réécrite pour faire correspondre artificiellement les horodatages. La suite recommandée est un registre de rapprochement avec :

1. chemin exact du fichier ;
2. version Supabase ;
3. nom normalisé ;
4. SHA-256 du SQL local ;
5. preuve du contenu effectivement appliqué lorsqu'elle est disponible ;
6. décision documentée ;
7. validation humaine avant toute correction de l'historique.

Ne jamais tenter de réparer l'historique en rejouant des migrations déjà appliquées.

## 5. Conseillers Supabase — observations du 27 novembre 2026

### 5.1. Sécurité

- Trois tables publiques ont RLS activée sans politique relevée : `accounting_sync_operations`, `company_billing` et `company_billing_sync_operations`. C'est un signal INFO ; les accès directs peuvent être volontairement révoqués au profit de RPC contrôlées. Vérifier les privilèges effectifs avant toute modification.
- Quatre fonctions `SECURITY DEFINER` sont signalées comme exécutables par `authenticated` : `create_accounting_alert`, `create_company`, `manage_accounting_period` et `review_accounting_notification`. Examiner les contrôles d'identité, rôles, paramètres, effets secondaires, `search_path` et privilèges. Ne pas révoquer à l'aveugle des fonctions nécessaires à l'application.
- La protection des mots de passe compromis est désactivée dans Supabase Auth. Son activation doit être planifiée et vérifiée avec les paramètres d'authentification et les parcours utilisateurs.

### 5.2. Performance

- Deux clés étrangères de `accounting_notifications` n'ont pas d'index couvrant signalé : `actor_user_id` et `reviewed_by`.
- Trente-cinq index sont signalés comme inutilisés à la date du contrôle. Cela ne justifie pas leur suppression : vérifier la durée d'observation, les requêtes rares, les tâches planifiées et les contraintes avant toute décision.

Les constats ci-dessus sont des alertes de conseil, pas la preuve d'une fuite ou d'un incident.

## 6. Autres travaux techniques restant à traiter

| Priorité | Sujet | Décision |
|---|---|---|
| P1 | Isolation des coffres comptables et fiscaux IndexedDB par utilisateur/entreprise | Concevoir une migration préservant les fichiers historiques ; ne pas masquer ni supprimer les documents sans stratégie de reprise |
| P1 | Vérification des transitions de session, retrait de membre et changement d'utilisateur | Ajouter des tests multi-onglets et multi-comptes |
| P1 | Revue des quatre fonctions `SECURITY DEFINER` | Vérifier chaque fonction et ses grants avant modification |
| P1 | Rapprochement des migrations par empreintes SQL | Produire un registre vérifiable ; aucune réapplication |
| P2 | Précache du service worker | **Résolu par PR #164** : ajout de `js/stock.js` et `js/work-history.js`, cache `mizane-v113`, test automatique des imports directs de `app.js` |
| P2 | Reproductibilité des dépendances | Le dépôt ne contient pas de `package-lock.json` à la racine ; évaluer la génération et la validation d'un lockfile avant de remplacer les installations de secours |
| P2 | Index des clés étrangères de notifications | Mesurer les requêtes et ajouter les index seulement si justifiés |
| P2 | Index signalés inutilisés | Ne pas supprimer sans analyse de charge |

## 8. Conclusion

La barrière P0 de synchronisation multi-entreprises et l'isolation IndexedDB des justificatifs sont intégrées à DEV. Les contrôles CI du commit `81a234125c1cda488b5de79c57366e16dfa3b259` ont réussi. La réconciliation des migrations reste documentaire et non destructive. Les alertes Supabase sont consignées sans modification prématurée des politiques, fonctions ou index.

## 7. Isolation des coffres documentaires locaux — intégrée par PR #167

La PR #167 a intégré une portée IndexedDB distincte pour les justificatifs comptables et fiscaux : un coffre par couple utilisateur/entreprise en mode SaaS et un coffre par utilisateur en mode local. En présence d’une entreprise active, l’accès au coffre local est refusé si l’association utilisateur/entreprise vérifiée par `company-storage.js` est absente ou incohérente.

Les anciennes bases IndexedDB non cloisonnées (`mizane_accounting_documents_v1` et `mizane_tax_evidence_v1`) ne sont ni supprimées ni automatiquement réattribuées : leur contenu ne peut pas être attribué de manière fiable à une entreprise. Elles restent intactes pour une procédure de récupération explicite ultérieure. Les nouveaux coffres ne lisent pas ces anciennes bases.

## 9. Revue Supabase DEV du 27 novembre 2026

### 9.1. Tables RLS sans politique

Les trois tables `public.accounting_sync_operations`, `public.company_billing` et `public.company_billing_sync_operations` ont RLS et FORCE RLS activés, aucune politique, et aucun privilège SELECT/INSERT/UPDATE/DELETE accordé à `anon` ou `authenticated` selon `has_table_privilege`. L'alerte Advisor `rls_enabled_no_policy` est donc informative dans l'état observé : aucun accès Data API direct n'est accordé à ces rôles. Toute évolution doit préserver cette fermeture et documenter les accès backend nécessaires.

### 9.2. Fonctions SECURITY DEFINER

Les quatre fonctions signalées (`create_accounting_alert`, `create_company`, `manage_accounting_period`, `review_accounting_notification`) sont exécutables par `authenticated`, mais leur définition a été inspectée : elles vérifient toutes `auth.uid()`, ont un `search_path` vide et appliquent des contrôles de rôle/appartenance adaptés à l'opération. L'alerte Advisor est conservée pour revue continue ; aucun changement de privilège n'a été appliqué car ces RPC sont utilisées par l'application.

### 9.3. Autres alertes

- Protection des mots de passe compromis Supabase Auth : désactivée selon Advisor. À évaluer avant activation, car elle peut refuser certains nouveaux mots de passe ; aucun paramètre Auth n'a été modifié.
- Deux clés étrangères de `accounting_notifications` sans index couvrant : à mesurer avant ajout.
- 35 index signalés inutilisés : aucune suppression sans analyse de charge.
- Health Advisor : aucune alerte remontée lors du contrôle.

### 9.4. Changement Supabase Data API

Depuis le 30 octobre 2026, les nouvelles tables publiques ne sont plus automatiquement exposées au Data API. Les futures tables Boussole devront recevoir explicitement les privilèges strictement nécessaires, puis des politiques RLS adaptées ; l'exposition API et les règles de lignes seront testées séparément. Référence : https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically.

## 10. Mise à jour du précache

La PR #168 incrémente le cache du service worker à `mizane-v114` et actualise les quatre assertions de version correspondantes. Le module `js/document-storage-scope.js` est précaché pour permettre l'ouverture hors connexion des coffres cloisonnés.
