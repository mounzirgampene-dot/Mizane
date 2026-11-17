# Supabase — démarrage de l'environnement multi-entreprises

Les migrations fondatrices ajoutent les fondations d'identité, d'entreprises et d'appartenances. Depuis le 16 novembre 2026, le schéma comptable cloud et l'import initial sécurisé sont également installés sur MIZANE-DEV. L'interface comptable n'est toutefois pas encore branchée à la synchronisation cloud et aucune donnée locale n'a été transférée.

## Prérequis

1. Créer un projet Supabase dédié au développement (ne pas commencer par la production).
2. Conserver l'URL du projet et la clé publique `anon` dans la configuration frontend ultérieure.
3. Garder la clé `service_role`, les mots de passe et les secrets uniquement dans les secrets Supabase/GitHub ; ne jamais les committer.
4. Activer la vérification d'adresse e-mail et configurer les URL de redirection de l'application.
5. Activer MFA pour les comptes administrateurs dès que le parcours d'authentification sera livré.

## Appliquer la migration

Depuis la racine du dépôt, avec Supabase CLI installé et lié au projet de développement :

```sh
supabase login
supabase link --project-ref VOTRE_PROJECT_REF
supabase db push
```

Vérifier d'abord le SQL et la cible du projet. Ne jamais lancer cette commande sur un projet contenant des données de production sans revue, sauvegarde et procédure de retour arrière.

## Ce que crée la migration

- `profiles` : profil applicatif lié à l'identité Supabase Auth.
- `companies` : espaces indépendants.
- `company_memberships` : rôle indépendant par utilisateur et entreprise.
- `company_invitations` : invitations avec jeton haché et durée de validité.
- `company_settings` : paramètres propres à l'entreprise.
- `audit_logs` : journal des événements sensibles.
- `accounting_settings`, `accounting_custom_accounts`, `accounting_thirds`, `accounting_entries`, `accounting_entry_lines` et `accounting_assets` : socle comptable isolé par entreprise.
- `sync-accounting` : Edge Function avec JWT obligatoire, vérification du membre actif et des rôles `admin`/`accountant`.
- `import_accounting_snapshot(company_id, actor_user_id, snapshot)` : RPC privilégiée, exécutable uniquement par `service_role`, appelée par l'Edge Function ; import initial atomique, contrôle de la partie double et exclusion des clés API.
- `create_company(...)` : fonction atomique qui crée l'entreprise et attribue le rôle initial `admin`.
- RLS et politiques de lecture / mise à jour d'administration.
- Les helpers RLS `is_active_company_member` et `has_company_role` résident dans le schéma non exposé `private` ; ils ne sont pas publiés comme RPC du schéma `public`.

Les clients ne disposent volontairement d'aucune politique pour créer directement des appartenances, modifier des rôles ou écrire des événements d'audit. Ces actions doivent passer par des fonctions serveur contrôlées.

## Fonctions serveur de gestion des membres

La fonction Edge `manage-company-members` se trouve dans `supabase/functions/manage-company-members/index.ts`. Elle vérifie le JWT de l'utilisateur et contrôle côté serveur que celui-ci est administrateur actif de l'entreprise.

Actions disponibles (requêtes POST JSON) :

- `create_invitation` : crée une invitation pour un rôle `accountant` ou `reader`, valable 7 jours.
- `accept_invitation` : permet à l'utilisateur authentifié dont l'adresse correspond à l'invitation d'accepter le jeton.
- `revoke_invitation` : révoque une invitation non utilisée.
- `set_member_role` : change le rôle d'un membre.
- `set_member_status` : suspend ou réactive un membre.
- `remove_member` : retire un membre de l'entreprise.

La création d'invitation envoie un e-mail via Resend. Le jeton brut n'est jamais retourné au navigateur ni inscrit dans les journaux ; seul son hachage est conservé en base. Le lien est valable 7 jours et son acceptation exige une session authentifiée dont l'adresse correspond à celle du destinataire.

### Déploiement dans un projet de développement

Après avoir appliqué les migrations :

```sh
supabase functions deploy manage-company-members
```

