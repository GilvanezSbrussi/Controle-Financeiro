const http = require("http");
const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");

const privateJwk = {
  kty: "EC",
  x: "e1XhgU2lsgYidY77PRY32wHggaUlnC1cUBsOHbriGKY",
  y: "ewKoqLdZ8lffJ26L2SwoNm85yQsM9WODS-NNq_E1Jr0",
  crv: "P-256",
  d: "osI_x9dIIVPMm-xTny1-XuGnFSCmWxuSGWkGswYoI84"
};

const publicJwk = {
  kty: "EC",
  x: "e1XhgU2lsgYidY77PRY32wHggaUlnC1cUBsOHbriGKY",
  y: "ewKoqLdZ8lffJ26L2SwoNm85yQsM9WODS-NNq_E1Jr0",
  crv: "P-256"
};

const root = __dirname;
const clientsFile = path.join(root, "clients.json");
// Arquivo que registra quais licencas ja foram ativadas e em qual maquina
const usedLicensesFile = path.join(root, "used-licenses.json");
const port = 8789;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

// Serve tanto a pasta license-admin quanto a pasta raiz do projeto (index.html)
const projectRoot = path.join(root, "..");

http
  .createServer(async (request, response) => {
    // Habilita CORS para acesso pelo IP local
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    // --- CLIENTES ---
    if (request.method === "GET" && request.url === "/clients") {
      sendJson(response, 200, { clients: readClients() });
      return;
    }

    if (request.method === "POST" && request.url === "/clients") {
      try {
        const body = await readBody(request);
        const result = saveClient(body.name, body.document, body.email);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    // --- GERAR LICENCA ---
    if (request.method === "POST" && request.url === "/generate") {
      try {
        const body = await readBody(request);
        const result = await generateLicense(body.holder, body.document, Number(body.days));
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    // --- VALIDAR LICENCA (impede uso duplicado) ---
    if (request.method === "POST" && request.url === "/validate") {
      try {
        const body = await readBody(request);
        const result = await validateAndActivateLicense(body.license, body.deviceId);
        sendJson(response, result.ok ? 200 : 403, result);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

    // --- ARQUIVOS ESTATICOS ---
    // Tenta servir da pasta license-admin primeiro, depois da raiz do projeto
    let route = request.url === "/" ? "/Gerador.html" : request.url;
    route = route.split("?")[0];

    let file = path.join(root, route);

    // Se nao encontrar na pasta admin, tenta na raiz do projeto (para o index.html)
    if (!fs.existsSync(file)) {
      file = path.join(projectRoot, route);
    }

    // Seguranca: nao permite sair das pastas permitidas
    if (!file.startsWith(root) && !file.startsWith(projectRoot)) {
      response.writeHead(403);
      response.end("Acesso negado");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Arquivo nao encontrado");
        return;
      }

      response.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain" });
      response.end(data);
    });
  })
  .listen(port, "0.0.0.0", () => {
    // Escuta em 0.0.0.0 para aceitar conexoes pelo IP local da rede
    console.log(`Servidor rodando em:`);
    console.log(`  Local:    http://127.0.0.1:${port}`);
    console.log(`  Rede:     http://<seu-ip-local>:${port}`);
    console.log(`  Admin:    http://127.0.0.1:${port}/Gerador.html`);
    console.log(`  App:      http://127.0.0.1:${port}/index.html`);
  });

// --- CLIENTES ---

function readClients() {
  if (!fs.existsSync(clientsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(clientsFile, "utf-8"));
  } catch {
    return [];
  }
}

function writeClients(clients) {
  fs.writeFileSync(clientsFile, JSON.stringify(clients, null, 2));
}

function saveClient(name, document, email) {
  const cleanName = String(name || "").trim();
  const cleanDocument = String(document || "").trim();
  const cleanEmail = String(email || "").trim();
  if (!cleanName) throw new Error("Informe o nome do cliente.");
  if (!cleanDocument) throw new Error("Informe CPF ou CNPJ do cliente.");

  const clients = readClients();
  const existing = clients.find((client) => onlyDigits(client.document) === onlyDigits(cleanDocument));
  const client = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    document: cleanDocument,
    email: cleanEmail,
    updatedAt: new Date().toISOString()
  };

  const nextClients = existing
    ? clients.map((item) => (item.id === existing.id ? client : item))
    : [client, ...clients];
  writeClients(nextClients);
  return { client, clients: nextClients };
}

// --- LICENCAS USADAS ---

function readUsedLicenses() {
  if (!fs.existsSync(usedLicensesFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(usedLicensesFile, "utf-8"));
  } catch {
    return [];
  }
}

function writeUsedLicenses(licenses) {
  fs.writeFileSync(usedLicensesFile, JSON.stringify(licenses, null, 2));
}

// Valida assinatura e verifica se a licenca ja foi usada em outro dispositivo
async function validateAndActivateLicense(licenseKey, deviceId) {
  if (!licenseKey) return { ok: false, message: "Chave de licenca nao informada." };
  if (!deviceId) return { ok: false, message: "Identificador de dispositivo nao informado." };

  // Verifica assinatura criptografica
  const parts = licenseKey.split(".");
  if (parts.length !== 2) {
    return { ok: false, message: "Chave de licenca invalida." };
  }

  let payload;
  try {
    const [payloadPart, signaturePart] = parts;
    const payloadBytes = base64UrlToBytes(payloadPart);
    const signatureBytes = base64UrlToBytes(signaturePart);

    const key = await webcrypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );

    const verified = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signatureBytes,
      payloadBytes
    );

    if (!verified) return { ok: false, message: "Assinatura da licenca invalida." };

    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, message: "Nao foi possivel verificar a licenca." };
  }

  // Verifica validade
  if (!payload.expiresAt || new Date(payload.expiresAt) <= new Date()) {
    return { ok: false, message: "Esta licenca ja esta expirada." };
  }

  // Verifica se a licenca ja foi ativada em outro dispositivo
  const usedLicenses = readUsedLicenses();
  const licenseHash = licenseKey.slice(-32); // Usa os ultimos 32 chars como identificador
  const existing = usedLicenses.find((item) => item.licenseHash === licenseHash);

  if (existing) {
    if (existing.deviceId !== deviceId) {
      return {
        ok: false,
        message: `Esta licenca ja foi ativada em outro dispositivo em ${new Date(existing.activatedAt).toLocaleDateString("pt-BR")}. Cada licenca so pode ser usada em um dispositivo.`
      };
    }
    // Mesmo dispositivo — permite reativar normalmente
    return { ok: true, payload };
  }

  // Primeira ativacao: registra o dispositivo
  usedLicenses.push({
    licenseHash,
    deviceId,
    holder: payload.holder,
    activatedAt: new Date().toISOString(),
    expiresAt: payload.expiresAt
  });
  writeUsedLicenses(usedLicenses);

  return { ok: true, payload };
}

// --- GERAR LICENCA ---

async function generateLicense(holder, document, days) {
  if (!holder) throw new Error("Informe o nome do cliente.");
  if (!Number.isFinite(days) || days <= 0) throw new Error("Informe dias de validade maior que zero.");

  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, days);
  const payload = {
    app: "Controle sua Fortuna",
    holder,
    document: document || "",
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await webcrypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, payloadBytes);

  return {
    holder,
    expiresAt: expiresAt.toLocaleDateString("pt-BR"),
    license: `${base64Url(payloadBytes)}.${base64Url(new Uint8Array(signature))}`
  };
}

// --- UTILITARIOS ---

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Dados invalidos."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function addDays(date, daysToAdd) {
  const result = new Date(date);
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(base64, "base64");
}
