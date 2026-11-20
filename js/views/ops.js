// MIZANE — Écran Outils : clôture d'exercice, immobilisations & amortissements, rapprochement bancaire.
import { postEntry, validateEntry, toCSV } from "../accounting.js";
import { AMORT_METHODS, amortizationSchedule, dotationLines, parseBankCSV, matchBankLines, bankLineKey, reconcileBankLine, diagnoseBankLine, closingProposal } from "../finance.js";
import { saveStore, downloadBlob } from "../db.js";
import { store, planAccounts, $app, router, toast, esc, money, openModal, closeModal } from "../state.js";

export function viewTools() {
  const s = store.settings;
  const assets = store.assets || [];
  $app.innerHTML = `
    <h1>Outils comptables</h1>

    <div class="card">
      <h2>🗓 Clôture d'exercice & à-nouveaux</h2>
      <p class="muted">Exercice en cours : ${esc(s.exerciceStart)} → ${esc(s.exerciceEnd)}. La clôture transfère les soldes des classes 6 et 7 au compte 12 (résultat), puis reporte les soldes des classes 1 à 5 en ouverture du nouvel exercice.</p>
      <div class="row">
        <div><label>Nouvel exercice — début</label><input type="date" id="cl-start" value="${esc(s.exerciceEnd ? nextDay(s.exerciceEnd) : "")}"></div>
        <div><label>Nouvel exercice — fin</label><input type="date" id="cl-end"></div>
        <div class="nogrow"><button id="cl-run">Clôturer et générer les à-nouveaux</button></div>
      </div>
      <div id="cl-result" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h2>🏢 Immobilisations & amortissements</h2>
      <div class="row">
        <div><label>Libellé</label><input id="am-name" placeholder="Ex. Matériel informatique"></div>
        <div><label>Compte immobilisation</label><input id="am-account" list="am-accounts" placeholder="Ex. 2240"><datalist id="am-accounts">${planAccounts.filter((a) => /^[2]/.test(a.code)).map((a) => `<option value="${a.code}">${esc(a.label)}</option>`).join("")}</datalist></div>
        <div><label>Valeur (HT)</label><div class="amount-with-calc"><input type="number" id="am-amount" min="0" step="0.01"><button type="button" class="secondary small" id="am-amount-calc" title="Calculer la valeur">∑</button></div></div>
      </div>
      <div class="row">
        <div><label>Date de mise en service</label><input type="date" id="am-date" value="${esc(s.exerciceStart)}"></div>
        <div><label>Durée (années)</label><input type="number" id="am-years" min="1" max="30" value="5"></div>
        <div><label>Méthode</label><select id="am-method">${Object.entries(AMORT_METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></div>
        <div class="nogrow"><button id="am-add">Ajouter</button></div>
      </div>
      ${assets.length === 0 ? `<p class="muted">Aucune immobilisation enregistrée.</p>` : `
      <div class="table-wrap" style="margin-top:10px"><table>
        <thead><tr><th>Libellé</th><th>Compte</th><th>Valeur</th><th>Méthode</th><th>Durée</th><th class="num">Déjà amorti</th><th class="num">VNC</th><th></th></tr></thead>
        <tbody>${assets.map((a, i) => {
          const cumul = Number(a.amortized) || 0;
          return `<tr><td>${esc(a.name)}</td><td>${esc(a.account)}</td><td class="num">${money(a.amount)}</td><td>${esc(AMORT_METHODS[a.method] || a.method)}</td><td>${a.years} an(s)</td>
          <td class="num">${money(cumul)}</td><td class="num">${money(a.amount - cumul)}</td>
          <td><button class="secondary small" data-sched="${i}">Plan</button> <button class="secondary small" data-edit-asset="${i}">Modifier</button> <button class="danger small" data-del-asset="${i}">✕</button></td></tr>`;
        }).join("")}</tbody>
      </table></div>
      <div class="actions"><button id="am-dotation">Générer la dotation de l'exercice</button></div>`}
      <div id="am-result" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h2>🏦 Rapprochement bancaire</h2>
      <p class="muted">Collez votre relevé bancaire (une ligne par opération : <code>date;libellé;montant</code>). Dates acceptées : JJ/MM/AAAA ou AAAA-MM-JJ. Utilisez un montant positif pour un crédit bancaire et négatif pour un débit, selon le sens des écritures de trésorerie de votre comptabilité.</p>
      <textarea id="bk-text" rows="6" placeholder="10/01/2025;Virement client;1000000&#10;12/01/2025;Fournisseur Diallo;-500000"></textarea>
      <div class="row">
        <div><label for="bk-days">Tolérance de date</label><select id="bk-days"><option value="0">Même jour</option><option value="2">± 2 jours</option><option value="4" selected>± 4 jours</option><option value="7">± 7 jours</option><option value="10">± 10 jours</option></select></div>
        <div class="nogrow"><button id="bk-run">Rapprocher</button></div>
      </div>
      <div id="bk-result" style="margin-top:10px"></div>
    </div>
  `;

  document.getElementById("am-amount-calc")?.addEventListener("click", () => openCalculator(document.getElementById("am-amount")));

  // ---- Clôture ----
  document.getElementById("cl-run").addEventListener("click", () => {
    const newStart = document.getElementById("cl-start").value;
    const newEnd = document.getElementById("cl-end").value;
    if (!newStart || !newEnd) return toast("Renseignez les dates du nouvel exercice.");
    const { closing, anew, resultat } = closingProposal(store, s.exerciceStart, s.exerciceEnd, newStart);
    const out = document.getElementById("cl-result");
    if (!closing && !anew) { out.innerHTML = `<p class="muted">Rien à clôturer : aucune écriture sur cet exercice.</p>`; return; }
    const checks = [closing, anew].filter(Boolean).map((e) => ({ e, v: validateEntry(store, e) }));
    if (checks.some((c) => !c.v.ok)) {
      out.innerHTML = `<ul class="errors">${checks.flatMap((c) => c.v.errors).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
      return;
    }
    out.innerHTML = `
      <p class="ok-msg">✓ Proposition prête. Résultat de l'exercice : ${money(resultat)} (${resultat >= 0 ? "bénéfice" : "perte"}).</p>
      ${closing ? `<p>Écriture de clôture au ${esc(closing.date)} : ${closing.lines.length} lignes.</p>` : ""}
      ${anew ? `<p>Écriture d'à-nouveaux au ${esc(anew.date)} : ${anew.lines.length} comptes reportés.</p>` : ""}
      <div class="actions"><button id="cl-post">Valider la clôture</button></div>`;
    document.getElementById("cl-post").addEventListener("click", () => {
      for (const e of [closing, anew]) if (e) postEntry(store, e);
      s.exerciceStart = newStart;
      s.exerciceEnd = newEnd;
      saveStore(store);
      toast("✓ Exercice clôturé. À-nouveaux générés pour " + newStart + ".");
      router.go("entries");
    });
  });

  // ---- Immobilisations ----
  document.getElementById("am-add").addEventListener("click", () => {
    const name = document.getElementById("am-name").value.trim();
    const account = document.getElementById("am-account").value.trim();
    const amount = Number(document.getElementById("am-amount").value);
    const years = Number(document.getElementById("am-years").value);
    if (!name || !account) return toast("Libellé et compte obligatoires.");
    if (!amount || amount <= 0) return toast("Valeur invalide.");
    if (!years || years < 1) return toast("Durée invalide.");
    if (!store.assets) store.assets = [];
    store.assets.push({ name, account, amount, years, method: document.getElementById("am-method").value, date: document.getElementById("am-date").value, amortized: 0 });
    saveStore(store);
    toast("✓ Immobilisation ajoutée.");
    router.render();
  });
  $app.querySelectorAll("[data-edit-asset]").forEach((b) => b.addEventListener("click", () => {
    const index = Number(b.dataset.editAsset);
    const asset = store.assets[index];
    if (!asset) return;
    const locked = (Number(asset.amortized) || 0) > 0;
    openModal(`
      <h2>Modifier l'immobilisation</h2>
      <div class="row">
        <div><label for="am-edit-name">Libellé</label><input id="am-edit-name" value="${esc(asset.name || "")}" required></div>
        <div><label for="am-edit-account">Compte immobilisation</label><input id="am-edit-account" list="am-edit-accounts" value="${esc(asset.account || "")}" ${locked ? "disabled" : ""}><datalist id="am-edit-accounts">${planAccounts.filter((a) => /^[2]/.test(a.code)).map((a) => `<option value="${a.code}">${esc(a.label)}</option>`).join("")}</datalist></div>
        <div><label for="am-edit-amount">Valeur (HT)</label><input id="am-edit-amount" type="number" min="0.01" step="0.01" value="${Number(asset.amount) || 0}" ${locked ? "disabled" : ""}></div>
      </div>
      <div class="row">
        <div><label for="am-edit-date">Date de mise en service</label><input id="am-edit-date" type="date" value="${esc(asset.date || "")}" ${locked ? "disabled" : ""}></div>
        <div><label for="am-edit-years">Durée (années)</label><input id="am-edit-years" type="number" min="1" max="30" step="1" value="${Number(asset.years) || 1}" ${locked ? "disabled" : ""}></div>
        <div><label for="am-edit-method">Méthode</label><select id="am-edit-method" ${locked ? "disabled" : ""}>${Object.entries(AMORT_METHODS).map(([key, label]) => `<option value="${key}" ${asset.method === key ? "selected" : ""}>${label}</option>`).join("")}</select></div>
      </div>
      ${locked ? '<p class="muted">Cette immobilisation a déjà été amortie : seul son libellé peut être modifié afin de préserver l’historique comptable.</p>' : ""}
      <div class="actions"><button type="button" class="secondary" data-close>Annuler</button><button type="button" id="am-edit-save">Enregistrer les modifications</button></div>`);
    document.getElementById("am-edit-save")?.addEventListener("click", () => {
      const name = document.getElementById("am-edit-name").value.trim();
      const account = document.getElementById("am-edit-account").value.trim();
      const amount = Number(document.getElementById("am-edit-amount").value);
      const date = document.getElementById("am-edit-date").value;
      const years = Number(document.getElementById("am-edit-years").value);
      const method = document.getElementById("am-edit-method").value;
      if (!name) return toast("Le libellé est obligatoire.");
      if (!locked && !account) return toast("Le compte immobilisation est obligatoire.");
      if (!locked && (!Number.isFinite(amount) || amount <= 0)) return toast("Valeur invalide.");
      if (!locked && (!Number.isInteger(years) || years < 1 || years > 30)) return toast("La durée doit être comprise entre 1 et 30 ans.");
      if (!locked && !date) return toast("La date de mise en service est obligatoire.");
      Object.assign(asset, { name });
      if (!locked) Object.assign(asset, { account, amount, date, years, method });
      saveStore(store);
      closeModal();
      toast("✓ Immobilisation modifiée.");
      router.render();
    });
  }));
  $app.querySelectorAll("[data-del-asset]").forEach((b) => b.addEventListener("click", () => {
    store.assets.splice(Number(b.dataset.delAsset), 1);
    saveStore(store);
    router.render();
  }));
  $app.querySelectorAll("[data-sched]").forEach((b) => b.addEventListener("click", () => {
    const a = store.assets[Number(b.dataset.sched)];
    const sched = amortizationSchedule(a.amount, a.years, a.method);
    openModal(`
      <h2>Plan d'amortissement — ${esc(a.name)}</h2>
      <table><thead><tr><th>Année</th><th class="num">Taux</th><th class="num">Annuité</th><th class="num">Cumul</th><th class="num">VNC</th></tr></thead>
      <tbody>${sched.map((r) => `<tr><td>${r.year}</td><td class="num">${r.rate} %</td><td class="num">${money(r.annuite)}</td><td class="num">${money(r.cumul)}</td><td class="num">${money(r.vnc)}</td></tr>`).join("")}</tbody></table>
      <div class="actions"><button class="secondary" data-close>Fermer</button></div>`);
  }));

  document.getElementById("am-dotation")?.addEventListener("click", () => {
    const lines = dotationLines(store.assets);
    if (lines.length < 2) return toast("Toutes les immobilisations sont déjà amorties.");
    const entry = { date: s.exerciceEnd, journal: "OD", reference: "Dotations " + s.exerciceEnd.slice(0, 4), lines };
    const v = validateEntry(store, entry);
    if (!v.ok) return toast(v.errors[0]);
    const out = document.getElementById("am-result");
    out.innerHTML = `
      <p>✓ Dotation proposée : ${lines.length / 2} immobilisation(s), total ${money(lines.reduce((a, l) => a + l.debit, 0))}.</p>
      <div class="actions"><button id="am-post">Valider l'écriture</button></div>`;
    document.getElementById("am-post").addEventListener("click", () => {
      const res = postEntry(store, entry);
      if (!res.ok) return toast(res.errors[0]);
      const annuities = {};
      for (const l of lines) if (l.credit) {
        const code = String(l.account).replace(/^28/, "2");
        annuities[code] = (annuities[code] || 0) + l.credit;
      }
      for (const a of store.assets) a.amortized = Math.round(((Number(a.amortized) || 0) + (annuities[a.account] || 0)) * 100) / 100;
      saveStore(store);
      toast(`✓ Écriture de dotations #${res.entry.id} enregistrée.`);
      router.go("entries");
    });
  });

  // ---- Rapprochement bancaire ----
  const renderBankResult = (session) => {
    const out = document.getElementById("bk-result");
    if (!out) return;
    const lines = session.lines || [];
    const ok = lines.filter(m => m.status === "matched").length;
    const pending = lines.length - ok;
    const totalBank = lines.reduce((sum,line) => sum + Number(line.amount || 0),0);
    const totalMatched = lines.filter(line => line.status === "matched").reduce((sum,line) => sum + Number(line.amount || 0),0);
    out.innerHTML = `
      <div class="grid cols-2">
        <div class="card kpi"><div class="value">${ok} / ${lines.length}</div><div class="label">Opérations rapprochées</div></div>
        <div class="card kpi"><div class="value">${pending}</div><div class="label">À vérifier</div></div>
      </div>
      <p class="muted">Relevé du ${esc(session.createdAt.slice(0,10))} · Tolérance : ±${session.days} jour(s). Total relevé : ${money(totalBank)} ; total rapproché : ${money(totalMatched)}.</p>
      <div class="row" style="margin:10px 0"><label><input type="checkbox" id="bk-unmatched-only"> Afficher uniquement les opérations à vérifier</label></div>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Écriture</th><th>Compte</th><th>Action / état</th></tr></thead>
      <tbody>${lines.map((m,index) => {
        const options = (m.candidates || []).map(id => `<option value="${Number(id)}" ${Number(id)===Number(m.match)?"selected":""}>Écriture #${Number(id)}</option>`).join("");
        return `<tr data-bk-row data-bk-status="${m.status}"><td>${esc(m.date)}</td><td>${esc(m.label)}</td><td class="num">${money(m.amount)}</td>
          <td>${m.match ? `#${m.match} · ${esc(m.matchDate || "")}` : (m.candidates.length ? `Possibles : #${m.candidates.join(", #")}` : "Aucune correspondance")}</td>
          <td>${m.matchAccount ? esc(m.matchAccount) : "—"}</td>
          <td>${m.match ? `<span class="ok-msg">✓ ${m.manuallyMatched ? "Validée manuellement" : "Rapprochée"}</span>` : `<span class="warn">À vérifier</span>`}
          ${m.status !== "matched" && m.candidates.length ? `<div class="row"><select data-bk-choice="${index}"><option value="">Choisir l'écriture</option>${options}</select><button class="small" data-bk-match="${index}">Valider</button></div>` : ""}
          ${m.status !== "matched" ? (() => { const d = diagnoseBankLine(m); return `<p class="muted">${esc(d.label)} — ${esc(d.hint)}</p><button class="secondary small" data-bk-adjust="${index}">Préparer une écriture</button>`; })() : ""}
          ${m.status === "matched" ? `<button class="secondary small" data-bk-unmatch="${index}">Défaire</button>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div>
      <div class="actions"><button class="secondary" id="bk-csv">⬇ Exporter le rapport CSV</button></div>
      <p class="muted">Les rapprochements et écritures de régularisation sont enregistrés dans les données synchronisées de l’entreprise. Vérifiez toujours les comptes proposés avant de comptabiliser ; la TVA n’est pas calculée automatiquement.</p>`;
    document.getElementById("bk-unmatched-only")?.addEventListener("change", event => {
      out.querySelectorAll("[data-bk-row]").forEach(row => { row.hidden = event.target.checked && row.dataset.bkStatus !== "unmatched"; });
    });
    out.querySelectorAll("[data-bk-match]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.bkMatch);
      const selected = out.querySelector(`[data-bk-choice="${index}"]`)?.value;
      if (!selected) return toast("Choisissez une écriture comptable.");
      try {
        const updated = reconcileBankLine(session.lines[index], Number(selected), store);
        const duplicate = session.lines.some((line,i) => i !== index && Number(line.match) === Number(selected));
        if (duplicate) return toast("Cette écriture est déjà affectée à une autre ligne du relevé.");
        session.lines[index] = updated;
        saveStore(store);
        renderBankResult(session);
      } catch(error) { toast(error.message); }
    }));
    out.querySelectorAll("[data-bk-adjust]").forEach(button => button.addEventListener("click", () => {
      const index = Number(button.dataset.bkAdjust);
      const line = session.lines[index];
      if (!line || line.status === "matched") return;
      const diagnosis = diagnoseBankLine(line);
      const bankAccounts = planAccounts.filter(account => /^5/.test(String(account.code)));
      const otherAccounts = planAccounts.filter(account => !/^5/.test(String(account.code)));
      if (!bankAccounts.length || !otherAccounts.length) return toast("Le plan comptable ne contient pas les comptes nécessaires.");
      const preferred = diagnosis.type === "bank_fee"
        ? otherAccounts.find(account => /frais|commission|agios|banque/i.test(account.label || ""))
        : diagnosis.type === "financial_income"
          ? otherAccounts.find(account => /^[67]/.test(String(account.code)) && /financier|interet/i.test(account.label || ""))
          : null;
      openModal(
        "<h2>Préparer une écriture de régularisation</h2>" +
        "<p class=\"muted\">" + esc(line.date) + " · " + esc(line.label) + " · " + money(line.amount) + "</p>" +
        "<p>" + esc(diagnosis.label) + ". Vérifiez la nature de l’opération et choisissez les comptes.</p>" +
        "<label for=\"bk-adjust-bank\">Compte bancaire (classe 5)</label>" +
        "<select id=\"bk-adjust-bank\">" + bankAccounts.map(account => "<option value=\"" + esc(account.code) + "\">" + esc(account.code) + " — " + esc(account.label) + "</option>").join("") + "</select>" +
        "<label for=\"bk-adjust-counter\">Compte de contrepartie</label>" +
        "<select id=\"bk-adjust-counter\">" + otherAccounts.map(account => "<option value=\"" + esc(account.code) + "\" " + (preferred && account.code === preferred.code ? "selected" : "") + ">" + esc(account.code) + " — " + esc(account.label) + "</option>").join("") + "</select>" +
        "<p class=\"muted\">Aucune écriture ne sera créée avant votre validation. La proposition ne calcule pas automatiquement la TVA.</p>" +
        "<div class=\"actions\"><button type=\"button\" class=\"secondary\" data-close>Annuler</button><button type=\"button\" id=\"bk-adjust-confirm\">Valider et comptabiliser</button></div>"
      );
      document.getElementById("bk-adjust-confirm")?.addEventListener("click", () => {
        const bankCode = document.getElementById("bk-adjust-bank")?.value;
        const counterCode = document.getElementById("bk-adjust-counter")?.value;
        if (!bankCode || !counterCode || bankCode === counterCode) return toast("Sélectionnez deux comptes différents.");
        const amount = Math.round(Math.abs(Number(line.amount)) * 100) / 100;
        const entry = { date: line.date, journal: "BQ", reference: "RAPPRO-" + line.date + "-" + (index + 1), lines: [
          { account: bankCode, label: line.label, debit: line.amount > 0 ? amount : 0, credit: line.amount < 0 ? amount : 0 },
          { account: counterCode, label: line.label, debit: line.amount < 0 ? amount : 0, credit: line.amount > 0 ? amount : 0 },
        ] };
        const validation = validateEntry(store, entry);
        if (!validation.ok) return toast(validation.errors[0]);
        const result = postEntry(store, entry);
        if (!result.ok) return toast(result.errors?.[0] || "Impossible de comptabiliser cette écriture.");
        session.lines[index] = { ...line, match: result.entry.id, matchAccount: bankCode, matchDate: line.date, status: "matched", manuallyMatched: true, adjustment: true };
        saveStore(store);
        closeModal();
        toast("Écriture de régularisation comptabilisée.");
        renderBankResult(session);
      });
    }));
    out.querySelectorAll("[data-bk-unmatch]").forEach(button => button.addEventListener("click", () => {
      const line = session.lines[Number(button.dataset.bkUnmatch)];
      line.match = null; line.matchAccount = null; line.matchDate = null; line.status = "unmatched"; line.manuallyMatched = false;
      saveStore(store); renderBankResult(session);
    }));
    document.getElementById("bk-csv")?.addEventListener("click", () => {
      downloadBlob(new Blob(["\ufeff" + toCSV(lines.map(m => ({
        date:m.date,libelle:m.label,montant:m.amount,ecriture:m.match||"",compte:m.matchAccount||"",
        etat:m.status==="matched"?"Rapprochée":"À vérifier",validation:m.manuallyMatched?"Manuelle":"Automatique"
      })))],{type:"text/csv;charset=utf-8"}),"mizane-rapprochement.csv");
    });
  };

  document.getElementById("bk-run").addEventListener("click", () => {
    const lines = parseBankCSV(document.getElementById("bk-text").value);
    const out = document.getElementById("bk-result");
    if (!lines.length) { out.innerHTML = `<p class="errors">Aucune ligne exploitable. Format attendu : <code>date;libellé;montant</code></p>`; return; }
    const priorKeys = new Set((store.settings.bankReconciliations || []).flatMap(session => (session.lines || []).map(bankLineKey)));
    const unique = lines.filter(line => !priorKeys.has(bankLineKey(line)));
    if (!unique.length) { out.innerHTML = '<p class="warn">Toutes les opérations de ce relevé ont déjà été importées. Aucun doublon créé.</p>'; return; }
    const days = Number(document.getElementById("bk-days").value) || 0;
    const matched = matchBankLines(store, unique, days);
    const session = { id: globalThis.crypto?.randomUUID?.() || "bk-" + Date.now(), createdAt:new Date().toISOString(), days, lines:matched };
    if (!Array.isArray(store.settings.bankReconciliations)) store.settings.bankReconciliations = [];
    store.settings.bankReconciliations.unshift(session);
    store.settings.bankReconciliations = store.settings.bankReconciliations.slice(0,50);
    saveStore(store);
    renderBankResult(session);
    if (lines.length > unique.length) toast((lines.length-unique.length) + " ligne(s) déjà importée(s) ignorée(s).");
  });

  // Historique des relevés déjà traités
  if ((store.settings.bankReconciliations || []).length) {
    const history = document.createElement("div");
    history.className = "card";
    history.innerHTML = `<h3>Historique des rapprochements</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Opérations</th><th>Rapprochées</th><th>À vérifier</th><th></th></tr></thead><tbody>${store.settings.bankReconciliations.map((session,index) => {
      const ok=(session.lines||[]).filter(line=>line.status==="matched").length;
      return `<tr><td>${esc(session.createdAt.slice(0,10))}</td><td>${session.lines.length}</td><td>${ok}</td><td>${session.lines.length-ok}</td><td><button class="secondary small" data-bk-history="${index}">Ouvrir</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
    document.getElementById("bk-result").after(history);
    history.querySelectorAll("[data-bk-history]").forEach(button => button.addEventListener("click", () => renderBankResult(store.settings.bankReconciliations[Number(button.dataset.bkHistory)])));
  }
}

