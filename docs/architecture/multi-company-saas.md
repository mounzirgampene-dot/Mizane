# Architecture cible — MIZANE multi-entreprises

**Statut :** décision d'architecture (ADR) — à valider avant implémentation  
**Branche :** `docs/multi-company-saas-architecture`  
**Décision structurante :** un compte utilisateur unique peut appartenir à plusieurs entreprises ; son rôle et ses autorisations sont définis séparément dans chaque entreprise.

## 1. Objectifs et invariants

MIZANE évolue d'une application comptable locale (PWA statique + `localStorage`) vers un SaaS multi-entreprises.

Les invariants non négociables sont :

1. Une identité utilisateur unique, authentifiée une seule fois.
2. Une entreprise constitue un espace de données autonome (tenant).
3. Une relation utilisateur–entreprise porte le rôle, l'état d'accès et les permissions de cet utilisateur dans cette entreprise.
4. Un utilisateur peut être administrateur dans l'entreprise A, comptable dans B et lecteur dans C.
5. Aucune donnée comptable d'une entreprise ne doit être lisible ou modifiable depuis une autre entreprise, même en manipulant les requêtes réseau ou le JavaScript du navigateur.
6. Les contrôles d'accès sont appliqués par la base de données (RLS) et, pour les opérations sensibles, par des fonctions serveur ; masquer un bouton dans l'interface ne constitue jamais une autorisation.
7. La migration doit préserver les données locales existantes et ne doit jamais les envoyer automatiquement vers une entreprise choisie sans confirmation explicite.

## 2. Architecture recommandée

### 2.1 Composants

