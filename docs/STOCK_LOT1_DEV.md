# MIZANE — Historique du lot 1 Gestion de stock

> Ce document décrit le prototype initial. Il est conservé pour l'historique, mais ses limites de stockage et de synchronisation ont été corrigées par le moteur serveur transactionnel documenté dans [STOCK_SERVER_ENGINE.md](./STOCK_SERVER_ENGINE.md).

## Contenu initial

- Navigation dédiée Gestion de stock.
- Référentiel des articles physiques et services.
- Plusieurs entrepôts.
- Entrées, sorties et transferts.
- Contrôle du stock négatif désactivé par défaut.
- Valorisation locale CUMP/FIFO.
- Tests de régression du moteur local.

## Évolution depuis le prototype

Le mode entreprise SaaS n'utilise plus le JSONB de facturation pour écrire le stock. Il lit désormais les soldes depuis les tables dédiées et passe par des RPC transactionnelles protégées par les rôles d'entreprise. La synchronisation de facturation ne pousse plus le champ stock.

Le mode local hors entreprise conserve le moteur historique pour la démonstration et la préparation. Il ne doit pas être confondu avec les données cloud de l'entreprise.

L'import de l'ancien stock local vers le nouveau moteur cloud est explicite, non destructif et idempotent. Il n'est jamais lancé automatiquement.

## Limites toujours ouvertes

1. Lots et numéros de série non activés ; seuls les articles avec tracking=none sont acceptés par le RPC.
2. Conversions d'unités non activées ; seule l'unité de base est prise en charge.
3. Achats, réceptions fournisseurs, commandes et livraisons partielles non raccordés aux flux métier.
4. Réservations créées et libérées, mais pas consommées automatiquement par une livraison.
5. Contrepassation automatique bloquée jusqu'à la restauration exacte des valorisations CUMP/FIFO.
6. Inventaires physiques guidés, comptabilisation automatique et règles CGNC non activés.
7. Le changement de méthode CUMP/FIFO est verrouillé après le premier mouvement.

## État de validation

- PR : [#68 — Gestion de stock](https://github.com/mounzirgampene-dot/Mizane/pull/68), maintenue en brouillon.
- ESLint et tests Node : réussis sur la dernière révision contrôlée.
- Migration SQL : préparée dans la branche, non appliquée à Supabase DEV.
- Aucun déploiement Preview ou Production effectué.
- Aucune donnée DEV ou Production modifiée.