La fonction utilise les variables serveur `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, fournies par l'environnement Supabase. Ne jamais exposer la clé `service_role` dans le navigateur ni dans GitHub. La vérification JWT doit rester activée. Configurer `MIZANE_ALLOWED_ORIGIN` avec l'origine exacte de l'application avant d'ouvrir l'API au frontend ; le joker CORS ne doit servir qu'aux essais locaux.

Exemple de corps JSON pour créer une invitation :

```json
{
  "action": "create_invitation",
  "company_id": "UUID_DE_L_ENTREPRISE",
  "email": "collaborateur@example.com",
  "role": "accountant"
}
```

Pour accepter, l'utilisateur doit être connecté avec l'adresse e-mail destinataire et envoyer `action` = `accept_invitation` avec `invitation_token`. Les autres actions exigent `company_id` et les champs propres à l'opération.

La protection du dernier administrateur est réalisée dans la migration `20261112000200_atomic_member_management.sql`, par une fonction SQL réservée à `service_role` et verrouillée par entreprise. Cela évite que deux requêtes concurrentes retirent simultanément les droits des deux derniers administrateurs.

Le test `supabase/tests/atomic_member_management.test.sql` vérifie cette protection. Il doit être exécuté avec `supabase test db` sur un environnement local ou de développement.

## Tests automatisés RLS

Un premier jeu de tests pgTAP est disponible dans `supabase/tests/multi_company_rls.test.sql`. Il crée deux identités de test, vérifie la création atomique d'une entreprise, l'attribution du rôle administrateur, la visibilité limitée aux entreprises membres et l'indépendance des rôles.

Après installation de Supabase CLI et démarrage de l'environnement local (`supabase start`), exécuter :

```sh
supabase test db
```

Ces tests doivent être exécutés sur une base locale ou un projet de développement jetable, jamais sur la base de production. Le résultat n'est pas encore certifié : les tests n'ont pas pu être exécutés ici faute d'environnement Supabase connecté.

## Vérifications manuelles complémentaires

Créer deux comptes Auth distincts : Alice et Bilal.

1. Alice appelle `create_company('Société A', 'MA', 'MAD', 'CGNC', 'Africa/Casablanca')`. Vérifier qu'elle voit l'entreprise A et qu'elle est `admin`.
2. Bilal crée l'entreprise B. Vérifier qu'il ne voit pas A.
3. Ajouter Bilal à A avec le rôle `reader` uniquement via une opération administrative serveur de test, jamais par une requête cliente directe.
4. Vérifier que Bilal voit A et B, avec des rôles différents dans chaque espace.
5. Vérifier qu'un lecteur ne peut pas modifier les paramètres, les appartenances ou les invitations.
6. Vérifier qu'un utilisateur suspendu perd immédiatement l'accès.
7. Vérifier qu'un utilisateur non membre ne peut ni sélectionner ni lire une entreprise en fournissant son UUID.
8. Vérifier qu'aucune opération cliente ne peut insérer ou modifier un rôle dans `company_memberships`, ni insérer un faux événement dans `audit_logs`.

**Résultat attendu :** l'isolation entre A et B est imposée par PostgreSQL, pas par l'interface.

## Limites connues de cette première étape

- Aucun écran d'inscription/connexion ou de création d'entreprise n'a encore été branché.
- La fonction de gestion des membres est écrite, mais elle n'est pas encore déployée ni testée sur un projet Supabase.
- L'envoi automatique des invitations par e-mail reste à intégrer.
- Les tables comptables existantes ne sont pas encore migrées vers PostgreSQL et n'ont donc pas encore de `company_id`.
- Le mode local actuel reste inchangé.
- La migration n'a pas été exécutée sur un projet Supabase : aucun accès à un projet ou à ses secrets n'a été fourni dans cette étape.

## Règle de livraison

Ne pas activer le mode multi-entreprises en production avant que les tests RLS positifs et négatifs, les Edge Functions, les tests d'invitation, la migration des données et le parcours de retour arrière aient été validés.


## API de consultation de la gestion des membres

Deux actions supplémentaires sont disponibles dans `manage-company-members` et exigent un JWT valide ainsi qu’un rôle `admin` actif dans l’entreprise demandée :

- `list_company_members` : renvoie les identifiants, e-mails, noms affichés, rôles et statuts des membres (maximum 200 résultats).
- `list_company_invitations` : renvoie les invitations encore valides et non révoquées (maximum 100 résultats). Les jetons et empreintes ne sont jamais renvoyés.

Le navigateur ne lit pas directement les profils privés des autres utilisateurs : ces données sont récupérées côté serveur après le contrôle d’administration. Les opérations de changement de rôle, suspension/réactivation, retrait et révocation utilisent les actions déjà protégées par la même vérification serveur.


## Envoi transactionnel des invitations par e-mail

La fonction `manage-company-members` envoie les invitations avec Resend. Configurer les secrets côté projet Supabase (jamais dans Git ou le frontend) :

```sh
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set MIZANE_APP_URL=https://VOTRE-UTILISATEUR.github.io/Mizane
supabase secrets set MIZANE_EMAIL_FROM='MIZANE <invitations@votre-domaine.com>'
```

`MIZANE_APP_URL` doit être l'URL de base GitHub Pages. `MIZANE_EMAIL_FROM` doit correspondre à un expéditeur vérifié dans Resend. En environnement d'essai, Resend peut limiter les destinataires et/ou l'expéditeur. Pour une utilisation réelle, vérifier un domaine et configurer ses DNS.

Le jeton brut n'est jamais retourné au frontend ni journalisé. Il est transmis dans le fragment URL du lien e-mail. Si Resend refuse l'envoi, l'enregistrement d'invitation est supprimé. L'invitation expire après 7 jours, est à usage unique et exige une session authentifiée dont l'adresse correspond.

Après configuration, redéployer :
```sh
supabase functions deploy manage-company-members
```

## Récupération du mot de passe

Le portail écoute l'événement Supabase Auth `PASSWORD_RECOVERY` et affiche un formulaire de nouveau mot de passe. Le formulaire vérifie la confirmation puis appelle `supabase.auth.updateUser({ password })`. Dans Supabase Auth, ajouter `https://VOTRE-UTILISATEUR.github.io/Mizane/espace.html` aux URL de redirection autorisées et vérifier le modèle d'e-mail de récupération.


