# Boussole MIZANE — feuille de livraison consolidée

Date de référence : 27 novembre 2026. Périmètre : branche DEV `feat/stock-integrated-dev`, PR #170 et PR #171.

## 1. Éléments livrés dans les branches de développement

| Domaine | État | Périmètre réellement disponible |
|---|---|---|
| Guide contextuel | Réalisé dans PR #171 | Panneau latéral, 16 articles FR/AR, aide selon la rubrique, recherche locale multiterme. |
| Recherche linguistique | Réalisé dans PR #171 | Normalisation FR/AR, accents, variantes arabes, diacritiques et tatweel. |
| Académie locale | Réalisé dans PR #171 | 10 parcours, 30 leçons, 20 questions, corrections bilingues, progression locale par utilisateur et entreprise. |
| Fonctionnement hors connexion | Réalisé pour les contenus embarqués | Précache du guide et de l'Académie ; aucun service distant nécessaire pour ces contenus. |
| Fondations documentaires | Migration proposée dans PR #170 | Six tables, versions FR/AR, relations, synonymes, préférences et événements de consentement. |
| Revue du helper d'appartenance | Réalisée | Vérification en lecture seule de `private.is_active_company_member(uuid)` et de ses droits. |

Les deux PR restent indépendantes et en brouillon. La PR #171 ne dépend pas de l'application de la migration de la PR #170.

## 2. Conditions bloquantes avant le cloud documentaire

La migration de la PR #170 n'est pas appliquée à MIZANE-DEV. Les tables n'existent donc pas encore dans la base et les politiques RLS ne peuvent pas être considérées comme validées en fonctionnement.

Avant application, il faut disposer de comptes de test Auth dédiés et de deux entreprises de test isolées, puis exécuter la matrice suivante après installation sur DEV :

1. `anon` lit uniquement les documents globaux publiés, leurs versions et relations globales publiées, ainsi que les synonymes actifs.
2. `anon` ne lit aucun brouillon ni document d'entreprise.
3. Un membre actif lit les documents publiés de son entreprise et les documents globaux.
4. Un membre révoqué et un utilisateur d'une autre entreprise ne lisent aucun document privé de cette entreprise.
5. Les versions et relations ne révèlent jamais un document non lisible.
6. Un utilisateur lit et modifie uniquement ses propres préférences.
7. Un utilisateur peut enregistrer un consentement uniquement pour son propre compte.
8. UPDATE et DELETE des événements de consentement sont refusés.
9. Les rôles sans privilèges d'édition ne peuvent créer, modifier, approuver ou publier des documents.
10. Les accès directs et RPC sont vérifiés avec les rôles PostgreSQL réels, pas seulement avec le rôle propriétaire.

La revue du helper privé ne remplace pas ces tests. Aucun compte Auth réel ne doit être utilisé comme compte de test.

## 3. Lots fonctionnels restant à développer après validation RLS

### 3.1 Moteur documentaire cloud
- Chargement paginé des documents et versions publiés.
- Recherche combinant texte, synonymes et métadonnées de rubrique.
- Filtrage par langue, version MIZANE, statut de publication et périmètre d'entreprise.
- Fallback local complet lorsque le réseau ou le cloud est indisponible.
- Liens entre prérequis, parcours suivants, dépannage et contenus associés.

### 3.2 Administration éditoriale
- Éditeur de contenu FR/AR et aperçu RTL.
- Brouillon, soumission en relecture, vérification, approbation, publication, archivage et restauration.
- Rôles séparés et vérifications serveur à chaque transition.
- Historique de versions, auteur, vérificateur, approbateur, date et sources.
- Aucun droit d'édition accordé directement au client sans autorisation serveur.

### 3.3 Progression Académie cloud
- Synchronisation de la progression après authentification.
- Résolution explicite des conflits entre appareils.
- Reprise hors connexion et synchronisation idempotente.
- Attestations internes non diplômantes uniquement après validation des règles de preuve et d'identité.
- Formation collective et supervision sans divulgation des conversations privées.

### 3.4 Assistant documentaire et IA
- Recherche documentaire sans IA toujours disponible.
- Consentement IA distinct, versionné, révocable et vérifié côté serveur.
- Aucun envoi automatique de données comptables.
- Accès ponctuel aux données métier uniquement sur autorisation explicite, limitée et en lecture seule.
- Défense contre prompt injection, minimisation, journalisation protégée et contrôle des fournisseurs.
- Audit de la fonction `company-ai` avant toute réutilisation ; elle n'est pas considérée comme un backend Boussole prêt à l'emploi.

### 3.5 Médias et démonstrations
- Captures annotées, vidéos et ressources téléchargeables.
- Démonstrations interactives dans un bac à sable fictif et isolé.
- Vérification des droits d'accès et du cache hors connexion.
- Aucun exercice pédagogique ne doit modifier les données métier réelles.

## 4. Conditions de sortie

Une fonction cloud ne peut être déclarée livrée qu'après :
- migration appliquée sur MIZANE-DEV seulement ;
- tests RLS sous `anon` et `authenticated` avec comptes dédiés ;
- tests d'isolation multi-entreprises et de révocation ;
- tests de permissions des RPC et fonctions Edge ;
- CI complète et Preview du commit exact ;
- contrôle des advisors Supabase après changement de schéma ;
- documentation des limites et procédure de retour arrière.

Aucune fusion dans `main`, aucun déploiement GitHub Pages Production et aucune migration Supabase Production ne font partie de cette feuille de livraison.
