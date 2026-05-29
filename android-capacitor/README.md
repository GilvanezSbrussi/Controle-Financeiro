# Controle sua Fortuna - Android

Esta pasta prepara a versao Android com Capacitor. Ela usa os arquivos da pasta `www`.

## Requisitos

- Node.js instalado
- Android Studio instalado
- Java/JDK configurado pelo Android Studio

## Criar o projeto Android

Na pasta `android-capacitor`, rode:

```powershell
npm install
npm run cap:add:android
npm run cap:sync
npm run android:open
```

O Android Studio vai abrir o projeto. Depois, conecte o celular via USB ou use um emulador e clique em `Run`.

## Gerar APK

No Android Studio:

1. Abra `Build`.
2. Escolha `Build Bundle(s) / APK(s)`.
3. Clique em `Build APK(s)`.

## Sobre a base local

O app salva a base no armazenamento interno do aplicativo. Para escolher uma pasta externa, use o botao `Exportar backup`; o Android abre o fluxo de download/arquivo conforme o aparelho. Depois voce pode restaurar pelo botao `Importar backup`.

Para uma versao futura com SQLite real e seletor nativo de pasta, podemos adicionar plugins Capacitor especificos de Filesystem e Document Picker.