## Socle comptable cloud — 16 novembre 2026

Le schéma comptable a été appliqué sur le seul projet MIZANE-DEV (`rudsovhdvinvyrwjamfo`) par les migrations :

- `20261116000100_cloud_accounting_schema.sql`
- `20261116000200_accounting_snapshot_import.sql`

La branche de travail GitHub est `feat/cloud-accounting-dev`. Aucune fusion vers `main` n'a été effectuée et aucun changement n'a été appliqué à Supabase PRODUCTION.

### Modèle ajouté

- `accounting_settings` : paramètres de l'exercice, devise, pays, plan comptable et prochain identifiant local. Les clés fournisseur `aiKey`, `ai_key`, `apiKey`, `api_key` et `providerApiKey` sont retirées lors de l'import initial.
- `accounting_custom_accounts` : comptes personnalisés propres à l'entreprise.
- `accounting_thirds` : clients, fournisseurs et autres tiers.
- `accounting_entries` : en-têtes des écritures, avec identifiant UUID cloud et identifiant local source.
- `accounting_entry_lines` : lignes comptables, avec contrainte débit/crédit sur chaque ligne et rattachement composite à l'écriture de la même entreprise.
- `accounting_assets` : immobilisations et amortissements.

Toutes ces tables ont RLS activée et forcée. Les membres actifs peuvent consulter les données de leur entreprise. Aucun droit d'écriture directe n'est accordé à `authenticated` dans cette première étape : les écritures doivent passer par des fonctions serveur contrôlées.

### Import initial sécurisé

La fonction SQL `import_accounting_snapshot(uuid, jsonb)` :

1. exige une session authentifiée et un rôle actif `admin` ou `accountant` dans l'entreprise ciblée ;
2. refuse l'import si une comptabilité cloud existe déjà, afin de ne pas écraser ni dupliquer des données ;
3. importe les paramètres sans clé API, les comptes personnalisés, les tiers, les écritures, leurs lignes et les immobilisations ;
4. contrôle les dates, journaux, montants, lignes et équilibre débit/crédit ;
5. résout les liens de contrepassation après insertion des écritures ;
6. journalise l'opération dans `audit_logs`.

Un import en erreur est annulé dans sa transaction. L'interface locale n'appelle pas encore cette fonction ; il n'y a donc aucun transfert automatique à ce stade.

### Vérifications réalisées sur DEV

- Les six tables existent et ont RLS activée.
- Les politiques de lecture ne sont définies que pour les membres actifs.
- Les privilèges SQL des utilisateurs authentifiés sont limités à `SELECT`.
- Un test transactionnel avec une entreprise temporaire et une écriture fictive a montré qu'un membre autorisé voit l'en-tête et ses deux lignes, tandis qu'un utilisateur non membre ne voit aucune ligne.
- Un test d'import transactionnel a importé correctement un instantané fictif (1 écriture, 2 lignes, 1 tiers, 1 immobilisation et 1 compte personnalisé), puis a confirmé qu'aucune clé `aiKey` n'était stockée. Les données de test ont été annulées par rollback.
- Un rôle `reader` a été refusé par la fonction d'import.

