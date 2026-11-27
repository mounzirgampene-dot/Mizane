# Boussole MIZANE — Modèle de données et règles d'accès proposés

**Statut :** conception technique préparatoire, non déployée.  
**Cible éventuelle :** Supabase MIZANE-DEV uniquement, après validation et migration versionnée.  
**Production :** hors périmètre.

## 1. Principes de conception

1. Séparer les contenus documentaires communs, les données personnelles et les contenus propres à une entreprise.
2. Conserver des versions documentaires immuables ; une publication ne réécrit pas une ancienne version.
3. Distinguer le statut éditorial du document, le statut de sa traduction et sa compatibilité avec la version de MIZANE.
4. Ne donner aucun droit de rédaction documentaire aux utilisateurs ordinaires.
5. Réserver les écritures éditoriales à des fonctions backend contrôlées, avec rôles éditoriaux dédiés.
6. Appliquer RLS sur toutes les tables exposées et définir explicitement les privilèges SQL.
7. Ne jamais stocker de clé fournisseur IA, secret ou jeton d'administration dans une table lisible depuis le frontend.
8. N'utiliser aucun accès métier implicite depuis les conversations.

## 2. Domaine documentaire commun

### 2.1. `boussole_documents`

Table de référence d'un article, d'une procédure, d'un guide ou d'une ressource.

Champs proposés :

- `id` UUID, clé primaire.
- `slug` identifiant lisible et stable.
- `module_key`, `feature_key` pour l'aide contextuelle.
- `visibility` : `global` ou `company`.
- `company_id` nullable ; obligatoire si `visibility = company`.
- `status` : `draft`, `review`, `published`, `archived`.
- `current_published_version` entier nullable.
- `min_app_version`, `max_app_version` pour la compatibilité.
- `created_by`, `updated_by`, `created_at`, `updated_at`, `published_at`.

Contraintes : cohérence visibilité/entreprise ; unicité du slug dans son périmètre ; statut contrôlé par CHECK ; index sur statut, module, fonctionnalité et entreprise.

### 2.2. `boussole_document_versions`

Une ligne par version et par langue. Les anciennes versions restent consultables par le moteur documentaire, mais seules les versions publiées et compatibles sont proposées par défaut.

Champs proposés :

- `id`, `document_id`, `version_number`, `locale` (`fr` ou `ar` au lancement).
- `title`, `summary`, `content_markdown`, `structured_content` JSONB.
- `source_references` JSONB, `learning_level`, `estimated_minutes`.
- `status` : brouillon, vérification, approuvé, publié, retiré.
- `created_by`, `reviewed_by`, `approved_by`, dates associées.
- `min_app_version`, `max_app_version`.

Contrainte unique : (`document_id`, `version_number`, `locale`). Le contenu publié est immuable ; toute correction produit une nouvelle version.

### 2.3. `boussole_document_relations`

Relations explicites entre articles : prérequis, suite logique, dépannage, article connexe ou remplacement.

Champs : `source_document_id`, `target_document_id`, `relation_type`, `sort_order`, `created_at`. Interdire les relations vers soi-même et les doublons identiques.

### 2.4. `boussole_media_assets`

Métadonnées des images, vidéos, PDF et démonstrations.

Champs : `id`, `document_version_id`, `storage_path`, `mime_type`, `file_size`, `sha256`, `locale`, `alt_text`, `caption`, `status`, `created_at`.

Le fichier binaire reste dans un bucket privé distinct. Les chemins de stockage ne sont jamais considérés comme une autorisation d'accès.

### 2.5. `boussole_search_synonyms`

Dictionnaire de termes et synonymes par langue, administré par le processus éditorial.

Champs : `id`, `locale`, `term`, `normalized_term`, `synonyms` tableau de texte, `is_active`, `updated_at`.

La recherche arabe doit prévoir une normalisation dédiée et des synonymes contrôlés ; ne pas supposer qu'un dictionnaire français ou un stemming latin convient à l'arabe.

## 3. Domaine personnel

### 3.1. `boussole_user_preferences`

Une ligne par utilisateur : langue d'interface, langue de réponse, suggestions, historique, préférences d'affichage et dates de mise à jour.

Clé primaire `user_id` liée à `auth.users`. RLS : l'utilisateur ne lit et ne modifie que sa propre ligne.

### 3.2. `boussole_consent_events`

Journal append-only des consentements et révocations : `user_id`, `consent_type`, `purpose`, `policy_version`, `decision`, `scope` JSONB et `created_at`.

RLS : lecture et insertion par le propriétaire uniquement. Aucune politique UPDATE ou DELETE. Une révocation crée un nouvel événement ; elle ne réécrit pas l'historique.

Les consentements IA, accès ponctuel à une donnée métier et mesure d'usage doivent être distincts.

## 4. Domaine conversations — phase ultérieure

### 4.1. `boussole_conversations`

Identité de la conversation, propriétaire, titre, contexte entreprise explicitement choisi, dates et statut d'archivage.

### 4.2. `boussole_messages`

Messages utilisateur et assistant, références documentaires, métadonnées de génération et date de création.

