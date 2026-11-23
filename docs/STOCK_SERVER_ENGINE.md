# Gestion de stock MIZANE — Lot serveur transactionnel

## État du lot

Ces migrations ont été appliquées et vérifiées sur Supabase **DEV uniquement**. Aucune migration de stock n'a été exécutée sur Production.

Fichiers :
- `supabase/migrations/20261123085959_stock_server_engine.sql`
- `supabase/migrations/20261123090112_stock_foreign_key_indexes.sql`

La première tentative a été rejetée par PostgreSQL à cause d'un délimiteur dollar incorrect dans les wrappers RPC. Le SQL a été corrigé dans GitHub puis appliqué avec succès. La migration appliquée accorde également `USAGE` sur le schéma privé aux utilisateurs authentifiés afin que les wrappers `SECURITY INVOKER` puissent résoudre les implémentations privées ; les privilèges `EXECUTE` restent accordés fonction par fonction.

## Architecture livrée

- Tables dédiées et isolées par `company_id` : paramètres, entrepôts, articles, documents, lignes, mouvements, soldes, couches de valorisation, allocations FIFO, réservations et journal d'audit.
- RLS activée et forcée sur les tables publiques ; lecture limitée aux membres actifs ; aucune écriture directe accordée au navigateur.
- RPC `stock_read_state`, `stock_save_product`, `stock_save_warehouse`, `stock_update_settings`, `stock_post_document`, `stock_reserve` et `stock_release_reservation`. Les wrappers publics sont `SECURITY INVOKER` ; la logique privilégiée est dans le schéma privé non exposé.
- Autorisation d'écriture côté serveur limitée à `admin` et `accountant`. L'activation du stock négatif est réservée à `admin`.
- Verrou transactionnel par entreprise, clé d'idempotence `operation_uid`, validations côté serveur et audit.
- Journal des mouvements, allocations FIFO et audit protégés contre les mises à jour/suppressions ordinaires.
- CUMP et FIFO ; FIFO consomme les couches chronologiquement et conserve les allocations de sortie. Le mode inventaire permanent/intermittent et les déclencheurs achat/vente sont paramétrables, sans automatisation achat/vente encore raccordée.
- Transferts débit/crédités dans la même transaction ; réservations retranchées du disponible.
- Le point d’entrée de contrepassation est volontairement bloqué : l’algorithme de restauration exacte des allocations CUMP/FIFO doit être finalisé avant de permettre une correction automatique. Les mouvements restent append-only.
- Changement CUMP/FIFO bloqué après le premier mouvement afin d'éviter une revalorisation silencieuse.

## Interface et reprise de l’historique

L’interface Gestion de stock détecte une entreprise active et lit désormais le stock via `stock_read_state`. Les créations d’articles/entrepôts, paramètres, mouvements et réservations passent par les RPC transactionnelles. Les totaux utilisent les soldes serveur complets ; les 500 derniers mouvements ne servent qu’à l’historique affiché. La synchronisation de facturation n’écrit plus le stock dans `company_billing`.

Une reprise explicite de l’ancien stock local est proposée uniquement lorsque le stock cloud est vide (ou lorsqu’une reprise est déjà commencée). Elle conserve les données locales, recrée les articles et entrepôts par référence/nom, puis rejoue les mouvements chronologiquement avec un `operation_uid` déterministe par entreprise et mouvement. Les doublons de requête sont donc neutralisés côté serveur. L’utilisateur doit déclencher cette reprise ; aucun transfert de données historiques n’est lancé automatiquement.

## Limites fonctionnelles explicites

Le dépôt de départ ne contient pas encore de module Achats complet ni de flux de livraison suffisamment définis pour raccorder les événements de vente/achat sans ambiguïté. Ce lot n'invente donc aucun déclencheur automatique à partir de factures.

