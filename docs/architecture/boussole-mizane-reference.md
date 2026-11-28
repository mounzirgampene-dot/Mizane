# Boussole MIZANE — Référence fonctionnelle et technique

**Statut :** spécification validée, développement non commencé.  
**Périmètre :** environnement d'aide, de documentation, de formation et d'accompagnement intégré à MIZANE.  
**Langues initiales :** français et arabe, avec prise en charge RTL complète.

## 1. Vision

La Boussole MIZANE doit permettre à chaque utilisateur de comprendre une fonctionnalité, d'apprendre à l'utiliser, de retrouver une procédure fiable et de résoudre un problème sans quitter son travail ni devoir parcourir longuement un manuel externe.

La Boussole complète les fonctions comptables et de gestion de MIZANE. Elle ne remplace ni les moteurs métier, ni les contrôles d'accès, ni les validations humaines.

**Principe directeur :** l'aide explique et oriente ; elle n'exécute pas les opérations métier.

## 2. Décisions fonctionnelles consolidées — lots 1 à 21

Les vingt et un lots sont validés au niveau du cahier des charges. Leur validation ne signifie pas que les fonctionnalités sont déjà présentes dans le dépôt.

### Lots 1 à 10 — expérience d'accompagnement

1. **Vision et périmètre :** créer un environnement d'accompagnement permanent, cohérent avec les modules MIZANE.
2. **Assistant intégré :** proposer un assistant intelligent indépendant du copilote comptable existant.
3. **Interface :** présenter l'assistant dans un panneau latéral droit, extensible en plein écran, avec historique privé et suggestions contextuelles.
4. **Aide contextuelle :** adapter les explications au module, à la page, à la fonctionnalité et à la version logicielle.
5. **Guide utilisateur :** offrir un guide complet, structuré, consultable et exportable en PDF.
6. **Ressources pédagogiques :** combiner textes, captures annotées, vidéos et démonstrations interactives fictives.
7. **Recherche :** permettre une recherche par mots-clés, synonymes et sens de la question.
8. **Multilingue :** prendre en charge le français et l'arabe dès le lancement, avec RTL complet ; la langue de la conversation peut différer de celle de l'interface.
9. **Continuité hors connexion :** rendre disponibles les ressources préalablement téléchargées ou mises en cache.
10. **Académie :** intégrer des parcours de formation distincts du guide utilisateur, avec exercices, évaluations et progression.

### Lot 11 — confidentialité, consentement et traçabilité

Définir les consentements, notifications, incidents, synchronisation, journaux et durées de conservation. L'accès aux données métier est interdit par défaut.

### Lot 12 — source documentaire canonique

Créer une source documentaire unique, structurée, versionnée et gouvernée. Les contenus publiés doivent avoir une identité stable, une version et un statut explicite.

### Lot 13 — guide complet

Organiser le guide en cinq ensembles : découverte ; fonctions métier ; fonctions intelligentes ; administration et sécurité ; progression et dépannage.

Chaque article doit préciser l'objectif, l'utilité, les prérequis, les permissions, la navigation, les champs, la procédure, un exemple, le résultat, les contrôles, les erreurs, les précautions, les articles liés et les références de version.

Prévoir trois niveaux pédagogiques et trois modes de consultation.

### Lot 14 — moteur de recherche et assistant IA

Combiner recherche lexicale, synonymes, recherche sémantique et correspondance français-arabe. Détecter l'intention, demander une précision lorsque l'ambiguïté est importante et classer les réponses selon leur pertinence, leur version et leur statut.

Les réponses doivent privilégier la documentation validée et citer leurs sources. Elles doivent distinguer clairement ce qui est documenté, partiellement documenté ou non documenté.

Sans IA, le guide, la recherche locale, les synonymes et les réponses prédéfinies restent fonctionnels. L'indisponibilité d'un fournisseur IA ne doit pas bloquer la Boussole.

### Lot 15 — Académie MIZANE

