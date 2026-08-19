const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Roda no Brasil, ajuste se seu projeto usar outra região
setGlobalOptions({ region: 'southamerica-east1' });

/**
 * Roda a cada 1 minuto: busca lembretes com dataHora <= agora e enviado == false,
 * envia push via FCM e marca como enviado. Se for recorrente (repeticao != 'none'),
 * reagenda para a próxima ocorrência em vez de apenas marcar como enviado.
 */
exports.checarLembretes = onSchedule('every 1 minutes', async () => {
  const agora = admin.firestore.Timestamp.now();

  const snap = await db.collection('lembretes')
    .where('enviado', '==', false)
    .where('dataHora', '<=', agora)
    .get();

  if (snap.empty) return;

  const tokenCache = {};

  await Promise.all(snap.docs.map(async (doc) => {
    const lembrete = doc.data();

    try {
      if (!tokenCache[lembrete.uid]) {
        const userDoc = await db.collection('users').doc(lembrete.uid).get();
        tokenCache[lembrete.uid] = userDoc.data()?.fcmToken || null;
      }
      const token = tokenCache[lembrete.uid];

      if (!token) {
        await doc.ref.update({ enviado: true, erro: 'usuario_sem_token' });
        return;
      }

      await admin.messaging().send({
        token,
        notification: {
          title: '🔔 Lembrete',
          body: lembrete.texto
        },
        webpush: {
          fcmOptions: { link: '/' },
          notification: { icon: '/icon-192.png' }
        }
      });

      // Recorrência: reagenda a próxima ocorrência em vez de encerrar
      if (lembrete.repeticao && lembrete.repeticao !== 'none') {
        const proxima = calcularProximaOcorrencia(lembrete.dataHora.toDate(), lembrete.repeticao);
        await doc.ref.update({ dataHora: admin.firestore.Timestamp.fromDate(proxima) });
      } else {
        await doc.ref.update({ enviado: true });
      }
    } catch (err) {
      console.error(`Erro ao enviar lembrete ${doc.id}:`, err);
      await doc.ref.update({ enviado: true, erro: String(err.message || err) });
    }
  }));
});

function calcularProximaOcorrencia(dataAtual, repeticao) {
  const proxima = new Date(dataAtual);
  if (repeticao === 'daily') proxima.setDate(proxima.getDate() + 1);
  else if (repeticao === 'weekly') proxima.setDate(proxima.getDate() + 7);
  else if (repeticao === 'monthly') proxima.setMonth(proxima.getMonth() + 1);
  return proxima;
}
const licencas = require("./licencas.js");
exports.criarPagamento = licencas.criarPagamento;
exports.mercadoPagoWebhook = licencas.mercadoPagoWebhook;
exports.listarLicencas = licencas.listarLicencas;
exports.licencaStatus = licencas.licencaStatus;

const comprovante = require("./comprovante.js");
exports.extrairComprovante = comprovante.extrairComprovante;