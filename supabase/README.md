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
- `company_invitations` : structure des invitations ; l'émission et l'acceptation seront ajoutées dans une Edge Function.
- `company_settings` : paramètres propres à l'entreprise.
- `audit_logs` : journal des événements sensibles.
- `create_company(...)` : fonction atomique qui crée l'entreprise et attribue le rôle initial `admin`.
- RLS et politiques de lecture / mise à jour d'administration.

Les clients ne disposent volontairement d'aucune politique pour créer directement des appartenances, modifier des rôles ou écrire des événements d'audit. Ces actions doivent passer par des fonctions serveur contrôlées.

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
- Les invitations, la révocation, le changement de rôle et la protection contre la suppression du dernier administrateur nécessitent des Edge Functions.
- Les tables comptables existantes ne sont pas encore migrées vers PostgreSQL et n'ont donc pas encore de `company_id`.
- Le mode local actuel reste inchangé.
- La migration n'a pas été exécutée sur un projet Supabase : aucun accès à un projet ou à ses secrets n'a été fourni dans cette étape.

## Règle de livraison

Ne pas activer le mode multi-entreprises en production avant que les tests RLS positifs et négatifs, les Edge Functions, les tests d'invitation, la migration des données et le parcours de retour arrière aient été validés.
