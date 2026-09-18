// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
// Pegue esses valores em: console.firebase.google.com
//   > selecione seu projeto > ⚙️ Configurações do projeto
//   > role até "Seus apps" > clique no app Web (</>) que você criar
//   > copie o objeto "firebaseConfig" e cole os valores abaixo.
//
// Se ainda não criou um app Web no projeto: na tela "Seus apps",
// clique no ícone </> ("Web") e siga o passo a passo (não precisa
// marcar "Firebase Hosting").
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDJq3pLdwhEmkfNlWaHKP8-Ezdgp5YSI-4",
  authDomain: "controle-financeiro-d6fd5.firebaseapp.com",
  projectId: "controle-financeiro-d6fd5",
  storageBucket: "controle-financeiro-d6fd5.firebasestorage.app",
  messagingSenderId: "347206402987",
  appId: "1:347206402987:web:148ffe4d6145229c5208ee"
};

firebase.initializeApp(firebaseConfig);

// Habilita persistência offline (cache local automático do Firestore).
// Precisa ser chamado antes de qualquer leitura/escrita no Firestore.
const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Persistência offline indisponível: outra aba/instância já está aberta.');
  } else if (err.code === 'unimplemented') {
    console.warn('Persistência offline não suportada neste navegador/WebView.');
  }
});

const auth = firebase.auth();    