Les éléments suivants ne sont pas activés dans cette migration et ne doivent pas être présentés comme opérationnels :
1. Traçabilité par lots et numéros de série : les valeurs autres que `none` sont refusées par le RPC de sauvegarde article tant que les tables et contrôles d'unicité/affectation ne sont pas livrés.
2. Conversions d'unités (carton/pièce/kg/litre, etc.) : seule l'unité de base est enregistrée.
3. Inventaire physique guidé : les ajustements de quantité sont possibles via les documents d'ajustement, mais le workflow de comptage, gel, rapprochement et validation n'est pas encore raccordé.
4. Comptabilisation automatique : aucun compte CGNC n'est codé en dur. Le raccordement attend une règle validée par entreprise et le plan de comptes réel.
5. Réservations : création et libération sont présentes ; consommation automatique d'une réservation lors d'une livraison reste à raccorder.
6. Contrepassation : le point d’entrée RPC est bloqué tant que la restauration exacte des couches de valorisation et des allocations FIFO n’est pas terminée. Aucun bouton de contrepassation n’est affiché. Les corrections par ajustement restent à intégrer à l’interface.

## Contrôles et validation

Les tests Node du dépôt vérifient statiquement les invariants de sécurité, le cloisonnement, la frontière RPC, le raccordement de l’interface, l’import historique, les verrous, l'idempotence, les protections append-only et les garde-fous FIFO/réservations.

### Vérifications PostgreSQL DEV effectuées

Les deux migrations sont présentes dans l'historique DEV : `20261123085959 stock_server_engine` et `20261123090112 stock_foreign_key_indexes`.

Les tests ont été exécutés dans des transactions explicitement annulées (`ROLLBACK)), avec entreprises, membres, articles et entrepôts fictifs :
1. Création article physique, service et entrepôts ; un service est refusé dans une réception physique.
2. Réception et idempotence ; une réutilisation du même `operation_uid` avec un contenu différent est refusée.
3. Réservation ; une sortie qui consomme une quantité réservée est refusée.
4. Transfert entre entrepôts ; la quantité globale est conservée.
5. CUMP : deux réceptions de 10 unités à 5 et 7, puis sortie de 5 ; solde attendu 15 unités et valeur 90.
6. FIFO : deux réceptions de 10 unités à 5 et 7, puis sortie de 12 ; solde attendu 8 unités et valeur 56, avec deux allocations FIFO.
7. Stock négatif refusé par défaut.
8. Un membre reader peut lire, mais ne peut pas écrire ; un non-membre ne peut pas lire l'entreprise de test.
9. Les privilèges directs d'insertion sur le journal des mouvements sont absents pour `authenticated`, et l'accès RPC anonyme est refusé.

Après rollback, les requêtes de contrôle ont confirmé zéro entreprise fictive et zéro mouvement de test résiduel. Les 11 tables de stock ont RLS activée et 11 politiques de lecture sont présentes.

### Supabase Advisors

- Sécurité : aucun nouvel avertissement propre au stock. Les alertes restantes concernent des fonctions SECURITY DEFINER déjà présentes (`create_company`, `manage_accounting_period`), trois tables historiques sans politique RLS, et la protection des mots de passe compromis désactivée.
- Performance : les 17 index couvrant les clés étrangères du stock ont été ajoutés dans la seconde migration. L'Advisor ne signale plus de clé étrangère stock non indexée ; il signale encore des index non utilisés, ce qui est attendu tant que le module a très peu de données.

Les tests transactionnels valident les chemins principaux du moteur, mais ne remplacent pas encore un test de concurrence multi-session avec plusieurs clients authentifiés ni un test navigateur complet.

## Sécurité

Les deux migrations ont été appliquées sur Supabase DEV. Les tests ont utilisé des données fictives et toutes leurs transactions ont été annulées ; aucune donnée métier DEV n'a été conservée ou modifiée. Aucun changement n'a été apporté à Supabase Production. La PR reste ouverte en brouillon et n'a pas été fusionnée.