function nextDay(d) {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}


// ---- Calculatrice générale et financière ----
const CALC_HISTORY_KEY = "mizane_calculator_history_v1";

function readCalculatorHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(CALC_HISTORY_KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 30) : [];
  } catch { return []; }
}

function recordCalculatorHistory(expression, result) {
  if (!Number.isFinite(result)) return;
  const history = readCalculatorHistory();
  history.unshift({ expression, result: Math.round((result + Number.EPSILON) * 1e8) / 1e8, date: new Date().toISOString() });
  try { localStorage.setItem(CALC_HISTORY_KEY, JSON.stringify(history.slice(0, 30))); } catch {}
  renderCalculatorHistory();
}

function renderCalculatorHistory() {
  const target = document.getElementById("calc-history-list");
  if (!target) return;
  const history = readCalculatorHistory();
  target.innerHTML = history.length ? history.map((item, index) => `
    <div class="row" style="justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <div><div>${esc(item.expression)}</div><strong>${formatCalc(item.result)}</strong></div>
      <div class="row" style="gap:6px">
        <button type="button" class="secondary small" data-history-copy="${Number(item.result)}" title="Copier le résultat">Copier</button>
        <button type="button" class="danger small" data-history-delete="${index}" title="Supprimer ce calcul">Supprimer</button>
      </div>
    </div>`).join("") : '<p class="muted">Aucun calcul enregistré pour le moment.</p>';
  target.querySelectorAll("[data-history-delete]").forEach((button) => button.addEventListener("click", () => {
    const history = readCalculatorHistory();
    history.splice(Number(button.dataset.historyDelete), 1);
    try { localStorage.setItem(CALC_HISTORY_KEY, JSON.stringify(history)); } catch {}
    renderCalculatorHistory();
    toast("Calcul supprimé de l'historique.");
  }));
  target.querySelectorAll("[data-history-copy]").forEach((button) => button.addEventListener("click", async () => {
    const value = button.dataset.historyCopy;
    try {
      await navigator.clipboard.writeText(value);
      toast("Résultat copié.");
    } catch {
      openModal(`<h2>Résultat</h2><input id="calc-history-fallback" readonly value="${esc(value)}"><p class="muted">Sélectionnez puis copiez ce montant.</p><div class="actions"><button class="secondary" data-close>Fermer</button></div>`);
      document.getElementById("calc-history-fallback")?.addEventListener("focus", (event) => event.target.select());
    }
  }));
}

