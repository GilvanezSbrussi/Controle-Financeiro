// licencas.js
// Cloud Functions (2ª geração) adicionais ao seu projeto:
//   - criarPagamento     → cria a cobrança no Mercado Pago
//   - mercadoPagoWebhook → recebe a confirmação e gera/entrega a licença
//
// Reaproveita EXATAMENTE a mesma chave privada e o mesmo formato de payload
// que license-admin/generate-license.js já usa, então licenca.html não
// precisa mudar em nada.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { webcrypto } = require("crypto");
const admin = require("firebase-admin");

const REGION = "southamerica-east1";

// ── SECRETS (configure com `firebase functions:secrets:set NOME`) ──
const MP_ACCESS_TOKEN = defineSecret("MP_ACCESS_TOKEN");
const PRIVATE_KEY_JWK = defineSecret("PRIVATE_KEY_JWK"); // o mesmo JSON de generate-license.js
const RESEND_API_KEY  = defineSecret("RESEND_API_KEY");
const FROM_EMAIL       = defineSecret("FROM_EMAIL");
const PUBLIC_BASE_URL  = defineSecret("PUBLIC_BASE_URL"); // ex: https://controle-financeiro-d6fd5.web.app
const ADMIN_PANEL_KEY  = defineSecret("ADMIN_PANEL_KEY"); // senha simples pra ver a lista de licenças

// ── PLANOS — fonte da verdade, o cliente nunca escolhe o preço ──
const PLANOS = {
  teste:      { nome: "Teste",      dias: 1,   preco: 1.00 }, // ⚠️ remover antes do lançamento final — usado só para validar o fluxo de pagamento
  mensal:     { nome: "Mensal",     dias: 30,  preco: 16.90 },
  trimestral: { nome: "Trimestral", dias: 90,  preco: 37.90 },
  semestral:  { nome: "Semestral",  dias: 180, preco: 64.90 },
  anual:      { nome: "Anual",      dias: 365, preco: 107.90 },
};

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

// ============================================================
// GERAÇÃO DE LICENÇA — mesmo formato do license-admin/Gerador.html
// (confirmado por teste: essa é a chave que realmente bate com a
// pública gravada em licenca.html)
// ============================================================
async function gerarLicenca({ deviceId, holder, document, dias }, privateJwkJson) {
  const jwk = JSON.parse(privateJwkJson);
  const issuedAt = new Date();
  const expiresAt = addDays(issuedAt, dias);

  const payload = {
    holder: holder || "Cliente",
    document: document || "",
    deviceId: deviceId || null,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    issuer: "mercadopago-auto", // identifica licenças emitidas automaticamente (vs "admin" do Gerador.html)
    clientId: null,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await webcrypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, payloadBytes
  );

  return { key: `${base64Url(payloadBytes)}.${base64Url(new Uint8Array(signature))}`, payload };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// ============================================================
// POST /api/criar-pagamento  { plano, deviceId, holder, document, email }
// Chamado pelo botão "Assinar" dos cards de plano no index.html.
// ============================================================
exports.criarPagamento = onRequest(
  { region: REGION, secrets: [MP_ACCESS_TOKEN, PUBLIC_BASE_URL] },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Método não permitido" }); return; }

    try {
      const { plano, deviceId, holder, document, email } = req.body || {};
      const def = PLANOS[plano];
      if (!def) { res.status(400).json({ error: "Plano inválido." }); return; }
      if (!deviceId) { res.status(400).json({ error: "deviceId é obrigatório." }); return; }

      const baseUrl = PUBLIC_BASE_URL.value();

      // Referência externa única do pedido — é isso que o Mercado Pago usa
      // pra você correlacionar o payment_id gerado por eles com o pedido
      // do seu sistema (aqui: pagamentos_processados / licencas_emitidas).
      const orderId = webcrypto.randomUUID();

      const preference = {
        items: [{
          title: `Controle sua Fortuna — Plano ${def.nome}`,
          description: `Licença de uso do app Controle sua Fortuna por ${def.dias} dias (Plano ${def.nome})`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: def.preco,
        }],
        external_reference: orderId,
        metadata: { deviceId, plano, holder: holder || "Cliente", document: document || "", email: email || null, orderId },
        back_urls: {
          success: `${baseUrl}/licenca.html?pago=1`,
          failure: `${baseUrl}/licenca.html?pago=0`,
          pending: `${baseUrl}/licenca.html?pago=pendente`,
        },
        ...(baseUrl.startsWith("https://") ? {
          notification_url: `${baseUrl}/api/webhook`,
          auto_return: "approved",
        } : {}),
      };

      const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` },
        body: JSON.stringify(preference),
      });
      const data = await mpRes.json();

      if (!mpRes.ok) {
        console.error("Erro Mercado Pago:", data);
        res.status(502).json({ error: "Não foi possível criar o pagamento." });
        return;
      }

      res.status(200).json({ checkoutUrl: data.init_point });
    } catch (e) {
      console.error("Erro em criarPagamento:", e);
      res.status(500).json({ error: "Erro interno." });
    }
  }
);

// ============================================================
// POST/GET /api/webhook — notificação da Mercado Pago
// ============================================================
exports.mercadoPagoWebhook = onRequest(
  { region: REGION, secrets: [MP_ACCESS_TOKEN, PRIVATE_KEY_JWK, RESEND_API_KEY, FROM_EMAIL, PUBLIC_BASE_URL] },
  async (req, res) => {
    try {
      const paymentId = req.query["data.id"] || req.body?.data?.id || req.query.id;
      const topic = req.query.topic || req.body?.type;

      if (!paymentId || (topic && topic !== "payment")) {
        res.status(200).send("ignorado");
        return;
      }

      const db = admin.firestore();
      const processadoRef = db.collection("pagamentos_processados").doc(String(paymentId));

      // Idempotência: se já processamos esse pagamento, não gera/envia de novo
      const jaProcessado = await processadoRef.get();
      if (jaProcessado.exists) {
        res.status(200).send("já processado");
        return;
      }

      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN.value()}` },
      });
      const payment = await payRes.json();

      if (!payRes.ok || payment.status !== "approved") {
        res.status(200).send(`status: ${payment.status || "erro"}`);
        return;
      }

      const meta = payment.metadata || {};
      const deviceId = meta.device_id || meta.deviceId;
      const plano = meta.plano;
      const def = PLANOS[plano];

      if (!def || !deviceId) {
        console.error("Metadata inválida no pagamento", payment.id, meta);
        res.status(200).send("metadata inválida");
        return;
      }

      const { key, payload } = await gerarLicenca(
        { deviceId, holder: meta.holder, document: meta.document, dias: def.dias },
        PRIVATE_KEY_JWK.value()
      );

      // Marca como processado + guarda um histórico (equivalente ao used-licenses.json do admin local)
      await processadoRef.set({
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        plano, holder: payload.holder, email: meta.email || null,
        externalReference: payment.external_reference || meta.orderId || null,
      });
      await db.collection("licencas_emitidas").add({
        ...payload, key, paymentId: String(paymentId),
        externalReference: payment.external_reference || meta.orderId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (meta.email) {
        await enviarEmailLicenca({
          email: meta.email, holder: payload.holder, nomePlano: def.nome, key,
          baseUrl: PUBLIC_BASE_URL.value(), apiKey: RESEND_API_KEY.value(), from: FROM_EMAIL.value(),
        });
      } else {
        console.warn("Pagamento aprovado sem e-mail para entrega:", payment.id);
      }

      res.status(200).send("ok");
    } catch (e) {
      console.error("Erro em mercadoPagoWebhook:", e);
      res.status(200).send("erro logado"); // 200 pra Mercado Pago não ficar reenviando em loop
    }
  }
);

