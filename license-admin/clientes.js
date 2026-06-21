const clientForm = document.querySelector("#clientForm");
const clientNameInput = document.querySelector("#clientName");
const clientDocumentInput = document.querySelector("#clientDocument");
const clientEmailInput = document.querySelector("#clientEmail");
const clientProfileInput = document.querySelector("#clientProfile");
const clientSearchInput = document.querySelector("#clientSearch");
const clientList = document.querySelector("#clientList");
const clientCount = document.querySelector("#clientCount");
const statusText = document.querySelector("#status");

// Chave usada no localStorage como fallback quando o backend não responde.
// Mantida em window para poder ser reaproveitada por outras telas (index.html, gerador.html).
const CLIENTS_LOCAL_KEY = "financas-clients-v1";

let clients = [];

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusText.textContent = "Salvando cliente...";

  const payload = {
    name: clientNameInput.value.trim(),
    document: clientDocumentInput.value.trim(),
    email: clientEmailInput.value.trim(),
    profile: clientProfileInput.value
  };

  try {
    const response = await fetch("/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível salvar.");

    clients = result.clients;
    // Mantém uma cópia local sincronizada, para telas que dependem do localStorage
    // (ex: validação de admin offline) mesmo quando o backend está disponível.
    saveClientsLocal(clients);

    clientForm.reset();
    renderClients();
    statusText.textContent = "✅ Cliente salvo com sucesso.";
  } catch (error) {
    // Backend indisponível (ou erro de rede): salva localmente como fallback.
    console.warn("Backend indisponível, salvando localmente:", error.message);
    saveClientLocalFallback(payload);
    clientForm.reset();
    renderClients();
    statusText.textContent = "⚠️ Backend indisponível. Cliente salvo localmente neste navegador.";
  }
});

clientSearchInput.addEventListener("input", renderClients);
loadClients();

async function loadClients() {
  try {
    const response = await fetch("/clients");
    if (!response.ok) throw new Error("Servidor retornou " + response.status);
    const result = await response.json();
    clients = result.clients || [];
    // Sincroniza cópia local com o que veio do servidor.
    saveClientsLocal(clients);
    renderClients();
  } catch {
    // Sem backend: usa o que estiver salvo localmente neste navegador.
    clients = loadClientsLocal();
    if (clients.length) {
      statusText.textContent = "⚠️ Backend indisponível. Exibindo clientes salvos localmente.";
    } else {
      statusText.textContent = "❌ Não foi possível carregar clientes (backend offline e nenhum dado local).";
    }
    renderClients();
  }
}

function renderClients() {
  const query = normalize(clientSearchInput.value);
  const filtered = clients.filter((client) => {
    const text = normalize(`${client.name} ${client.document} ${client.email || ""} ${client.profile || ""}`);
    return text.includes(query);
  });

  clientCount.textContent = `${clients.length} clientes`;

  if (!filtered.length) {
    clientList.innerHTML = '<div class="empty-state">Nenhum cliente encontrado.</div>';
    return;
  }

  clientList.innerHTML = filtered
    .map((client) => `
      <button class="client-item" type="button" data-id="${client.id}">
        <strong>${client.name}</strong>
        <span>${client.document}${client.email ? ` — ${client.email}` : ""} — Perfil: ${client.profile || "Usuário"}</span>
      </button>
    `)
    .join("");

  clientList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = clients.find((item) => item.id === button.dataset.id);
      if (!client) return;

      clientNameInput.value = client.name;
      clientDocumentInput.value = client.document;
      clientEmailInput.value = client.email || "";
      clientProfileInput.value = client.profile || "Usuário";
      statusText.textContent = `📝 Editando: ${client.name}.`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w@.]+/g, "");
}

// ============================================================
// FALLBACK LOCALSTORAGE (usado apenas quando o backend falha)
// ============================================================

function loadClientsLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIENTS_LOCAL_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveClientsLocal(list) {
  try {
    localStorage.setItem(CLIENTS_LOCAL_KEY, JSON.stringify(list || []));
  } catch (e) {
    console.warn("Não foi possível salvar clientes localmente:", e);
  }
}

function saveClientLocalFallback(payload) {
  const list = loadClientsLocal();

  // Verifica se já existe cliente com o mesmo documento (atualiza em vez de duplicar)
  const docNormalized = (payload.document || "").replace(/\D/g, "");
  const existingIndex = list.findIndex(
    (c) => (c.document || "").replace(/\D/g, "") === docNormalized && docNormalized
  );

  const record = {
    id: existingIndex >= 0 ? list[existingIndex].id : "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    name: payload.name,
    document: payload.document,
    email: payload.email,
    profile: payload.profile
  };

  if (existingIndex >= 0) {
    list[existingIndex] = record;
  } else {
    list.push(record);
  }

  saveClientsLocal(list);
  clients = list;
}
