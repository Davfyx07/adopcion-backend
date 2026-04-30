const admin = require('firebase-admin');

let firebaseApp = null;

function initializeFirebase() {
  if (firebaseApp) return firebaseApp;

  try {
    // Opción 1: Service account JSON file path
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
      });
      console.log('✅ Firebase inicializado con service account file');
      return firebaseApp;
    }

    // Opción 2: Service account JSON como string
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
      });
      console.log('✅ Firebase inicializado con service account JSON');
      return firebaseApp;
    }

    // Opción 3: Application Default Credentials (GCP/Azure)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      firebaseApp = admin.initializeApp({
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      console.log('✅ Firebase inicializado con Application Default Credentials');
      return firebaseApp;
    }

    // Fallback: modo desarrollo sin Firebase (logs warning)
    console.warn('⚠️ Firebase no configurado. Las fotos se guardarán como URLs mock.');
    return null;
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    return null;
  }
}

function getStorage() {
  const app = initializeFirebase();
  if (!app) return null;
  return admin.storage().bucket();
}

module.exports = { initializeFirebase, getStorage };
