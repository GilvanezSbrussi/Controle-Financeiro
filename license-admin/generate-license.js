const { webcrypto } = require("crypto");

const privateJwk = {
  kty: "EC",
  x: "e1XhgU2lsgYidY77PRY32wHggaUlnC1cUBsOHbriGKY",
  y: "ewKoqLdZ8lffJ26L2SwoNm85yQsM9WODS-NNq_E1Jr0",
  crv: "P-256",
  d: "osI_x9dIIVPMm-xTny1-XuGnFSCmWxuSGWkGswYoI84"
};

const args = parseArgs(process.argv.slice(2));
const holder = args.cliente || args.holder || "Cliente";
const documentNumber = args.documento || args.document || "";
const days = Number(args.dias || args.days || 30);

if (!Number.isFinite(days) || days <= 0) {
  console.error("Informe uma quantidade de dias maior que zero. Ex: --dias 30");
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, days);
  const payload = {
    app: "Controle sua Fortuna",
    holder,
    document: documentNumber,
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
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    payloadBytes
  );

  console.log("Cliente:", holder);
  console.log("Validade:", expiresAt.toLocaleDateString("pt-BR"));
  console.log("Licenca:");
  console.log(`${base64Url(payloadBytes)}.${base64Url(new Uint8Array(signature))}`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    parsed[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return parsed;
}

function addDays(date, daysToAdd) {
  const result = new Date(date);
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
