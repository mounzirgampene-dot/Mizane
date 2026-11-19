// MIZANE — Historique d'activité et travaux récents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { store, $app, esc, money, router } from "./state.js";

const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
let client = null;
let access = null;

async function getContext() {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || "";
  if (access?.companyId === companyId) return access;
  access = null;
  if (!companyId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const user = sessionData?.session?.user;
  if (!user) return null;
  const { data: membership, error } = await client
    .from("company_memberships")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!membership || membership.status !== "active" || !["admin", "accountant"].includes(membership.role)) return null;
  access = { companyId, user, role: membership.role };
  return access;
}

export async function initWorkHistory() {
  try {
    return Boolean(await getContext());
  } catch (error) {
    console.warn("Historique MIZANE indisponible :", error?.message || error);
    return false;
  }
}

export function canAccessWorkHistory() {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || "";
  return Boolean(access && access.companyId === companyId && ["admin", "accountant"].includes(access.role));
}

function actionText(action) {
  const parts = String(action || "").split(".");
  const operation = parts.at(-1);
  const entity = parts.length > 2 ? parts[1] : parts[0];
  const names = {
    entry: "Écriture comptable",
    third: "Tiers",
    asset: "Immobilisation",
    custom_account: "Compte personnalisé",
    settings: "Paramètres comptables",
    company: "Entreprise",
  };
  const verbs = { upsert: "Enregistrement ou modification", delete: "Suppression", created: "Création" };
  return { entity: names[entity] || "Action", verb: verbs[operation] || "Action" };
}

function actionSummary(row) {
  const summary = row?.details?.summary || {};
  const parts = [];
  if (summary.reference) parts.push("Réf. " + summary.reference);
  if (summary.date) parts.push(summary.date);
  if (summary.journal) parts.push("Journal " + summary.journal);
  if (summary.name) parts.push(summary.name);
  if (summary.type) parts.push(summary.type);
  if (summary.code) parts.push("Compte " + summary.code);
  if (summary.label) parts.push(summary.label);
  if (summary.account) parts.push("Compte " + summary.account);
  if (summary.amount != null) parts.push(money(Number(summary.amount) || 0));
  if (summary.label === "Paramètres comptables") parts.push(summary.label);
  return parts.join(" · ") || "Détail non disponible";
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat(store.settings.locale || "fr-FR", {
    dateStyle: "medium", timeStyle: "short",
  }).format(date);
}

function moduleFor(row) {
  const type = String(row?.entity_type || "");
  if (type.includes("entry")) return "entries";
  if (type.includes("third")) return "thirds";
  if (type.includes("asset") || type.includes("custom_account")) return "tools";
  if (type.includes("settings")) return "settings";
  if (type === "company") return "settings";
  return "dashboard";
}

function renderEvent(row, own = false) {
  const action = actionText(row.action);
  const target = moduleFor(row);
  const actor = row.actor_user_id === access?.user.id ? "Vous" : row.actor_user_id ? "Un membre de l'équipe" : "Compte supprimé";
  return `
    <article class="work-event">
      <div class="work-event-main">
        <strong>${esc(action.entity)} — ${esc(action.verb)}</strong>
        <div class="muted">${esc(actionSummary(row))}</div>
        <small class="muted">${esc(dateLabel(row.created_at))} · ${own ? "Votre activité" : esc(actor)}</small>
      </div>
      <button class="secondary small" type="button" data-work-open="${target}">Ouvrir</button>
    </article>`;
}