Règle essentielle : l'utilisateur peut créer ses propres messages utilisateur ; les messages assistant sont créés côté serveur. Le frontend ne peut pas s'attribuer le rôle assistant ni falsifier les références de sources.

Les politiques de rétention, suppression et synchronisation doivent être définies avant d'activer l'historique cloud.

## 5. Domaine Académie — phase ultérieure

Tables conceptuelles :

- `boussole_learning_paths`
- `boussole_courses`
- `boussole_lessons`
- `boussole_learning_units`
- `boussole_exercises`
- `boussole_questions`
- `boussole_enrollments`
- `boussole_progress`
- `boussole_attempts`
- `boussole_certificates`

Les contenus de formation sont communs ou explicitement rattachés à une entreprise. Les inscriptions, progressions, tentatives et attestations appartiennent à un utilisateur. Les simulations ne doivent jamais écrire dans les tables métier.

## 6. RLS, privilèges et accès

### 6.1. Contenus publiés

- `anon` : lecture des seuls documents globaux publiés et de leurs versions publiées.
- `authenticated` : lecture des documents globaux publiés et des documents d'entreprise publiés pour une entreprise dont l'utilisateur est membre actif.
- Aucun INSERT, UPDATE ou DELETE direct pour `anon` ou `authenticated`.
- Écriture éditoriale via backend, après contrôle d'un rôle éditorial explicite.
- Les relations et médias héritent des règles d'accès du document parent ; un lien média ne doit jamais rendre un contenu privé public.

### 6.2. Données personnelles

- Préférences : SELECT/INSERT/UPDATE limité à `auth.uid() = user_id`.
- Consentements : SELECT/INSERT limité au propriétaire ; pas de modification ni suppression.
- Conversations et messages : propriétaire obligatoire ; l'entreprise éventuelle doit être une entreprise où le membre est actif.
- Aucun accès interentreprises ; aucun rôle pédagogique ne modifie le RBAC métier.

### 6.3. Privilèges SQL

La migration devra révoquer explicitement les privilèges inutiles, puis accorder uniquement les opérations prévues. Il ne faut pas supposer que l'activation de RLS suffit si aucun privilège SQL n'a été accordé, ni supposer que les nouvelles tables du schéma `public` sont automatiquement exposées par le Data API.

Références officielles :
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase — Data API et sécurité des tables](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase — Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Changelog — changements d'exposition Data API](https://supabase.com/changelog?types=breaking-change)

## 7. Stockage des médias

Créer un bucket Boussole séparé des coffres comptables et fiscaux existants. Le bucket doit rester privé. Les téléchargements passent par une vérification du statut publié et de la visibilité du document, puis par une URL signée à durée limitée.

Les fichiers doivent être contrôlés : type MIME réel, taille, extension, empreinte SHA-256, nom généré côté serveur, protection contre les chemins arbitraires et validation du contenu. Prévoir une stratégie de remplacement, archivage, purge et restauration.

## 8. Recherche

Première version sans dépendance obligatoire à l'IA :

- index lexical et plein texte ;
- synonymes par langue ;
- filtre par statut, langue, module, fonctionnalité et compatibilité ;
- classement déterministe ;
- recherche locale dans les ressources téléchargées.

La recherche sémantique et les embeddings sont une étape distincte. Ils ne doivent jamais remplacer le contrôle de visibilité ni contourner RLS.

## 9. Ordre de migration recommandé

1. Préparer le schéma documentaire et les contraintes.
2. Ajouter les tables documentaires et les politiques de lecture publiées.
3. Ajouter préférences et consentements personnels.
4. Ajouter les métadonnées médias et le bucket privé.
5. Ajouter les index et les tests RLS.
6. Ajouter les fonctions backend de publication et de recherche.
7. Ajouter conversations et Académie dans des migrations séparées.

Chaque lot doit avoir une migration additive, des tests SQL, une preuve de RLS, une stratégie de retour arrière et une validation DEV avant activation.

## 10. Tests obligatoires avant activation

1. Anonyme : aucun document brouillon, en revue ou privé.
2. Utilisateur authentifié : accès aux documents globaux publiés.
3. Membre entreprise A : accès aux contenus publiés de A, jamais de B.
4. Membre suspendu ou retiré : aucun accès aux contenus d'entreprise.
5. Traduction non publiée : non visible même si une autre langue est publiée.
6. Version incompatible : exclue des résultats par défaut.
7. Média privé : aucune lecture sans autorisation du document parent.
8. Utilisateur : lecture et modification de ses préférences uniquement.
9. Consentement : insertion personnelle, historique non modifiable.
10. Conversation : aucune lecture interutilisateur ; rôle assistant réservé au serveur.
11. Offline : aucun contenu privé dans un cache partagé.
12. Suppression et révocation : aucune ancienne synchronisation ne ressuscite les droits.

## 11. État de cette proposition

Ce document est un modèle de données préparatoire. Aucune table Boussole, politique RLS, fonction Edge, bucket ou migration n'a été créée par ce document.

Avant la première migration, il faut générer le fichier avec `supabase migration new`, vérifier la version du CLI et la cible DEV, puis contrôler les privilèges par défaut du projet. La migration doit être testée et revue avant toute application à MIZANE-DEV. Aucune commande de migration ne doit viser Production.
