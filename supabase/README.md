# Supabase — démarrage de l'environnement multi-entreprises

Cette première migration ajoute uniquement les fondations d'identité, d'entreprises et d'appartenances. Elle ne connecte pas encore l'interface MIZANE à Supabase et ne migre aucune donnée comptable.

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

La création d'invitation retourne le jeton une seule fois à l'administrateur appelant. **L'envoi automatique par e-mail n'est pas encore intégré** : le jeton doit être transmis par un canal sûr jusqu'à l'ajout d'un fournisseur d'e-mail transactionnel. Ne pas l'inscrire dans des journaux publics.

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