async function enviarEmailLicenca({ email, holder, nomePlano, key, baseUrl, apiKey, from }) {
  if (!apiKey) {
    console.warn("RESEND_API_KEY não configurada — licença não enviada por e-mail:", key);
    return;
  }
  const linkAtivacao = `${baseUrl}/licenca.html?key=${encodeURIComponent(key)}`;
  const html = `
    <p>Olá, ${escapeHtml(holder)}!</p>
    <p>Seu pagamento do plano <strong>${escapeHtml(nomePlano)}</strong> foi confirmado. 🎉</p>
    <p><a href="${linkAtivacao}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ativar minha licença agora</a></p>
    <p>Se o botão não funcionar, copie e cole esta chave na tela de Licença do app:</p>
    <p style="font-family:monospace;font-size:12px;word-break:break-all;background:#f0f7f5;padding:10px;border-radius:6px">${escapeHtml(key)}</p>
  `;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: email, subject: "Sua licença do Minha Fortuna está pronta ✅", html }),
  });
  if (!r.ok) console.error("Erro ao enviar e-mail:", await r.text());
}

function escapeHtml(str) {
  return String(str).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

// ============================================================
// GET /api/licencas — lista as licenças emitidas (manuais + automáticas)
// Protegida por header:  x-admin-key: <ADMIN_PANEL_KEY>
// ============================================================
exports.listarLicencas = onRequest(
  { region: REGION, secrets: [ADMIN_PANEL_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const chaveEnviada = req.get("x-admin-key") || req.query.key;
    if (!chaveEnviada || chaveEnviada !== ADMIN_PANEL_KEY.value()) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }

    try {
      const db = admin.firestore();
      const snap = await db.collection("licencas_emitidas")
        .orderBy("createdAt", "desc")
        .limit(200)
        .get();

      const licencas = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          holder: d.holder || "",
          document: d.document || "",
          plano: d.plano || (d.issuer === "admin-manual" ? "Manual" : ""),
          deviceId: d.deviceId || null,
          issuer: d.issuer || "",
          issuedAt: d.issuedAt || null,
          expiresAt: d.expiresAt || null,
          // a chave completa não é enviada por segurança — só um trecho pra identificar
          keyPreview: d.key ? `${String(d.key).slice(0, 12)}…` : null,
        };
      });

      res.status(200).json({ licencas });
    } catch (e) {
      console.error("Erro em listarLicencas:", e);
      res.status(500).json({ error: "Erro interno." });
    }
  }
);

// ============================================================
// GET /api/licenca-status?deviceId=... — usado pelo app pra checar,
// sozinho, se já existe uma licença pronta pra ESTE aparelho (sem
// precisar de e-mail nem senha de admin — só retorna dados de UM
// deviceId por vez, que só quem comprou naquele aparelho conhece).
// ============================================================
exports.licencaStatus = onRequest(
  { region: REGION },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const deviceId = String(req.query.deviceId || "").trim();
    if (!deviceId) {
      res.status(400).json({ error: "Informe deviceId." });
      return;
    }

    try {
      const db = admin.firestore();
      const snap = await db.collection("licencas_emitidas")
        .where("deviceId", "==", deviceId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (snap.empty) {
        res.status(200).json({ found: false });
        return;
      }

      const d = snap.docs[0].data();
      res.status(200).json({
        found: true,
        key: d.key,
        holder: d.holder || "",
        expiresAt: d.expiresAt || null,
      });
    } catch (e) {
      console.error("Erro em licencaStatus:", e);
      if (String(e.message || "").includes("requires an index")) {
        res.status(503).json({ error: "Consulta ainda sendo preparada no servidor (índice em criação). Tente novamente em alguns minutos." });
        return;
      }
      res.status(500).json({ error: "Erro interno." });
    }
  }
);