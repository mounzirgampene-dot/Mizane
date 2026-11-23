# Gestion de stock MIZANE — moteur transactionnel

## État des migrations

Les migrations de stock sont appliquées sur Supabase **DEV uniquement**. Les versions du dépôt correspondent à l'historique distant :

- `20261123085959_stock_server_engine.sql`
- `20261123090112_stock_foreign_key_indexes.sql`
- `20261123090659_stock_traceability_and_units.sql`
- `20261123090728_fix_stock_lot_balance_decrease.sql`
- `20261123090856_stock_serial_guards_and_indexes.sql`
- `20261123091005_normalize_stock_serial_inputs.sql`

Aucune de ces migrations n'a été exécutée sur Production.

## Architecture et sécurité

- Tables dédiées par entreprise : articles, entrepôts, documents, lignes, mouvements, soldes, couches de valorisation, allocations FIFO, réservations, lots, soldes par lot, numéros de série, conversions d'unités et audit.
- RLS activée et forcée sur les tables publiques du stock ; lecture limitée aux membres actifs de l'entreprise ; aucune écriture directe du navigateur dans les tables.
- RPC publiques en `SECURITY INVOKER`, implémentations privilégiées dans le schéma privé non exposé. Les écritures vérifient l'identité et le rôle actif `admin` ou `accountant`.
- Verrou transactionnel par entreprise, empreinte de requête liée à `operation_uid`, contrôles côté serveur et audit.
- Journal des mouvements, allocations FIFO et journal d'audit protégés contre les modifications et suppressions ordinaires.
- Les services restent facturables mais ne peuvent pas recevoir de mouvements physiques.
- Le stock négatif reste désactivé par défaut ; FIFO, lots et numéros de série exigent des quantités réellement disponibles.

## Fonctionnalités désormais livrées

### Module Achats

- Navigation dédiée « Achats », réservée aux rôles administrateur et comptable.
- Référentiel de fournisseurs : raison sociale, code, identifiant fiscal, téléphone, e-mail et adresse.
- Commandes fournisseurs et factures fournisseurs distinctes, avec numérotation, devise, articles physiques, entrepôt, unité, quantité et coût.
- Rapprochement commande/facture : même fournisseur, articles compatibles, quantités facturées plafonnées à la commande, prix contrôlés et contrôle des quantités physiquement reçues lorsque le déclencheur est « réception ».
- Réceptions partielles depuis les commandes, reliquats calculés par ligne et traçabilité des lots/numéros de série.
- Le paramètre `purchase_trigger` pilote l'entrée : à la réception physique ou à la validation de facture fournisseur. Les mouvements sont inscrits dans le moteur de stock serveur, avec origine `supplier_receipt` ou `supplier_invoice`.
- Les fournisseurs et documents sont conservés dans l'espace de facturation synchronisé par version ; les écritures de stock restent séparées dans le journal transactionnel dédié. Ce lot ne génère pas encore les écritures comptables fournisseurs ni les paiements/avoirs.
- Les appels de réception conservent leur `operation_uid` avant envoi et peuvent être rejoués sans doublon après une erreur réseau.

### Traçabilité par lot

- Un article configuré en suivi par lot exige un code de lot pour chaque entrée, sortie, transfert ou ajustement.
- Le serveur conserve le référentiel des lots et les quantités par entrepôt.
- Une sortie ne peut pas dépasser le solde du lot sélectionné, même si le stock global de l'article est suffisant.
- Un transfert débite et crédite le même lot dans la même transaction.

### Traçabilité par numéro de série

- Un article sérialisé exige une quantité entière et exactement un numéro par unité.
- Les numéros sont normalisés, uniques à l'échelle de l'entreprise et rattachés à un article.
- Le serveur suit les états en stock, en transit et sortis, ainsi que l'entrepôt courant.
- Une sortie ou un transfert ne peut utiliser qu'un numéro effectivement présent dans l'entrepôt source.
- Les articles sérialisés utilisent uniquement leur unité de base ; les conversions sont refusées pour ce mode de suivi.

### Conversions d'unités

- Chaque article possède une unité de base et peut définir jusqu'à 50 unités alternatives.
- Le facteur exprime le nombre d'unités de base dans une unité alternative : par exemple 1 carton = 12 pièces.
- Le serveur convertit la quantité saisie vers l'unité de base et ramène le coût unitaire à cette même base avant valorisation.
- Les documents conservent la quantité saisie, l'unité et le facteur appliqué pour l'audit.
- Les conversions et l'unité de base ne peuvent plus être modifiées après le premier mouvement, afin de préserver l'interprétation historique.


