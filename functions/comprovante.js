// comprovante.js
// Cloud Function (2ª geração) que recebe a FOTO de um comprovante
// (nota fiscal, recibo, print de PIX/transferência) e usa a Claude API
// para extrair: tipo (receita/despesa), descrição, valor, data e categoria.
//
// A chave da Anthropic NUNCA vai para o navegador — fica só aqui, como
// secret do Cloud Functions (mesmo padrão de MP_ACCESS_TOKEN em licencas.js).
//
// Configurar a chave uma única vez:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//
// Exige o usuário estar logado (Firebase Auth) pra evitar que alguém de
// fora fique consumindo sua cota da API à toa.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

const REGION = "southamerica-east1";
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// Modelo usado para ler a imagem. Haiku é o mais barato e dá conta bem
// de ler comprovantes; troque para "claude-sonnet-5" se quiser mais precisão.
const MODEL = "claude-haiku-4-5-20251001";

// Tamanho máximo aceito pra imagem em base64 (~5MB de imagem original).
const MAX_BASE64_LEN = 7_000_000;

// Limite de leituras por foto (IA) por usuário, por mês.
const LIMITE_MENSAL = 40;

function mesAtual() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

// Verifica e consome 1 leitura da cota mensal do usuário, de forma atômica
// (evita corrida se o usuário mandar duas fotos ao mesmo tempo).
// Retorna { permitido: boolean, restante: number }.
async function consumirCota(uid) {
  const db = admin.firestore();
  const ref = db.collection("usoIA").doc(uid);
  const mes = mesAtual();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const atual = snap.exists ? snap.data() : null;
    const contagemAtual = atual && atual.mes === mes ? (atual.contagem || 0) : 0;

    if (contagemAtual >= LIMITE_MENSAL) {
      return { permitido: false, restante: 0 };
    }

    const novaContagem = contagemAtual + 1;
    tx.set(ref, { mes, contagem: novaContagem, atualizadoEm: admin.firestore.FieldValue.serverTimestamp() });
    return { permitido: true, restante: LIMITE_MENSAL - novaContagem };
  });
}

function cors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function buildSystemPrompt(categorias) {
  const listaCategorias = categorias && categorias.length
    ? categorias.join(", ")
    : "nenhuma categoria cadastrada";
  const hoje = new Date().toISOString().slice(0, 10);

  return `Você extrai dados de comprovantes financeiros (notas fiscais, recibos, cupons, prints de PIX/transferência/boleto) para um app de controle financeiro pessoal brasileiro.
Responda ESTRITAMENTE com um objeto JSON, sem texto antes ou depois, sem markdown e sem crases, no formato exato:
{"type":"expense"|"income","description":"string curta","amount":numero,"date":"YYYY-MM-DD","category":"string ou vazio","confidence":"high"|"medium"|"low"}

Regras:
- "type": "expense" para compras, pagamentos e gastos; "income" para recebimentos, depósitos e PIX recebido.
- "amount": valor TOTAL em reais, apenas número (ex: 45.9), sem "R$", sem separador de milhar.
- "date": data do comprovante em YYYY-MM-DD. Se não encontrar data legível, use ${hoje}.
- "description": nome do estabelecimento/remetente ou descrição curta (máx. 40 caracteres).
- "category": escolha a mais adequada dentre estas, exatamente como escrita, incluindo maiúsculas/minúsculas: ${listaCategorias}. Se nenhuma se encaixar bem, retorne "".
- "confidence": "low" se a imagem estiver ilegível, borrada ou não parecer um comprovante financeiro.
- Se não for possível extrair nada útil, retorne {"type":"expense","description":"","amount":0,"date":"${hoje}","category":"","confidence":"low"}.`;
}

exports.extrairComprovante = onRequest(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

    // ── Autenticação: exige usuário logado no Firebase ──
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) { res.status(401).json({ ok: false, error: "sem_token" }); return; }
    let uid;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch (e) {
      res.status(401).json({ ok: false, error: "token_invalido" });
      return;
    }

    const { imageBase64, mediaType, categorias } = req.body || {};
    if (!imageBase64 || !mediaType) {
      res.status(400).json({ ok: false, error: "imagem_ausente" });
      return;
    }
    if (imageBase64.length > MAX_BASE64_LEN) {
      res.status(400).json({ ok: false, error: "imagem_muito_grande" });
      return;
    }
    const tiposAceitos = ["image/jpeg", "image/png", "image/webp"];
    if (!tiposAceitos.includes(mediaType)) {
      res.status(400).json({ ok: false, error: "tipo_imagem_invalido" });
      return;
    }

    // ── Cota mensal: no máximo 40 leituras por foto por usuário/mês ──
    let cota;
    try {
      cota = await consumirCota(uid);
    } catch (e) {
      console.error("Erro ao checar cota:", e);
      res.status(500).json({ ok: false, error: "erro_cota" });
      return;
    }
    if (!cota.permitido) {
      res.status(429).json({ ok: false, error: "limite_mensal_atingido", limite: LIMITE_MENSAL });
      return;
    }

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          system: buildSystemPrompt(Array.isArray(categorias) ? categorias : []),
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: "Extraia os dados deste comprovante e responda só com o JSON pedido." }
            ]
          }]
        })
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Erro Anthropic API:", resp.status, errText);
        res.status(502).json({ ok: false, error: "falha_ia" });
        return;
      }

      const data = await resp.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) { res.status(502).json({ ok: false, error: "resposta_vazia" }); return; }

      let parsed;
      try {
        const limpo = textBlock.text.replace(/```json|```/g, "").trim();
        parsed = JSON.parse(limpo);
      } catch (e) {
        console.error("Erro ao parsear JSON da IA:", textBlock.text);
        res.status(502).json({ ok: false, error: "json_invalido" });
        return;
      }

      // Sanitização básica antes de devolver ao cliente
      const out = {
        type: parsed.type === "income" ? "income" : "expense",
        description: String(parsed.description || "").slice(0, 60),
        amount: Number(parsed.amount) > 0 ? Number(parsed.amount) : 0,
        date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : new Date().toISOString().slice(0, 10),
        category: String(parsed.category || ""),
        confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium"
      };

      res.status(200).json({ ok: true, data: out, restante: cota.restante, limite: LIMITE_MENSAL });
    } catch (err) {
      console.error("Erro extrairComprovante:", err);
      res.status(500).json({ ok: false, error: "erro_interno" });
    }
  }
);
