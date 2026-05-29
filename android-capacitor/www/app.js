const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const storageKey = "financas-v3";
const licenseStorageKey = "financas-license-v1";
const validLicenseKeys = ["FINANCAS-2026"];
const demoLicenseDays = 1;
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

const elements = {
  totalBalance: document.querySelector("#totalBalance"),
  incomeTotal: document.querySelector("#incomeTotal"),
  expenseTotal: document.querySelector("#expenseTotal"),
  investmentTotal: document.querySelector("#investmentTotal"),
  accountCount: document.querySelector("#accountCount"),
  accountList: document.querySelector("#accountList"),
  transactionList: document.querySelector("#transactionList"),
  transactionCount: document.querySelector("#transactionCount"),
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
  flowChart: document.querySelector("#flowChart"),
  accountChart: document.querySelector("#accountChart"),
  netResult: document.querySelector("#netResult"),
  topExpense: document.querySelector("#topExpense"),
  topExpenseLabel: document.querySelector("#topExpenseLabel"),
  savingRate: document.querySelector("#savingRate"),
  insightsList: document.querySelector("#insightsList"),
  licenseStatus: document.querySelector("#licenseStatus"),
  licenseKey: document.querySelector("#licenseKey"),
  activateLicenseButton: document.querySelector("#activateLicenseButton"),
  licenseMessage: document.querySelector("#licenseMessage"),
  exportButton: document.querySelector("#exportButton"),
  importFile: document.querySelector("#importFile"),
  backupStatus: document.querySelector("#backupStatus")
};

elements.date.value = new Date().toISOString().slice(0, 10);

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
elements.transactionList.addEventListener("click", handleTransactionAction);
elements.activateLicenseButton.addEventListener("click", activateLicense);
elements.exportButton.addEventListener("click", exportBackup);
elements.importFile.addEventListener("change", importBackup);

window.addEventListener("resize", () => {
  drawCharts(calculateSummary());
});

