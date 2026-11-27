# Boussole MIZANE — feuille de livraison consolidée

Date de référence : 27 novembre 2026. Périmètre : branche DEV `feat/stock-integrated-dev`, PR #170 et PR #171.

## 1. Éléments livrés dans les branches de développement

| Domaine | État | Périmètre réellement disponible |
|---|---|---|
| Guide contextuel | Réalisé dans PR #171 | Panneau latéral, 16 articles FR/AR, aide selon la rubrique, recherche locale multiterme. |
| Recherche linguistique | Réalisé dans PR #171 | Normalisation FR/AR, accents, variantes arabes, diacritiques et tatweel. |
| Académie locale | Réalisé dans PR #171 | 10 parcours, 30 leçons, 20 questions, corrections bilingues, progression locale par utilisateur et entreprise. |
| Fonctionnement hors connexion | Réalisé pour les contenus embarqués | Précache du guide et de l'Académie ; aucun service distant nécessaire pour ces contenus. |
| Fondations documentaires | Appliquées sur MIZANE-DEV via PR #170 | Six tables, RLS/FORCE RLS, privilèges explicites, versions FR/AR, relations, synonymes, préférences et événements de consentement. |
| Lecteur documentaire cloud | En cours dans PR #172 | Recherche en lecture seule des documents publiés, versions FR/AR et synonymes, filtrage par espace actif, fallback local hors connexion. |
| Revue du helper d'appartenance | Réalisée | Vérification de `private.is_active_company_member(uuid)` et de ses droits. |
| Validation RLS transactionnelle | Réussie le 27 novembre 2026 | Tests avec les rôles PostgreSQL réels `anon` et `authenticated`, trois identités Auth synthétiques, deux entreprises, fixtures annulées par `ROLLBACK`. |

Les deux PR restent indépendantes et en brouillon. La PR #171 ne dépend pas de l'application de la migration de la PR #170.

## 2. Validation de la fondation cloud — terminée sur DEV

La migration `20261127105326_boussole_foundation.sql` a été appliquée à MIZANE-DEV sous la version `20261127105326_boussole_foundation`. Les six tables existent et sont vides après validation.

Le script `supabase/tests/boussole_rls_smoke.sql` a été exécuté sur DEV. Il crée des identités Auth synthétiques et deux entreprises dans une transaction, bascule sur les rôles PostgreSQL `anon` et `authenticated`, puis annule l'ensemble par `ROLLBACK`. Résultat vérifié : **PASS**. Aucun compte réel ni donnée métier n'a été utilisé.

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

Les contrôles ont couvert les dix cas listés ci-dessus, notamment les droits de lecture, le cloisonnement interentreprises, la révocation, les préférences, l'append-only des consentements et l'interdiction d'écriture éditoriale directe. Le script reste disponible pour les validations futures. Aucun compte Auth réel n'a été utilisé.

## 3. Lots fonctionnels restant à développer après validation RLS

### 3.1 Moteur documentaire cloud
- **En cours dans PR #172 :** lecture des documents et versions publiés, recherche texte avec synonymes FR/AR, filtrage RLS par espace actif, affichage texte sécurisé et fallback local hors connexion.
- À compléter : pagination au-delà du premier lot, filtre de compatibilité par version de l'application, métadonnées de rubrique plus avancées et navigation des relations (prérequis, parcours suivants, dépannage, contenus associés).

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
- tests RLS transactionnels sous `anon` et `authenticated` réussis ;
- tests d'isolation multi-entreprises et de révocation réussis ;
- tests de permissions des RPC et fonctions Edge ;
- CI complète et Preview du commit exact ;
- contrôle des advisors Supabase après changement de schéma ;
- documentation des limites et procédure de retour arrière.

Aucune fusion dans `main`, aucun déploiement GitHub Pages Production et aucune migration Supabase Production ne font partie de cette feuille de livraison.


## 5. État d'exploitation au 27 novembre 2026 — DEV

- Les PR #170 à #176 sont fusionnées dans `feat/stock-integrated-dev`.
- Dernier commit d'intégration avant cette mise à jour documentaire : `48d5b3010998c424bd16c120bd5a53c1133490a7`.
- Preview de la branche : https://feat-stock-integrated-dev.mizane-test-preview.pages.dev
- Projet Supabase cible : MIZANE-DEV (`rudsovhdvinvyrwjamfo`, région eu-west-2), état ACTIVE_HEALTHY.
- Migrations enregistrées et appliquées sur DEV :
  - `20261127105326_boussole_foundation`
  - `20261127123614_boussole_editorial_governance`
  - `20261127123619_boussole_english_locale`
  - `20261127123622_boussole_resource_governance`
