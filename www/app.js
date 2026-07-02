"use strict";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

const STORAGE_KEY = "financas-v3";
const LICENSE_KEY = "financas-license-v1";
const DEVICE_KEY  = "financas-device-id";
const CATS_KEY    = "financas-categories-v1";
const RECORRENTES_KEY = "financas-recorrentes-v1";

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
let recorrentes = loadRecorrentes();
let filters = { type: "", cat: "", acc: "" };
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
setupAuthUI();
setupFilters();
setupRecorrentesUI();
scheduleRecorrentesNotifications();

// Inicia a sincronização com a nuvem em segundo plano (não bloqueia a tela inicial).
// O app já está usável com os dados locais antes mesmo disso terminar.
if (typeof firebase !== "undefined" && typeof auth !== "undefined") {
  initFirebaseSync();
} else {
  console.warn("Firebase não carregado — verifique se firebase-config.js está incluído antes de app.js. App segue funcionando 100% local.");
}

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
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); // sempre grava local primeiro (funciona offline)
  cloudSave("state", state);
}

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
    if (Array.isArray(raw) && raw.length > 0) {
      // Normaliza formato (migra "favorite" antigo para "isFavorite" e
      // garante os campos de limite mensal usados na tela de categorias).
      return raw.filter(c => c && c.name).map(c => ({
        id: c.id || ("c" + Date.now() + Math.random().toString(36).slice(2)),
        name: c.name,
        type: c.type || "expense",
        isFavorite: !!(c.isFavorite ?? c.favorite),
        hasLimit: !!c.hasLimit,
        monthlyLimit: parseFloat(c.monthlyLimit) || 0,
        warningPercent: parseInt(c.warningPercent) || 80
      }));
    }
  } catch {}
  // Categorias padrão
  return [
    { id: "sal",   name: "Salario",       type: "income",     isFavorite: true,  hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "ali",   name: "Alimentacao",   type: "expense",    isFavorite: true,  hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "tran",  name: "Transporte",    type: "expense",    isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "mor",   name: "Moradia",       type: "expense",    isFavorite: true,  hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "sau",   name: "Saude",         type: "expense",    isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "edu",   name: "Educacao",      type: "expense",    isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "laz",   name: "Lazer",         type: "expense",    isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "inv",   name: "Investimento",  type: "investment", isFavorite: true,  hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "rent",  name: "Rendimentos",   type: "income",     isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
    { id: "div",   name: "Dividendos",    type: "all",        isFavorite: false, hasLimit:false, monthlyLimit:0, warningPercent:80 },
  ];
}
function saveCats() {
  localStorage.setItem(CATS_KEY, JSON.stringify(cats));
  cloudSave("cats", { items: cats });
}

// Expõe a lista de categorias e uma forma de atualizá-la (com persistência
// local + sincronização automática com o Firebase) para a UI de categorias
// (com limites mensais e edição) definida em index.html.
window.getCats = function() { return cats; };
window.setCats = function(newCats) {
  cats = Array.isArray(newCats) ? newCats : [];
  saveCats();
};

function loadRecorrentes() {
  try { return JSON.parse(localStorage.getItem(RECORRENTES_KEY) || "[]"); } catch { return []; }
}
function saveRecorrentes() {
  localStorage.setItem(RECORRENTES_KEY, JSON.stringify(recorrentes));
  cloudSave("recorrentes", { items: recorrentes });
}

// ============================================================
// SINCRONIZAÇÃO COM FIREBASE (nuvem)
// ============================================================
// Estratégia: o app sempre funciona 100% offline com localStorage
// (igual hoje). Quando há login + internet, espelha os dados no
// Firestore e fica ouvindo mudanças em tempo real (outro
// dispositivo logado na mesma conta também recebe as atualizações).
let cloudUserId = null;
let cloudReady = false;
let suppressNextSnapshot = { state: false, cats: false };

function cloudDocPath(name) {
  // "name" é "state" ou "cats" — cada um vira um documento dentro de users/{uid}/data/
  return db.collection("users").doc(cloudUserId).collection("data").doc(name);
}

function cloudSave(name, payload) {
  if (!cloudReady || !cloudUserId) return; // sem login/sem rede: só fica salvo local mesmo
  suppressNextSnapshot[name] = true; // evita que o próprio listener re-renderize com o que acabamos de mandar
  cloudDocPath(name).set(payload, { merge: false }).catch((err) => {
    console.warn(`Falha ao sincronizar "${name}" com a nuvem (vai tentar de novo no próximo save):`, err);
  });
}

