"use strict";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const STORAGE_KEY = "financas-v3";
const LICENSE_KEY = "financas-license-v1";
const DEVICE_KEY  = "financas-device-id";
const CATS_KEY    = "financas-categories-v1";

const licPubKey = {
  kty:"EC", crv:"P-256",
  x:"e1XhgU2lsgYidY77PRY32wHggaUlnC1cUBsOHbriGKY",
  y:"ewKoqLdZ8lffJ26L2SwoNm85yQsM9WODS-NNq_E1Jr0"
};

const defaultState = {
  accounts: [
    { id:"corrente",     name:"Conta corrente", kind:"checking",   openingBalance:0 },
    { id:"investimentos",name:"Investimentos",  kind:"investment", openingBalance:0 }
  ],
  transactions: []
};

// Função para obter data/hora no fuso de Brasília
function getBrazilDate() {
  const now = new Date();
  const brazilTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000) + (-3 * 3600000));
  return brazilTime.toISOString().slice(0, 10);
}

// --- ESTADO ---
let state   = loadState();
let license = loadLicense();
let cats    = loadCats();
let editId  = null;
let economyMonth = new Date().getMonth();
let economyYear  = new Date().getFullYear();
let currentEditingCategoryId = null; // Nova variável para rastrear a categoria em edição

// --- ELEMENTOS ---
const el = {
  totalBalance:  document.getElementById("totalBalance"),
  incomeTotal:   document.getElementById("incomeTotal"),
  expenseTotal:  document.getElementById("expenseTotal"),
  investTotal:   document.getElementById("investmentTotal"),
  accountCount:  document.getElementById("accountCount"),
  accountList:   document.getElementById("accountList"),
  formTitle:     document.getElementById("formTitle"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  txForm:        document.getElementById("txForm"),
  desc:          document.getElementById("desc"),
  amt:           document.getElementById("amt"),
  dt:            document.getElementById("dt"),
  fromAcc:       document.getElementById("fromAcc"),
  toAcc:         document.getElementById("toAcc"),
  toWrap:        document.getElementById("toWrap"),
  catWrap:       document.getElementById("catWrap"),
  cat:           document.getElementById("cat"),
  saveBtn:       document.getElementById("saveBtn"),
  expList:       document.getElementById("expList"),
  incList:       document.getElementById("incList"),
  trfList:       document.getElementById("trfList"),
  expCount:      document.getElementById("expCount"),
  incCount:      document.getElementById("incCount"),
  trfCount:      document.getElementById("trfCount"),
  catPills:      document.getElementById("catPills"),
  ecoCanvas:     document.getElementById("ecoCanvas"),
  ecoPercent:    document.getElementById("ecoPercent"),
  ecoInc:        document.getElementById("ecoInc"),
  ecoExp:        document.getElementById("ecoExp"),
  ecoSaved:      document.getElementById("ecoSaved"),
  ecoMonth:      document.getElementById("ecoMonth"),
  netResult:     document.getElementById("netResult"),
  topExp:        document.getElementById("topExp"),
  topExpLbl:     document.getElementById("topExpLbl"),
  savRate:       document.getElementById("savRate"),
  insights:      document.getElementById("insights"),
  flowChart:     document.getElementById("flowChart"),
  accChart:      document.getElementById("accChart"),
  licWarn:       document.getElementById("licWarn"),
  favTags:       document.getElementById("favTags"),
  catName:              document.getElementById("catName"),
  catType:              document.getElementById("catType"),
  catFav:               document.getElementById("catFav"),
  catAddBtn:            document.getElementById("catAddBtn"),
  catModalList:         document.getElementById("catModalList"),
  catHasLimit:          document.getElementById("catHasLimit"),
  catLimitAmount:       document.getElementById("catLimitAmount"),
  catLimitWarning:      document.getElementById("catLimitWarning"),
  catLimitFields:       document.getElementById("catLimitFields"),
  editCatModal:         document.getElementById("catEditModal"),
  catEditModalClose:    document.getElementById("catEditModalClose"),
  editCatName:          document.getElementById("editCatName"),
  editCatType:          document.getElementById("editCatType"),
  editCatFav:           document.getElementById("editCatFav"),
  editCatHasLimit:      document.getElementById("editCatHasLimit"),
  editCatLimitAmount:   document.getElementById("editCatLimitAmount"),
  editCatLimitWarning:  document.getElementById("editCatLimitWarning"),
  editCatLimitFields:   document.getElementById("editCatLimitFields"),
  editCatSaveBtn:       document.getElementById("editCatSaveBtn"),
  editCatDeleteBtn:     document.getElementById("editCatDeleteBtn"),
};

// --- INIT ---
el.dt.value = getBrazilDate();

el.txForm.addEventListener("submit", onSubmit);
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener("change", updateFormMode));
el.cancelEditBtn.addEventListener("click", resetForm);
el.expList.addEventListener("click", onTxClick);
el.incList.addEventListener("click", onTxClick);
el.trfList.addEventListener("click", onTxClick);
window.addEventListener("resize", () => { try { drawCharts(calcSummary()); drawEconomyChart(); } catch(e){} });