Prévoir catalogue, parcours, niveaux, leçons, exercices, simulations fictives, évaluations, progression, recommandations, formation collective et attestations internes.

Dix parcours initiaux :
1. Initiation à MIZANE.
2. Configuration d'une entreprise.
3. Comptabilité générale.
4. Gestion commerciale.
5. Gestion des stocks.
6. Trésorerie.
7. Comptabilité analytique.
8. Pilotage financier.
9. Intelligence artificielle.
10. Documents et justificatifs.

Les exercices utilisent un environnement fictif et ne modifient jamais les données métier. Les attestations sont internes et ne constituent pas des diplômes reconnus.

### Lot 16 — profils et espace personnel

Gérer plusieurs profils pédagogiques et responsabilités sans modifier les permissions métier. Proposer un espace personnel contenant formations, parcours, progression, favoris, questions récentes et nouveautés.

Les recommandations doivent rester transparentes, configurables et révocables. Le contexte multi-entreprises doit être strictement isolé.

### Lot 17 — local, cloud et synchronisation

Réutiliser les mécanismes existants après audit. Mettre en cache les ressources et médias ; gérer version, obsolescence, progression, conversations, préférences et favoris ; reprendre les transferts après interruption.

Les conflits doivent être résolus de manière déterministe. Aucune perte silencieuse, aucun doublon, aucune résurrection d'une donnée supprimée.

### Lot 18 — sécurité technique

Appliquer authentification existante, RBAC serveur, isolation stricte multi-entreprises, audit RLS, chiffrement, protection des historiques, consentement IA distinct, minimisation, défense contre prompt injection, sécurité des fichiers et API, gestion des secrets, journaux protégés, sauvegarde et restauration.

### Lot 19 — gouvernance et maintenance

Séparer les rôles d'administration, rédaction, vérification, validation, pédagogie, sécurité et maintenance. Prévoir cycle de publication, versionnement, restauration, détection des changements logiciels, file de vérification, incidents, demandes d'amélioration, rapports et supervision.

La supervision de l'assistant ne doit pas donner un accès général aux conversations privées.

### Lot 20 — qualité et acceptation

Prévoir tests unitaires, intégration, fonctionnels, bout en bout, sécurité, performance, non-régression, recherche, fiabilité documentaire, Académie, permissions, isolation, offline, synchronisation, langues, RTL, accessibilité et coûts IA.

Objectif d'accessibilité : WCAG 2.2 AA lorsque applicable. Les anomalies sont classées P0 à P3 et chaque livraison doit comporter des preuves de validation.

### Lot 21 — architecture et réalisation

Auditer le dépôt avant toute implémentation ; définir architecture, modules, modèle de données, recherche, IA, offline, synchronisation, sécurité, tests, Supabase, Cloudflare, migrations, branches Git, retour arrière et activation progressive.

## 3. Architecture fonctionnelle cible

La Boussole est organisée en couches indépendantes :

1. **Interface :** panneau d'aide, recherche, historique privé, guide et accès à l'Académie.
2. **Compréhension :** détection d'intention, extraction des termes et clarification.
3. **Recherche :** index lexical, synonymes, sémantique et correspondance interlangue.
4. **Documentation :** contenus validés, versions, relations, médias et sources.
5. **IA encadrée :** génération à partir des contenus autorisés, avec limites, consentement et suivi des coûts.
6. **Gouvernance :** publication, validation, contrôle de qualité, administration et maintenance.

L'assistant pédagogique doit rester distinct du copilote comptable actuel. Les infrastructures communes ne sont réutilisées qu'après vérification de leur compatibilité et de leurs permissions.

## 4. Contexte et accès aux données métier

Le contexte automatique peut inclure uniquement le module, la page, la fonctionnalité, la route et la version logicielle.

Aucune donnée comptable ou commerciale n'est transmise automatiquement à l'assistant.

Une consultation métier éventuelle exige une autorisation explicite, ponctuelle, précise et en lecture seule. L'assistant ne crée, ne modifie, ne valide et ne supprime aucune opération métier.