export function viewCalculator() {
  $app.innerHTML = `
    <h1>Calculatrice</h1>
    <p class="muted">Effectuez vos calculs courants, puis utilisez les outils financiers pour calculer un pourcentage ou la TVA.</p>
    <div class="grid cols-2 calculator-layout">
      <section class="card">
        <h2>Calculatrice classique</h2>
        ${calculatorMarkup("main")}
      </section>
      <section class="card">
        <h2>Calcul financier</h2>
        <div class="calculator-finance">
          <label for="calc-amount">Montant</label>
          <input id="calc-amount" type="number" min="0" step="0.01" placeholder="Ex. 1000">
          <label for="calc-rate">Taux (%)</label>
          <input id="calc-rate" type="number" min="0" step="0.01" value="20">
          <div class="actions">
            <button class="secondary" id="calc-percent">Calculer le pourcentage</button>
            <button class="secondary" id="calc-vat-ht">Montant HT depuis TTC</button>
            <button class="secondary" id="calc-vat-ttc">Montant TTC depuis HT</button>
          </div>
          <div class="calculator-result" id="calc-finance-result" aria-live="polite">Le résultat apparaîtra ici.</div>
          <button class="secondary" id="calc-use-finance" disabled>Afficher le résultat</button>
        </div>
      </section>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2>Historique des calculs</h2>
        <button type="button" class="secondary small" id="calc-history-clear">Effacer l'historique</button>
      </div>
      <p class="muted">Les 30 derniers calculs sont conservés sur cet appareil.</p>
      <div id="calc-history-list"></div>
    </section>
  `;
  renderCalculatorHistory();
  document.getElementById("calc-history-clear").addEventListener("click", () => {
    if (!readCalculatorHistory().length) return;
    try { localStorage.removeItem(CALC_HISTORY_KEY); } catch {}
    renderCalculatorHistory();
    toast("Historique effacé.");
  });
  bindCalculator($app.querySelector('[data-calculator="main"]'));
  let result = null;
  const amount = document.getElementById("calc-amount");
  const rate = document.getElementById("calc-rate");
  const output = document.getElementById("calc-finance-result");
  const use = document.getElementById("calc-use-finance");
  const calculate = (kind) => {
    const value = Number(amount.value), percent = Number(rate.value);
    if (!amount.value || !Number.isFinite(value) || !Number.isFinite(percent) || percent < 0) {
      output.textContent = "Saisissez un montant et un taux valides.";
      result = null; use.disabled = true; return;
    }
    if (kind === "percent") result = value * percent / 100;
    if (kind === "ht") result = value / (1 + percent / 100);
    if (kind === "ttc") result = value * (1 + percent / 100);
    const vat = kind === "ht" ? value - result : kind === "ttc" ? result - value : result;
    const expression = kind === "percent" ? `${formatCalc(value)} × ${percent} %` : kind === "ht" ? `TTC ${formatCalc(value)} ÷ (1 + ${percent} %)` : `HT ${formatCalc(value)} + ${percent} % TVA`;
    output.innerHTML = `<strong>Résultat : ${formatCalc(result)}</strong><br><span class="muted">${kind === "percent" ? percent + " % de " + formatCalc(value) : "TVA : " + formatCalc(vat)}</span>`;
    recordCalculatorHistory(expression, result);
    use.disabled = false;
  };
  document.getElementById("calc-percent").addEventListener("click", () => calculate("percent"));
  document.getElementById("calc-vat-ht").addEventListener("click", () => calculate("ht"));
  document.getElementById("calc-vat-ttc").addEventListener("click", () => calculate("ttc"));
  use.addEventListener("click", () => {
    if (result === null) return;
    openModal(`<h2>Résultat du calcul</h2><p class="calculator-result"><strong>${formatCalc(result)}</strong></p><p class="muted">Copiez ce montant dans le champ comptable souhaité.</p><div class="actions"><button class="secondary" data-close>Fermer</button></div>`);
  });
}