render();

// ============================================================
// PERSISTÊNCIA
// ============================================================
function loadState() {
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!p) return structuredClone(defaultState);
    return {
      accounts: p.accounts?.length ? p.accounts : defaultState.accounts,
      transactions: Array.isArray(p.transactions) ? p.transactions : []
    };
  } catch { return structuredClone(defaultState); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function loadLicense() {
  try { return JSON.parse(localStorage.getItem(LICENSE_KEY) || "null") || { active:false }; }
  catch { return { active:false }; }
}
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = "dev-" + Date.now() + "-" + crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

function loadCats() {
  try {
    const raw = JSON.parse(localStorage.getItem(CATS_KEY) || "null");
    if (Array.isArray(raw)) return raw;
  } catch {}
  // Categorias padrão
  return [
    { id: "sal",   name: "Salario",       type: "income",     favorite: true },
    { id: "ali",   name: "Alimentacao",   type: "expense",    favorite: true },
    { id: "tran",  name: "Transporte",    type: "expense",    favorite: false },
    { id: "mor",   name: "Moradia",       type: "expense",    favorite: true },
    { id: "sau",   name: "Saude",         type: "expense",    favorite: false },
    { id: "edu",   name: "Educacao",      type: "expense",    favorite: false },
    { id: "laz",   name: "Lazer",         type: "expense",    favorite: false },
    { id: "inv",   name: "Investimento",  type: "investment", favorite: true },
    { id: "rent",  name: "Rendimentos",   type: "income",     favorite: false },
    { id: "div",   name: "Dividendos",    type: "all",        favorite: false },
  ];
}
function saveCats() { localStorage.setItem(CATS_KEY, JSON.stringify(cats)); }

// ============================================================
// CATEGORIAS - helpers
// ============================================================
function getCatsForType(type) {
  if (type === "transfer") return [];
  return cats.filter(c => c.type === type || c.type === "all");
}
function getFavCatsForType(type) {
  return getCatsForType(type).filter(c => c.favorite);
}

// ============================================================
// FORM PRINCIPAL - CATEGORIAS FAVORITAS
// ============================================================
function renderFavTags(container, catSelect, currentType, currentCat) {
  const favs = getFavCatsForType(currentType);
  if (!favs.length || currentType === "transfer") {
    container.innerHTML = "";
    const section = container.closest ? container.closest("#favTagsSection,#editFavTagsSection") : null;
    if (section) section.style.display = "none";
    return;
  }
  const section = container.closest ? container.closest("#favTagsSection,#editFavTagsSection") : null;
  if (section) section.style.display = "";
  
  container.innerHTML = favs.map(c =>
    `<button type="button" class="fav-tag${currentCat === c.name ? " selected" : ""}" data-catname="${c.name}">${c.name}</button>`
  ).join("");
  
  container.querySelectorAll(".fav-tag").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.catname;
      catSelect.value = name;
      container.querySelectorAll(".fav-tag").forEach(b => b.classList.toggle("selected", b === btn));
    });
  });
}

function fillCatSelect(selectEl, type) {
  const list = getCatsForType(type);
  selectEl.innerHTML = '<option value="">Sem categoria</option>' +
    list.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
}

// ============================================================
// FORM PRINCIPAL
// ============================================================
function updateFormMode() {
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const isTransfer = type === "transfer";
  el.toWrap.classList.toggle("hidden", !isTransfer);
  el.catWrap.classList.toggle("hidden", isTransfer);
  el.toAcc.required = isTransfer;
  fillCatSelect(el.cat, type);
  renderFavTags(el.favTags, el.cat, type, el.cat.value);
  // Ocultar favs em transferência
  const sec = document.getElementById("favTagsSection");
  if (sec) sec.style.display = isTransfer ? "none" : "";
  // Limpar seleção fav ao trocar tipo
  if (!isTransfer) el.cat.value = "";
}

