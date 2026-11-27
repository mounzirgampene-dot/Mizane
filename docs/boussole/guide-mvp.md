# Boussole MIZANE — première interface du guide local

## Périmètre livré

Un panneau latéral accessible depuis la barre supérieure fournit une recherche locale, des articles d'aide en français et en arabe, ainsi qu'une sélection contextuelle selon la rubrique MIZANE ouverte.

Le contenu est embarqué dans le module JavaScript, ajouté au précache du service worker et consultable hors connexion après un premier chargement réussi.

## Sécurité et limites

- Le guide ne lit aucune écriture, aucun solde, aucune facture et aucune donnée d'entreprise.
- Il n'appelle aucun fournisseur IA et n'envoie aucun texte à un service externe.
- Il n'exécute aucune opération métier.
- La recherche est locale et porte uniquement sur les articles intégrés.
- Il s'agit d'une première base d'aide, pas encore du guide exhaustif, des médias, des démonstrations interactives ni de l'Académie prévus.

## Couverture initiale\n\nLe guide couvre désormais la prise en main, les paramètres, la saisie, les états, les tiers, la facturation et les achats, les stocks, la fiscalité, les périodes, les outils, les notifications, les travaux, la synchronisation, les exports et la confidentialité. La recherche accepte plusieurs termes et normalise les variantes courantes du français et de l’arabe.\n\n## Vérifications

Le test `tests/boussole-ui.test.js` vérifie l'intégration du panneau, la présence des contenus FR/AR et le précache du module. Les tests complets et le déploiement Cloudflare Preview restent requis.
