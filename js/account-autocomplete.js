// MIZANE — Autocomplétion accessible des comptes par numéro ou libellé.
export function attachAccountAutocomplete(input, accounts, onSelect) {
  if (!input) return;
  const wrapper = document.createElement("div");
  wrapper.className = "account-autocomplete";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.append(input);
  const menu = document.createElement("div");
  menu.className = "account-suggestions hidden";
  menu.setAttribute("role", "listbox");
  wrapper.append(menu);
  let matches = [];
  let active = -1;

  const close = () => { menu.classList.add("hidden"); menu.replaceChildren(); active = -1; };
  const choose = (account) => { onSelect(account); close(); };
  const render = () => {
    const query = input.value.trim().toLocaleLowerCase("fr");
    if (!query) return close();
    matches = accounts.filter((a) =>
      String(a.code).toLocaleLowerCase("fr").startsWith(query) ||
      String(a.label).toLocaleLowerCase("fr").includes(query)
    ).slice(0, 10);
    menu.replaceChildren();
    if (!matches.length) return close();
    matches.forEach((account, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "account-suggestion";
      option.setAttribute("role", "option");
      option.innerHTML = "";
      const code = document.createElement("strong");
      code.textContent = account.code;
      const label = document.createElement("span");
      label.textContent = account.label;
      option.append(code, label);
      option.addEventListener("mousedown", (event) => { event.preventDefault(); choose(account); });
      menu.append(option);
      if (index === active) option.classList.add("active");
    });
    menu.classList.remove("hidden");
  };

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (menu.classList.contains("hidden")) return;
    if (event.key === "ArrowDown") { event.preventDefault(); active = Math.min(active + 1, matches.length - 1); renderActive(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); active = Math.max(active - 1, 0); renderActive(); }
    else if (event.key === "Enter" && active >= 0 && matches[active]) { event.preventDefault(); choose(matches[active]); }
    else if (event.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 120));

  function renderActive() {
    [...menu.children].forEach((node, index) => {
      node.classList.toggle("active", index === active);
      node.setAttribute("aria-selected", String(index === active));
    });
  }
}