function calculatorMarkup(id, withInsert = false) {
  return `
    <div class="calculator" data-calculator="${id}">
      <output class="calculator-display" data-calc-display aria-live="polite">0</output>
      <div class="calculator-keys">
        ${["C","⌫","%","÷","7","8","9","×","4","5","6","−","1","2","3","+","±","0",".","="].map((key) =>
          `<button type="button" class="calculator-key ${["÷","×","−","+","="].includes(key) ? "operator" : ""}" data-calc-key="${key}">${key}</button>`).join("")}
      </div>
      ${withInsert ? '<button type="button" class="calculator-insert" data-calc-insert>Insérer le résultat</button>' : ""}
    </div>`;
}

function formatCalc(value) {
  if (!Number.isFinite(value)) return "Erreur";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 8 }).format(Math.round((value + Number.EPSILON) * 1e8) / 1e8);
}

function bindCalculator(root, onInsert) {
  if (!root) return;
  let current = "0", stored = null, operator = null, waiting = false;
  const display = root.querySelector("[data-calc-display]");
  const render = () => { display.textContent = current; };
  const compute = (a, b, op) => {
    if (op === "+") return a + b;
    if (op === "−") return a - b;
    if (op === "×") return a * b;
    if (op === "÷") return b === 0 ? NaN : a / b;
    return b;
  };
  root.querySelectorAll("[data-calc-key]").forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.calcKey;
    if (/^\d$/.test(key)) {
      current = waiting || current === "0" ? key : current.length < 18 ? current + key : current;
      waiting = false;
    } else if (key === ".") {
      if (waiting) { current = "0."; waiting = false; }
      else if (!current.includes(".")) current += ".";
    } else if (key === "C") {
      current = "0"; stored = null; operator = null; waiting = false;
    } else if (key === "⌫") {
      current = waiting || current.length <= 1 ? "0" : current.slice(0, -1);
      waiting = false;
    } else if (key === "±") {
      current = String(-Number(current));
    } else if (key === "%") {
      current = String(Number(current) / 100);
    } else if (["+", "−", "×", "÷"].includes(key)) {
      const value = Number(current);
      if (operator && !waiting) {
        const next = compute(stored, value, operator);
        current = String(next); stored = next;
      } else stored = value;
      operator = key; waiting = true;
    } else if (key === "=" && operator) {
      const left = stored, right = Number(current), op = operator;
      const answer = compute(left, right, op);
      current = String(answer);
      if (Number.isFinite(answer)) recordCalculatorHistory(`${formatCalc(left)} ${op} ${formatCalc(right)}`, answer);
      stored = null; operator = null; waiting = true;
    }
    if (!Number.isFinite(Number(current))) current = "Erreur";
    render();
  }));
  root.querySelector("[data-calc-insert]")?.addEventListener("click", () => {
    if (Number.isFinite(Number(current)) && onInsert) onInsert(Number(current));
  });
}

export function openCalculator(targetInput) {
  if (!targetInput) return;
  openModal(`
    <h2>Calculatrice</h2>
    <p class="muted">Effectuez le calcul puis insérez le résultat dans le champ ${esc(targetInput.dataset.calcLabel || "montant")}.</p>
    ${calculatorMarkup("inline", true)}
    <div class="actions"><button class="secondary" data-close>Fermer</button></div>
  `);
  const modalCalculator = document.querySelector('#modal-content [data-calculator="inline"]');
  bindCalculator(modalCalculator, (value) => {
    targetInput.value = String(Math.round((value + Number.EPSILON) * 100) / 100);
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    closeModal();
    toast("Résultat inséré dans le montant.");
  });
}
