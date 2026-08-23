/* ============================================================
   CONFIGURACIÓN DE FIREBASE
   ------------------------------------------------------------
   1) Ve a https://console.firebase.google.com
   2) Crea un proyecto (o abre el que ya creaste)
   3) Configuración del proyecto -> Tus apps -> ícono "</>" (Web)
   4) Copia el objeto firebaseConfig que te muestra Google y
      REEMPLAZA el de abajo (el de abajo es solo un ejemplo,
      NO funciona tal cual).
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyAq5W1VOrq6azEnTOUpJ5UrnBQ7_UxPXZs",
  authDomain: "yasdrip-tienda.firebaseapp.com",
  projectId: "yasdrip-tienda",
  storageBucket: "yasdrip-tienda.firebasestorage.app",
  messagingSenderId: "853282307300",
  appId: "1:853282307300:web:3a53e04dce1fcf5a3200f1",
  measurementId: "G-V3WB099ZC2",
};

firebase.initializeApp(firebaseConfig);

/* Referencias globales que usa el resto del sitio (store.js, admin.html) */
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();
