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


## 5. État d'exploitation au 27 novembre 2026

- Migration Boussole appliquée uniquement sur Supabase DEV (`20261127105326`).
- Les six tables sont vides ; aucun contenu éditorial n'a été injecté.
- Le smoke test RLS transactionnel passe et annule toutes ses fixtures.
- Les Advisors ne signalent aucune nouvelle alerte liée aux tables Boussole ; les alertes antérieures des modules comptables et Auth restent documentées dans la revue RLS.
- PR #170 et PR #171 restent indépendantes et en brouillon. Le guide/Académie de PR #171 continue de fonctionner localement sans dépendre des tables cloud.
- Prochaine tranche : lecteur documentaire cloud en lecture seule, avec fallback local et filtrage par langue/version ; l'administration éditoriale restera un lot séparé, protégé côté serveur.
- `main`, GitHub Pages Production et Supabase Production restent hors périmètre.


## 6. Dépendances de livraison — 27 novembre 2026

1. PR #170 : fondations et migration DEV, validées par tests RLS transactionnels.
2. PR #171 : guide local et Académie locale.
3. PR #172 : lecteur cloud en lecture seule, construit au-dessus du guide et dépendant du schéma de PR #170.

Les trois PR restent en brouillon et aucune n'est fusionnée automatiquement. La migration DEV déjà appliquée ne vaut pas autorisation de migration Production. L'éditeur, le workflow éditorial, la progression cloud, les médias et l'assistant IA restent des lots distincts.


## 7. Gouvernance éditoriale — PR #173 en préparation

La branche `feat/boussole-editorial-governance-dev` ajoute une première couche serveur de gouvernance, sans ouvrir l'édition directe depuis le navigateur.

- Registre des rôles `author`, `reviewer`, `publisher` et `admin`, avec portée globale ou par entreprise.
- Aucun rôle n'est préattribué ; aucune identité réelle n'est choisie automatiquement.
- Tables de rôles et d'audit protégées par RLS/FORCE RLS, sans privilège direct pour `anon` ou `authenticated`.
- Fonction transactionnelle serveur pour créer/modifier un brouillon, créer une version linguistique, soumettre en relecture, demander des corrections, approuver, publier, archiver et restaurer.
- Fonction Edge authentifiant le JWT avec Auth puis appelant uniquement la RPC protégée ; l'identité d'acteur vient du jeton vérifié, jamais du corps envoyé par le navigateur.
- Séparation des tâches : un auteur ne peut pas approuver sa propre version ; un auteur ou approbateur ne peut pas publier sa propre version.
- Publication bilingue : les versions française et arabe d'un même numéro doivent toutes deux être approuvées avant publication.
- Une nouvelle relecture ne masque pas la dernière version déjà publiée.
- L'attribution des rôles reste une opération d'administration privilégiée, hors interface utilisateur de cette tranche.

**État de validation PR #173 :** CI qualité et workflow de vérification Preview réussis sur le commit `d79603e`. Le scénario transactionnel final a exécuté la migration et les transitions sur MIZANE-DEV avec des identités, une entreprise et des rôles synthétiques, puis `ROLLBACK` ; résultat : PASS. Il couvre aussi les rôles révoqués, les refus d'auto-approbation et d'auto-publication, le refus de modification d'un document archivé et l'absence de privilèges directs côté client. Vérification post-test : zéro table éditoriale persistante et zéro entrée de migration `20261127120000`. La migration n'est donc pas appliquée, la fonction Edge n'est pas déployée, aucun rôle réel n'est attribué et aucun document réel n'est créé. Cette tranche ne modifie pas Production ni `main`.

### Étapes avant activation
1. Revue SQL et test transactionnel réel sur DEV avec rôles synthétiques, sans persistance des fixtures — **PASS**.
2. Vérification des droits d'exécution de la RPC, des refus sans rôle, des rôles révoqués et de la séparation auteur/vérificateur/éditeur — **PASS**.
3. Application de la migration DEV uniquement après revue finale, CI et rapprochement exact de l'historique — en attente.
4. Déploiement de `boussole-editor` sur DEV seulement après migration et CI réussies — en attente.
5. Interface d'administration éditoriale et procédure d'attribution explicite des rôles dans un lot distinct.