### Raccordement des ventes et livraisons

- Les lignes de facture client peuvent être liées à un article physique, un entrepôt et une unité de stock.
- Les conversions d'unités, les lots et les numéros de série sont transmis au moteur serveur lors de la sortie.
- Avec le déclenchement `invoice_validation`, la validation de la facture génère une sortie de stock idempotente.
- Avec le déclenchement `delivery`, l'utilisateur confirme les livraisons depuis la facture ; les livraisons partielles ne consomment que les quantités saisies et le reliquat reste livrable.
- Les opérations utilisent un `operation_uid` conservé avant l'appel serveur. En cas de délai réseau ou d'échec, la facture affiche une action de reprise ; la répétition utilise le même identifiant et le même contenu.
- Les sorties conservent l'origine `sales_invoice` ou `sales_delivery` et la référence de facture. Les factures ayant déjà généré une sortie ne peuvent plus être modifiées depuis l'éditeur standard.

### Raccordement des réceptions fournisseurs

- Les réceptions physiques peuvent enregistrer le nom du fournisseur, la référence du bon de livraison ou de la facture et une origine `supplier_receipt`.
- Ces informations sont conservées dans le document et affichées dans l'historique des mouvements.
- Le module Achats et les factures fournisseurs ne sont pas encore présents. Le paramètre `purchase_trigger=supplier_invoice` est donc conservé comme configuration, mais il ne déclenche pas encore automatiquement une entrée ; la réception physique reste une opération explicite.

## Valorisation et mouvements

- CUMP et FIFO restent pris en charge ; les transferts préservent la valeur totale de l'entreprise.
- Les couches et allocations FIFO sont enregistrées côté serveur.
- Les réservations réduisent la quantité disponible pour les sorties.
- Les déclencheurs achat/vente et le mode permanent/périodique restent paramétrables, mais les flux Achats, Facturation et Livraisons ne sont pas encore raccordés.
- La contrepassation reste volontairement bloquée tant que la restauration exacte des couches et allocations CUMP/FIFO n'est pas livrée.
- Aucun compte CGNC n'est codé en dur et aucune écriture comptable automatique n'est générée.

## Validation sur DEV

Les tests PostgreSQL ont été exécutés avec un membre administrateur de l'entreprise fictive de test, dans des transactions annulées par `ROLLBACK` :

1. Création d'articles avec suivi lot et série, entrepôts et conversion carton/pièce.
2. Réception de 2 cartons de 12 pièces à 1 200 MAD le carton, puis sortie d'un carton : quantité convertie de 24 à 12 pièces et valeur de 2 400 à 1 200 MAD.
3. Contrôle du solde d'un lot ; une sortie supérieure au lot disponible est refusée.
4. Réception de deux numéros de série, sortie du premier et transfert du second vers un autre entrepôt.
5. Réutilisation d'un numéro encore en stock, unité inconnue et dépassement de lot refusés.
6. Contrôle après rollback : aucun article, entrepôt, lot ou numéro de série de test résiduel.

Les tests Node couvrent également les conversions, les soldes par lot, les mouvements sérialisés et l'atomicité des refus. Sur le dernier commit contrôlé de la PR : ESLint est réussi et les **97 tests fonctionnels/résilience passent, sans échec**. Le déploiement Cloudflare Pages Preview du commit de tête s'est terminé avec le statut `success`.

## Limites restantes

1. Module Achats complet : fournisseurs, commandes, factures fournisseurs, rapprochement commande/réception/facture et déclenchement automatique selon le paramètre d'achat.
2. Consommation automatique des réservations lors des livraisons ; le flux de livraison actuel contrôle le stock disponible mais ne consomme pas encore les réservations actives.
3. Workflow d'inventaire physique guidé, avec comptage, gel, rapprochement et validation.
4. Contrepassation exacte et auditée pour CUMP/FIFO.
5. Génération des écritures comptables après validation du plan comptable de chaque entreprise et des règles CGNC.
6. Tests de concurrence multi-session et parcours navigateur authentifié complet.

## Environnement et statut

- PR #68 : ouverte, maintenue en brouillon.
- Branche : `feat/stock-integrated-dev`.
- Aperçu Cloudflare : [feat-stock-integrated-dev.mizane-test-preview.pages.dev](https://feat-stock-integrated-dev.mizane-test-preview.pages.dev), déploiement Preview confirmé réussi sur le commit de tête contrôlé.
- Supabase DEV : migrations appliquées et scénarios de test rollbackés.
- Cloudflare : Preview uniquement.
- Production : non touchée ; aucune fusion dans `main` ni aucun déploiement Production.
