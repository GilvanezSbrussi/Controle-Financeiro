const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const storageKey = "financas-v3";
const licenseStorageKey = "financas-license-v1";
const deviceIdKey = "financas-device-id";
const userProfileKey = "financas-user-profile";

// Numero do WhatsApp do administrador — altere aqui
const whatsappNumber = "5500000000000";

const licensePublicKey = {
  kty: "EC",
  x: "e1XhgU2lsgYidY77PRY32wHggaUlnC1cUBsOHbriGKY",
  y: "ewKoqLdZ8lffJ26L2SwoNm85yQsM9WODS-NNq_E1Jr0",
  crv: "P-256"
};

let editingTransactionId = null;

const defaultState = {
  accounts: [
    { id: "corrente", name: "Conta corrente", kind: "checking", openingBalance: 0 },
    { id: "investimentos", name: "Investimentos", kind: "investment", openingBalance: 0 }
  ],
  transactions: []
};

let state = loadState();
let license = loadLicense();
let userProfile = loadUserProfile();

const elements = {
  // Setup modal
  setupModal: document.querySelector("#setupModal"),
  setupUsername: document.querySelector("#setupUsername"),
  setupFullname: document.querySelector("#setupFullname"),
  setupEmail: document.querySelector("#setupEmail"),
  setupCpf: document.querySelector("#setupCpf"),
  setupSaveButton: document.querySelector("#setupSaveButton"),
  setupStatus: document.querySelector("#setupStatus"),
  // Menu
  menuButton: document.querySelector("#menuButton"),
  dropdownMenu: document.querySelector("#dropdownMenu"),
  menuLicense: document.querySelector("#menuLicense"),
  menuBackup: document.querySelector("#menuBackup"),
  // Panels
  licensePanel: document.querySelector("#licensePanel"),
  backupPanel: document.querySelector("#backupPanel"),
  // Summary
  totalBalance: document.querySelector("#totalBalance"),
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  investmentTotal: document.querySelector("#investmentTotal"),
  accountCount: document.querySelector("#accountCount"),
  accountList: document.querySelector("#accountList"),
  // Transaction lists
  incomeList: document.querySelector("#incomeList"),
  expenseList: document.querySelector("#expenseList"),
  transferList: document.querySelector("#transferList"),
  incomeCount: document.querySelector("#incomeCount"),
  expenseCount: document.querySelector("#expenseCount"),
  transferCount: document.querySelector("#transferCount"),
  // Form
  form: document.querySelector("#transactionForm"),
  formTitle: document.querySelector("#formTitle"),
  saveButton: document.querySelector("#saveButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  description: document.querySelector("#description"),
  amount: document.querySelector("#amount"),
  date: document.querySelector("#date"),
  category: document.querySelector("#category"),
  fromAccount: document.querySelector("#fromAccount"),
  toAccount: document.querySelector("#toAccount"),
  toAccountWrap: document.querySelector("#toAccountWrap"),
  categoryWrap: document.querySelector("#categoryWrap"),
  // Economy chart
  economyChart: document.querySelector("#economyChart"),
  economyPercent: document.querySelector("#economyPercent"),
  economyIncome: document.querySelector("#economyIncome"),
  economyExpense: document.querySelector("#economyExpense"),
  economySaved: document.querySelector("#economySaved"),
  economyMonth: document.querySelector("#economyMonth"),
  // Charts
  flowChart: document.querySelector("#flowChart"),
  accountChart: document.querySelector("#accountChart"),
  // Reports
  netResult: document.querySelector("#netResult"),
  topExpense: document.querySelector("#topExpense"),
  topExpenseLabel: document.querySelector("#topExpenseLabel"),
  savingRate: document.querySelector("#savingRate"),
  insightsList: document.querySelector("#insightsList"),
  // License — podem estar em licenca.html, nao no index
  licenseStatus: document.querySelector("#licenseStatus"),
  licenseKey: document.querySelector("#licenseKey"),
  activateLicenseButton: document.querySelector("#activateLicenseButton"),
  licenseMessage: document.querySelector("#licenseMessage"),
  whatsappRenewal: document.querySelector("#whatsappRenewal"),
  // Backup
  exportButton: document.querySelector("#exportButton"),
  importFile: document.querySelector("#importFile"),
  backupStatus: document.querySelector("#backupStatus")
};

// --- INIT ---

elements.date.value = new Date().toISOString().slice(0, 10);

// Redireciona para cadastro se nao tiver perfil
if (!userProfile && window.location.pathname !== "/cadastro.html") {
  window.location.href = "cadastro.html";
}

if (elements.setupSaveButton) {
  elements.setupSaveButton.addEventListener("click", saveUserProfile);
}

// Menu dropdown
if (elements.menuButton) {
  elements.menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    elements.dropdownMenu.classList.toggle("hidden");
  });
}

