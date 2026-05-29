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

const root = __dirname;
const clientsFile = path.join(root, "clients.json");
const port = 8789;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

http
  .createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/clients") {
      sendJson(response, 200, { clients: readClients() });
      return;
    }

    if (request.method === "POST" && request.url === "/clients") {
      try {
        const body = await readBody(request);
        const result = saveClient(body.name, body.document);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return;
    }

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

    const route = request.url === "/" ? "/index.html" : request.url;
    const file = path.join(root, route.split("?")[0]);
    if (!file.startsWith(root)) {
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
  .listen(port, "127.0.0.1", () => {
    console.log(`Gerador de licencas aberto em http://127.0.0.1:${port}`);
  });

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

function saveClient(name, document) {
  const cleanName = String(name || "").trim();
  const cleanDocument = String(document || "").trim();
  if (!cleanName) throw new Error("Informe o nome do cliente.");
  if (!cleanDocument) throw new Error("Informe CPF ou CNPJ do cliente.");

  const clients = readClients();
  const existing = clients.find((client) => onlyDigits(client.document) === onlyDigits(cleanDocument));
  const client = {
    id: existing?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    document: cleanDocument,
    updatedAt: new Date().toISOString()
  };

  const nextClients = existing
    ? clients.map((item) => (item.id === existing.id ? client : item))
    : [client, ...clients];
  writeClients(nextClients);
  return { client, clients: nextClients };
}

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

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
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