function resetForm() {
  editId = null;
  el.txForm.reset();
  el.dt.value = getBrazilDate();
  document.querySelector('input[name="type"][value="income"]').checked = true;
  el.formTitle.textContent = "➕ Novo lancamento";
  el.saveBtn.textContent = "Salvar lancamento";
  el.cancelEditBtn.classList.add("hidden");
  updateFormMode();
}

function onSubmit(e) {
  e.preventDefault();
  const fd = new FormData(el.txForm);
  const type = fd.get("type");
  const fromAcc = fd.get("fromAccount");
  const toAcc = fd.get("toAccount");
  if (type === "transfer" && fromAcc === toAcc) { alert("Escolha contas diferentes."); return; }

  // Validar categoria pelo tipo
  const catVal = String(fd.get("category") || "").trim();
  if (catVal && type !== "transfer") {
    const found = cats.find(c => c.name === catVal);
    if (found && found.type !== "all" && found.type !== type) {
      alert(`A categoria "${catVal}" é para ${found.type === "income" ? "receitas" : found.type === "expense" ? "despesas" : "investimentos"}. Use uma categoria compatível com "${type === "income" ? "receita" : type === "expense" ? "despesa" : "investimento"}".`);
      return;
    }
  }

  const tx = {
    id: editId || crypto.randomUUID(),
    type,
    description: String(fd.get("description")).trim(),
    amount: Number(fd.get("amount")),
    date: fd.get("date"),
    fromAccount: fromAcc,
    toAccount: type === "transfer" ? toAcc : "",
    category: catVal
  };
  if (editId) {
    state.transactions = state.transactions.map(t => t.id === editId ? tx : t);
    editId = null;
  } else {
    state.transactions.unshift(tx);
  }
  saveState();
  resetForm();
  render();
}

function onTxClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const tx = state.transactions.find(t => t.id === btn.dataset.id);
  if (!tx) return;
  if (btn.dataset.action === "edit") openEditModal(tx);
  if (btn.dataset.action === "del") {
    if (confirm("Remover este lancamento?")) {
      state.transactions = state.transactions.filter(t => t.id !== btn.dataset.id);
      saveState(); render();
    }
  }
}

// ============================================================
// MODAL DE EDIÇÃO DE LANÇAMENTO
// ============================================================
const editModal     = document.getElementById("editModal");
const editModalClose= document.getElementById("editModalClose");
const editForm      = document.getElementById("editForm");
const editDesc      = document.getElementById("editDesc");
const editAmt       = document.getElementById("editAmt");
const editDt        = document.getElementById("editDt");
const editFromAcc   = document.getElementById("editFromAcc");
const editToAcc     = document.getElementById("editToAcc");
const editToWrap    = document.getElementById("editToWrap");
const editCatWrap   = document.getElementById("editCatWrap");
const editCat       = document.getElementById("editCat");
const editFavTags   = document.getElementById("editFavTags");
let   editingId     = null;

function fillEditSelects() {
  const opts = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  editFromAcc.innerHTML = opts;
  editToAcc.innerHTML   = opts;
}

function updateEditFormMode() {
  const type = document.querySelector('input[name="etype"]:checked')?.value;
  const isTransfer = type === "transfer";
  editToWrap.classList.toggle("hidden", !isTransfer);
  editCatWrap.classList.toggle("hidden", isTransfer);
  editToAcc.required = isTransfer;
  fillCatSelect(editCat, type);
  renderFavTags(editFavTags, editCat, type, editCat.value);
  const sec = document.getElementById("editFavTagsSection");
  if (sec) sec.style.display = isTransfer ? "none" : "";
}

document.querySelectorAll('input[name="etype"]').forEach(r => r.addEventListener("change", updateEditFormMode));

