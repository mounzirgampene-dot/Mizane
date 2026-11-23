# Gestion de stock MIZANE — Lot serveur transactionnel

## État du lot

Cette migration ajoute le socle de persistance et de traitement serveur du stock. Elle est **préparée dans GitHub mais non exécutée** sur Supabase DEV ou Production.

Fichier : `supabase/migrations/20261123150000_stock_server_engine.sql`

## Architecture livrée

- Tables dédiées et isolées par `company_id` : paramètres, entrepôts, articles, documents, lignes, mouvements, soldes, couches de valorisation, allocations FIFO, réservations et journal d'audit.
- RLS activée et forcée sur les tables publiques ; lecture limitée aux membres actifs ; aucune écriture directe accordée au navigateur.
- RPC `stock_read_state`, `stock_save_product`, `stock_save_warehouse`, `stock_update_settings`, `stock_post_document`, `stock_reserve`, `stock_release_reservation` et `stock_reverse_document`.
- Autorisation d'écriture côté serveur limitée à `admin` et `accountant`. L'activation du stock négatif est réservée à `admin`.
- Verrou transactionnel par entreprise, clé d'idempotence `operation_uid`, validations côté serveur et audit.
- Journal des mouvements, allocations FIFO et audit protégés contre les mises à jour/suppressions ordinaires.
- CUMP et FIFO ; FIFO consomme les couches chronologiquement et conserve les allocations de sortie.
- Transferts débit/crédités dans la même transaction ; réservations retranchées du disponible.
- Contrepassation par document inverse, avec motif obligatoire. Les documents d'origine sont conservés.
- Changement CUMP/FIFO bloqué après le premier mouvement afin d'éviter une revalorisation silencieuse.

## Limites fonctionnelles explicites

Le dépôt de départ ne contient pas encore de module Achats complet ni de flux de livraison suffisamment définis pour raccorder les événements de vente/achat sans ambiguïté. Ce lot n'invente donc aucun déclencheur automatique à partir de factures.

Les éléments suivants ne sont pas activés dans cette migration et ne doivent pas être présentés comme opérationnels :
1. Traçabilité par lots et numéros de série : les valeurs autres que `none` sont refusées par le RPC de sauvegarde article tant que les tables et contrôles d'unicité/affectation ne sont pas livrés.
2. Conversions d'unités (carton/pièce/kg/litre, etc.) : seule l'unité de base est enregistrée.
3. Inventaire physique guidé : les ajustements de quantité sont possibles via les documents d'ajustement, mais le workflow de comptage, gel, rapprochement et validation n'est pas encore raccordé.
4. Comptabilisation automatique : aucun compte CGNC n'est codé en dur. Le raccordement attend une règle validée par entreprise et le plan de comptes réel.
5. Réservations : création et libération sont présentes ; consommation automatique d'une réservation lors d'une livraison reste à raccorder.
6. Intégration de l'interface existante : la vue actuelle utilise encore son modèle local historique et la synchronisation de facturation contient toujours le champ stock historique. Les RPC serveur doivent être raccordées à une interface adaptée avant usage réel multi-utilisateur. Ne pas interpréter la présence de la migration comme une bascule complète du frontend.

## Contrôles et validation

Les tests Node ajoutés vérifient statiquement les invariants de sécurité, le cloisonnement, les RPC, les verrous, l'idempotence, les protections append-only et les garde-fous FIFO/réservations. Ils ne remplacent pas une exécution PostgreSQL.

Avant toute activation sur DEV :
1. Générer/valider la migration avec la version Supabase CLI du dépôt et vérifier son ordre dans `supabase migration list`.
2. Appliquer sur DEV après sauvegarde explicite.
3. Vérifier les signatures, privilèges, politiques RLS et triggers dans PostgreSQL.
4. Exécuter des tests transactionnels avec entreprise/utilisateurs/articles/entrepôts fictifs, concurrence, idempotence, FIFO, CUMP, transfert, réservation, contrepassation et rollback/nettoyage.
5. Exécuter Supabase Security et Performance Advisors.
6. Raccorder le frontend cloud, puis tester deux sessions distinctes (admin/comptable/reader) avant de rendre la PR fusionnable.

## Sécurité

Aucune migration n'a été appliquée, aucune donnée DEV n'a été modifiée, aucun déploiement Preview/Production n'a été effectué et aucune PR n'a été fusionnée.
