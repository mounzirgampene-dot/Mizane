// MIZANE — Écran Outils : clôture d'exercice, immobilisations & amortissements, rapprochement bancaire.
import { postEntry, validateEntry, toCSV } from "../accounting.js";
import { AMORT_METHODS, amortizationSchedule, dotationLines, parseBankCSV, matchBankLines, closingProposal } from "../finance.js";
import { saveStore, downloadBlob } from "../db.js";
import { store, planAccounts, $app, router, toast, esc, money, openModal } from "../state.js";

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
        <div><label>Valeur (HT)</label><input type="number" id="am-amount" min="0" step="0.01"></div>
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
          <td><button class="secondary small" data-sched="${i}">Plan</button> <button class="danger small" data-del-asset="${i}">✕</button></td></tr>`;
        }).join("")}</tbody>
      </table></div>
      <div class="actions"><button id="am-dotation">Générer la dotation de l'exercice</button></div>`}
      <div id="am-result" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h2>🏦 Rapprochement bancaire</h2>
      <p class="muted">Collez votre relevé (une ligne par opération : <code>date;libellé;montant</code> — dates JJ/MM/AAAA ou AAAA-MM-JJ, montants signés). MIZANE rapproche automatiquement avec les écritures de trésorerie (classe 5) à ±4 jours.</p>
      <textarea id="bk-text" rows="6" placeholder="10/01/2025;Virement client;1000000&#10;12/01/2025;Fournisseur Diallo;-500000"></textarea>
      <div class="actions"><button id="bk-run">Rapprocher</button></div>
      <div id="bk-result" style="margin-top:10px"></div>
    </div>
  `;

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
  document.getElementById("bk-run").addEventListener("click", () => {
    const lines = parseBankCSV(document.getElementById("bk-text").value);
    const out = document.getElementById("bk-result");
    if (!lines.length) { out.innerHTML = `<p class="errors">Aucune ligne exploitable. Format attendu : <code>date;libellé;montant</code></p>`; return; }
    const matched = matchBankLines(store, lines);
    const ok = matched.filter((m) => m.match).length;
    out.innerHTML = `
      <p>${ok} opération(s) rapprochée(s) sur ${matched.length}.</p>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Libellé</th><th class="num">Montant</th><th>Rapprochement</th></tr></thead>
      <tbody>${matched.map((m) => `<tr><td>${esc(m.date)}</td><td>${esc(m.label)}</td><td class="num">${money(m.amount)}</td>
        <td>${m.match ? `<span class="ok-msg">✓ écriture #${m.match}</span>` : `<span class="warn">⚠ non rapprochée${m.candidates.length ? " — proches : #" + m.candidates.join(", #") : ""}</span>`}</td></tr>`).join("")}</tbody></table></div>
      <div class="actions">
        <button class="secondary" id="bk-csv">⬇ Exporter le rapprochement (CSV)</button>
      </div>`;
    document.getElementById("bk-csv").addEventListener("click", () => {
      downloadBlob(new Blob(["\ufeff" + toCSV(matched.map((m) => ({ date: m.date, libelle: m.label, montant: m.amount, ecriture: m.match || "" })))], { type: "text/csv;charset=utf-8" }), "mizane-rapprochement.csv");
    });
  });
}

function nextDay(d) {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}
