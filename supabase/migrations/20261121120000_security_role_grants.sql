-- MIZANE: durcissement des privilèges SQL pour les accès publics.
-- Les écritures comptables et la gestion des membres passent par les RPC/Edge Functions
-- contrôlées côté serveur. Les politiques RLS restent la barrière d'accès aux lignes.
begin;

-- Le rôle anon n'a pas besoin de privilèges directs sur les tables applicatives.
revoke all privileges on all tables in schema public from anon;

-- Les clients authentifiés conservent SELECT et les UPDATE déjà protégés par RLS.
-- Les insertions/suppressions et opérations DDL ne doivent pas être accessibles
-- directement depuis le navigateur : elles passent par les fonctions serveur.
revoke insert, delete, truncate, references, trigger
on all tables in schema public from authenticated;

-- Les séquences ne sont pas utilisées directement par le client.
revoke all privileges on all sequences in schema public from anon;
revoke usage, update on all sequences in schema public from authenticated;

-- Appliquer la même règle aux objets futurs créés par le rôle de migration.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke insert, delete, truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke usage, update on sequences from authenticated;

commit;
