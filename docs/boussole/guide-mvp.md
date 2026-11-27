# Boussole MIZANE — guide local et recherche documentaire cloud

## Périmètre livré

Le panneau accessible depuis la barre supérieure fournit une recherche locale, des articles d'aide en français et en arabe, une aide contextuelle selon la rubrique ouverte et un mode plein écran. Les contenus embarqués restent disponibles hors connexion après mise en cache.

Lorsque la connexion est disponible, une recherche de deux caractères ou plus interroge également les documents publiés dans MIZANE Cloud. Les résultats distants sont filtrés par langue et par espace actif ; les politiques RLS Supabase restent l'autorité pour les documents globaux et ceux de l'entreprise. Les versions et synonymes publiés sont lus en lecture seule.

## Fonctionnement et sécurité

- La recherche locale fonctionne sans réseau et reste affichée si le cloud est indisponible.
- La recherche cloud utilise uniquement la clé publishable destinée au navigateur ; aucune clé secrète ou service_role n'est exposée.
- Le texte de recherche et l'identifiant de l'espace actif sont transmis au projet Supabase MIZANE pour filtrer les documents publiés.
- Le client n'effectue aucune insertion, modification, suppression ou RPC sur les tables documentaires.
- Aucune écriture, facture, balance, donnée comptable ou fiscale n'est lue.
- Aucun appel IA n'est effectué.
- Le contenu Markdown distant est affiché comme texte, jamais interprété comme HTML.
- Les documents d'entreprise restent filtrés par RLS et par l'espace actif sélectionné.
- En cas d'absence de connexion, d'erreur ou d'absence de document publié dans la langue demandée, le guide local reste utilisable.

## Limites restantes

Cette tranche fournit la lecture documentaire. Elle ne fournit pas encore l'éditeur, les workflows de relecture/approbation/publication, les médias, les démonstrations interactives, la synchronisation cloud de l'Académie ou l'assistant IA. Ces fonctions nécessitent des contrôles serveur et des lots séparés.

## Vérifications

- Tests de normalisation et d'expansion des synonymes FR/AR.
- Tests statiques vérifiant la lecture des seules tables Boussole et l'absence d'écritures/RPC dans le client.
- Vérification du précache du module cloud et de la configuration publique.
- Exécution de la suite complète et validation Cloudflare Preview requises sur le commit final.
