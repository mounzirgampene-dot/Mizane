// MIZANE — Notifications d'anomalies comptables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { $app, esc } from "./state.js";

const COMPANY_KEY = "mizane_active_company_v1";
let client = null;
let context = null;
let unreadCount = 0;

function getClient() {
  if (!client && SUPABASE_URL && SUPABASE_ANON_KEY) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return client;
}

async function getContext(force = false) {
  const companyId = localStorage.getItem(COMPANY_KEY) || "";
  if (!companyId) { context = null; return null; }
  if (!force && context?.companyId === companyId) return context;
  context = null;
  const supabase = getClient();
  if (!supabase) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData?.session?.user;
  if (!user) return null;
  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership || membership.status !== "active" || !["admin","accountant"].includes(membership.role)) return null;
  context = { companyId, user, role: membership.role };
  return context;
}

export async function initNotifications() {
  try {
    await refreshUnreadCount();
    return Boolean(context);
  } catch (error) {
    console.warn("Notifications MIZANE indisponibles :", error?.message || error);
    return false;
  }
}

export function canAccessNotifications() {
  return Boolean(context && context.companyId === (localStorage.getItem(COMPANY_KEY) || "")
    && ["admin","accountant"].includes(context.role));
}

export function getUnreadNotificationCount() {
  return unreadCount;
}

export async function refreshUnreadCount() {
  const ctx = await getContext(true);
  if (!ctx) { unreadCount = 0; return 0; }
  const { count, error } = await getClient()
    .from("accounting_notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", ctx.companyId)
    .is("read_at", null);
  if (error) throw error;
  unreadCount = Number(count) || 0;
  window.dispatchEvent(new CustomEvent("mizane:notifications-changed"));
  return unreadCount;
}

export async function notifySyncFailure(error) {
  const ctx = await getContext(true);
  if (!ctx || ctx.role !== "accountant") return false;
  const message = String(error?.message || error || "Une anomalie a bloqué l’enregistrement cloud.");
  if (/failed to fetch|network|réseau|timeout|timed out|429|502|503|504|session expirée|not authenticated/i.test(message)) return false;
  const { error: rpcError } = await getClient().rpc("create_accounting_alert", {
    p_company_id: ctx.companyId,
    p_title: "Opération comptable bloquée",
    p_message: message.slice(0, 1800),
    p_entity_type: "accounting_sync",
    p_entity_id: null,
    p_details: { source: "cloud_sync_failure" },
  });
  if (rpcError) throw rpcError;
  await refreshUnreadCount();
  return true;
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusLabel(row) {
  if (row.category === "error") return "Erreur détectée";
  if (row.review_status === "confirmed") return "Erreur confirmée";
  if (row.review_status === "dismissed") return "Alerte écartée";
  return "À vérifier";
}

function renderNotification(row) {
  const adminActions = context?.role === "admin" && row.category === "suspicious" && row.review_status === "pending"
    ? `<div class="notification-actions">
        <button class="primary small" type="button" data-notification-review="confirmed" data-notification-id="${esc(row.id)}">Confirmer l’erreur</button>
        <button class="secondary small" type="button" data-notification-review="dismissed" data-notification-id="${esc(row.id)}">Écarter l’alerte</button>
      </div>` : "";
  const markRead = !row.read_at
    ? `<button class="secondary small" type="button" data-notification-read="${esc(row.id)}">Marquer comme lue</button>` : "";
  return `<article class="notification-card ${row.read_at ? "" : "is-unread"}">
    <div class="notification-card-head"><strong>${esc(row.title)}</strong><span class="notification-status">${esc(statusLabel(row))}</span></div>
    <p>${esc(row.message)}</p>
    <small class="muted">${esc(dateLabel(row.created_at))} · ${row.category === "error" ? "Blocage automatique" : "Contrôle après enregistrement"}</small>
    <div class="notification-actions">${markRead}${adminActions}</div>
  </article>`;
}

export async function viewNotifications() {
  $app.innerHTML = `
    <div class="row notification-heading"><div><h1>Notifications</h1><p class="muted">Anomalies détectées et opérations à vérifier.</p></div>
      <button class="secondary small" id="notifications-refresh" type="button">Actualiser</button></div>
    <section class="card"><div id="notifications-list"><p class="muted">Chargement des notifications…</p></div></section>`;
  const target = $app.querySelector("#notifications-list");
  const load = async () => {
    if (!target?.isConnected) return;
    target.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const ctx = await getContext(true);
      if (!ctx) throw new Error("Accès réservé à l’administrateur et au comptable d’une entreprise active.");
      const { data, error } = await getClient()
        .from("accounting_notifications")
        .select("id,event_uid,category,title,message,review_status,read_at,created_at,entity_type,entity_id")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!target.isConnected) return;
      target.innerHTML = data?.length
        ? data.map(renderNotification).join("")
        : '<p class="muted">Aucune notification pour le moment.</p>';
      await refreshUnreadCount();
    } catch (error) {
      if (target.isConnected) target.innerHTML = `<p class="errors">${esc(error?.message || "Lecture des notifications impossible.")}</p>`;
    }
  };
  target.addEventListener("click", async event => {
    const readButton = event.target.closest("[data-notification-read]");
    const reviewButton = event.target.closest("[data-notification-review]");
    try {
      if (readButton) {
        const { error } = await getClient().from("accounting_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", readButton.dataset.notificationRead);
        if (error) throw error;
      } else if (reviewButton && context?.role === "admin") {
        const { error } = await getClient().rpc("review_accounting_notification", {
          p_notification_id: reviewButton.dataset.notificationId,
          p_decision: reviewButton.dataset.notificationReview,
        });
        if (error) throw error;
      } else return;
      await load();
      window.dispatchEvent(new CustomEvent("mizane:notifications-changed"));
    } catch (error) {
      const note = target.querySelector(".errors") || document.createElement("p");
      note.className = "errors";
      note.textContent = error?.message || "Mise à jour impossible.";
      if (!note.isConnected) target.prepend(note);
    }
  });
  $app.querySelector("#notifications-refresh")?.addEventListener("click", load);
  await load();
}