function initFirebaseSync() {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // ainda não logado nessa sessão: faz login anônimo automático (sem pedir nada ao usuário)
      try { await auth.signInAnonymously(); }
      catch (err) { console.warn("Login anônimo falhou (provável sem internet); app continua só local.", err); }
      return;
    }

    cloudUserId = user.uid;
    cloudReady = true;

    // Carrega perfil do usuário (nome, avatar, moeda)
    await loadProfile(user.uid);

    // Migração única: se já existe dado local e ainda não existe nada na nuvem, sobe o que tem.
    const stateDoc = await cloudDocPath("state").get().catch(() => null);
    if (stateDoc && !stateDoc.exists) {
      cloudSave("state", state);
    }
    const catsDoc = await cloudDocPath("cats").get().catch(() => null);
    if (catsDoc && !catsDoc.exists) {
      cloudSave("cats", { items: cats });
    }
    const recorrDoc = await cloudDocPath("recorrentes").get().catch(() => null);
    if (recorrDoc && !recorrDoc.exists && recorrentes.length) {
      cloudSave("recorrentes", { items: recorrentes });
    }

    // Ouve mudanças em tempo real (inclusive vindas de outro dispositivo)
    cloudDocPath("state").onSnapshot((snap) => {
      if (suppressNextSnapshot.state) { suppressNextSnapshot.state = false; return; }
      if (!snap.exists) return;
      const remote = snap.data();
      if (Array.isArray(remote.transactions)) {
        state = { accounts: remote.accounts?.length ? remote.accounts : defaultState.accounts, transactions: remote.transactions };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        render();
      }
    });

    cloudDocPath("cats").onSnapshot((snap) => {
      if (suppressNextSnapshot.cats) { suppressNextSnapshot.cats = false; return; }
      if (!snap.exists) return;
      const remote = snap.data();
      if (Array.isArray(remote.items)) {
        cats = remote.items;
        localStorage.setItem(CATS_KEY, JSON.stringify(cats));
        render();
      }
    });

    cloudDocPath("recorrentes").onSnapshot((snap) => {
      if (!snap.exists) return;
      const remote = snap.data();
      if (Array.isArray(remote.items)) {
        recorrentes = remote.items;
        localStorage.setItem(RECORRENTES_KEY, JSON.stringify(recorrentes));
        renderRecorrentes();
        renderProjecao();
      }
    });

    renderAuthStatus();
  });
}

// ============================================================
// LOGIN COM E-MAIL/SENHA (upgrade da conta anônima)
// ============================================================
// Objetivo: o cliente pode continuar usando o app sem nenhum login
// (modo anônimo, dados só naquele aparelho). Quando ele quiser acessar
// os mesmos dados em outro celular, ele "vincula" um e-mail/senha à
// conta anônima atual — isso MANTÉM o mesmo uid e os dados já salvos,
// só adiciona uma forma de login permanente em cima da mesma conta.
let authMode = "criar"; // "criar" = vincular conta nova | "entrar" = logar em conta já existente
let userProfile = { name: "", avatar: "🙂", currency: "BRL" }; // perfil carregado da nuvem

// ─── SAUDAÇÃO NO HEADER ──────────────────────────────────────
function updateHeaderGreeting() {
  const greeting = document.getElementById("headerGreeting");
  const avatar = document.getElementById("headerAvatar");
  if (greeting) {
    const hour = new Date().getHours();
    const period = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    greeting.textContent = userProfile.name ? `${period}, ${userProfile.name}!` : period;
  }
  if (avatar) avatar.textContent = userProfile.avatar || "🙂";
}

// ─── PERFIL NO FIRESTORE ──────────────────────────────────────
async function loadProfile(uid) {
  try {
    const snap = await db.collection("users").doc(uid).collection("data").doc("perfil").get();
    if (snap.exists) {
      userProfile = { name: "", avatar: "🙂", currency: "BRL", ...snap.data() };
    }
  } catch (e) { console.warn("Erro ao carregar perfil:", e); }
  updateHeaderGreeting();
}

async function saveProfile(uid) {
  await db.collection("users").doc(uid).collection("data").doc("perfil").set(userProfile, { merge: true });
}