render();

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return structuredClone(defaultState);

  try {
    const parsed = JSON.parse(raw);
    return {
      accounts: parsed.accounts?.length ? parsed.accounts : defaultState.accounts,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadLicense() {
  const raw = localStorage.getItem(licenseStorageKey);
  if (!raw) return { active: false, key: "" };

  try {
    return JSON.parse(raw);
  } catch {
    return { active: false, key: "" };
  }
}

function saveLicense() {
  localStorage.setItem(licenseStorageKey, JSON.stringify(license));
}

async function activateLicense() {
  const key = elements.licenseKey.value.trim();
  const normalizedKey = key.toUpperCase();

  if (validLicenseKeys.includes(normalizedKey)) {
    license = {
      active: true,
      type: "demo",
      key: normalizedKey,
      activatedAt: new Date().toISOString(),
      expiresAt: addDays(new Date(), demoLicenseDays).toISOString()
    };
    saveLicense();
    elements.licenseKey.value = "";
    renderLicense();
    return;
  }

  const signedLicense = await verifySignedLicense(key);
  if (!signedLicense.valid) {
    elements.licenseMessage.textContent = signedLicense.message;
    return;
  }

  license = {
    active: true,
    type: "signed",
    key,
    holder: signedLicense.payload.holder || "Cliente",
    issuedAt: signedLicense.payload.issuedAt,
    expiresAt: signedLicense.payload.expiresAt
  };
  saveLicense();
  elements.licenseKey.value = "";
  renderLicense();
}

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
  setBackupStatus("Backup exportado. No celular, escolha a pasta de destino quando o sistema perguntar.");
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

      state = {
        accounts: importedState.accounts,
        transactions: importedState.transactions
      };
      saveState();
      render();
      setBackupStatus("Backup importado com sucesso.");
    } catch {
      setBackupStatus("Nao foi possivel importar este arquivo de backup.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function setBackupStatus(message) {
  elements.backupStatus.textContent = message;
}

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

function render() {
  fillAccountSelects();
  const summary = calculateSummary();
  renderSummary(summary);
  renderAccounts(summary.accountBalances);
  renderTransactions();
  renderReports(summary);
  renderLicense();
  drawCharts(summary);
}

function fillAccountSelects() {
  const options = state.accounts
    .map((account) => `<option value="${account.id}">${account.name}</option>`)
    .join("");
  elements.fromAccount.innerHTML = options;
  elements.toAccount.innerHTML = options;
}

function calculateSummary() {
  const balances = Object.fromEntries(
    state.accounts.map((account) => [account.id, account.openingBalance || 0])
  );

  let income = 0;
  let expense = 0;

  state.transactions.forEach((transaction) => {
    const amount = Number(transaction.amount) || 0;

    if (transaction.type === "income") {
      income += amount;
      balances[transaction.fromAccount] += amount;
    }

    if (transaction.type === "expense") {
      expense += amount;
      balances[transaction.fromAccount] -= amount;
    }

    if (transaction.type === "transfer") {
      balances[transaction.fromAccount] -= amount;
      balances[transaction.toAccount] += amount;
    }
  });

  const investmentIds = state.accounts
    .filter((account) => account.kind === "investment")
    .map((account) => account.id);

  const investmentTotal = investmentIds.reduce((total, id) => total + (balances[id] || 0), 0);
  const totalBalance = Object.values(balances).reduce((total, value) => total + value, 0);

  return {
    income,
    expense,
    totalBalance,
    investmentTotal,
    accountBalances: balances
  };
}

function renderSummary(summary) {
  elements.totalBalance.textContent = money.format(summary.totalBalance);
  elements.incomeTotal.textContent = money.format(summary.income);
  elements.expenseTotal.textContent = money.format(summary.expense);
  elements.investmentTotal.textContent = money.format(summary.investmentTotal);
  elements.accountCount.textContent = `${state.accounts.length} contas`;
}

function renderAccounts(balances) {
  elements.accountList.innerHTML = state.accounts
    .map((account) => {
      const initial = account.kind === "investment" ? "I" : "C";
      return `
        <article class="account-card">
          <div>
            <small>${account.kind === "investment" ? "Investimento" : "Conta corrente"}</small>
            <strong>${account.name}</strong>
            <small>${money.format(balances[account.id] || 0)}</small>
          </div>
          <span class="account-icon ${account.kind}" aria-hidden="true">${initial}</span>
        </article>
      `;
    })
    .join("");
}

function renderTransactions() {
  if (!state.transactions.length) {
    elements.transactionList.innerHTML = '<div class="empty-state">Nenhum lancamento cadastrado ainda.</div>';
    elements.transactionCount.textContent = "0 registros";
    return;
  }

  elements.transactionCount.textContent = `${state.transactions.length} registros`;
  elements.transactionList.innerHTML = state.transactions
    .map((transaction) => {
      const account = getAccountName(transaction.fromAccount);
      const destination = getAccountName(transaction.toAccount);
      const amountClass = `${transaction.type}-text`;
      const label = getTypeLabel(transaction.type);
      const meta =
        transaction.type === "transfer"
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
        </article>
      `;
    })
    .join("");
}

function handleTransactionAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const transaction = state.transactions.find((item) => item.id === button.dataset.id);
  if (!transaction) return;

  if (button.dataset.action === "edit") {
    startEdit(transaction);
  }
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
  state.transactions
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) => {
      const category = transaction.category || "Sem categoria";
      categories[category] = (categories[category] || 0) + Number(transaction.amount || 0);
    });

  return Object.entries(categories)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function buildInsights(summary, expenseByCategory, savingRate) {
  if (!state.transactions.length) {
    return ["Cadastre receitas e despesas para gerar analises automaticas."];
  }

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

  if (!insights.length) {
    insights.push("Seu resultado esta positivo. Continue acompanhando as maiores categorias para manter o controle.");
  }

  return insights;
}

function renderLicense() {
  const valid = isLicenseValid();

  if (valid) {
    const expiration = license.expiresAt ? formatDate(license.expiresAt.slice(0, 10)) : "sem data";
    elements.licenseStatus.textContent = "Ativada";
    elements.licenseStatus.className = "status-ok";
    elements.licenseMessage.textContent = `Licenca ativa ate ${expiration}. ${license.holder ? `Cliente: ${license.holder}.` : ""}`;
    setFormLocked(false);
    return;
  }

  const expired = license.active && license.expiresAt && new Date(license.expiresAt) <= new Date();
  elements.licenseStatus.textContent = expired ? "Expirada" : "Nao ativada";
  elements.licenseStatus.className = "status-alert";
  elements.licenseMessage.textContent = expired
    ? "Licenca expirada. Ative uma nova chave para liberar novos lancamentos."
    : "Para teste, use a chave FINANCAS-2026. Ela vence 1 dia apos a ativacao.";
  setFormLocked(true);
}

function setFormLocked(locked) {
  elements.form.classList.toggle("locked", locked);
  elements.form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = locked;
  });
}

function isLicenseValid() {
  if (!license.active || !license.expiresAt) return false;
  return new Date(license.expiresAt) > new Date();
}

async function verifySignedLicense(value) {
  const parts = value.split(".");
  if (parts.length !== 2) {
    return { valid: false, message: "Chave invalida. Use FINANCAS-2026 ou uma licenca gerada pelo administrador." };
  }

  try {
    const [payloadPart, signaturePart] = parts;
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signatureBytes = base64UrlToBytes(signaturePart);
    const key = await crypto.subtle.importKey(
      "jwk",
      licensePublicKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signatureBytes,
      payloadBytes
    );

    if (!verified) {
      return { valid: false, message: "Assinatura da licenca invalida." };
    }

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!payload.expiresAt || new Date(payload.expiresAt) <= new Date()) {
      return { valid: false, message: "Esta licenca ja esta expirada." };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, message: "Nao foi possivel validar esta licenca." };
  }
}

function drawCharts(summary) {
  drawBarChart(elements.flowChart, [
    { label: "Receitas", value: summary.income, color: "#15803d" },
    { label: "Despesas", value: summary.expense, color: "#b42318" }
  ]);

  drawBarChart(
    elements.accountChart,
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
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
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

function getAccountName(id) {
  return state.accounts.find((account) => account.id === id)?.name || "Conta";
}

function getTypeLabel(type) {
  return {
    income: "Receita",
    expense: "Despesa",
    transfer: "Transferencia"
  }[type];
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