## 8. Administration éditoriale et troisième langue — PR #174

La branche `feat/boussole-editorial-admin-i18n-dev` ajoute l'administration éditoriale et le support anglais de bout en bout dans les couches livrées par cette tranche.

### Langues
- Français (`fr`), arabe (`ar`) et anglais (`en`) sont les trois locales autorisées pour les versions documentaires et les synonymes.
- Les préférences d'interface et de réponse acceptent également les trois langues.
- Les 16 articles du guide local disposent d'un contenu anglais.
- L'Académie possède une traduction anglaise des 10 parcours, 30 leçons et 20 évaluations, avec options et explications.
- La recherche Académie et le lecteur cloud prennent en charge la langue anglaise.
- L'arabe conserve RTL ; français et anglais utilisent LTR.

### Administration
- Interface dédiée avec liste des documents, création de brouillons, création d'une nouvelle édition à partir de la dernière version publiée, sélection des langues, édition Markdown, aperçu texte et suivi des statuts.
- Les auteurs voient leurs propres brouillons et les documents publiés ; les relecteurs et éditeurs autorisés peuvent consulter les éléments de leur périmètre.
- Files d'action distinctes selon les rôles author, reviewer et publisher ; l'interface n'accorde aucun droit.
- Liste et lecture des brouillons via Edge Function après authentification Auth et vérification serveur du rôle et de l'appartenance active à l'entreprise.
- Aucun accès direct du navigateur aux tables éditoriales et aucune clé service_role côté client.
- La publication exige trois versions approuvées (FR, AR et EN) partageant le même numéro d'édition.
- Les traductions d'une édition partagent un numéro ; les versions suivantes utilisent le numéro suivant après la dernière publication.

### Validation PR #174
- Commit validé : `598e99ab04a1480e394b5a741ea568ea8bad47da`.
- ESLint réussi ; suite principale : 169 tests réussis, 0 échec.
- Suites Académie et fiscales réussies.
- Workflow de vérification Preview réussi.
- Test transactionnel trilingue sur MIZANE-DEV : migration de gouvernance et migration anglaise exécutées avec fixtures synthétiques, création FR/AR/EN au même numéro, approbation par un relecteur distinct, publication des trois langues, création du numéro suivant, puis `ROLLBACK`.
- Vérification post-test : zéro table éditoriale persistante et zéro entrée de migration `20261127120000` ou `20261127133000`.

### Activation non effectuée
- Aucune migration appliquée à MIZANE-DEV ; les contraintes existantes restent FR/AR.
- La fonction Edge `boussole-editor` n'est pas déployée.
- Aucun rôle éditorial réel n'est attribué ; l'interface reste masquée tant qu'aucun rôle autorisé n'est détecté.
- Aucun contenu réel n'est créé ou publié par cette PR.
- Les migrations devront être appliquées dans l'ordre après revue et livraison des PR précédentes, puis la fonction Edge déployée sur DEV uniquement.

### Suite
1. Terminer la revue de la PR #174 ; ne pas fusionner automatiquement les PR en brouillon.
2. Après livraison ordonnée des PR #170 à #174, appliquer les migrations DEV dans l'ordre et déployer la fonction Edge DEV.
3. Effectuer une vérification Auth réelle avec un rôle éditorial explicitement attribué.
4. Ajouter la gestion éditoriale des synonymes, relations, compatibilité de versions et pièces média, puis l'administration des rôles via un canal privilégié séparé.

## 9. Gestion documentaire avancée — PR #175