// ─── STATUS DO MODAL ──────────────────────────────────────────
function renderAuthStatus() {
  const box = document.getElementById("authStatusBox");
  const form = document.getElementById("authForm");
  const profileSection = document.getElementById("profileSection");
  if (!box) return;
  const user = auth.currentUser;
  if (user && !user.isAnonymous) {
    box.innerHTML = `✅ Conta sincronizada como <strong>${user.email}</strong>.`;
    if (form) form.style.display = "none";
    if (profileSection) {
      profileSection.style.display = "";
      // Preenche os campos com os valores atuais do perfil
      const nameEl = document.getElementById("profileName");
      const currEl = document.getElementById("profileCurrency");
      if (nameEl) nameEl.value = userProfile.name || "";
      if (currEl) currEl.value = userProfile.currency || "BRL";
      // Marca o avatar selecionado
      document.querySelectorAll(".avatar-opt").forEach(btn => {
        btn.classList.toggle("selected", btn.dataset.emoji === (userProfile.avatar || "🙂"));
      });
    }
  } else {
    box.innerHTML = `Seus dados estão salvos só neste aparelho (conta anônima).<br>Crie um login com e-mail e senha para acessar de outro celular e ter backup permanente.`;
    if (form) form.style.display = "";
    if (profileSection) profileSection.style.display = "none";
  }
}

function showAuthError(msg) {
  const el = document.getElementById("authError");
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

// ─── LOGIN / CRIAR CONTA ──────────────────────────────────────
async function handleAuthSubmit(email, password) {
  showAuthError("");
  const submitBtn = document.getElementById("authSubmitBtn");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Aguarde..."; }
  try {
    if (authMode === "criar") {
      const cred = firebase.auth.EmailAuthProvider.credential(email, password);
      await auth.currentUser.linkWithCredential(cred);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
    renderAuthStatus();
    document.getElementById("authModal")?.classList.remove("open");
  } catch (err) {
    const msgs = {
      "auth/email-already-in-use": "Esse e-mail já tem conta. Toque em \"Já tenho conta — entrar\".",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/weak-password": "Senha muito fraca — use pelo menos 6 caracteres.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/network-request-failed": "Sem conexão com a internet. Tente novamente online."
    };
    showAuthError(msgs[err.code] || ("Erro: " + (err.message || err.code)));
    console.warn("Erro de autenticação:", err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === "criar" ? "Criar conta e sincronizar" : "Entrar";
    }
  }
}

// ─── ESQUECI MINHA SENHA ──────────────────────────────────────
async function handleForgotPassword() {
  const emailEl = document.getElementById("authEmail");
  const email = emailEl?.value.trim();
  if (!email) { showAuthError("Digite seu e-mail acima para redefinir a senha."); return; }
  showAuthError("");
  try {
    await auth.sendPasswordResetEmail(email);
    showAuthError(""); // limpa erros
    const box = document.getElementById("authStatusBox");
    if (box) box.innerHTML = `📧 E-mail de redefinição enviado para <strong>${email}</strong>. Verifique sua caixa de entrada (e o spam).`;
  } catch (err) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-email") {
      showAuthError("E-mail não encontrado. Verifique se digitou corretamente.");
    } else {
      showAuthError("Erro ao enviar e-mail: " + (err.message || err.code));
    }
  }
}

