import { initializeApp } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence verbose internal Firestore stream lifecycle logs (e.g. idle stream timeouts)
try {
  setLogLevel('silent');
} catch {
  // Ignore
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Lazily initialize client Firestore only if explicitly invoked, preventing idle stream timeout warnings
let _db: ReturnType<typeof getFirestore> | null = null;
export const getClientDb = () => {
  if (!_db) {
    try {
      _db = initializeFirestore(app, {
        ignoreUndefinedProperties: true,
        experimentalAutoDetectLongPolling: true,
      }, firebaseConfig.firestoreDatabaseId);
    } catch {
      _db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
  return _db;
};

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(target, prop, receiver) {
    return Reflect.get(getClientDb(), prop, receiver);
  }
});


export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