function openEditModal(tx) {
  editingId = tx.id;
  fillEditSelects();
  document.querySelector(`input[name="etype"][value="${tx.type}"]`).checked = true;
  editDesc.value    = tx.description;
  editAmt.value     = tx.amount;
  editDt.value      = tx.date;
  editFromAcc.value = tx.fromAccount;
  editToAcc.value   = tx.toAccount || state.accounts[0]?.id;
  updateEditFormMode();
  editCat.value     = tx.category || "";
  renderFavTags(editFavTags, editCat, tx.type, tx.category || "");
  editModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditModal() {
  editModal.classList.remove("open");
  document.body.style.overflow = "";
  editingId = null;
}

editModalClose.addEventListener("click", closeEditModal);
editModal.addEventListener("click", function(e) {
  if (e.target === editModal) closeEditModal();
});

editForm.addEventListener("submit", function(e) {
  e.preventDefault();
  if (!editingId) return;
  const fd = new FormData(editForm);
  const type = fd.get("etype");
  const fromAcc = fd.get("fromAccount");
  const toAcc   = fd.get("toAccount");
  if (type === "transfer" && fromAcc === toAcc) { alert("Escolha contas diferentes."); return; }

  const catVal = String(fd.get("category") || "").trim();
  if (catVal && type !== "transfer") {
    const found = cats.find(c => c.name === catVal);
    if (found && found.type !== "all" && found.type !== type) {
      alert(`A categoria "${catVal}" é para ${found.type === "income" ? "receitas" : found.type === "expense" ? "despesas" : "investimentos"}.`);
      return;
    }
  }

  const tx = {
    id: editingId,
    type,
    description: String(fd.get("description")).trim(),
    amount: Number(fd.get("amount")),
    date: fd.get("date"),
    fromAccount: fromAcc,
    toAccount: type === "transfer" ? toAcc : "",
    category: catVal
  };
  state.transactions = state.transactions.map(t => t.id === editingId ? tx : t);
  saveState();
  closeEditModal();
  render();
});

// ============================================================
// MODAL DETALHE CONTA
// ============================================================
const accModal      = document.getElementById("accModal");
const accModalClose = document.getElementById("accModalClose");
const accModalBody  = document.getElementById("accModalBody");
const accModalName  = document.getElementById("accModalName");
const accModalType  = document.getElementById("accModalType");
const accModalBal   = document.getElementById("accModalBalance");
const accModalIcon  = document.getElementById("accModalIcon");

function openAccModal(accId) {
  const acc = state.accounts.find(a => a.id === accId);
  if (!acc) return;
  const summary = calcSummary();
  const bal = summary.balances[acc.id] || 0;

  accModalName.textContent = acc.name;
  accModalType.textContent = acc.kind === "investment" ? "Investimento" : "Conta corrente";
  accModalBal.textContent  = money.format(bal);
  accModalIcon.textContent = acc.kind === "investment" ? "I" : "C";
  accModalIcon.className   = "acc-modal-icon " + (acc.kind === "investment" ? "investment" : "checking");

  // Filtra transações desta conta
  const txs = state.transactions.filter(t =>
    t.fromAccount === accId || (t.type === "transfer" && t.toAccount === accId)
  );

  if (!txs.length) {
    accModalBody.innerHTML = '<div class="empty">Nenhum lancamento nesta conta.</div>';
  } else {
    // Agrupa por dia
    const groups = {};
    txs.forEach(t => {
      const d = t.date;
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });

    const fmt = new Intl.DateTimeFormat("pt-BR", { weekday:"short", day:"2-digit", month:"short" });
    const sorted = Object.entries(groups).sort((a,b) => b[0].localeCompare(a[0]));
    const icons  = { income:"💰", expense:"💸", transfer:"🔄" };

    accModalBody.innerHTML = sorted.map(([date, items]) => {
      const dayLabel = fmt.format(new Date(date + "T12:00:00"));
      // subtotal do dia para esta conta
      let sub = 0;
      items.forEach(t => {
        const v = Number(t.amount);
        if (t.type === "income")   sub += v;
        if (t.type === "expense")  sub -= v;
        if (t.type === "transfer") {
          if (t.fromAccount === accId) sub -= v;
          if (t.toAccount   === accId) sub += v;
        }
      });
      const subClass = sub >= 0 ? "income-text" : "expense-text";
      const subStr   = (sub >= 0 ? "+" : "") + money.format(sub);

      const rows = items.map(t => {
        const prefix = t.type === "income" ? "+" : t.type === "expense" ? "-" : "↔";
        const cls    = t.type === "income" ? "income-text" : t.type === "expense" ? "expense-text" : "transfer-text";
        const meta   = t.type === "transfer"
          ? (t.fromAccount === accId ? `→ ${accName(t.toAccount)}` : `← ${accName(t.fromAccount)}`)
          : (t.category || "Sem categoria");
        return `
        <div class="tx-item">
          <div class="tx-ico ${t.type}">${icons[t.type]}</div>
          <div class="tx-body">
            <div class="tx-desc">${t.description}</div>
            <div class="tx-meta">${meta}</div>
          </div>
          <div class="tx-right">
            <div class="tx-amt ${cls}">${prefix}${money.format(Number(t.amount))}</div>
            <div class="tx-date">${fmtDate(t.date)}</div>
          </div>
        </div>`;
      }).join("");

      return `
        <div class="day-group">
          <div class="day-label">
            ${dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
            <span class="day-subtotal ${subClass}">${subStr}</span>
          </div>
          ${rows}
        </div>`;
    }).join("");
  }

  accModal.classList.add("open");
  document.body.style.overflow = "hidden";
}

accModalClose.addEventListener("click", function() {
  accModal.classList.remove("open");
  document.body.style.overflow = "";
});
accModal.addEventListener("click", function(e) {
  if (e.target === accModal) { accModal.classList.remove("open"); document.body.style.overflow = ""; }
});

// ============================================================
// MODAL CATEGORIAS
// ============================================================
const catModal      = document.getElementById("catModal");
const catModalClose = document.getElementById("catModalClose");
const catModalList  = document.getElementById("catModalList");
const catName       = document.getElementById("catName");
const catType       = document.getElementById("catType");
const catFav        = document.getElementById("catFav");
const catAddBtn     = document.getElementById("catAddBtn");

function openCatModal() {
  renderCatModalList();
  catModal.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeCatModal() {
  catModal.classList.remove("open");
  document.body.style.overflow = "";
  render(); // re-render para atualizar selects de categoria
}

catModalClose.addEventListener("click", closeCatModal);
catModal.addEventListener("click", function(e) {
  if (e.target === catModal) closeCatModal();
});

catAddBtn.addEventListener("click", function() {
  const name = catName.value.trim();
  if (!name) { alert("Digite o nome da categoria."); return; }
  if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    alert("Ja existe uma categoria com este nome."); return;
  }
  cats.push({
    id:       "c" + Date.now(),
    name:     name,
    type:     catType.value,
    favorite: catFav.checked
  });
  saveCats();
  catName.value  = "";
  catFav.checked = false;
  renderCatModalList();
});

function renderCatModalList() {
  if (!cats.length) {
    catModalList.innerHTML = '<div class="cat-empty">Nenhuma categoria cadastrada.</div>';
    return;
  }
  const typeLabels = { income:"Receitas", expense:"Despesas", investment:"Investimento", all:"Todos" };
  catModalList.innerHTML = cats.map(c => `
    <div class="cat-list-item">
      <div class="cat-star">${c.favorite ? "⭐" : "☆"}</div>
      <div class="cat-list-item-info">
        <div class="cat-list-item-name">${c.name}</div>
        <div class="cat-list-item-meta">
          <span class="cat-badge ${c.type}">${typeLabels[c.type] || c.type}</span>
          ${c.favorite ? "<span style='font-size:.68rem;color:var(--primary)'>Favorita</span>" : ""}
        </div>
      </div>
      <button class="cat-del-btn" data-catid="${c.id}" title="Remover">🗑</button>
    </div>
  `).join("");

  catModalList.querySelectorAll(".cat-del-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      if (!confirm("Remover esta categoria?")) return;
      cats = cats.filter(c => c.id !== btn.dataset.catid);
      saveCats();
      renderCatModalList();
    });
  });
}

