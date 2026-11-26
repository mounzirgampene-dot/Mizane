# MIZANE — Réapprovisionnement et alertes de stock

## Périmètre

Ce module ajoute un pilotage de réapprovisionnement fondé sur les soldes transactionnels du stock et les réservations actives. Il ne crée aucune commande fournisseur et ne génère aucun mouvement de stock automatiquement.

## Seuils par article

Chaque article physique peut recevoir deux quantités exprimées dans son unité de base :

- **Seuil minimum** : niveau à partir duquel une alerte est déclenchée.
- **Stock cible** : niveau souhaité après réapprovisionnement, obligatoirement supérieur ou égal au seuil minimum.

Les seuils sont globaux à l'article, tous entrepôts confondus. Les services sont exclus.

Les valeurs sont enregistrées dans `stock_products.minimum_stock` et `stock_products.target_stock`. En mode entreprise, leur modification passe par la RPC `stock_update_reorder_thresholds`, qui vérifie l'identité, le rôle actif administrateur/comptable, les limites numériques et l'appartenance de l'article à l'entreprise. Chaque changement est ajouté au journal d'audit.

## Calcul du disponible

Pour chaque article surveillé :

`Disponible = Stock physique total - Réservations actives`

Une réservation libérée ou consommée n'est pas déduite. Les devises ne sont pas concernées et les quantités de produits ayant des unités différentes ne sont jamais additionnées dans un total global.

## Alertes et suggestion

- **Rupture** : le disponible est nul ou négatif.
- **Sous le seuil** : le disponible est positif mais inférieur ou égal au seuil minimum.
- **Disponibilité incohérente** : les réservations dépassent le stock physique, ce qui doit être examiné avant toute commande.

Lorsque l'article est sous seuil, la suggestion est :

`Quantité suggérée = Stock cible - Disponible`

La suggestion est indicative. Elle ne tient pas lieu de commande d'achat et ne modifie pas les réservations ni les soldes.

## Interface et export

La page Gestion de stock affiche les articles surveillés, les ruptures, les alertes, le stock physique, les quantités réservées, le disponible, les seuils et la quantité suggérée. Les administrateurs et comptables peuvent modifier les seuils. Les autres utilisateurs conservent une consultation en lecture seule selon leurs droits existants.

Un export CSV du rapport est disponible, y compris en lecture seule.

## Sécurité et compatibilité

- Migration additive : les articles existants reçoivent des seuils à zéro et ne déclenchent donc pas d'alerte avant configuration.
- Aucune écriture directe depuis le navigateur dans les tables Supabase.
- Aucune modification des mouvements, valorisations CUMP/FIFO, réservations ou écritures comptables.
- Les seuils locaux hors entreprise restent enregistrés dans le profil local.
- La migration ne doit être appliquée que sur MIZANE-DEV. Production reste exclue.


## Brouillons de commandes fournisseurs

Les alertes peuvent alimenter le formulaire Achats existant pour préparer un brouillon de commande fournisseur. Le calcul déduit les quantités non encore reçues des commandes déjà ouvertes, y compris les brouillons, afin de limiter les doublons. Les commandes annulées et les factures ne sont pas considérées comme des commandes ouvertes.

Chaque ligne est proposée dans l'unité de base de l'article. L'entrepôt suggéré est celui dont la disponibilité est la plus faible parmi les entrepôts actifs ; l'utilisateur peut le modifier. Le fournisseur n'est jamais choisi automatiquement et le coût unitaire reste à renseigner. Les services et les entrepôts inactifs sont exclus.

Le document est enregistré au statut « Brouillon » et reste sans effet sur le stock. L'utilisateur doit ouvrir le document dans Achats puis cliquer sur « Confirmer la commande » pour le faire passer au statut « Commandée ». Cette confirmation ne transmet pas la commande au fournisseur ; elle autorise seulement le suivi des réceptions dans MIZANE. Aucun mouvement de stock, paiement, facture ou engagement externe n'est généré par la préparation du brouillon.