- **Frontend :** application MIZANE actuelle, progressivement adaptée pour utiliser une couche d'accès aux données asynchrone. L'hébergement statique GitHub Pages peut rester temporairement le point de diffusion du frontend.
- **Authentification :** Supabase Auth (inscription, connexion, récupération, vérification d'adresse e-mail et sessions).
- **Base centrale :** PostgreSQL via Supabase.
- **Isolation :** politiques PostgreSQL Row Level Security (RLS), activées sur chaque table contenant des données d'entreprise.
- **Fonctions serveur :** Supabase Edge Functions pour invitations, création d'entreprise, changement de rôle, opérations administratives, tâches sensibles et intégrations IA nécessitant des secrets.
- **Fichiers :** Supabase Storage avec chemins et politiques séparés par entreprise.
- **Audit :** journal append-only des événements de sécurité et des opérations sensibles.

GitHub Pages ne doit contenir aucune clé secrète, clé de service Supabase ou clé fournisseur IA privilégiée. Seule la clé publique/anon du projet Supabase peut être utilisée dans le frontend ; la sécurité dépend alors intégralement de l'authentification et des politiques RLS correctement configurées.

### 2.2 Vue logique

```text
Utilisateur
   |
   v
MIZANE Web / PWA
   |-- Authentification et session
   |-- Sélecteur d'entreprise active
   |-- Interface comptable et permissions d'affichage
   |
   v
Supabase
   |-- Auth : identité unique
   |-- PostgreSQL : entreprises, appartenances, comptabilité
   |-- RLS : isolation par entreprise et rôle
   |-- Edge Functions : invitations et actions sensibles
   |-- Storage : documents privés par entreprise
   |
   v
Journal d'audit / sauvegardes / supervision
```

## 3. Modèle d'identité et d'appartenance

### 3.1 Tables centrales

| Table | Rôle |
|---|---|
| `profiles` | Profil applicatif lié à `auth.users.id` ; informations non comptables de l'utilisateur |
| `companies` | Espace d'entreprise : raison sociale, pays, devise, référentiel, fuseau horaire, paramètres |
| `company_memberships` | Appartenance d'un utilisateur à une entreprise, rôle et statut indépendants |
| `company_invitations` | Invitations ciblées par e-mail, entreprise, rôle, expiration et état |
| `audit_logs` | Historique des actions sensibles, rattaché à l'entreprise et à l'acteur |
| `company_settings` | Paramètres propres à une entreprise si leur volume justifie une table séparée |

La clé de `company_memberships` est le couple (`company_id`, `user_id`). Le rôle n'est jamais stocké globalement dans le profil utilisateur.

### 3.2 Schéma de principe

```sql
create type public.company_role as enum ('admin', 'accountant', 'reader');
create type public.membership_status as enum ('invited', 'active', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  country_code char(2) not null,
  base_currency char(3) not null,
  accounting_standard text not null,
  timezone text not null default 'Africa/Casablanca',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.company_memberships (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.company_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role public.company_role not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Ce SQL décrit le noyau conceptuel ; il ne doit pas être exécuté en production tel quel sans migration versionnée, fonctions de contrôle, politiques RLS, index, tests et revue de sécurité.

## 4. Rôles et autorisations

### Administrateur d'entreprise (`admin`)

- Gérer les informations et paramètres de son entreprise.
- Inviter, suspendre et retirer des membres.
- Attribuer les rôles comptable et lecteur, et gérer les autres administrateurs selon une règle de gouvernance.
- Accéder aux données comptables et aux états.
- Consulter les journaux d'audit et gérer les sauvegardes de l'entreprise.

### Comptable (`accountant`)

- Consulter et saisir les opérations comptables.
- Gérer les journaux, comptes, tiers, rapprochements et immobilisations selon les modules activés.
- Préparer et produire les états comptables.
- Ne peut pas gérer les membres, les rôles, les paramètres de sécurité ni transférer la propriété de l'entreprise.
- Les suppressions et validations définitives devront être définies par permission métier explicite ; elles ne sont pas implicites dans le rôle.

### Lecteur (`reader`)

- Consulter les données et états auxquels l'entreprise lui donne accès.
- Ne peut ni créer, ni modifier, ni supprimer, ni clôturer une opération.
- Ne peut pas gérer les membres ou paramètres.

**Règle importante :** un rôle est attribué par entreprise. Il n'existe pas de rôle universel « administrateur » qui donnerait accès à toutes les entreprises. L'administration de la plateforme MIZANE est un périmètre distinct, réservé à une équipe technique habilitée, audité et non confondu avec les administrateurs clients.

## 5. Isolation des données (multi-tenant)

Toutes les tables métier qui contiennent ou référencent des données d'une entreprise doivent porter un `company_id` non nul : exercices, journaux, écritures, lignes d'écritures, comptes personnalisés, tiers, factures, immobilisations, rapprochements, pièces jointes, paramètres et exports.

Contraintes recommandées :

- Index sur `company_id` et sur les combinaisons de recherche courantes.
- Clés étrangères composites lorsque nécessaire, afin d'empêcher qu'une ligne d'écriture d'une entreprise référence un compte ou un exercice d'une autre.
- `company_id` fixé par le contexte serveur ou validé par RLS ; ne jamais faire confiance à une valeur envoyée par le navigateur.
- RLS activée et forcée sur toutes les tables métier exposées à l'API.
- Aucun accès anonyme aux données comptables.
- Tests négatifs systématiques : un utilisateur de A ne peut ni lire, ni modifier, ni supprimer les enregistrements de B, même s'il connaît leurs UUID.

Exemple de fonction de vérification de l'appartenance active :

```sql
create or replace function public.is_active_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.company_id = target_company
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;
```

Exemple de politique de lecture pour une table métier :

```sql
alter table public.accounting_entries enable row level security;
alter table public.accounting_entries force row level security;

create policy "members read entries in their company"
on public.accounting_entries
for select
to authenticated
using (public.is_active_company_member(company_id));
```

Cette politique n'est qu'un exemple de lecture. Les politiques INSERT, UPDATE et DELETE doivent vérifier le rôle requis et les règles métier. Les fonctions `SECURITY DEFINER` doivent rester minimales, avoir un `search_path` fixé, des privilèges d'exécution limités et faire l'objet d'une revue dédiée.

## 6. Parcours utilisateur

1. L'utilisateur crée un compte MIZANE et vérifie son adresse e-mail.
2. Il crée un espace entreprise en renseignant la raison sociale, le pays, la devise, le référentiel comptable et le fuseau horaire.
3. Il devient premier administrateur de cet espace au sein d'une transaction serveur atomique.
4. Depuis « Équipe », il invite un collaborateur par e-mail et lui attribue un rôle dans cette entreprise.
5. Le collaborateur accepte l'invitation et rejoint l'espace avec son compte existant ou en crée un.
6. À la connexion, MIZANE affiche les entreprises accessibles ; l'utilisateur choisit son espace actif.
7. Le changement d'entreprise recharge le contexte, les paramètres, les données et les permissions ; aucune donnée de l'espace précédent ne doit rester affichée par inadvertance.

L'acceptation d'une invitation doit vérifier le destinataire, le hash du jeton, l'expiration, l'état de l'invitation et l'identité authentifiée. Les jetons en clair ne sont jamais conservés en base.

## 7. Adaptation de l'application actuelle

L'application actuelle utilise `localStorage` via `js/db.js`. Cette persistance reste utile pour le mode hors ligne et les sauvegardes, mais elle ne peut pas être la source d'autorité d'un SaaS multi-utilisateur.

Évolution recommandée :

1. Introduire une interface de dépôt de données (repository) entre les vues et la persistance.
2. Conserver un dépôt local pour le mode hors ligne et les données historiques.
3. Ajouter un dépôt distant Supabase, sélectionné après authentification.
4. Ajouter un contexte `activeCompanyId` explicite ; toutes les opérations distantes reçoivent ce contexte et sont protégées par RLS.
5. Adapter progressivement les modules comptables existants sans réécrire le moteur de partie double.
6. Ne pas synchroniser automatiquement les données locales avant que l'utilisateur ait choisi l'entreprise de destination et confirmé l'import.

Le cache local doit être cloisonné par utilisateur et par entreprise, par exemple avec des clés de cache incluant les deux identifiants. À la déconnexion, au changement d'utilisateur ou au retrait d'un accès, les données privées en cache doivent être purgées ou rendues inaccessibles.

## 8. Synchronisation et mode hors ligne

Pour une première version fiable :

- Les écritures comptables sont créées avec un identifiant stable côté client et un horodatage serveur.
- Chaque enregistrement synchronisable possède un champ de version ou `updated_at`.
- Les conflits ne sont pas résolus par un écrasement silencieux.
- Une écriture comptable validée ne doit pas être remplacée automatiquement par une version locale plus ancienne.
- Les opérations sensibles (clôture, validation, suppression, changement de rôle) exigent une connexion et une autorisation serveur.
- Les files d'attente hors ligne doivent être liées à l'utilisateur et à l'entreprise d'origine.

La stratégie de résolution des conflits devra être définie par type de donnée ; les écritures comptables nécessitent une règle stricte et traçable.

## 9. Sécurité, gouvernance et audit

- MFA recommandé pour les administrateurs, puis imposé selon le niveau de risque.
- Invitations à durée limitée, révocables et à usage unique.
- Protection contre la suppression du dernier administrateur actif d'une entreprise.
- Changement de rôle et retrait d'un membre exécutés côté serveur et journalisés.
- Journal d'audit append-only : invitations, connexions sensibles, changement de rôle, création/validation/contrepassation/clôture d'écriture, export et restauration.
- Secrets IA conservés côté serveur ou chiffrés par utilisateur/entreprise ; jamais dans le code statique ni dans les tables lisibles par tous les membres.
- Sauvegardes PostgreSQL, procédure de restauration testée et politique de conservation documentée.
- Limitation de débit sur inscription, invitations et fonctions sensibles.
- Tests RLS couvrant les trois rôles, plusieurs entreprises et les utilisateurs suspendus.

## 10. Migration des données existantes

La version actuelle doit continuer à fonctionner pendant la transition.

1. Détecter une installation locale existante et proposer une sauvegarde JSON.
2. Authentifier l'utilisateur et lui faire créer ou sélectionner l'entreprise cible.
3. Afficher un aperçu du nombre d'écritures, comptes, tiers, exercices et immobilisations à importer.
4. Valider la structure et les règles comptables avant import.
5. Importer dans une transaction serveur, avec identifiant de lot et protection contre les doublons.
6. Comparer les totaux de débits/crédits, le nombre d'écritures et les soldes avant/après.
7. Conserver le fichier source local tant que l'utilisateur n'a pas confirmé la réussite et la conformité de l'import.

## 11. Plan de réalisation

| Phase | Livrable | Critère de sortie |
|---|---|---|
| 0. Préparation | Projet Supabase de développement, environnements et secrets | Aucun secret dans Git ; environnement isolé |
| 1. Fondations | Schéma profils/entreprises/appartenances/invitations, RLS et tests | Isolation A/B démontrée par tests négatifs |
| 2. Authentification | Inscription, connexion, récupération et profil | Sessions et erreurs gérées proprement |
| 3. Espaces | Création d'entreprise, sélecteur et paramètres | Un compte rejoint plusieurs entreprises |
| 4. Équipe | Invitations, rôles, suspension et révocation | Rôles indépendants et contrôlés côté serveur |
| 5. Comptabilité distante | Dépôts de données et migration progressive des modules | Les écritures restent équilibrées et cloisonnées |
| 6. Migration | Import local guidé et contrôles de rapprochement | Aucune perte ni duplication lors des essais |
| 7. Hors ligne et audit | Cache cloisonné, file de synchronisation, audit et sauvegardes | Conflits et restaurations testés |
| 8. Production | Revue de sécurité, tests de charge, surveillance et déploiement | Feu vert sécurité et plan de retour arrière |

## 12. Décisions à conserver

- **Modèle d'identité :** un utilisateur = un compte global.
- **Modèle d'autorisation :** une appartenance par entreprise, avec un rôle indépendant.
- **Modèle de données :** base PostgreSQL partagée, isolation logique stricte par `company_id` via RLS.
- **Fournisseur recommandé :** Supabase, sous réserve de valider les besoins de résidence des données, coûts, sauvegardes et conformité applicables.
- **Déploiement :** frontend statique possible au départ ; fonctions serveur et base sécurisée obligatoires pour les fonctions multi-entreprises.
- **Périmètre de cette décision :** architecture et plan de réalisation. Aucun système d'authentification ou multi-tenant n'est réputé opérationnel tant que les migrations, politiques, tests et déploiements correspondants n'ont pas été exécutés et vérifiés.
