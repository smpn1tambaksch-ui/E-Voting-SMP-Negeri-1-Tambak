/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  AppView,
  Candidate,
  DEFAULT_SETTINGS,
  ElectionSettings,
  PanitiaUser,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BoothView } from './components/BoothView';
import { PublicResultsView } from './components/PublicResultsView';
import { AdminLoginView } from './components/AdminLoginView';
import { AdminDashboard } from './components/AdminDashboard';

const BOOTSTRAP_ADMIN_EMAIL = 'smpn1tambak.sch@gmail.com';

/**
 * Menentukan halaman aktif berdasarkan URL (/admin, #/admin, /hasil, atau /).
 * Memisahkan rute login panitia dari bilik suara pemilih sepenuhnya.
 */
function resolveViewFromLocation(): AppView {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path.startsWith('/admin') || hash.startsWith('#/admin')) {
    return 'admin';
  }
  if (path.startsWith('/hasil') || hash.startsWith('#/hasil')) {
    return 'results';
  }
  return 'booth';
}

function AppContent() {
  const [view, setView] = useState<AppView>(() => resolveViewFromLocation());
  const [settings, setSettings] = useState<ElectionSettings>(DEFAULT_SETTINGS);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [panitiaProfile, setPanitiaProfile] = useState<PanitiaUser | null>(null);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  const navigate = useCallback((nextView: AppView) => {
    const targetPath =
      nextView === 'admin' ? '/admin' : nextView === 'results' ? '/hasil' : '/';
    if (window.location.pathname !== targetPath || window.location.hash) {
      window.history.pushState({}, '', targetPath);
    }
    setView(nextView);
  }, []);

  useEffect(() => {
    const handleRouteChange = () => setView(resolveViewFromLocation());
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);
    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
    };
  }, []);

  // Pantau status login Firebase Auth dan verifikasi peran + status aktif di koleksi "panitia"
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAdminAuthError(null);

      if (!currentUser) {
        setPanitiaProfile(null);
        setAuthReady(true);
        return;
      }

      try {
        const panitiaSnap = await getDoc(doc(db, 'panitia', currentUser.uid));
        if (panitiaSnap.exists()) {
          const data = panitiaSnap.data();
          if (!data.active) {
            setPanitiaProfile(null);
            setAdminAuthError('Akun panitia Anda telah dinonaktifkan oleh admin sekolah.');
            await signOut(auth);
            setAuthReady(true);
            return;
          }

          if (data.role === 'admin' || data.role === 'panitia') {
            setPanitiaProfile({
              id: panitiaSnap.id,
              email: data.email || currentUser.email || '',
              name: data.name || currentUser.displayName || 'Panitia',
              role: data.role,
              active: Boolean(data.active),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            });
            setAuthReady(true);
            return;
          }
        }

        // Fallback untuk akun sekolah utama terverifikasi
        if (
          currentUser.email === BOOTSTRAP_ADMIN_EMAIL &&
          currentUser.emailVerified
        ) {
          setPanitiaProfile({
            id: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || 'Admin Sekolah',
            role: 'admin',
            active: true,
          });
          setAuthReady(true);
          return;
        }

        setPanitiaProfile(null);
        setAdminAuthError(
          `Akun ${currentUser.email || currentUser.uid} belum terdaftar sebagai panitia.`
        );
        await signOut(auth);
      } catch {
        setPanitiaProfile(null);
        setAdminAuthError(
          `Akun ${currentUser.email || 'ini'} tidak memiliki hak akses Panel Panitia.`
        );
        await signOut(auth);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listener realtime pengaturan bilik & pemilihan (berlaku langsung di semua perangkat)
  useEffect(() => {
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'election'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettings({
            schoolName: data.schoolName || DEFAULT_SETTINGS.schoolName,
            schoolLogoUrl: data.schoolLogoUrl || '',
            isElectionOpen: Boolean(data.isElectionOpen),
            voteTimeoutSeconds:
              typeof data.voteTimeoutSeconds === 'number'
                ? data.voteTimeoutSeconds
                : DEFAULT_SETTINGS.voteTimeoutSeconds,
            resetAfterSubmitSeconds:
              typeof data.resetAfterSubmitSeconds === 'number'
                ? data.resetAfterSubmitSeconds
                : DEFAULT_SETTINGS.resetAfterSubmitSeconds,
            officerMode: Boolean(data.officerMode),
            showPublicResults: Boolean(data.showPublicResults),
            announcement: data.announcement || '',
            updatedAt: data.updatedAt,
          });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
        setInitialLoaded(true);
      },
      (err) => {
        console.error('Gagal memuat pengaturan pemilihan:', err);
        setInitialLoaded(true);
      }
    );

    // Listener realtime daftar pasangan calon (OSIS, Pramuka, PMR)
    const candidatesQuery = query(
      collection(db, 'candidates'),
      where('org', 'in', ['OSIS', 'PRAMUKA', 'PMR'])
    );
    const unsubCandidates = onSnapshot(
      candidatesQuery,
      (snap) => {
        const list: Candidate[] = snap.docs.map((d) => ({
          id: d.id,
          org: d.data().org,
          number: d.data().number,
          ketuaName: d.data().ketuaName,
          wakilName: d.data().wakilName,
          photoUrl: d.data().photoUrl || '',
          vision: d.data().vision || '',
          mission: d.data().mission || '',
          createdAt: d.data().createdAt,
          updatedAt: d.data().updatedAt,
        }));
        setCandidates(list);
      },
      (err) => {
        console.error('Gagal memuat data paslon:', err);
      }
    );

    return () => {
      unsubSettings();
      unsubCandidates();
    };
  }, []);

  if (!initialLoaded) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-slate-200 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Memuat sistem E-Voting SMP Negeri 1 Tambak...</p>
        </div>
      </div>
    );
  }

  // Halaman Panel Panitia (/admin atau #/admin) — terpisah dari halaman bilik suara pemilih
  if (view === 'admin') {
    if (!authReady) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#2563eb] to-[#3730a3] text-white flex items-center justify-center p-6">
          <p className="text-sm font-medium">Memeriksa sesi autentikasi panitia...</p>
        </div>
      );
    }

    if (!user || !panitiaProfile) {
      return (
        <AdminLoginView
          settings={settings}
          authError={adminAuthError}
        />
      );
    }

    return (
      <AdminDashboard
        user={user}
        panitiaProfile={panitiaProfile}
        settings={settings}
        candidates={candidates}
        onBackToBooth={() => navigate('booth')}
      />
    );
  }

  if (view === 'results') {
    return (
      <PublicResultsView
        settings={settings}
        candidates={candidates}
        onBackToBooth={() => navigate('booth')}
      />
    );
  }

  return (
    <BoothView
      settings={settings}
      candidates={candidates}
      onNavigateResults={() => navigate('results')}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
