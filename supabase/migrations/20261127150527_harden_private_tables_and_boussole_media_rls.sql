-- Défense en profondeur : les tables privées restent sans accès direct aux rôles API.
-- Les fonctions SECURITY DEFINER détenues par postgres continuent de les gérer.
ALTER TABLE private.accounting_plan_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.accounting_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.company_ai_credentials ENABLE ROW LEVEL SECURITY;

-- Une version publiée doit appartenir au document auquel le média est rattaché.
DROP POLICY IF EXISTS boussole_media_read_company_published ON public.boussole_media_assets;
CREATE POLICY boussole_media_read_company_published
ON public.boussole_media_assets
FOR SELECT
TO authenticated
USING (
  is_active
  AND EXISTS (
    SELECT 1
    FROM public.boussole_documents d
    WHERE d.id = boussole_media_assets.document_id
      AND d.status = 'published'
      AND (
        d.visibility = 'global'
        OR (d.visibility = 'company' AND private.is_active_company_member(d.company_id))
      )
  )
  AND (
    boussole_media_assets.version_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.boussole_document_versions v
      WHERE v.id = boussole_media_assets.version_id
        AND v.document_id = boussole_media_assets.document_id
        AND v.status = 'published'
    )
  )
);

DROP POLICY IF EXISTS boussole_media_read_global_published ON public.boussole_media_assets;
CREATE POLICY boussole_media_read_global_published
ON public.boussole_media_assets
FOR SELECT
TO anon, authenticated
USING (
  is_active
  AND EXISTS (
    SELECT 1
    FROM public.boussole_documents d
    WHERE d.id = boussole_media_assets.document_id
      AND d.status = 'published'
      AND d.visibility = 'global'
  )
  AND (
    boussole_media_assets.version_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.boussole_document_versions v
      WHERE v.id = boussole_media_assets.version_id
        AND v.document_id = boussole_media_assets.document_id
        AND v.status = 'published'
    )
  )
);