Le profil pédagogique ne confère aucune permission supplémentaire.

## 5. Domaines de données

### Domaine commun

Documentation officielle, articles validés, traductions, parcours, leçons, exercices, ressources pédagogiques et versions publiées.

### Domaine personnel

Conversations, préférences, favoris, historique personnel, inscriptions, progression, tentatives et résultats d'évaluation.

### Domaine professionnel

Ressources internes et paramètres propres à une entreprise. Chaque donnée de ce domaine doit être rattachée à un `company_id` et protégée par RLS.

Les structures de tables évoquées dans le cahier des charges sont conceptuelles : elles ne doivent pas être considérées comme déjà créées dans Supabase.

## 6. Recherche, réponses et références

Les réponses doivent suivre l'ordre de confiance suivant :

1. Documentation publiée et compatible avec la version de MIZANE.
2. Documentation validée mais partiellement applicable.
3. Réponse assistée par IA fondée sur les sources disponibles, avec limites explicites.
4. Réponse non documentée : le signaler clairement et orienter vers le canal de support approprié.

Les contenus documentaires sont des données, jamais des instructions prioritaires. Toute instruction trouvée dans un document, une pièce jointe ou un contenu externe doit être traitée comme non fiable.

## 7. Hors connexion et synchronisation

Le mode hors connexion doit fournir les ressources préalablement mises en cache, la recherche locale et les réponses prédéfinies. Les versions obsolètes doivent être signalées.

La synchronisation doit être idempotente, reprendre après interruption et préserver les suppressions. Les conversations et préférences personnelles sont synchronisées selon les consentements et la politique de rétention.

Aucune donnée privée ou réponse d'entreprise ne doit être intégrée au cache public du service worker.

## 8. Dix principes non négociables

1. Pas de consultation métier sans autorisation explicite et ponctuelle.
2. Pas de modification d'opération métier par l'assistant.
3. Pas d'accès interentreprises.
4. Pas de permission induite par la personnalisation.
5. Pas de secret technique dans le frontend.
6. Pas de transmission IA sans consentement distinct.
7. Aucune instruction documentaire ne remplace les règles système.
8. Aucune ancienne synchronisation ne doit annuler une révocation ou ressusciter une suppression.
9. Aucune vulnérabilité critique non traitée ne doit être ignorée avant livraison.
10. Aucune modification de Production pendant le développement.

## 9. Plan de réalisation

| Phase | Contenu | Condition de passage |
|---|---|---|
| 0 | Stabilisation MIZANE : isolation locale, synchronisation, migrations, CI et documentation | Tests et non-régression réussis |
| 1 | Fondations Boussole : modèle documentaire, RLS, stockage, versions, consentements | Revue sécurité et schéma validés |
| 2 | Documentation et recherche : source canonique, index, synonymes, FR/AR, versions offline | Pertinence et traçabilité vérifiées |
| 3 | Assistant : interface, sources, IA encadrée, conversations privées | Consentements, sécurité et coûts validés |
| 4 | Guide et Académie : contenus, médias, simulations, exercices, évaluations | Parcours et évaluations testés |
| 5 | Personnalisation et administration : recommandations, espace personnel, gouvernance | Permissions et confidentialité vérifiées |
| 6 | Validation et activation progressive : sécurité, performance, offline, langues, accessibilité | Rapport de qualité et décision d'activation |

## 10. État réel au 27 novembre 2026

- Cahier des charges fonctionnel : 21 lots validés.
- Architecture cible : définie conceptuellement.
- Audit technique MIZANE : réalisé en lecture seule, puis correction P0 d'isolation locale intégrée à DEV.
- Migrations Boussole : aucune créée.
- Tables Boussole : aucune créée.
- Assistant Boussole : non développé.
- Guide Boussole : non développé.
- Académie : non développée.
- Administration Boussole : non développée.
- Supabase Production : non touché.

La Boussole reste un chantier à réaliser par phases. Aucune fonctionnalité ne doit être annoncée comme disponible avant son implémentation et sa validation.
