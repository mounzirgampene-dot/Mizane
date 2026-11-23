# MIZANE — Lot 1 Gestion de stock (DEV)

## Contenu livré

- Navigation dédiée « Gestion de stock », masquée aux comptes Reader comme les autres fonctions d'écriture.
- Référentiel des articles : marchandises, matières premières, semi-finis, produits finis, consommables et services.
- Gestion de plusieurs entrepôts.
- Journal de mouvements : entrées, sorties et transferts.
- Contrôle du stock disponible ; stock négatif désactivé par défaut et activation réservée à l'administrateur.
- Valorisation par CUMP ou FIFO, avec couches de réception et consommation de couches.
- Validation des références uniques, quantités, dates, entrepôts et interdiction des mouvements physiques sur les services.
- Synchronisation cloud du bloc stock par le mécanisme de versionnement de la facturation existant (table company_billing / RPC sync_company_billing). Le contrôle de rôle et la détection de conflit existants sont réutilisés.
- Tests de régression ajoutés au runner du dépôt.

## Limites connues — ne pas confondre ce lot avec la livraison finale

1. Les données stock sont actuellement embarquées dans le JSONB de facturation pour réutiliser le canal cloud existant. Ce choix accélère le prototype mais n'est pas la cible de l'architecture : un volume élevé peut atteindre la limite de taille de synchronisation.
2. Les opérations sont calculées côté navigateur avant synchronisation. Ce lot ne fournit pas encore de RPC transactionnelle dédiée au stock ; les opérations simultanées multi-appareils sont protégées par le mécanisme de conflit global, mais le serveur ne recalcule pas les soldes.
3. Les achats fournisseurs, réceptions partielles, commandes clients, livraisons partielles et liaison article/facture ne sont pas encore raccordés.
4. La génération automatique des écritures comptables et les comptes de stock/variation doivent être configurés à partir du plan comptable réel de chaque entreprise. Aucune règle CGNC n'est codée en dur.
5. La traçabilité par lot et numéro de série est visible comme fonctionnalité future, mais les choix sont désactivés dans l'interface jusqu'à l'implémentation complète.
6. Les inventaires physiques, écarts, contrepassations de mouvements et réservations ne sont pas encore livrés.
7. Le changement de méthode CUMP/FIFO n'est pas encore protégé par une procédure de bascule et de recalcul historique ; il doit être effectué avant le démarrage des mouvements réels.

## Vérifications à effectuer sur Preview

- Créer deux entrepôts et plusieurs articles.
- Réceptionner des quantités à coûts différents ; vérifier la valorisation CUMP.
- Basculer sur FIFO avant de créer les mouvements de test, puis vérifier les sorties.
- Transférer une partie du stock ; le total entreprise doit rester inchangé.
- Tenter une sortie supérieure au disponible ; elle doit être refusée si le stock négatif est désactivé.
- Vérifier le rôle Reader : navigation et actions de stock absentes.
- Synchroniser deux sessions ; vérifier le pull cloud et le message de conflit lors de modifications simultanées.

## Sécurité et déploiement

- Branche : `feat/stock-integrated-dev`.
- Cible de revue : `main`, via une Pull Request en brouillon.
- Aucun SQL n'a été exécuté.
- Aucune migration ni Edge Function n'a été déployée.
- Aucun changement Production.