async function readEvents(own = false) {
  const context = await getContext();
  if (!context) throw new Error("Accès réservé à l'administrateur et au comptable d'une entreprise active.");
  let query = client
    .from("audit_logs")
    .select("id,actor_user_id,action,entity_type,details,created_at")
    .eq("company_id", context.companyId);
  if (own) query = query.eq("actor_user_id", context.user.id);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

function bindOpenButtons() {
  $app.querySelectorAll("[data-work-open]").forEach(button => {
    button.addEventListener("click", () => router.go(button.dataset.workOpen));
  });
}

function renderEventPage(title, description, own) {
  $app.innerHTML = `
    <div class="row work-page-heading">
      <div><h1>${title}</h1><p class="muted">${description}</p></div>
      <button class="secondary small" id="work-refresh">Actualiser</button>
    </div>
    <section class="card"><div id="work-events" class="work-events"><p class="muted">Chargement de l'historique…</p></div></section>`;
  const load = async () => {
    const target = $app.querySelector("#work-events");
    if (!target) return;
    target.innerHTML = '<p class="muted">Chargement…</p>';
    try {
      const rows = await readEvents(own);
      if (!target.isConnected) return;
      target.innerHTML = rows.length
        ? rows.map(row => renderEvent(row, own)).join("")
        : '<p class="muted">Aucune activité enregistrée pour le moment. Les opérations apparaîtront ici après leur synchronisation avec le cloud.</p>';
      bindOpenButtons();
    } catch (error) {
      if (target.isConnected) target.innerHTML = `<p class="errors">${esc(error?.message || "Lecture de l'historique impossible.")}</p>`;
    }
  };
  $app.querySelector("#work-refresh")?.addEventListener("click", load);
  load();
}

export function viewActivityHistory() {
  renderEventPage("Historique des actions", "Les opérations enregistrées dans le cloud pour cette entreprise.", false);
}

function localWorks() {
  const items = [];
  for (const entry of store.entries || []) {
    items.push({
      date: entry.createdAt || entry.date,
      title: "Écriture #" + entry.id,
      detail: [entry.date, entry.journal, entry.reference].filter(Boolean).join(" · "),
      route: "entries",
      type: "Écriture",
    });
  }
  for (const doc of store.billing?.documents || []) {
    items.push({
      date: doc.createdAt || doc.date,
      title: (doc.type === "quote" ? "Devis " : "Facture ") + (doc.number || "#" + doc.id),
      detail: [doc.customerName, doc.date, doc.status].filter(Boolean).join(" · "),
      route: "billing",
      type: "Facturation",
    });
  }
  for (const third of store.thirds || []) {
    items.push({
      date: third.updatedAt || third.createdAt || "",
      title: third.name || "Tiers sans nom",
      detail: third.type || "Tiers",
      route: "thirds",
      type: "Tiers",
    });
  }
  for (const asset of store.assets || []) {
    items.push({
      date: asset.updatedAt || asset.createdAt || asset.date || "",
      title: asset.name || "Immobilisation sans nom",
      detail: asset.account ? "Compte " + asset.account : "Immobilisation",
      route: "tools",
      type: "Immobilisation",
    });
  }
  return items.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);
}

export function viewMyWork() {
  const works = localWorks();
  $app.innerHTML = `
    <h1>Mes travaux</h1>
    <p class="muted">Retrouvez les écritures, devis, factures, tiers et immobilisations disponibles dans les données de cette entreprise sur cet appareil.</p>
    <section class="card">
      <h2>Documents et opérations récents</h2>
      <div class="work-events">
        ${works.length ? works.map(item => `
          <article class="work-event">
            <div class="work-event-main">
              <strong>${esc(item.title)}</strong>
              <div class="muted">${esc(item.detail || item.type)}</div>
              <small class="muted">${esc(item.type)} · ${esc(item.date ? dateLabel(item.date) : "Date non renseignée")}</small>
            </div>
            <button class="secondary small" type="button" data-work-open="${item.route}">Ouvrir</button>
          </article>`).join("") : '<p class="muted">Aucun travail enregistré sur cet appareil pour le moment.</p>'}
      </div>
    </section>
    <section class="card">
      <h2>Mes actions synchronisées</h2>
      <div id="my-work-events" class="work-events"><p class="muted">Chargement…</p></div>
    </section>
    <p class="muted">Les éléments ci-dessus ouvrent leur module de travail. Les brouillons non enregistrés et les rapports exportés ne sont pas encore archivés dans cet espace.</p>`;
  bindOpenButtons();
  readEvents(true).then(rows => {
    const target = $app.querySelector("#my-work-events");
    if (!target) return;
    target.innerHTML = rows.length
      ? rows.map(row => renderEvent(row, true)).join("")
      : '<p class="muted">Aucune action personnelle synchronisée dans le cloud pour le moment.</p>';
    bindOpenButtons();
  }).catch(error => {
    const target = $app.querySelector("#my-work-events");
    if (target) target.innerHTML = `<p class="errors">${esc(error?.message || "Lecture de vos actions impossible.")}</p>`;
  });
}