Ces essais sont des tests ponctuels exécutés dans des transactions annulées ; ils ne constituent pas encore une campagne complète de tests multi-entreprises en environnement navigateur.

### Étapes restantes avant activation

1. Ajouter au portail la sélection d'entreprise active et le pont sécurisé avec la comptabilité locale.
2. Préparer une sauvegarde JSON et un écran de prévisualisation avant le premier transfert.
3. Générer des identifiants de synchronisation stables côté navigateur et gérer les conflits sans écrasement.
4. Tester deux entreprises réellement séparées avec un administrateur, un comptable et un lecteur.
5. Déployer et tester les fonctions serveur avant d'autoriser la saisie comptable cloud.
6. Ajouter ensuite l'assistant IA SaaS côté serveur, avec JWT, contrôle du rôle et données limitées à l'entreprise active.

**Important :** l'application locale reste la source de données actuelle. Le schéma cloud est préparé, mais la synchronisation n'est pas encore activée. Ne pas déployer cette branche en production avant validation explicite.


### Import initial depuis le portail MIZANE

La fonction `sync-accounting` est déployée sur MIZANE-DEV avec `verify_jwt=true`. Elle résout le JWT auprès de Supabase Auth, contrôle que l'utilisateur est membre actif avec le rôle `admin` ou `accountant`, puis appelle le RPC d'import avec l'identifiant de l'acteur vérifié.

Le RPC `import_accounting_snapshot` n'est pas exécutable par `authenticated` ni par `anon` : seul `service_role` peut l'appeler. Il recontrôle dans PostgreSQL que l'acteur transmis possède bien une appartenance active et le rôle requis. La clé `service_role` reste exclusivement côté serveur.

Déploiement de la fonction :

```sh
supabase functions deploy sync-accounting
```

Le portail de la branche `feat/cloud-accounting-dev` affiche une action d'import initial aux administrateurs et comptables. Avant l'envoi, il télécharge une sauvegarde JSON locale, affiche l'entreprise source et l'entreprise cible, avertit en cas de différence de nom, puis demande confirmation. L'import est unique et refuse une entreprise dont les tables comptables contiennent déjà des données.

**Ce parcours n'est pas encore une synchronisation continue.** Après l'import, les écritures locales et cloud ne se mettent pas automatiquement à jour l'une l'autre. Il faut livrer le moteur de synchronisation bidirectionnelle et sa gestion des conflits avant de présenter la comptabilité cloud comme active.


### Durcissement complémentaire RLS

Les fonctions de vérification d'appartenance utilisées par les politiques RLS ont été déplacées de `public` vers le schéma non exposé `private`. Les politiques de toutes les tables d'entreprise et comptables utilisent désormais ces fonctions privées. Les membres authentifiés conservent le droit d'exécution nécessaire aux politiques, mais les fonctions ne sont plus accessibles comme endpoints RPC publics.

Le conseiller de sécurité Supabase ne signale plus les helpers d'appartenance ni le RPC d'import. Il conserve deux alertes préexistantes :
- `create_company` est un RPC `SECURITY DEFINER` accessible aux utilisateurs authentifiés ; il est volontairement nécessaire à la création atomique d'une entreprise et vérifie `auth.uid()` avant toute opération.
- La protection des mots de passe compromis (Have I Been Pwned) est désactivée dans la configuration Auth du projet. Elle devra être activée dans les paramètres Auth avant la production.

Les tests RLS après déplacement des helpers confirment qu'un membre actif voit les écritures de son entreprise et qu'un utilisateur non membre ne voit aucune écriture.


## Lecture sécurisée de la comptabilité cloud

La fonction Edge `read-accounting` expose une lecture paginée des données comptables d'une entreprise :
- JWT obligatoire et identité résolue auprès de Supabase Auth ;
- vérification d'une adhésion active au périmètre de l'entreprise ;
- rôles autorisés : `admin`, `accountant` et `reader` (lecture seule) ;
- aucun identifiant d'entreprise fourni ne suffit à contourner le contrôle d'adhésion ;
- paramètres, comptes personnalisés, tiers, immobilisations, écritures et lignes sont renvoyés ;
- pagination des écritures par `limit` (1 à 200) et `offset`, avec indicateur `has_more` ;
- les champs de secrets et clés API sont retirés récursivement des paramètres renvoyés ;
- la clé `service_role` reste exclusivement côté serveur.