// Expor openCatModal globalmente
window.openCatModal = openCatModal;

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render() {
  fillSelects();
  fillCatSelect(el.cat, document.querySelector('input[name="type"]:checked')?.value || "income");
  const summary = calcSummary();
  renderSummary(summary);
  renderAccounts(summary.balances);
  renderTransactions();
  renderCatPills();
  renderReports(summary);
  renderLicense();
  renderFavTags(el.favTags, el.cat, document.querySelector('input[name="type"]:checked')?.value || "income", el.cat.value);
  try { drawCharts(summary); } catch(e) {}
  try { drawEconomyChart(); } catch(e) {}
}

function fillSelects() {
  const opts = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  el.fromAcc.innerHTML = opts;
  el.toAcc.innerHTML   = opts;
}

function calcSummary() {
  const balances = Object.fromEntries(state.accounts.map(a => [a.id, a.openingBalance || 0]));
  let income = 0, expense = 0;
  state.transactions.forEach(t => {
    const v = Number(t.amount) || 0;
    if (t.type === "income")   { income += v; balances[t.fromAccount] = (balances[t.fromAccount]||0) + v; }
    if (t.type === "expense")  { expense += v; balances[t.fromAccount] = (balances[t.fromAccount]||0) - v; }
    if (t.type === "transfer") { balances[t.fromAccount] = (balances[t.fromAccount]||0) - v; balances[t.toAccount] = (balances[t.toAccount]||0) + v; }
  });
  const invIds = state.accounts.filter(a => a.kind === "investment").map(a => a.id);
  const investTotal = invIds.reduce((s,id) => s + (balances[id]||0), 0);
  const totalBalance = Object.values(balances).reduce((s,v) => s+v, 0);
  return { income, expense, totalBalance, investTotal, balances };
}

