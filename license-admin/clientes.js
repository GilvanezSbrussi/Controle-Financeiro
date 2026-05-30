const clientForm = document.querySelector("#clientForm");
const clientNameInput = document.querySelector("#clientName");
const clientDocumentInput = document.querySelector("#clientDocument");
const clientEmailInput = document.querySelector("#clientEmail");
const clientSearchInput = document.querySelector("#clientSearch");
const clientList = document.querySelector("#clientList");
const clientCount = document.querySelector("#clientCount");
const statusText = document.querySelector("#status");
let clients = [];

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusText.textContent = "Salvando cliente...";

  try {
    const response = await fetch("/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clientNameInput.value.trim(),
        document: clientDocumentInput.value.trim(),
        email: clientEmailInput.value.trim()
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Nao foi possivel salvar o cliente.");

    clients = result.clients;
    clientForm.reset();
    renderClients();
    statusText.textContent = "Cliente salvo com sucesso.";
  } catch (error) {
    statusText.textContent = error.message;
  }
});

clientSearchInput.addEventListener("input", renderClients);

loadClients();

async function loadClients() {
  try {
    const response = await fetch("/clients");
    const result = await response.json();
    clients = result.clients || [];
    renderClients();
  } catch {
    statusText.textContent = "Nao foi possivel carregar o cadastro de clientes.";
  }
}

function renderClients() {
  const query = normalize(clientSearchInput.value);
  const filtered = clients.filter((client) => {
    const text = normalize(`${client.name} ${client.document} ${client.email || ""}`);
    return text.includes(query);
  });

  clientCount.textContent = `${clients.length} clientes`;

  if (!filtered.length) {
    clientList.innerHTML = '<div class="empty-state">Nenhum cliente encontrado.</div>';
    return;
  }

  clientList.innerHTML = filtered
    .map(
      (client) => `
        <button class="client-item" type="button" data-id="${client.id}">
          <strong>${client.name}</strong>
          <span>${client.document}${client.email ? ` — ${client.email}` : ""}</span>
        </button>
      `
    )
    .join("");

  clientList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = clients.find((item) => item.id === button.dataset.id);
      if (!client) return;
      clientNameInput.value = client.name;
      clientDocumentInput.value = client.document;
      clientEmailInput.value = client.email || "";
      statusText.textContent = `Editando cliente: ${client.name}.`;
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
