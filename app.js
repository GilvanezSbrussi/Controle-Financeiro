"use strict";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const STORAGE_KEY = "financas-v3";
const LICENSE_KEY = "financas-license-v1";
const DEVICE_KEY  = "financas-device-id";

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

// --- ESTADO ---
let state   = loadState();
let license = loadLicense();
let editId  = null;
let economyMonth = new Date().getMonth();
let economyYear  = new Date().getFullYear();

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
};

// --- INIT ---
el.dt.value = new Date().toISOString().slice(0,10);

el.txForm.addEventListener("submit", onSubmit);
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener("change", updateFormMode));
el.cancelEditBtn.addEventListener("click", resetForm);
el.expList.addEventListener("click", onTxClick);
el.incList.addEventListener("click", onTxClick);
el.trfList.addEventListener("click", onTxClick);
window.addEventListener("resize", () => { try { drawCharts(calcSummary()); drawEconomyChart(); } catch(e){} });

render();

// --- PERSISTÊNCIA ---
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

// --- FORM ---
function updateFormMode() {
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const isTransfer = type === "transfer";
  el.toWrap.classList.toggle("hidden", !isTransfer);
  el.catWrap.classList.toggle("hidden", isTransfer);
  el.toAcc.required = isTransfer;
}

function resetForm() {
  editId = null;
  el.txForm.reset();
  el.dt.value = new Date().toISOString().slice(0,10);
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
  const tx = {
    id: editId || crypto.randomUUID(),
    type,
    description: String(fd.get("description")).trim(),
    amount: Number(fd.get("amount")),
    date: fd.get("date"),
    fromAccount: fromAcc,
    toAccount: type === "transfer" ? toAcc : "",
    category: String(fd.get("category") || "").trim()
  };
  if (editId) {
    state.transactions = state.transactions.map(t => t.id === editId ? tx : t);
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
  if (btn.dataset.action === "edit") startEdit(tx);
  if (btn.dataset.action === "del") {
    if (confirm("Remover este lancamento?")) {
      state.transactions = state.transactions.filter(t => t.id !== btn.dataset.id);
      saveState(); render();
    }
  }
}

function startEdit(tx) {
  editId = tx.id;
  document.querySelector(`input[name="type"][value="${tx.type}"]`).checked = true;
  el.desc.value = tx.description;
  el.amt.value  = tx.amount;
  el.dt.value   = tx.date;
  el.fromAcc.value = tx.fromAccount;
  el.toAcc.value   = tx.toAccount || state.accounts[0]?.id;
  el.cat.value     = tx.category || "";
  el.formTitle.textContent = "✏️ Editar lancamento";
  el.saveBtn.textContent   = "Salvar alteracoes";
  el.cancelEditBtn.classList.remove("hidden");
  updateFormMode();
  // Vai para aba visão geral e rola para o form
  document.querySelector('.tab[data-pane="pane-geral"]').click();
  setTimeout(() => el.txForm.scrollIntoView({ behavior:"smooth", block:"start" }), 100);
}

// --- RENDER PRINCIPAL ---
function render() {
  fillSelects();
  const summary = calcSummary();
  renderSummary(summary);
  renderAccounts(summary.balances);
  renderTransactions();
  renderCatPills();
  renderReports(summary);
  renderLicense();
  try { drawCharts(summary); } catch(e) {}
  try { drawEconomyChart(); } catch(e) {}
}

function fillSelects() {
  const opts = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  el.fromAcc.innerHTML = opts;
  el.toAcc.innerHTML = opts;
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
    <div class="acc-card">
      <div class="acc-info">
        <small>${a.kind === "investment" ? "Investimento" : "Conta corrente"}</small>
        <strong>${a.name}</strong>
        <em>${money.format(balances[a.id]||0)}</em>
      </div>
      <div class="acc-icon ${a.kind}">${a.kind === "investment" ? "I" : "C"}</div>
    </div>`).join("");
}

function renderTransactions() {
  const inc = state.transactions.filter(t => t.type === "income");
  const exp = state.transactions.filter(t => t.type === "expense");
  const trf = state.transactions.filter(t => t.type === "transfer");
  el.incCount.textContent = inc.length;
  el.expCount.textContent = exp.length;
  el.trfCount.textContent = trf.length;
  el.incList.innerHTML = txHTML(inc, "Nenhuma receita ainda.");
  el.expList.innerHTML = txHTML(exp, "Nenhuma despesa ainda.");
  el.trfList.innerHTML = txHTML(trf, "Nenhuma transferencia ainda.");
}

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
        <div style="display:flex;gap:6px;margin-top:4px">
          <button class="tx-edit" data-action="edit" data-id="${t.id}">✏️ Editar</button>
          <button class="tx-edit" data-action="del"  data-id="${t.id}" style="color:var(--expense)">🗑 Remover</button>
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
  const cats = {};
  state.transactions.filter(t => t.type === "expense").forEach(t => {
    const c = t.category || "Sem categoria";
    cats[c] = (cats[c]||0) + Number(t.amount);
  });
  const sorted = Object.entries(cats).sort((a,b) => b[1]-a[1]);
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

// --- GRAFICO ECONOMIA ---
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
  const pct  = inc > 0 ? Math.max(0, Math.min(100, Math.round(saved/inc*100))) : 0;

  el.ecoInc.textContent    = money.format(inc);
  el.ecoExp.textContent    = money.format(exp);
  el.ecoSaved.textContent  = money.format(saved);
  el.ecoSaved.style.color  = saved >= 0 ? "var(--income)" : "var(--expense)";
  el.ecoPercent.textContent = pct + "%";
  el.ecoPercent.style.color = pct>=20 ? "var(--income)" : pct>=10 ? "var(--primary)" : "var(--expense)";

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
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI); ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=lw; ctx.stroke();
  if (pct>0) {
    ctx.beginPath(); ctx.arc(cx,cy,r,start,start+2*Math.PI*pct/100);
    ctx.strokeStyle = pct>=20?"#16a34a":pct>=10?"#0f766e":"#f59e0b";
    ctx.lineWidth=lw; ctx.lineCap="round"; ctx.stroke();
  }
  if (pct<100 && exp>0) {
    ctx.beginPath(); ctx.arc(cx,cy,r,start+2*Math.PI*pct/100,start+2*Math.PI);
    ctx.strokeStyle="#fca5a5"; ctx.lineWidth=lw; ctx.lineCap="round"; ctx.stroke();
  }
}

// --- GRÁFICOS BARRA ---
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
    ctx.fillText(row.label.slice(0,12),x,H-pad-7);
    ctx.fillStyle="var(--text2,#666)"; ctx.font="700 10px Arial";
    ctx.fillText(money.format(row.value),x,Math.max(16,y-6));
  });
}

// --- UTILS ---
function accName(id) { return state.accounts.find(a=>a.id===id)?.name||"Conta"; }
function fmtDate(v)  { return dateFmt.format(new Date(v+"T12:00:00")); }

// Expor para uso externo (abas)
window.drawCharts = drawCharts;
window.drawEconomyChart = drawEconomyChart;
window.calculateSummary = calcSummary;
window.economyMonth = economyMonth;
window.economyYear  = economyYear;