function renderSummary(s) {
  el.totalBalance.textContent = money.format(s.totalBalance);
  el.incomeTotal.textContent  = money.format(s.income);
  el.expenseTotal.textContent = money.format(s.expense);
  el.investTotal.textContent  = money.format(s.investTotal);
  el.accountCount.textContent = state.accounts.length + " contas";
}

function renderAccounts(balances) {
  if (!state.accounts.length) { el.accountList.innerHTML = '<div class="empty">Nenhuma conta.</div>'; return; }
  el.accountList.innerHTML = state.accounts.map(a => `
    <div class="acc-card" data-accid="${a.id}" title="Ver lancamentos de ${a.name}">
      <div class="acc-card-inner">
        <div class="acc-info">
          <small>${a.kind === "investment" ? "Investimento" : "Conta corrente"}</small>
          <strong>${a.name}</strong>
          <em>${money.format(balances[a.id]||0)}</em>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="acc-icon ${a.kind}">${a.kind === "investment" ? "I" : "C"}</div>
          <span class="acc-arrow">›</span>
        </div>
      </div>
    </div>`).join("");

  el.accountList.querySelectorAll(".acc-card").forEach(card => {
    card.addEventListener("click", () => openAccModal(card.dataset.accid));
  });
}

function renderTransactions(m, y) {
  const now = new Date();
  const mn = (m !== undefined) ? m : (window.economyMonth !== undefined ? window.economyMonth : now.getMonth());
  const yr = (y !== undefined) ? y : (window.economyYear  !== undefined ? window.economyYear  : now.getFullYear());
  const prefix = `${yr}-${String(mn+1).padStart(2,"0")}`;

  // Mês formatado para exibir no cabeçalho
  const monthLabel = new Date(yr, mn, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  // Atualiza rótulo dos cabeçalhos dos cards
  const expTitle  = document.querySelector("#expList")?.closest(".card")?.querySelector(".card-title h2");
  const incTitle  = document.querySelector("#incList")?.closest(".card")?.querySelector(".card-title h2");
  const trfTitle  = document.querySelector("#trfList")?.closest(".card")?.querySelector(".card-title h2");
  if (expTitle) expTitle.textContent = `💸 Despesas — ${monthCap}`;
  if (incTitle) incTitle.textContent = `💰 Receitas — ${monthCap}`;
  if (trfTitle) trfTitle.textContent = `🔄 Transferências — ${monthCap}`;

  const all = state.transactions;
  const inMonth = t => (t.date || "").startsWith(prefix);

  const inc = all.filter(t => t.type === "income"   && inMonth(t));
  const exp = all.filter(t => t.type === "expense"  && inMonth(t));
  const trf = all.filter(t => t.type === "transfer" && inMonth(t));

  el.incCount.textContent = inc.length;
  el.expCount.textContent = exp.length;
  el.trfCount.textContent = trf.length;
  el.incList.innerHTML = txHTML(inc, "Nenhuma receita neste mês.");
  el.expList.innerHTML = txHTML(exp, "Nenhuma despesa neste mês.");
  el.trfList.innerHTML = txHTML(trf, "Nenhuma transferência neste mês.");
}

// Expor para sincronização global de mês
window.renderTransactions = renderTransactions;

function txHTML(list, empty) {
  if (!list.length) return `<div class="empty">${empty}</div>`;
  const icons = { income:"💰", expense:"💸", transfer:"🔄" };
  return list.map(t => {
    const acc = accName(t.fromAccount);
    const dest = accName(t.toAccount);
    const meta = t.type === "transfer" ? `${acc} → ${dest}` : `${acc}${t.category ? " · " + t.category : ""}`;
    const prefix = t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
    const cls = t.type === "income" ? "income-text" : t.type === "expense" ? "expense-text" : "transfer-text";
    return `
    <div class="tx-item">
      <div class="tx-ico ${t.type}">${icons[t.type]}</div>
      <div class="tx-body">
        <div class="tx-desc">${t.description}</div>
        <div class="tx-meta">${meta}</div>
        <div class="tx-actions">
          <button class="abtn" data-action="edit" data-id="${t.id}">✏️ Editar</button>
          <button class="abtn del" data-action="del" data-id="${t.id}">🗑 Remover</button>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amt ${cls}">${prefix}${money.format(Number(t.amount))}</div>
        <div class="tx-date">${fmtDate(t.date)}</div>
      </div>
    </div>`;
  }).join("");
}

function renderCatPills() {
  const catMap = {};
  state.transactions.filter(t => t.type === "expense").forEach(t => {
    const c = t.category || "Sem categoria";
    catMap[c] = (catMap[c]||0) + Number(t.amount);
  });
  const sorted = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  if (!sorted.length) { el.catPills.innerHTML = '<span style="font-size:.82rem;color:var(--text3)">Nenhuma despesa ainda.</span>'; return; }
  const total = sorted.reduce((s,[,v]) => s+v, 0);
  el.catPills.innerHTML = sorted.map(([c,v]) =>
    `<div class="cat-pill"><span class="cat-dot"></span>${c} <strong>${Math.round(v/total*100)}%</strong></div>`
  ).join("");
}

function renderReports(s) {
  const byCat = Object.entries(
    state.transactions.filter(t => t.type==="expense").reduce((acc,t) => {
      const c = t.category||"Sem categoria"; acc[c]=(acc[c]||0)+Number(t.amount); return acc;
    }, {})
  ).sort((a,b)=>b[1]-a[1]);
  const top = byCat[0];
  const net = s.income - s.expense;
  const rate = s.income > 0 ? Math.round(net/s.income*100) : 0;
  el.netResult.textContent = money.format(net);
  el.netResult.className = net >= 0 ? "income-text" : "expense-text";
  el.topExp.textContent = money.format(top?.[1]||0);
  el.topExpLbl.textContent = top?.[0] || "Sem despesas";
  el.savRate.textContent = rate + "%";
  const tips = [];
  if (s.expense > s.income && s.income > 0) tips.push("As despesas estao maiores que as receitas.");
  if (top) { const p = s.expense > 0 ? Math.round(top[1]/s.expense*100):0; tips.push(`${top[0]} concentra ${p}% das despesas.`); }
  if (rate < 10 && s.income > 0) tips.push("Taxa de economia baixa. Tente guardar pelo menos 10%.");
  if (s.investTotal <= 0 && s.income > 0) tips.push("Sem saldo em investimentos. Considere separar uma reserva.");
  if (!tips.length) tips.push("Resultado positivo! Continue acompanhando.");
  el.insights.innerHTML = tips.map(t => `<div class="insight">${t}</div>`).join("");
}

function renderLicense() {
  const valid = license.active && license.expiresAt && new Date(license.expiresAt) > new Date();
  el.licWarn.style.display = valid ? "none" : "flex";
  lockForm(!valid);
}

function lockForm(lock) {
  el.txForm.classList.toggle("locked", lock);
  el.txForm.querySelectorAll("input,select,button").forEach(c => c.disabled = lock);
}

// ============================================================
// GRÁFICO ECONOMIA
// ============================================================
function drawEconomyChart(m, y) {
  if (m !== undefined) economyMonth = m;
  if (y !== undefined) economyYear  = y;
  const mn = economyMonth, yr = economyYear;
  const name = monthFmt.format(new Date(yr, mn, 1));
  el.ecoMonth.textContent = name.charAt(0).toUpperCase() + name.slice(1);

  const txs = state.transactions.filter(t => {
    const d = new Date(t.date + "T12:00:00");
    return d.getMonth() === mn && d.getFullYear() === yr;
  });
  const inc  = txs.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0);
  const exp  = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0);
  const saved = inc - exp;
  // Permite negativo: sem Math.max(0,...) para refletir real
  const pct  = inc > 0 ? Math.min(100, Math.round(saved/inc*100)) : (exp > 0 ? -100 : 0);

  el.ecoInc.textContent    = money.format(inc);
  el.ecoExp.textContent    = money.format(exp);
  el.ecoSaved.textContent  = money.format(saved);
  el.ecoSaved.style.color  = saved >= 0 ? "var(--income)" : "var(--expense)";
  el.ecoPercent.textContent = pct + "%";
  el.ecoPercent.style.color = pct>=20 ? "var(--income)" : pct>=10 ? "var(--primary)" : "var(--expense)";

  // Mantém as variáveis globais sincronizadas para que os botões de navegação
  // sempre leiam o mês/ano atual corretamente
  window.economyMonth = economyMonth;
  window.economyYear  = economyYear;

  const cv = el.ecoCanvas;
  const ctx = cv.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const sz = 130;
  cv.width  = sz * dpr;
  cv.height = sz * dpr;
  cv.style.width  = sz + "px";
  cv.style.height = sz + "px";
  ctx.scale(dpr, dpr);
  const cx=sz/2, cy=sz/2, r=50, lw=13;
  const start = -Math.PI/2;
  ctx.clearRect(0,0,sz,sz);
  // Trilha de fundo
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=lw; ctx.stroke();

  if (pct > 0) {
    // Positivo: arco verde/teal/amarelo proporcional
    ctx.beginPath(); ctx.arc(cx,cy,r,start,start+2*Math.PI*pct/100);
    ctx.strokeStyle = pct>=20?"#16a34a":pct>=10?"#0f766e":"#f59e0b";
    ctx.lineWidth=lw; ctx.lineCap="round"; ctx.stroke();
    // Restante em vermelho claro
    if (pct<100 && exp>0) {
      ctx.beginPath(); ctx.arc(cx,cy,r,start+2*Math.PI*pct/100,start+2*Math.PI);
      ctx.strokeStyle="#fca5a5"; ctx.lineWidth=lw; ctx.lineCap="round"; ctx.stroke();
    }
  } else if (exp > 0) {
    // Negativo: anel inteiro vermelho para indicar estouro
    ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI);
    ctx.strokeStyle="#ef4444"; ctx.lineWidth=lw; ctx.stroke();
  }
}