// ─── CONFIGURA TODOS OS EVENTOS DO MODAL ─────────────────────
function setupAuthUI() {
  const modal   = document.getElementById("authModal");
  const form    = document.getElementById("authForm");
  const toggleBtn  = document.getElementById("authToggleModeBtn");
  const submitBtn  = document.getElementById("authSubmitBtn");
  const logoutBtn  = document.getElementById("authLogoutBtn");
  const forgotBtn  = document.getElementById("authForgotBtn");
  const profileSaveBtn = document.getElementById("profileSaveBtn");

  // Abre o modal pelo avatar no header OU pelo item do menu
  ["headerAvatar", "menuAccountBtn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
      document.getElementById("ddMenu")?.classList.remove("open");
      renderAuthStatus();
      showAuthError("");
      modal?.classList.add("open");
    });
  });

  if (modal)    modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("open"); });
  document.getElementById("authModalClose")?.addEventListener("click", () => modal?.classList.remove("open"));

  if (toggleBtn) toggleBtn.addEventListener("click", () => {
    authMode = authMode === "criar" ? "entrar" : "criar";
    if (submitBtn) submitBtn.textContent = authMode === "criar" ? "Criar conta e sincronizar" : "Entrar";
    toggleBtn.textContent = authMode === "criar" ? "Já tenho conta — entrar" : "Criar uma conta nova";
    showAuthError("");
  });

  if (forgotBtn) forgotBtn.addEventListener("click", handleForgotPassword);

  if (form) form.addEventListener("submit", e => {
    e.preventDefault();
    handleAuthSubmit(
      document.getElementById("authEmail").value.trim(),
      document.getElementById("authPassword").value
    );
  });

  if (logoutBtn) logoutBtn.addEventListener("click", async () => {
    if (!confirm("Sair da conta? O app volta a usar uma conta anônima neste aparelho.")) return;
    await auth.signOut();
    cloudUserId = null;
    cloudReady = false;
    userProfile = { name: "", avatar: "🙂", currency: "BRL" };
    updateHeaderGreeting();
    renderAuthStatus();
  });

  // Avatar picker
  document.getElementById("avatarGrid")?.addEventListener("click", e => {
    const btn = e.target.closest(".avatar-opt");
    if (!btn) return;
    document.querySelectorAll(".avatar-opt").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    userProfile.avatar = btn.dataset.emoji;
    updateHeaderGreeting();
  });

  // Salvar perfil
  if (profileSaveBtn) profileSaveBtn.addEventListener("click", async () => {
    const nameEl = document.getElementById("profileName");
    const currEl = document.getElementById("profileCurrency");
    userProfile.name = nameEl?.value.trim() || "";
    userProfile.currency = currEl?.value || "BRL";
    updateHeaderGreeting();
    if (cloudUserId) {
      profileSaveBtn.disabled = true;
      profileSaveBtn.textContent = "Salvando...";
      try {
        await saveProfile(cloudUserId);
        const msg = document.getElementById("profileSavedMsg");
        if (msg) { msg.style.display = "block"; setTimeout(() => msg.style.display = "none", 3000); }
      } catch (e) { alert("Erro ao salvar perfil. Tente novamente."); }
      finally { profileSaveBtn.disabled = false; profileSaveBtn.textContent = "💾 Salvar perfil"; }
    }
  });
}

