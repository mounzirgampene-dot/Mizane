# Académie MIZANE — tranche locale bilingue

## Livraison

Cette tranche ajoute une première Académie pédagogique utilisable sans connexion réseau et sans fournisseur d'IA.

- Dix parcours initiaux : initiation, configuration d'entreprise, comptabilité générale, gestion commerciale, stocks, trésorerie, comptabilité analytique, pilotage financier, IA responsable, documents et justificatifs.
- Trois leçons bilingues français/arabe par parcours.
- Deux questions d'évaluation par parcours, avec correction et explication.
- Suivi des leçons et résultats, tableau de progression et réinitialisation explicite.
- Interface adaptée à l'arabe (RTL) et au français.
- Contenu embarqué et mis en cache par le service worker.
- Aucun accès aux données comptables, aucun appel réseau et aucun appel IA.

## Cloisonnement de la progression

La progression est enregistrée uniquement dans le stockage local du navigateur. La clé est distincte selon l'utilisateur actif et l'entreprise active ; en mode local, un espace local est utilisé. Les données de progression ne sont pas envoyées au cloud et ne sont pas synchronisées entre appareils.

Le contenu pédagogique est générique. Les exercices ne créent, ne modifient et ne valident aucune opération métier.

## Limites assumées

Cette livraison ne constitue pas encore :
- une Académie cloud avec synchronisation multi-appareils ;
- un système d'attestations ou de formation collective ;
- un éditeur de contenu collaboratif et son workflow de validation ;
- un moteur de démonstrations interactives connecté à des environnements d'exercice isolés ;
- un assistant IA.

Ces fonctions dépendent des fondations documentaires de la PR #170 et, pour les fonctions cloud, des tests RLS réels après application contrôlée de la migration sur MIZANE-DEV. Aucun schéma Supabase n'est modifié par cette tranche.

## Vérifications attendues

La suite automatisée contrôle les dix parcours, la présence des contenus FR/AR, les leçons et quiz, la validation des réponses, la normalisation des données et le cloisonnement par utilisateur et entreprise.
