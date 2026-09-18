const { webcrypto } = require("crypto");
const path = require("path");

const privateJwk = {
  kty: "EC",
  crv: "P-256",
  d:   "h-edO4Dzn_Ulo8gajpmfM9Ed8U9eOSjXrhCV_xtBbYc",
  x:   "iAvXDinVd5FjDKzq5ZkenzIgH_w2VxxiA8CXZV59v5c",
  y:   "4ocxQqQ_mpNSc7WNTnVTOAF9umT48NtjykGh5mrJg5Y"
};

// ── Firestore (opcional) ──────────────────────────────────────────
// Se existir license-admin/serviceAccountKey.json, a licença gerada
// também é salva na mesma coleção "licencas_emitidas" usada pelas
// licenças automáticas do Mercado Pago, assim tudo aparece junto.
let db = null;
try {
  const serviceAccount = require(path.join(__dirname, "serviceAccountKey.json"));
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
} catch (e) {
  // Sem chave de serviço configurada — segue funcionando só localmente,
  // exatamente como antes (só imprime a licença no terminal).
}

const args = parseArgs(process.argv.slice(2));
const holder = args.cliente || args.holder || "Cliente";
const documentNumber = args.documento || args.document || "";
const days = Number(args.dias || args.days || 30);
const deviceId = args.device || args.deviceid || null;

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
  const licenseKey = `${base64Url(payloadBytes)}.${base64Url(new Uint8Array(signature))}`;

  console.log("Cliente:", holder);
  console.log("Validade:", expiresAt.toLocaleDateString("pt-BR"));
  console.log("Licenca:");
  console.log(licenseKey);

  if (db) {
    await db.collection("licencas_emitidas").add({
      holder,
      document: documentNumber,
      deviceId,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      issuer: "admin-manual", // diferencia de "mercadopago-auto"
      key: licenseKey,
      createdAt: admin_FieldValueServerTimestamp(),
    });
    console.log("\n✅ Também salva no Firestore (licencas_emitidas).");
  } else {
    console.log("\nℹ️  Não salva no Firestore: license-admin/serviceAccountKey.json não encontrado.");
  }
}

function admin_FieldValueServerTimestamp() {
  // Requer o mesmo módulo já carregado acima quando db existe.
  return require("firebase-admin").firestore.FieldValue.serverTimestamp();
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
