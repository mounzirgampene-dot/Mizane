-- Indexe la clé étrangère utilisée pour retrouver les opérations de synchronisation par acteur.
create index if not exists accounting_sync_operations_actor_user_id_idx
  on private.accounting_sync_operations(actor_user_id);