Requête : `POST /functions/v1/read-accounting` avec le corps JSON `{"company_id":"<uuid>","limit":100,"offset":0}`.

Cette fonction fournit une lecture cloud sécurisée ; elle ne réalise pas encore la synchronisation continue, ne donne aucun droit d'écriture au rôle lecteur et ne connecte pas encore l'assistant IA SaaS.


### Identifiants stables pour la synchronisation — 17 novembre 2026

Le socle d'identité de synchronisation est en préparation sur DEV :

- Le navigateur attribue un UUID stable (client_uid) aux écritures, tiers, immobilisations et comptes personnalisés, puis le conserve dans mizane_v1.
- Un identifiant d'appareil distinct est conservé dans localStorage sous mizane_sync_device_v1 ; il n'est pas copié dans les sauvegardes JSON afin qu'un autre appareil ne se fasse pas passer pour le même appareil.
- accounting_custom_accounts possède désormais client_uid, avec unicité par entreprise.
- La lecture cloud renvoie désormais aussi le client_uid des comptes personnalisés.
- L'import initial sécurisé préserve les UUID locaux lorsqu'ils sont fournis ; les sauvegardes plus anciennes sans UUID restent compatibles grâce à une génération côté serveur.

**Limite :** ce socle ne constitue pas encore le moteur de synchronisation. Il manque encore le protocole d'échange incrémental, les versions/conflits, les suppressions contrôlées, les écritures transactionnelles continues et les tests multi-appareils. Aucun transfert réel n'a été déclenché.


### Journal des modifications pour synchronisation incrémentale — 17 novembre 2026

La migration `20261117090000_accounting_sync_change_log.sql` ajoute `accounting_sync_changes`, journal minimal et cloisonné par entreprise. Des déclencheurs enregistrent les insertions, modifications et suppressions des paramètres, comptes personnalisés, tiers, immobilisations et écritures. Le journal ne stocke pas le contenu comptable, uniquement le type d'entité, l'UUID stable, l'opération, l'entreprise et un curseur séquentiel.

La fonction Edge `read-accounting` version 3 accepte `changes_since` et renvoie jusqu'à 500 événements après ce curseur, avec `changes_pagination.next_cursor` et `has_more`. L'adhésion active est vérifiée avant lecture. Les événements de suppression sont conservés comme tombstones afin que les appareils puissent apprendre qu'un élément a été supprimé.

**Limites actuelles :** le journal ne transporte pas les lignes de données elles-mêmes et aucun endpoint d'écriture incrémentale n'est encore disponible. Les lignes d'écritures sont synchronisées avec leur écriture parent dans une future transaction serveur. Le client ne doit pas encore considérer le journal comme une synchronisation opérationnelle complète.


### Versions de synchronisation et prévention des écrasements — 17 novembre 2026

Les tables de paramètres, comptes personnalisés, tiers, immobilisations et écritures possèdent maintenant un champ `sync_version` initialisé à 1. Un déclencheur serveur incrémente cette version et actualise `updated_at` à chaque modification. La fonction `read-accounting` version 4 renvoie cette version pour chaque entité afin de permettre au futur endpoint d'écriture de comparer la version attendue par l'appareil avec la version actuelle du serveur.

La règle prévue pour le futur push est un contrôle optimiste : une modification ne sera acceptée que si la version attendue correspond à la version serveur ; sinon le serveur renverra un conflit sans écraser les données. Ce contrôle n'est pas encore exposé par une API d'écriture.


## Moteur d'écriture incrémentale cloud — 17 novembre 2026

Le premier endpoint d'écriture incrémentale est désormais déployé sur MIZANE-DEV :

- Edge Function `push-accounting-changes`, JWT obligatoire (`verify_jwt=true`), contrôle côté serveur de l'identité, de l'appartenance active et du rôle `admin` ou `accountant`.
- RPC `apply_accounting_changes(company_id, actor_user_id, operation_id, changes)`, exécutable uniquement par `service_role`. PostgreSQL recontrôle lui-même le rôle actif de l'acteur.
- Lots de 1 à 100 changements, avec opérations `upsert` et `delete` pour les paramètres, comptes personnalisés, tiers, immobilisations et écritures.
- Contrôle optimiste par `expected_sync_version`. Une version périmée renvoie un statut `conflict` et ne remplace pas la valeur serveur.
- Idempotence par `operation_id` et empreinte du contenu : le rejeu d'un même lot renvoie le résultat initial, tandis que la réutilisation de l'identifiant avec un contenu différent est refusée.
- Une écriture et toutes ses lignes sont créées ou remplacées dans la même transaction SQL. Les lignes sont contrôlées et le total débit doit correspondre au total crédit. Les suppressions déclenchent les tombstones du journal de synchronisation.
- Les clés fournisseur sont filtrées des paramètres avant enregistrement. Les opérations sont également inscrites dans `audit_logs`.

