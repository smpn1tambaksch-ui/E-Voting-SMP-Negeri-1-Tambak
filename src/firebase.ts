/**
 * Inisialisasi Firebase SDK, persistensi sesi lokal, instance Auth sekunder,
 * koneksi Firestore, dan penanganan error terstruktur.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Inisialisasi aplikasi Firebase utama menggunakan konfigurasi dari firebase-applet-config.json
const app = initializeApp(firebaseConfig);

// Koneksi ke database Firestore spesifik sesuai firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Pastikan sesi login panitia tersimpan di perangkat lokal hingga Logout ditekan
void setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Gagal mengatur persistensi sesi Firebase Auth:', err);
});

/**
 * Mengembalikan instance Auth sekunder agar admin dapat membuat akun panitia baru
 * tanpa mengeluarkan sesi admin yang sedang aktif.
 */
export function getSecondaryAuth(): Auth {
  const name = 'SecondaryPanitiaAuth';
  const secondaryApp = getApps().some((a) => a.name === name)
    ? getApp(name)
    : initializeApp(firebaseConfig, name);
  return getAuth(secondaryApp);
}

// Jenis operasi Firestore untuk pelaporan error terstruktur
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Menangani dan melempar ulang error Firestore dengan konteks lengkap untuk debugging.
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Menguji konektivitas ke server Firestore saat aplikasi pertama kali dimuat.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'settings', 'election'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Koneksi Firestore offline. Periksa konfigurasi Firebase Anda.');
      return false;
    }
    return true;
  }
}

void testFirestoreConnection();
