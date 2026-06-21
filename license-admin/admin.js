const clientSearchInput = document.querySelector("#clientSearch");
const clientList = document.querySelector("#clientList");
const clientCount = document.querySelector("#clientCount");
const form = document.querySelector("#licenseForm");
const holderInput = document.querySelector("#holder");
const holderDocumentInput = document.querySelector("#holderDocument");
const daysInput = document.querySelector("#days");
const licenseOutput = document.querySelector("#licenseOutput");
const statusText = document.querySelector("#status");
const copyButton = document.querySelector("#copyButton");

let clients = [];

loadClients();

clientSearchInput.addEventListener("input", renderClients);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusText.textContent = "Gerando licença...";
  
  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holder: holderInput.value.trim(),
        document: holderDocumentInput.value.trim(),
        days: Number(daysInput.value)
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || "Não foi possível gerar a licença.");
    }

    licenseOutput.value = result.license;
    statusText.textContent = `✅ Licença criada para ${result.holder}, válida até ${result.expiresAt}.`;
    document.getElementById('successBanner').classList.add('show');
  } catch (error) {
    statusText.textContent = "❌ " + error.message;
  }
});

copyButton.addEventListener("click", async () => {
  if (!licenseOutput.value) {
    alert("Nenhuma licença gerada ainda.");
    return;
  }
  
  try {
    await navigator.clipboard.writeText(licenseOutput.value);
    statusText.textContent = "✅ Licença copiada!";
    copyButton.textContent = "✅ Copiado!";
    setTimeout(() => { copyButton.textContent = "📋 Copiar"; }, 2000);
  } catch (err) {
    licenseOutput.select();
    document.execCommand("copy");
    statusText.textContent = "✅ Licença copiada!";
  }
});

async function loadClients() {
  try {
    const response = await fetch("/clients");
    const result = await response.json();
    clients = result.clients || [];
    renderClients();
  } catch (error) {
    statusText.textContent = "❌ Não foi possível carregar clientes.";
    clientList.innerHTML = '<div class="empty-state">Erro ao carregar. Verifique o servidor.</div>';
  }
}

function renderClients() {
  const query = normalize(clientSearchInput.value);
  clientCount.textContent = `${clients.length} clientes`;
  
  if (!query) {
    clientList.innerHTML = '<div class="empty-state">Digite para pesquisar clientes...</div>';
    return;
  }
  
  const filtered = clients.filter((client) => {
    const text = normalize(`${client.name} ${client.document} ${client.email || ""}`);
    return text.includes(query);
  });
  
  if (!filtered.length) {
    clientList.innerHTML = '<div class="empty-state">Nenhum cliente encontrado.</div>';
    return;
  }
  
  clientList.innerHTML = filtered
    .map((client) => `
      <button class="client-item" type="button" data-id="${client.id}">
        <strong>${client.name}</strong>
        <span>${client.document}${client.email ? ` — ${client.email}` : ""}</span>
      </button>
    `)
    .join("");
  
  clientList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = clients.find((item) => item.id === button.dataset.id);
      if (client) selectClient(client);
    });
  });
}

function selectClient(client) {
  holderInput.value = client.name;
  holderDocumentInput.value = client.document;
  clientSearchInput.value = "";
  clientList.innerHTML = "";
  statusText.textContent = `✅ Cliente selecionado: ${client.name}.`;
}

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w@.]+/g, "");
}