document.addEventListener("click", () => {
  if (elements.dropdownMenu) elements.dropdownMenu.classList.add("hidden");
});

if (elements.menuLicense) {
  elements.menuLicense.addEventListener("click", () => {
    togglePanel(elements.licensePanel);
    if (elements.backupPanel) elements.backupPanel.classList.add("hidden");
    elements.licensePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

if (elements.menuBackup) {
  elements.menuBackup.addEventListener("click", () => {
    togglePanel(elements.backupPanel);
    if (elements.licensePanel) elements.licensePanel.classList.add("hidden");
    elements.backupPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function togglePanel(panel) {
  panel.classList.toggle("hidden");
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(elements.form);
  const type = formData.get("type");
  const amount = Number(formData.get("amount"));
  const fromAccount = formData.get("fromAccount");
  const toAccount = formData.get("toAccount");

  if (type === "transfer" && fromAccount === toAccount) {
    alert("Escolha contas diferentes para a transferencia.");
    return;
  }

  const transaction = {
    id: editingTransactionId || crypto.randomUUID(),
    type,
    description: String(formData.get("description")).trim(),
    amount,
    date: formData.get("date"),
    fromAccount,
    toAccount: type === "transfer" ? toAccount : "",
    category: String(formData.get("category") || "").trim()
  };

  if (editingTransactionId) {
    state.transactions = state.transactions.map((item) =>
      item.id === editingTransactionId ? transaction : item
    );
  } else {
    state.transactions.unshift(transaction);
  }

  saveState();
  resetForm();
  render();
});

document.querySelectorAll('input[name="type"]').forEach((input) => {
  input.addEventListener("change", updateFormMode);
});

elements.cancelEditButton.addEventListener("click", resetForm);
elements.incomeList.addEventListener("click", handleTransactionAction);
elements.expenseList.addEventListener("click", handleTransactionAction);
elements.transferList.addEventListener("click", handleTransactionAction);
elements.activateLicenseButton.addEventListener("click", activateLicense);
elements.exportButton.addEventListener("click", exportBackup);
elements.importFile.addEventListener("change", importBackup);

window.addEventListener("resize", () => { drawCharts(calculateSummary()); });

updateWhatsappLink();
render();

// --- USER PROFILE ---

function loadUserProfile() {
  const raw = localStorage.getItem(userProfileKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveUserProfile() {
  const username = elements.setupUsername.value.trim();
  const fullname = elements.setupFullname.value.trim();
  const email = elements.setupEmail.value.trim();
  const cpf = elements.setupCpf.value.trim();

  if (!username || !fullname || !email || !cpf) {
    elements.setupStatus.textContent = "Preencha todos os campos para continuar.";
    return;
  }

  userProfile = { username, fullname, email, cpf, registeredAt: new Date().toISOString() };
  localStorage.setItem(userProfileKey, JSON.stringify(userProfile));
  elements.setupModal.classList.add("hidden");
  updateWhatsappLink();
}

// --- STATE ---

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(raw);
    return {
      accounts: parsed.accounts?.length ? parsed.accounts : defaultState.accounts,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch { return structuredClone(defaultState); }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

// --- LICENSE ---

function loadLicense() {
  const raw = localStorage.getItem(licenseStorageKey);
  if (!raw) return { active: false, key: "" };
  try { return JSON.parse(raw); } catch { return { active: false, key: "" }; }
}

function saveLicense() {
  localStorage.setItem(licenseStorageKey, JSON.stringify(license));
}

function getDeviceId() {
  let deviceId = localStorage.getItem(deviceIdKey);
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${crypto.randomUUID()}`;
    localStorage.setItem(deviceIdKey, deviceId);
  }
  return deviceId;
}

async function activateLicense() {
  const key = elements.licenseKey.value.trim();
  if (!key) { elements.licenseMessage.textContent = "Digite a chave de licenca."; return; }

  if (elements.activateLicenseButton) elements.activateLicenseButton.disabled = true;
  if (elements.licenseMessage) elements.licenseMessage.textContent = "Validando licenca...";

  // Valida assinatura localmente primeiro
  const localCheck = await verifySignedLicense(key);
  if (!localCheck.valid) {
    elements.licenseMessage.textContent = localCheck.message;
    elements.activateLicenseButton.disabled = false;
    return;
  }

  // Valida no servidor (uso unico por dispositivo)
  try {
    const deviceId = getDeviceId();
    const response = await fetch("/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license: key, deviceId })
    });
    const result = await response.json();

    if (!result.ok) {
      elements.licenseMessage.textContent = result.message || "Licenca recusada pelo servidor.";
      elements.activateLicenseButton.disabled = false;
      return;
    }

    license = {
      active: true,
      type: "signed",
      key,
      holder: result.payload.holder || "Cliente",
      issuedAt: result.payload.issuedAt,
      expiresAt: result.payload.expiresAt
    };
    saveLicense();
    elements.licenseKey.value = "";
    renderLicense();
  } catch {
    // Servidor indisponivel — aceita localmente com aviso
    license = {
      active: true,
      type: "signed",
      key,
      holder: localCheck.payload.holder || "Cliente",
      issuedAt: localCheck.payload.issuedAt,
      expiresAt: localCheck.payload.expiresAt
    };
    saveLicense();
    elements.licenseKey.value = "";
    elements.licenseMessage.textContent = "Servidor indisponivel. Licenca aceita localmente.";
    renderLicense();
  }

  elements.activateLicenseButton.disabled = false;
}

function updateWhatsappLink() {
  if (!elements.whatsappRenewal) return;
  const name = userProfile ? userProfile.fullname : "Cliente";
  const username = userProfile ? userProfile.username : "";
  const cpf = userProfile ? userProfile.cpf : "";
  const msg = encodeURIComponent(
    `Ola! Gostaria de solicitar a renovacao da minha licenca do Controle sua Fortuna.\n\nNome: ${name}\nUsuario: ${username}\nCPF: ${cpf}`
  );
  elements.whatsappRenewal.href = `https://wa.me/${whatsappNumber}?text=${msg}`;
}

// --- BACKUP ---

function exportBackup() {
  const backup = {
    app: "Controle sua Fortuna",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `financas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setBackupStatus("Backup exportado com sucesso.");
}

function importBackup(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedState = parsed.data || parsed;
      if (!Array.isArray(importedState.accounts) || !Array.isArray(importedState.transactions)) {
        throw new Error("Arquivo invalido");
      }
      state = { accounts: importedState.accounts, transactions: importedState.transactions };
      saveState();
      render();
      setBackupStatus("Backup importado com sucesso.");
    } catch {
      setBackupStatus("Nao foi possivel importar este arquivo.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function setBackupStatus(message) {
  elements.backupStatus.textContent = message;
}

// --- FORM ---

function updateFormMode() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const isTransfer = type === "transfer";
  elements.toAccountWrap.classList.toggle("hidden", !isTransfer);
  elements.categoryWrap.classList.toggle("hidden", isTransfer);
  elements.toAccount.required = isTransfer;
}

function resetForm() {
  editingTransactionId = null;
  elements.form.reset();
  elements.date.value = new Date().toISOString().slice(0, 10);
  document.querySelector('input[name="type"][value="income"]').checked = true;
  elements.formTitle.textContent = "Novo lancamento";
  elements.saveButton.textContent = "Salvar lancamento";
  elements.cancelEditButton.classList.add("hidden");
  updateFormMode();
}

// --- RENDER ---

function render() {
  try { fillAccountSelects(); } catch(e) { console.warn("fillAccountSelects:", e); }
  const summary = calculateSummary();
  try { renderSummary(summary); } catch(e) { console.warn("renderSummary:", e); }
  try { renderAccounts(summary.accountBalances); } catch(e) { console.warn("renderAccounts:", e); }
  try { renderTransactionsByType(); } catch(e) { console.warn("renderTransactionsByType:", e); }
  try { renderReports(summary); } catch(e) { console.warn("renderReports:", e); }
  try { renderLicense(); } catch(e) { console.warn("renderLicense:", e); }
  try { drawCharts(summary); } catch(e) { console.warn("drawCharts:", e); }
  try { drawEconomyChart(); } catch(e) { console.warn("drawEconomyChart:", e); }
}

function fillAccountSelects() {
  const options = state.accounts
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
    .join("");
  elements.fromAccount.innerHTML = options;
  elements.toAccount.innerHTML = options;
}

function calculateSummary() {
  const balances = Object.fromEntries(
    state.accounts.map((a) => [a.id, a.openingBalance || 0])
  );
  let income = 0, expense = 0;
  state.transactions.forEach((t) => {
    const amount = Number(t.amount) || 0;
    if (t.type === "income") { income += amount; balances[t.fromAccount] += amount; }
    if (t.type === "expense") { expense += amount; balances[t.fromAccount] -= amount; }
    if (t.type === "transfer") { balances[t.fromAccount] -= amount; balances[t.toAccount] += amount; }
  });
  const investmentIds = state.accounts.filter((a) => a.kind === "investment").map((a) => a.id);
  const investmentTotal = investmentIds.reduce((total, id) => total + (balances[id] || 0), 0);
  const totalBalance = Object.values(balances).reduce((total, v) => total + v, 0);
  return { income, expense, totalBalance, investmentTotal, accountBalances: balances };
}

function renderSummary(summary) {
  elements.totalBalance.textContent = money.format(summary.totalBalance);
  elements.incomeTotal.textContent = money.format(summary.income);
  elements.expenseTotal.textContent = money.format(summary.expense);
  elements.investmentTotal.textContent = money.format(summary.investmentTotal);
  elements.accountCount.textContent = `${state.accounts.length} contas`;
}

function renderAccounts(balances) {
  elements.accountList.innerHTML = state.accounts.map((account) => {
    const initial = account.kind === "investment" ? "I" : "C";
    return `
      <article class="account-card">
        <div>
          <small>${account.kind === "investment" ? "Investimento" : "Conta corrente"}</small>
          <strong>${account.name}</strong>
          <small>${money.format(balances[account.id] || 0)}</small>
        </div>
        <span class="account-icon ${account.kind}" aria-hidden="true">${initial}</span>
      </article>`;
  }).join("");
}

function renderTransactionsByType() {
  const incomes = state.transactions.filter((t) => t.type === "income");
  const expenses = state.transactions.filter((t) => t.type === "expense");
  const transfers = state.transactions.filter((t) => t.type === "transfer");

  elements.incomeCount.textContent = `${incomes.length} registros`;
  elements.expenseCount.textContent = `${expenses.length} registros`;
  elements.transferCount.textContent = `${transfers.length} registros`;

  elements.incomeList.innerHTML = renderTransactionItems(incomes, "Nenhuma receita cadastrada ainda.");
  elements.expenseList.innerHTML = renderTransactionItems(expenses, "Nenhuma despesa cadastrada ainda.");
  elements.transferList.innerHTML = renderTransactionItems(transfers, "Nenhuma transferencia cadastrada ainda.");
}

function renderTransactionItems(transactions, emptyMsg) {
  if (!transactions.length) {
    return `<div class="empty-state">${emptyMsg}</div>`;
  }
  return transactions.map((transaction) => {
    const account = getAccountName(transaction.fromAccount);
    const destination = getAccountName(transaction.toAccount);
    const amountClass = `${transaction.type}-text`;
    const label = getTypeLabel(transaction.type);
    const meta = transaction.type === "transfer"
      ? `${account} para ${destination}`
      : `${account}${transaction.category ? ` - ${transaction.category}` : ""}`;

    return `
      <article class="transaction-item">
        <div>
          <div class="transaction-title">
            <span>${transaction.description}</span>
            <span class="badge ${transaction.type}">${label}</span>
          </div>
          <div class="transaction-meta">${formatDate(transaction.date)} - ${meta}</div>
        </div>
        <div class="transaction-actions">
          <div class="transaction-amount ${amountClass}">${formatTransactionAmount(transaction)}</div>
          <button class="small-button" type="button" data-action="edit" data-id="${transaction.id}">Editar</button>
        </div>
      </article>`;
  }).join("");
}

function handleTransactionAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const transaction = state.transactions.find((item) => item.id === button.dataset.id);
  if (!transaction) return;
  if (button.dataset.action === "edit") startEdit(transaction);
}

function startEdit(transaction) {
  editingTransactionId = transaction.id;
  document.querySelector(`input[name="type"][value="${transaction.type}"]`).checked = true;
  elements.description.value = transaction.description;
  elements.amount.value = transaction.amount;
  elements.date.value = transaction.date;
  elements.fromAccount.value = transaction.fromAccount;
  elements.toAccount.value = transaction.toAccount || state.accounts[0].id;
  elements.category.value = transaction.category || "";
  elements.formTitle.textContent = "Editar lancamento";
  elements.saveButton.textContent = "Salvar alteracoes";
  elements.cancelEditButton.classList.remove("hidden");
  updateFormMode();
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderReports(summary) {
  const expenseByCategory = getExpenseByCategory();
  const top = expenseByCategory[0];
  const net = summary.income - summary.expense;
  const savingRate = summary.income > 0 ? Math.round((net / summary.income) * 100) : 0;

  elements.netResult.textContent = money.format(net);
  elements.netResult.className = net >= 0 ? "income-text" : "expense-text";
  elements.topExpense.textContent = money.format(top?.amount || 0);
  elements.topExpenseLabel.textContent = top ? top.category : "Sem despesas";
  elements.savingRate.textContent = `${savingRate}%`;

  const insights = buildInsights(summary, expenseByCategory, savingRate);
  elements.insightsList.innerHTML = insights.map((item) => `<div class="insight-item">${item}</div>`).join("");
}

function getExpenseByCategory() {
  const categories = {};
  state.transactions.filter((t) => t.type === "expense").forEach((t) => {
    const category = t.category || "Sem categoria";
    categories[category] = (categories[category] || 0) + Number(t.amount || 0);
  });
  return Object.entries(categories)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function buildInsights(summary, expenseByCategory, savingRate) {
  if (!state.transactions.length) return ["Cadastre receitas e despesas para gerar analises automaticas."];
  const insights = [];
  const top = expenseByCategory[0];
  if (summary.expense > summary.income && summary.income > 0) {
    insights.push("As despesas estao maiores que as receitas. Priorize cortar gastos recorrentes antes de assumir novos compromissos.");
  }
  if (top) {
    const percent = summary.expense > 0 ? Math.round((top.amount / summary.expense) * 100) : 0;
    insights.push(`${top.category} concentra ${percent}% das despesas. Revise essa categoria primeiro para encontrar economia rapida.`);
  }
  if (savingRate < 10 && summary.income > 0) {
    insights.push("A taxa de economia esta baixa. Uma meta inicial saudavel e guardar pelo menos 10% das receitas.");
  }
  if (summary.investmentTotal <= 0 && summary.income > 0) {
    insights.push("Ainda nao ha saldo em investimentos. Use transferencia para separar reserva ou aplicacoes.");
  }
  if (!insights.length) insights.push("Seu resultado esta positivo. Continue acompanhando as maiores categorias para manter o controle.");
  return insights;
}

function renderLicense() {
  const valid = isLicenseValid();
  if (valid) {
    const expiration = license.expiresAt ? formatDate(license.expiresAt.slice(0, 10)) : "sem data";
    if (elements.licenseStatus) { elements.licenseStatus.textContent = "Ativada"; elements.licenseStatus.className = "status-ok"; }
    if (elements.licenseMessage) elements.licenseMessage.textContent = `Licenca ativa ate ${expiration}.${license.holder ? ` Cliente: ${license.holder}.` : ""}`;
    setFormLocked(false);
    showLicenseWarning(false);
    return;
  }
  const expired = license.active && license.expiresAt && new Date(license.expiresAt) <= new Date();
  if (elements.licenseStatus) { elements.licenseStatus.textContent = expired ? "Expirada" : "Nao ativada"; elements.licenseStatus.className = "status-alert"; }
  if (elements.licenseMessage) elements.licenseMessage.textContent = expired
    ? "Licenca expirada. Solicite uma nova chave pelo WhatsApp abaixo."
    : "Digite a chave de licenca fornecida pelo administrador.";
  setFormLocked(true);
  showLicenseWarning(true);
}

function setFormLocked(locked) {
  elements.form.classList.toggle("locked", locked);
  elements.form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = locked;
  });
}

function showLicenseWarning(show) {
  const el = document.querySelector("#licenseWarning");
  if (el) el.style.display = show ? "flex" : "none";
}

function isLicenseValid() {
  if (!license.active || !license.expiresAt) return false;
  return new Date(license.expiresAt) > new Date();
}

async function verifySignedLicense(value) {
  const parts = value.split(".");
  if (parts.length !== 2) {
    return { valid: false, message: "Chave invalida. Digite uma licenca gerada pelo administrador." };
  }
  try {
    const [payloadPart, signaturePart] = parts;
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signatureBytes = base64UrlToBytes(signaturePart);
    const key = await crypto.subtle.importKey("jwk", licensePublicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signatureBytes, payloadBytes);
    if (!verified) return { valid: false, message: "Assinatura da licenca invalida." };
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload.expiresAt || new Date(payload.expiresAt) <= new Date()) {
      return { valid: false, message: "Esta licenca ja esta expirada." };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, message: "Nao foi possivel validar esta licenca." };
  }
}

// --- ECONOMY CHART ---

// Mes selecionado para o grafico de economia
let economyMonth = new Date().getMonth();
let economyYear = new Date().getFullYear();

function drawEconomyChart(targetMonth, targetYear) {
  const month = targetMonth !== undefined ? targetMonth : economyMonth;
  const year = targetYear !== undefined ? targetYear : economyYear;
  economyMonth = month;
  economyYear = year;

  const refDate = new Date(year, month, 1);
  const monthName = refDate.toLocaleString("pt-BR", { month: "long", year: "numeric" });
  if (elements.economyMonth) {
    elements.economyMonth.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    elements.economyMonth.style.cursor = "pointer";
    elements.economyMonth.title = "Clique para navegar entre meses";
  }

  // Filtra lancamentos do mes selecionado
  const monthTx = state.transactions.filter(t => {
    const d = new Date(t.date + "T12:00:00");
    return d.getMonth() === month && d.getFullYear() === year;
  });

  const income = monthTx.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const saved = income - expense;
  const percent = income > 0 ? Math.max(0, Math.min(100, Math.round((saved / income) * 100))) : 0;

  if (elements.economyIncome) elements.economyIncome.textContent = money.format(income);
  if (elements.economyExpense) elements.economyExpense.textContent = money.format(expense);
  if (elements.economySaved) {
    elements.economySaved.textContent = money.format(saved);
    elements.economySaved.style.color = saved >= 0 ? "#0f766e" : "#b42318";
  }
  if (elements.economyPercent) {
    elements.economyPercent.textContent = percent + "%";
    elements.economyPercent.style.color = percent >= 20 ? "#15803d" : percent >= 10 ? "#0f766e" : "#b42318";
  }

  const canvas = elements.economyChart;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = 140;
  const scale = window.devicePixelRatio || 1;
  canvas.width = size * scale;
  canvas.height = size * scale;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  ctx.scale(scale, scale);

  const cx = size / 2, cy = size / 2, radius = 54, lineWidth = 14;
  const startAngle = -Math.PI / 2;
  const fillAngle = startAngle + (2 * Math.PI * percent / 100);

  ctx.clearRect(0, 0, size, size);

  // Trilha de fundo
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Arco de economia
  if (percent > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, fillAngle);
    ctx.strokeStyle = percent >= 20 ? "#15803d" : percent >= 10 ? "#0f766e" : "#f59e0b";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Arco de despesa (vermelho)
  if (percent < 100 && expense > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, fillAngle, startAngle + 2 * Math.PI);
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }
}

// --- CHARTS ---

function drawCharts(summary) {
  drawBarChart(elements.flowChart, [
    { label: "Receitas", value: summary.income, color: "#15803d" },
    { label: "Despesas", value: summary.expense, color: "#b42318" }
  ]);
  drawBarChart(elements.accountChart,
    state.accounts.map((account) => ({
      label: account.name,
      value: summary.accountBalances[account.id] || 0,
      color: account.kind === "investment" ? "#2563eb" : "#0f766e"
    }))
  );
}

function drawBarChart(canvas, rows) {
  const context = canvas.getContext("2d");
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width * scale));
  canvas.height = Math.max(180, Math.floor(rect.height * scale));
  context.scale(scale, scale);
  const width = canvas.width / scale;
  const height = canvas.height / scale;
  const padding = 28;
  const chartHeight = height - padding * 2 - 26;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  const barWidth = Math.min(96, (width - padding * 2) / rows.length - 18);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fbfdfc";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#dce5e2";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding, height - padding - 26);
  context.lineTo(width - padding, height - padding - 26);
  context.stroke();
  rows.forEach((row, index) => {
    const x = padding + index * ((width - padding * 2) / rows.length) + 12;
    const valueHeight = (Math.abs(row.value) / max) * chartHeight;
    const y = height - padding - 26 - valueHeight;
    context.fillStyle = row.color;
    roundRect(context, x, y, barWidth, valueHeight, 6);
    context.fill();
    context.fillStyle = "#17211f";
    context.font = "700 12px Arial";
    context.fillText(trimLabel(row.label, 15), x, height - padding - 7);
    context.fillStyle = "#61716d";
    context.font = "700 11px Arial";
    context.fillText(money.format(row.value), x, Math.max(18, y - 8));
  });
}

function roundRect(context, x, y, width, height, radius) {
  const safeHeight = Math.max(height, 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + safeHeight, radius);
  context.arcTo(x + width, y + safeHeight, x, y + safeHeight, radius);
  context.arcTo(x, y + safeHeight, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

// --- UTILS ---

function getAccountName(id) {
  return state.accounts.find((a) => a.id === id)?.name || "Conta";
}

function getTypeLabel(type) {
  return { income: "Receita", expense: "Despesa", transfer: "Transferencia" }[type];
}

function formatTransactionAmount(transaction) {
  const prefix = transaction.type === "income" ? "+" : transaction.type === "expense" ? "-" : "";
  return `${prefix}${money.format(Number(transaction.amount) || 0)}`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return dateFormatter.format(date);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function trimLabel(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}.` : value;
}