- Les noms des fichiers dans `supabase/migrations` correspondent exactement aux versions présentes dans l'historique Supabase.
- Les neuf tables Boussole sont présentes et vides : documents, versions, relations, synonymes, préférences, consentements, rôles éditoriaux, audit et médias.
- Le bucket `boussole-media` est privé, limité à 20 Mio, avec liste MIME explicite.
- Les RPC `boussole_editor_transition` et `boussole_editor_manage_resource` sont SECURITY DEFINER avec `search_path` vide ; EXECUTE est refusé à `anon` et `authenticated`, et accordé uniquement à `service_role`.
- Aucun rôle éditorial réel, document, version, synonyme, événement de consentement ou média n'a été créé.
- `main`, GitHub Pages Production et Supabase Production restent hors périmètre.

## 6. Livraison des PR #170 à #176 — terminée

1. PR #170 : fondations documentaires et RLS.
2. PR #171 : guide local et Académie trilingue.
3. PR #172 : lecteur documentaire cloud en lecture seule.
4. PR #173 : rôles et gouvernance éditoriale serveur.
5. PR #174 : administration éditoriale et anglais comme troisième langue officielle.
6. PR #175 : synonymes, relations, compatibilité des versions et gestion des médias.
7. PR #176 : isolation des versions par auteur et autorisation préalable avant lecture privilégiée d'un média.

Les contrôles du commit final de PR #176 et de son commit de fusion sont réussis : ESLint, suite complète (169 tests, 0 échec), workflow Preview et déploiement Cloudflare de la branche DEV.

## 7. État de la fonction Edge

- Fonction `boussole-editor` déployée sur MIZANE-DEV.
- État Supabase : ACTIVE, version 1.
- `verify_jwt=false` au niveau de la passerelle, car la fonction vérifie elle-même le jeton avec `adminClient.auth.getUser(jwt)` avant toute action.
- Les actions de lecture et d'écriture contrôlent le rôle éditorial et l'appartenance active au périmètre demandé.
- Les auteurs ne reçoivent que les versions publiées et leurs propres brouillons ; les médias liés à des versions invisibles ne sont pas signés.
- Pour enregistrer un média, la RPC `media_upload_authorize` vérifie les droits avant toute lecture privilégiée de l'objet Storage.
- Aucun secret `service_role` n'est exposé au navigateur.
- Aucun rôle réel n'est attribué : les appels d'administration doivent donc être refusés tant qu'un rôle n'est pas explicitement créé par une procédure privilégiée.

## 8. Vérifications Supabase et points de suivi

### Sécurité
- Les RPC Boussole ne sont pas signalées comme exécutables par `authenticated` dans les Security Advisors.
- Les alertes `rls_enabled_no_policy` sur `boussole_editor_roles` et `boussole_editor_audit` correspondent au choix de refus par défaut : RLS/FORCE RLS est activé et aucun accès direct client n'est accordé.
- Les alertes préexistantes sur quatre RPC comptables SECURITY DEFINER et sur la protection des mots de passe compromis restent hors de cette tranche.

### Performance
- Les Advisors signalent des index de clés étrangères manquants sur plusieurs tables Boussole, notamment les relations, versions, documents et médias.
- Des avertissements de politiques permissives multiples concernent la lecture globale/entreprise ; les politiques restent limitées aux documents publiés.
- Les politiques de préférences et de consentement peuvent être optimisées avec `(select auth.uid())`.
- Ces points sont des optimisations de suivi, pas des échecs de sécurité bloquant l'activation DEV. Ils devront être traités dans une migration dédiée et testée.

## 9. Limites fonctionnelles restantes

1. La diffusion des médias aux utilisateurs finaux du lecteur documentaire doit être raccordée à une voie de lecture signée respectant la visibilité globale/entreprise et la version publiée.
2. L'attribution des rôles éditoriaux doit faire l'objet d'un processus privilégié explicite ; aucune attribution automatique n'est prévue.
3. Un test d'acceptation Auth avec comptes synthétiques doit vérifier les refus sans rôle et les autorisations avec rôles de test, sans créer de rôle réel.
4. Les index et politiques signalés par les Performance Advisors doivent être optimisés séparément.
5. Aucune mise en production n'est incluse : pas de fusion dans `main`, pas de GitHub Pages Production et pas de Supabase Production.

## 10. Séquence suivante

1. Vérifier les journaux de la fonction `boussole-editor` après les premiers appels authentifiés de test.
2. Effectuer les tests Auth avec utilisateur sans rôle, puis rôles synthétiques dans un environnement de test isolé.
3. Raccorder la lecture média côté lecteur documentaire.
4. Préparer une migration de performance pour les index et politiques, avec tests transactionnels et Advisors.
5. N'envisager Production qu'après validation explicite distincte et revue de sécurité complète.