// ============================================================
// GRÁFICOS BARRA
// ============================================================
function drawCharts(s) {
  drawBar(el.flowChart, [
    { label:"Receitas", value:s.income,  color:"#16a34a" },
    { label:"Despesas", value:s.expense, color:"#dc2626" }
  ]);
  drawBar(el.accChart, state.accounts.map(a => ({
    label: a.name,
    value: s.balances[a.id]||0,
    color: a.kind==="investment"?"#2563eb":"#0f766e"
  })));
}

function drawBar(canvas, rows) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio||1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(300, rect.width||300);
  const H = 180;
  canvas.width  = W*dpr; canvas.height = H*dpr;
  canvas.style.height = H+"px";
  ctx.scale(dpr,dpr);
  const pad=28, ch=H-pad*2-26, max=Math.max(...rows.map(r=>Math.abs(r.value)),1);
  const bw = Math.min(80,(W-pad*2)/rows.length-16);
  ctx.clearRect(0,0,W,H);
  rows.forEach((row,i) => {
    const x = pad + i*((W-pad*2)/rows.length)+10;
    const vh = (Math.abs(row.value)/max)*ch;
    const y  = H-pad-26-vh;
    ctx.fillStyle=row.color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x,y,bw,vh,5) : ctx.rect(x,y,bw,vh);
    ctx.fill();
    ctx.fillStyle="var(--text,#111)"; ctx.font="700 11px Arial";
    ctx.fillText(row.label,x,H-pad-7);
    ctx.fillStyle="var(--text2,#666)"; ctx.font="700 10px Arial";
    ctx.fillText(money.format(row.value),x,Math.max(16,y-6));
  });
}

// ============================================================
// UTILS
// ============================================================
function accName(id) { return state.accounts.find(a=>a.id===id)?.name||"Conta"; }
function fmtDate(v)  { return dateFmt.format(new Date(v+"T12:00:00")); }

// Expor para uso externo
window.drawCharts = drawCharts;
window.drawEconomyChart = drawEconomyChart;
window.calculateSummary = calcSummary;
window.economyMonth = economyMonth;
window.economyYear  = economyYear;
window.appData = state; 