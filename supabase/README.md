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
- `import_accounting_snapshot(company_id, snapshot)` : import initial atomique, réservé aux rôles `admin` et `accountant`, avec contrôle de la partie double et exclusion des clés API.
- `create_company(...)` : fonction atomique qui crée l'entreprise et attribue le rôle initial `admin`.
- RLS et politiques de lecture / mise à jour d'administration.

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
