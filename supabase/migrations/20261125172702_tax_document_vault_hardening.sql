-- Prevent metadata reassignment and verification rollback by client users.
begin;
create or replace function private.guard_company_tax_document_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id,new.company_id,new.declaration_id,new.category,new.file_name,new.mime_type,new.file_size,
      new.reference_date,new.notes,new.storage_path,new.uploaded_by,new.created_at)
     is distinct from
     (old.id,old.company_id,old.declaration_id,old.category,old.file_name,old.mime_type,old.file_size,
      old.reference_date,old.notes,old.storage_path,old.uploaded_by,old.created_at) then
    raise exception 'Les métadonnées structurelles d’un justificatif sont immuables.' using errcode = '42501';
  end if;
  if old.status = 'verified' and
     (new.status is distinct from old.status or new.verified_by is distinct from old.verified_by
      or new.verified_at is distinct from old.verified_at) then
    raise exception 'Un justificatif vérifié ne peut pas être rétrogradé.' using errcode = '42501';
  end if;
  if new.status = 'verified' and
     (new.verified_by is distinct from (select auth.uid()) or new.verified_at is null) then
    raise exception 'La vérification doit être attribuée à l’utilisateur connecté.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_company_tax_document_update() from public, anon;
grant execute on function private.guard_company_tax_document_update() to authenticated;
drop trigger if exists guard_company_tax_document_update on public.company_tax_documents;
create trigger guard_company_tax_document_update
before update on public.company_tax_documents
for each row execute function private.guard_company_tax_document_update();
commit;