La table privée `private.accounting_sync_operations` conserve les résultats d'idempotence ; elle n'est pas exposée par la Data API. Les utilisateurs `authenticated` ne disposent toujours d'aucun droit direct d'écriture sur les tables comptables, et le RPC d'écriture ne leur est pas exécutable.

### Tests transactionnels effectués sur DEV

Les tests ont été exécutés dans des transactions annulées par `ROLLBACK` :

1. création d'un tiers avec version initiale 1 ;
2. rejeu du même `operation_id`, avec retour identique sans doublon ;
3. modification concurrente simulée, passage de version 1 à 2 ;
4. envoi d'une version attendue périmée, conflit détecté et donnée serveur préservée ;
5. création d'une écriture équilibrée avec ses deux lignes ;
6. remplacement transactionnel des lignes et incrément de version ;
7. suppression de l'écriture et de ses lignes ;
8. rejet d'une écriture déséquilibrée, sans donnée partielle conservée.

Les tests se sont terminés sans erreur et les transactions ont été annulées. Aucune donnée comptable de test n'a été conservée.

### Limite fonctionnelle importante

Ce moteur serveur est en place, mais le navigateur n'est pas encore raccordé au push/pull incrémental. Il ne faut donc pas présenter la synchronisation multi-appareils comme opérationnelle : le pont local, la récupération des changements cloud, la gestion des conflits dans l'interface et les essais navigateur restent à réaliser. L'assistant IA SaaS n'est pas encore connecté à ces données.

Le conseiller de sécurité a également signalé une table `public.accounting_sync_operations` vide, avec RLS activée et aucune politique ; elle refuse donc les accès via RLS. Cette table n'est pas utilisée par le nouveau RPC, qui utilise la table privée. Les alertes préexistantes concernant `create_company` et la protection des mots de passe compromis restent à traiter avant production.


## Moteur d'écriture incrémentale — 17 novembre 2026

La migration `20261117092000_accounting_incremental_write_engine.sql` ajoute le RPC `push_accounting_changes` et le registre privé d'idempotence `accounting_sync_operations`. L'Edge Function `push-accounting-changes` exige un JWT valide, vérifie l'appartenance active et le rôle `admin` ou `accountant`, puis appelle le RPC avec l'identité Auth vérifiée.

Le protocole accepte des lots de 1 à 100 opérations et prend en charge les entités `settings`, `custom_account`, `third`, `asset` et `entry`. Chaque opération porte un `client_uid` (sauf les paramètres), un `expected_sync_version`, un type `upsert` ou `delete` et les données de l'entité. Chaque lot porte un `operation_uid` UUID stable : le rejeu du même lot renvoie le résultat enregistré, sans appliquer deux fois les modifications.

Le serveur sérialise les lots d'une entreprise, vérifie toutes les versions avant toute écriture et renvoie un résultat de conflit sans appliquer le lot si une version est périmée. Les écritures et leurs lignes sont traitées dans la même transaction ; la partie double, les journaux, les comptes, les montants et les références de contrepassation sont contrôlés. Les suppressions physiques génèrent des tombstones via les déclencheurs du journal. Toute erreur SQL annule le lot complet.

Le registre d'idempotence n'est pas lisible par les utilisateurs authentifiés : RLS est activée et forcée, aucun accès n'est accordé à `anon` ou `authenticated`, et seuls les appels serveur utilisent `service_role`. Le RPC recontrôle lui-même l'identité et le rôle transmis.

**Limite actuelle :** ce moteur fournit l'API serveur de push, mais le client local n'est pas encore raccordé à ce protocole. La synchronisation bidirectionnelle, le rapprochement automatique des conflits et l'assistant IA SaaS ne sont donc pas encore activés. Les tests exécutés sur DEV utilisent des entreprises temporaires et sont annulés par rollback ; aucune donnée comptable réelle n'a été transférée.
