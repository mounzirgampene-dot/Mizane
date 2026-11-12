// MIZANE — Gestion sécurisée des membres d'une entreprise.
// Déployer comme fonction Supabase : manage-company-members
// Secrets requis côté Supabase : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("MIZANE_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

const fail = (status: number, message: string) => json(status, { error: message });
const validUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const makeToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return fail(405, "Méthode non autorisée.");

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return fail(500, "Configuration serveur incomplète.");

  const authorization = request.headers.get("Authorization") ?? "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === authorization) return fail(401, "Authentification requise.");

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  const actor = authData.user;
  if (authError || !actor) return fail(401, "Session invalide ou expirée.");

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail(400, "Corps de requête invalide.");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "JSON invalide.");
  }

  const action = body.action;

  // L'acceptation repose sur le jeton et l'e-mail authentifié, pas sur un rôle admin.
  if (action === "accept_invitation") {
    const token = typeof body.invitation_token === "string" ? body.invitation_token.trim() : "";
    const email = normalizeEmail(actor.email);
    if (!token || token.length !== 64 || !email) return fail(400, "Invitation ou adresse e-mail invalide.");
    const tokenHash = await hashToken(token);
    const { data: invitation, error } = await adminClient.from("company_invitations")
      .select("id,company_id,email,role,expires_at,accepted_at,revoked_at")
      .eq("token_hash", tokenHash).maybeSingle();
    if (error) return fail(500, "Impossible de vérifier l'invitation.");
    if (!invitation || invitation.email !== email || invitation.accepted_at || invitation.revoked_at ||
        new Date(invitation.expires_at).getTime() <= Date.now()) {
      return fail(400, "Invitation invalide, expirée, révoquée ou destinée à une autre adresse.");
    }
    const { data: prior, error: priorError } = await adminClient.from("company_memberships")
      .select("status").eq("company_id", invitation.company_id).eq("user_id", actor.id).maybeSingle();
    if (priorError) return fail(500, "Impossible de vérifier l'appartenance existante.");
    if (prior?.status === "active") return fail(409, "Vous êtes déjà membre de cette entreprise.");
    const { data: claimed, error: claimError } = await adminClient.from("company_invitations")
      .update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id)
      .is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .select("id").maybeSingle();
    if (claimError || !claimed) return fail(409, "Cette invitation a déjà été utilisée ou n'est plus valide.");
    const { error: upsertError } = await adminClient.from("company_memberships").upsert({
      company_id: invitation.company_id, user_id: actor.id, role: invitation.role, status: "active",
    }, { onConflict: "company_id,user_id" });
    if (upsertError) {
      await adminClient.from("company_invitations").update({ accepted_at: null }).eq("id", invitation.id);
      return fail(500, "Impossible d'ajouter le membre.");
    }
    const { error: auditError } = await adminClient.from("audit_logs").insert({
      company_id: invitation.company_id, actor_user_id: actor.id, action: "invitation.accepted",
      entity_type: "company_membership", entity_id: actor.id,
      details: { invitation_id: invitation.id, role: invitation.role },
    });
    if (auditError) console.error("audit invitation.accepted:", auditError.message);
    return json(200, { accepted: true, company_id: invitation.company_id, role: invitation.role });
  }

  const companyId = body.company_id;
  if (!validUuid(companyId)) return fail(400, "Identifiant d'entreprise invalide.");

  // Le contrôle d'administration est refait côté serveur à chaque requête.
  const { data: actorMembership, error: membershipError } = await adminClient
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", actor.id)
    .maybeSingle();

  if (membershipError) return fail(500, "Impossible de vérifier les droits.");
  if (!actorMembership || actorMembership.status !== "active" || actorMembership.role !== "admin") {
    return fail(403, "Seul un administrateur actif de cette entreprise peut effectuer cette action.");
  }

  const audit = async (event: string, entityType: string, entityId: string, details = {}) => {
    const { error } = await adminClient.from("audit_logs").insert({
      company_id: companyId,
      actor_user_id: actor.id,
      action: event,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
    if (error) throw new Error("Échec de l'enregistrement du journal d'audit.");
  };

  try {
    if (action === "list_company_members") {
      const { data: rows, error } = await adminClient.from("company_memberships")
        .select("user_id,role,status,created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) return fail(500, "Impossible de charger les membres.");
      const ids = (rows ?? []).map((row) => row.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await adminClient.from("profiles").select("id,display_name").in("id", ids)
        : { data: [], error: null };
      if (profileError) return fail(500, "Impossible de charger les profils des membres.");
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const members = await Promise.all((rows ?? []).map(async (row) => {
        const { data } = await adminClient.auth.admin.getUserById(row.user_id);
        const profile = profileById.get(row.user_id);
        return {
          user_id: row.user_id,
          email: data.user?.email ?? null,
          display_name: profile?.display_name ?? null,
          role: row.role,
          status: row.status,
          created_at: row.created_at,
        };
      }));
      return json(200, { members });
    }

    if (action === "list_company_invitations") {
      const { data, error } = await adminClient.from("company_invitations")
        .select("id,email,role,expires_at,created_at")
        .eq("company_id", companyId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return fail(500, "Impossible de charger les invitations en attente.");
      return json(200, { invitations: data ?? [] });
    }

    if (action === "create_invitation") {
      const email = normalizeEmail(body.email);
      const role = body.role;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        return fail(400, "Adresse e-mail invalide.");
      }
      if (role !== "accountant" && role !== "reader") {
        return fail(400, "Le rôle d'invitation doit être comptable ou lecteur.");
      }

      const { data: existing } = await adminClient
        .from("company_invitations")
        .select("id")
        .eq("company_id", companyId)
        .eq("email", email)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .limit(1);
      if (existing?.length) return fail(409, "Une invitation active existe déjà pour cette adresse.");

      const token = makeToken();
      const tokenHash = await hashToken(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: invitation, error } = await adminClient
        .from("company_invitations")
        .insert({
          company_id: companyId,
          email,
          role,
          token_hash: tokenHash,
          invited_by: actor.id,
          expires_at: expiresAt,
        })
        .select("id,email,role,expires_at")
        .single();
      if (error || !invitation) return fail(500, "Impossible de créer l'invitation.");

      await audit("invitation.created", "company_invitation", invitation.id, { email, role });
      // Le jeton est remis une seule fois à l'administrateur appelant.
      // L'envoi par e-mail sera branché sur un fournisseur transactionnel séparé.
      return json(201, { invitation, invitation_token: token });
    }


    if (action === "revoke_invitation") {
      if (!validUuid(body.invitation_id)) return fail(400, "Identifiant d'invitation invalide.");
      const { data, error } = await adminClient
        .from("company_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", body.invitation_id)
        .eq("company_id", companyId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .select("id")
        .maybeSingle();
      if (error) return fail(500, "Impossible de révoquer l'invitation.");
      if (!data) return fail(404, "Invitation active introuvable.");
      await audit("invitation.revoked", "company_invitation", data.id);
      return json(200, { revoked: true });
    }

    if (action === "set_member_role" || action === "set_member_status" || action === "remove_member") {
      const memberId = body.user_id;
      if (!validUuid(memberId)) return fail(400, "Identifiant de membre invalide.");
      if (memberId === actor.id && action !== "set_member_role") {
        return fail(400, "Un administrateur ne peut pas se suspendre ou se retirer lui-même depuis cette fonction.");
      }

      let rpcAction: string;
      let rpcRole: string | null = null;
      let rpcStatus: string | null = null;
      if (action === "set_member_role") {
        if (!["admin", "accountant", "reader"].includes(String(body.role))) return fail(400, "Rôle inconnu.");
        rpcAction = "set_role";
        rpcRole = String(body.role);
      } else if (action === "set_member_status") {
        if (body.status !== "active" && body.status !== "suspended") return fail(400, "Statut inconnu.");
        rpcAction = "set_status";
        rpcStatus = String(body.status);
      } else {
        rpcAction = "remove";
      }

      // La transaction SQL sérialise les changements par entreprise et protège
      // le dernier administrateur même en cas de requêtes concurrentes.
      const { data: result, error: rpcError } = await adminClient.rpc("manage_company_member", {
        p_company_id: companyId,
        p_user_id: memberId,
        p_action: rpcAction,
        p_role: rpcRole,
        p_status: rpcStatus,
      });
      if (rpcError) {
        if (rpcError.code === "P0002") return fail(404, "Membre introuvable.");
        if (rpcError.code === "23514") return fail(409, rpcError.message);
        if (rpcError.code === "22023") return fail(400, rpcError.message);
        console.error("manage_company_member:", rpcError.message);
        return fail(500, "Impossible de modifier ce membre.");
      }

      if (action === "set_member_role") {
        await audit("member.role_changed", "company_membership", memberId, {
          from: result.previous_role, to: rpcRole,
        });
        return json(200, { updated: true, role: rpcRole });
      }
      if (action === "set_member_status") {
        await audit(rpcStatus === "suspended" ? "member.suspended" : "member.reactivated",
          "company_membership", memberId, { previous_status: result.previous_status });
        return json(200, { updated: true, status: rpcStatus });
      }
      await audit("member.removed", "company_membership", memberId, {
        previous_role: result.previous_role,
      });
      return json(200, { removed: true });
    }
    return fail(400, "Action inconnue.");
  } catch (error) {
    console.error("manage-company-members:", error);
    return fail(500, error instanceof Error ? error.message : "Erreur serveur.");
  }
});