// ============================================================
// CATEGORIAS - helpers
// ============================================================
function getCatsForType(type) {
  if (type === "transfer") return [];
  return cats.filter(c => c.type === type || c.type === "all");
}
function getFavCatsForType(type) {
  return getCatsForType(type).filter(c => c.isFavorite);
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
// A UI do modal de categorias (abrir/fechar, adicionar, editar, excluir,
// limites mensais) é implementada em index.html, usando window.getCats()/
// window.setCats() (definidos acima) para ler e persistir os dados —
// incluindo a sincronização com o Firebase feita por saveCats().

// ============================================================
// RENDER PRINCIPAL
// ============================================================
function render() {
  fillSelects();
  fillCatSelect(el.cat, document.querySelector('input[name="type"]:checked')?.value || "income");
  if (window.populateFilterSelects) window.populateFilterSelects();
  const summary = calcSummary();
  renderSummary(summary);
  renderAccounts(summary.balances);
  renderTransactions();
  renderCatPills();
  renderReports(summary);
  renderLicense();
  renderFavTags(el.favTags, el.cat, document.querySelector('input[name="type"]:checked')?.value || "income", el.cat.value);
  renderRecorrentes();
  renderProjecao();
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

  const inc = applyFilters(all.filter(t => t.type === "income"   && inMonth(t)));
  const exp = applyFilters(all.filter(t => t.type === "expense"  && inMonth(t)));
  const trf = applyFilters(all.filter(t => t.type === "transfer" && inMonth(t)));

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
// FILTROS
// ============================================================

function setupFilters() {
  const fType = document.getElementById("filterType");
  const fCat  = document.getElementById("filterCat");
  const fAcc  = document.getElementById("filterAcc");
  const fClear = document.getElementById("filterClearBtn");

  // Preenche selects de categoria e conta com os dados atuais
  function populateFilterSelects() {
    if (fCat) {
      const catOpts = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");
      fCat.innerHTML = `<option value="">Todas as categorias</option>${catOpts}`;
      fCat.value = filters.cat;
    }
    if (fAcc) {
      const accOpts = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
      fAcc.innerHTML = `<option value="">Todas as contas</option>${accOpts}`;
      fAcc.value = filters.acc;
    }
  }

  window.populateFilterSelects = populateFilterSelects;

  const onChange = () => {
    filters.type = fType?.value || "";
    filters.cat  = fCat?.value  || "";
    filters.acc  = fAcc?.value  || "";
    renderTransactions();
    renderCatPills();
  };

  fType?.addEventListener("change", onChange);
  fCat?.addEventListener("change",  onChange);
  fAcc?.addEventListener("change",  onChange);
  fClear?.addEventListener("click", () => {
    filters = { type: "", cat: "", acc: "" };
    if (fType) fType.value = "";
    if (fCat)  fCat.value  = "";
    if (fAcc)  fAcc.value  = "";
    renderTransactions();
    renderCatPills();
  });
}

// Filtro aplicado sobre uma lista de transações
function applyFilters(txs) {
  return txs.filter(t => {
    if (filters.type && t.type !== filters.type) return false;
    if (filters.cat  && t.category !== filters.cat) return false;
    if (filters.acc  && t.fromAccount !== filters.acc && t.toAccount !== filters.acc) return false;
    return true;
  });
}

// ============================================================
// RECORRENTES — CRUD e UI
// ============================================================
let editRecorrId = null;

function getDaysUntilDue(day) {
  const today = new Date();
  const due = new Date(today.getFullYear(), today.getMonth(), day);
  if (due < today) due.setMonth(due.getMonth() + 1);
  return Math.round((due - today) / 86400000);
}

function wasLaunchedThisMonth(rec) {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  return rec.lastLaunched === key;
}

function markLaunched(rec) {
  const now = new Date();
  rec.lastLaunched = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
}

function launchRecorrente(rec) {
  const today = getBrazilDate();
  const [yr, mo] = today.split("-");
  const day = String(Math.min(rec.day, new Date(+yr, +mo, 0).getDate())).padStart(2,"0");
  const tx = {
    id: crypto.randomUUID(),
    type: rec.type,
    description: rec.description,
    amount: rec.amount,
    date: `${yr}-${mo}-${day}`,
    fromAccount: rec.fromAccount,
    toAccount: "",
    category: rec.category || ""
  };
  state.transactions.unshift(tx);
  markLaunched(rec);
  saveState();
  saveRecorrentes();
  render();
  scheduleRecorrentesNotifications();
}

function renderRecorrentes() {
  const el = document.getElementById("recorrList");
  if (!el) return;
  const active = recorrentes.filter(r => r.active !== false);
  if (!recorrentes.length) { el.innerHTML = '<div class="empty">Nenhuma conta recorrente cadastrada.</div>'; return; }

  el.innerHTML = recorrentes.map(rec => {
    const daysLeft = getDaysUntilDue(rec.day);
    const launched = wasLaunchedThisMonth(rec);
    let dueTag = "";
    if (!launched) {
      if (daysLeft <= 0)       dueTag = `<span class="recorr-due overdue">Vencida</span>`;
      else if (daysLeft <= 3)  dueTag = `<span class="recorr-due due-soon">em ${daysLeft}d</span>`;
    }
    const inactiveClass = rec.active === false ? " recorr-inactive" : "";
    return `
    <div class="recorr-item${inactiveClass}" data-id="${rec.id}">
      <div class="recorr-badge ${rec.type}">${rec.day}</div>
      <div class="recorr-info">
        <strong>${rec.description}${dueTag}</strong>
        <small>${rec.category || "Sem categoria"} · Dia ${rec.day} · ${rec.type === "expense" ? "Despesa" : "Receita"}</small>
      </div>
      <span class="recorr-amount ${rec.type}">${rec.type === "expense" ? "−" : "+"}${money.format(rec.amount)}</span>
      <div class="recorr-actions">
        ${!launched && rec.active !== false ? `<button class="recorr-btn" data-action="launch" data-id="${rec.id}" title="Lançar agora">▶</button>` : ""}
        <button class="recorr-btn" data-action="edit"   data-id="${rec.id}" title="Editar">✏️</button>
        <button class="recorr-btn" data-action="toggle" data-id="${rec.id}" title="${rec.active === false ? "Ativar" : "Pausar"}">${rec.active === false ? "▶" : "⏸"}</button>
        <button class="recorr-btn" data-action="del"    data-id="${rec.id}" title="Excluir">🗑</button>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id  = btn.dataset.id;
      const rec = recorrentes.find(r => r.id === id);
      if (!rec) return;
      if (btn.dataset.action === "launch") {
        if (confirm(`Lançar "${rec.description}" (${money.format(rec.amount)}) agora?`)) launchRecorrente(rec);
      }
      if (btn.dataset.action === "edit")   openRecorrModal(rec);
      if (btn.dataset.action === "toggle") {
        rec.active = rec.active === false ? true : false;
        saveRecorrentes(); renderRecorrentes();
      }
      if (btn.dataset.action === "del") {
        if (confirm(`Excluir "${rec.description}"?`)) {
          recorrentes = recorrentes.filter(r => r.id !== id);
          saveRecorrentes(); renderRecorrentes(); renderProjecao();
        }
      }
    });
  });
}

function openRecorrModal(rec) {
  editRecorrId = rec ? rec.id : null;
  const modal = document.getElementById("recorrModal");
  document.getElementById("recorrModalTitle").textContent = rec ? "✏️ Editar recorrente" : "🔁 Nova recorrente";

  // Preenche selects
  const accEl = document.getElementById("recorrAcc");
  accEl.innerHTML = state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
  const catEl = document.getElementById("recorrCat");
  catEl.innerHTML = `<option value="">Sem categoria</option>` + cats.map(c => `<option value="${c.name}">${c.name}</option>`).join("");

  if (rec) {
    document.querySelector(`input[name="rtype"][value="${rec.type}"]`).checked = true;
    document.getElementById("recorrDesc").value = rec.description;
    document.getElementById("recorrAmt").value  = rec.amount;
    document.getElementById("recorrDay").value  = rec.day;
    accEl.value = rec.fromAccount;
    catEl.value = rec.category || "";
  } else {
    document.querySelector('input[name="rtype"][value="expense"]').checked = true;
    document.getElementById("recorrDesc").value = "";
    document.getElementById("recorrAmt").value  = "";
    document.getElementById("recorrDay").value  = "";
    accEl.value = state.accounts[0]?.id || "";
    catEl.value = "";
  }
  modal?.classList.add("open");
}

function setupRecorrentesUI() {
  document.getElementById("addRecorrBtn")?.addEventListener("click", () => openRecorrModal(null));
  document.getElementById("recorrModalClose")?.addEventListener("click", () => document.getElementById("recorrModal")?.classList.remove("open"));
  document.getElementById("recorrModal")?.addEventListener("click", e => { if (e.target.id === "recorrModal") e.target.classList.remove("open"); });

  document.getElementById("recorrForm")?.addEventListener("submit", e => {
    e.preventDefault();
    const type = document.querySelector('input[name="rtype"]:checked')?.value || "expense";
    const rec = {
      id:          editRecorrId || crypto.randomUUID(),
      type,
      description: document.getElementById("recorrDesc").value.trim(),
      amount:      Number(document.getElementById("recorrAmt").value),
      day:         Number(document.getElementById("recorrDay").value),
      fromAccount: document.getElementById("recorrAcc").value,
      category:    document.getElementById("recorrCat").value,
      active:      true,
      lastLaunched: editRecorrId ? (recorrentes.find(r=>r.id===editRecorrId)?.lastLaunched || "") : ""
    };
    if (editRecorrId) {
      recorrentes = recorrentes.map(r => r.id === editRecorrId ? rec : r);
    } else {
      recorrentes.push(rec);
    }
    saveRecorrentes();
    renderRecorrentes();
    renderProjecao();
    scheduleRecorrentesNotifications();
    document.getElementById("recorrModal")?.classList.remove("open");
  });
}

// ============================================================
// PROJEÇÃO DE SALDO — próximos 30 dias
// ============================================================
function renderProjecao() {
  const el = document.getElementById("projecaoList");
  if (!el) return;
  const ativos = recorrentes.filter(r => r.active !== false);
  if (!ativos.length) { el.innerHTML = '<div class="empty">Cadastre recorrentes para ver a projeção.</div>'; return; }

  // Saldo atual
  const balances = Object.fromEntries(state.accounts.map(a => [a.id, a.openingBalance || 0]));
  state.transactions.forEach(t => {
    const v = Number(t.amount) || 0;
    if (t.type === "income")   balances[t.fromAccount] = (balances[t.fromAccount]||0) + v;
    if (t.type === "expense")  balances[t.fromAccount] = (balances[t.fromAccount]||0) - v;
    if (t.type === "transfer") { balances[t.fromAccount] = (balances[t.fromAccount]||0) - v; balances[t.toAccount] = (balances[t.toAccount]||0) + v; }
  });
  let saldo = Object.values(balances).reduce((s,v)=>s+v,0);

  // Monta eventos dos próximos 30 dias
  const today = new Date(); today.setHours(0,0,0,0);
  const events = [];
  for (let d = 0; d <= 30; d++) {
    const date = new Date(today); date.setDate(today.getDate() + d);
    ativos.forEach(rec => {
      const dueDay = Math.min(rec.day, new Date(date.getFullYear(), date.getMonth()+1, 0).getDate());
      if (date.getDate() === dueDay) {
        const alreadyLaunched = wasLaunchedThisMonth(rec) &&
          new Date().getMonth() === date.getMonth() && new Date().getFullYear() === date.getFullYear();
        if (!alreadyLaunched) events.push({ date: new Date(date), rec });
      }
    });
  }

  if (!events.length) { el.innerHTML = '<div class="empty">Sem eventos recorrentes nos próximos 30 dias.</div>'; return; }

  // Agrupa por data e calcula saldo projetado
  const grouped = [];
  events.sort((a,b) => a.date - b.date);
  let currentDate = null;
  events.forEach(ev => {
    const key = ev.date.toISOString().slice(0,10);
    if (key !== currentDate) { currentDate = key; grouped.push({ date: ev.date, items: [] }); }
    grouped[grouped.length-1].items.push(ev.rec);
  });

  const todayKey = today.toISOString().slice(0,10);
  let runSaldo = saldo;
  el.innerHTML = grouped.map(group => {
    const dateKey = group.date.toISOString().slice(0,10);
    const isToday = dateKey === todayKey;
    const dateLabel = isToday ? "Hoje" : dateFmt.format(group.date);
    let groupHtml = "";
    group.items.forEach(rec => {
      runSaldo += rec.type === "income" ? rec.amount : -rec.amount;
      const signal = rec.type === "income" ? "+" : "−";
      const cls    = rec.type === "income" ? "income-text" : "expense-text";
      groupHtml += `<div class="proj-row${isToday ? " proj-today" : ""}">
        <span class="proj-date">${dateLabel}</span>
        <span class="proj-event">${rec.description}</span>
        <span class="proj-balance ${runSaldo < 0 ? "neg" : "pos"}">${signal}${money.format(rec.amount)} → ${money.format(runSaldo)}</span>
      </div>`;
    });
    return groupHtml;
  }).join("");
}

// ============================================================
// NOTIFICAÇÕES — @capacitor/local-notifications
// ============================================================
async function scheduleRecorrentesNotifications() {
  try {
    const { LocalNotifications } = Capacitor?.Plugins || {};
    if (!LocalNotifications) return; // plugin não disponível (web ou não instalado)

    // Cancela notificações de recorrentes anteriores (IDs 9000-9099)
    const ids = Array.from({length:100}, (_,i) => ({ id: 9000+i }));
    await LocalNotifications.cancel({ notifications: ids }).catch(()=>{});

    // Pede permissão
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;

    const notifications = [];
    recorrentes.filter(r => r.active !== false && !wasLaunchedThisMonth(r)).forEach((rec, i) => {
      const today = new Date(); today.setHours(9, 0, 0, 0);
      const due = new Date(today.getFullYear(), today.getMonth(), rec.day, 9, 0, 0);
      if (due < today) due.setMonth(due.getMonth() + 1);

      const daysLeft = Math.round((due - new Date()) / 86400000);
      if (daysLeft > 7) return; // só notifica com até 7 dias de antecedência

      const alertDate = new Date(due); alertDate.setDate(due.getDate() - 2); alertDate.setHours(9,0,0,0);
      if (alertDate < new Date()) return; // já passou a data de alerta

      notifications.push({
        id: 9000 + i,
        title: `📅 ${rec.description} vence em ${daysLeft}d`,
        body: `${rec.type === "expense" ? "Despesa" : "Receita"} de ${money.format(rec.amount)} — toque para lançar`,
        schedule: { at: alertDate },
        sound: null, attachments: null, actionTypeId: "", extra: null
      });
    });

    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) { console.warn("Notificação local indisponível:", e); }
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