Branche : `feat/boussole-document-relations-media-dev`, empilée sur `feat/boussole-editorial-admin-i18n-dev` (base #174, commit `598e99ab04a1480e394b5a741ea568ea8bad47da`). La PR reste en brouillon et n'active aucune migration ni fonction Edge.

### 9.1 Administration trilingue intégrée à l'interface

- Synonymes FR/AR/EN : consultation, ajout/mise à jour par clé normalisée et désactivation ; accès réservé au rôle global publisher/admin.
- Relations : prérequis, étape suivante, dépannage, contenu associé et remplacement ; sélection des documents publiés du même espace ; suppression contrôlée.
- Compatibilité : édition des versions minimale et maximale au niveau document ou version.
- Médias : formulaire trilingue pour textes alternatifs et légendes, association à une version, liste des ressources, lien signé temporaire et archivage.
- Les contrôles d'interface ne constituent jamais une autorisation ; chaque écriture repasse par l'Edge Function et la RPC privilégiée.
- Arabe RTL ; français et anglais LTR, selon les paramètres de l'interface déjà établis dans PR #174.

### 9.2 Sécurité serveur et Storage

- RPC `boussole_editor_manage_resource` limitée à `service_role`, avec identité d'acteur issue du JWT vérifié par Auth.
- Autorisation d'envoi média vérifiée dans la RPC : rôle publisher/admin dans le périmètre, appartenance active à l'entreprise, document et version associés.
- Bucket `boussole-media` privé, limite de 20 Mio et liste MIME explicite ; la migration réapplique la configuration privée si le bucket existe déjà.
- Téléversement par URL signée à usage contrôlé ; le navigateur ne reçoit jamais la clé `service_role`.
- Avant enregistrement, l'Edge Function vérifie l'existence, la taille, le type déclaré et la signature binaire du fichier (JPEG, PNG, WebP, AVIF, MP4, WebM ou PDF).
- Si l'enregistrement échoue, l'objet téléversé est supprimé ; lors de l'archivage, les métadonnées sont désactivées puis l'objet Storage est supprimé. Un échec de nettoyage est signalé comme `cleanup_pending`.
- Les liens de lecture des médias sont signés pour 15 minutes et délivrés seulement après contrôle d'accès éditorial au document.
- Table média protégée par RLS/FORCE RLS ; aucun privilège direct d'écriture accordé à `anon` ou `authenticated`.
- La clé étrangère composite met uniquement `version_id` à NULL lors de la suppression d'une version, sans tenter de mettre `document_id` à NULL.

### 9.3 Tests ajoutés et vérifications requises

- Tests statiques sur la migration, la portée des rôles, la séparation de l'identité Auth, les synonymes, les relations, la compatibilité, les URL signées, les signatures MIME et le nettoyage Storage.
- Le test Boussole éditorial est inclus dans `tests/run.mjs`.
- À confirmer sur le commit final : ESLint, suite complète, CI GitHub, Preview, revue SQL, tests transactionnels PostgreSQL DEV avec identités synthétiques et `ROLLBACK`, et Supabase Advisors.
- Les tests statiques ne remplacent pas les tests d'exécution Postgres/Storage. Aucune réussite de CI, Preview ou Advisors n'est revendiquée avant lecture des résultats du commit exact.

### 9.4 Activation et limites

- Migration `20261127150000_boussole_resource_governance.sql` non appliquée.
- Fonction Edge `boussole-editor` non déployée.
- Aucun rôle réel attribué ; aucun contenu réel ni média réel créé.
- La lecture de médias par les utilisateurs finaux du lecteur documentaire reste à raccorder à une voie de diffusion signée compatible avec les règles de visibilité du lecteur ; les liens signés actuellement exposés sont réservés à l'interface éditoriale authentifiée.
- Aucune fusion automatique des PR #170 à #175.
- Aucun changement de `main`, GitHub Pages Production ou Supabase Production.

## 10. Prochaine séquence de validation — PR #175

1. Contrôle de cohérence final de la migration, de la RPC et de l'Edge Function.
2. ESLint et suite complète sur le commit exact.
3. Tests transactionnels DEV avec rôles et identités synthétiques, relations cycliques, révocation, upload MIME valide/invalide, dépassement de taille, suppression Storage et `ROLLBACK`.
4. Preview et vérification des interfaces FR/AR/EN.
5. Supabase Advisors et revue des privilèges/RLS/Storage.
6. Mise à jour de la PR avec les résultats observés ; conserver le brouillon tant que les étapes précédentes ne sont pas toutes validées.

L'application de la migration DEV et le déploiement de la fonction Edge DEV restent des opérations séparées, à exécuter dans l'ordre et après validation explicite. Production et `main` restent hors périmètre.
