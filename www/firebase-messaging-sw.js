// firebase-messaging-sw.js
// IMPORTANTE: este arquivo precisa ficar na RAIZ do site
// (ex: https://seusite.com/firebase-messaging-sw.js), no mesmo
// nível do index.html, para o escopo de push funcionar.

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Cole aqui EXATAMENTE a mesma config do seu firebase-config.js
firebase.initializeApp({
  apiKey: "AIzaSyDJq3pLdwhEmkfNlWaHKP8-Ezdgp5YSI-4",
  authDomain: "controle-financeiro-d6fd5.firebaseapp.com",
  projectId: "controle-financeiro-d6fd5",
  storageBucket: "controle-financeiro-d6fd5.firebasestorage.app",
  messagingSenderId: "347206402987",
  appId: "1:347206402987:web:148ffe4d6145229c5208ee"
});

const messaging = firebase.messaging();

// Exibe a notificação quando o app está fechado / em segundo plano
messaging.onBackgroundMessage((payload) => {
  const titulo = payload.notification?.title || 'Lembrete';
  const opcoes = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: payload.fcmOptions?.link || '/' }
  };
  self.registration.showNotification(titulo, opcoes);
});

// Ao clicar na notificação, abre/foca o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
