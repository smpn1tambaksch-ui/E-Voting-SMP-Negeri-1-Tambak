import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Shield, X } from 'lucide-react';
import { auth, db } from '../firebase';
import { ElectionSettings } from '../types';
import { convertDriveUrl } from '../utils/driveImage';

interface AdminLoginViewProps {
  settings: ElectionSettings;
  authError: string | null;
}

const ATTEMPTS_KEY = 'spensata_evoting_login_attempts';
const LOCK_UNTIL_KEY = 'spensata_evoting_login_lock_until';
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 1000; // 1 menit

/**
 * Halaman Login Panel Panitia bergaya SPECTRA:
 * - Latar penuh gradasi biru (#2563eb ke #3730a3)
 * - Kartu putih membulat (±28px) di tengah layar, lebar maks 420px
 * - Autentikasi Firebase Email/Password tanpa menyimpan password di kode/database
 * - Pembatasan 5x percobaan login gagal (tunggu 1 menit)
 */
export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  settings,
  authError,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // State pembatasan percobaan gagal
  const [lockRemainingSec, setLockRemainingSec] = useState<number>(() => {
    const lockUntil = Number(localStorage.getItem(LOCK_UNTIL_KEY) || '0');
    const diff = Math.ceil((lockUntil - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  });

  // Modal setup admin awal (terpisah agar kartu login bersih hanya 2 field)
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupEmail, setSetupEmail] = useState('admin@spensata.sch.id');
  const [setupName, setSetupName] = useState('Admin Sekolah');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);

  const [logoFailed, setLogoFailed] = useState(false);
  const resolvedLogoUrl = convertDriveUrl(settings.schoolLogoUrl);

  useEffect(() => {
    setLogoFailed(false);
  }, [resolvedLogoUrl]);

  // Hitung mundur masa tunggu 1 menit saat login terkunci
  useEffect(() => {
    if (lockRemainingSec <= 0) return;
    const timer = window.setInterval(() => {
      const lockUntil = Number(localStorage.getItem(LOCK_UNTIL_KEY) || '0');
      const diff = Math.ceil((lockUntil - Date.now()) / 1000);
      if (diff <= 0) {
        localStorage.removeItem(LOCK_UNTIL_KEY);
        localStorage.setItem(ATTEMPTS_KEY, '0');
        setLockRemainingSec(0);
        setLocalError(null);
      } else {
        setLockRemainingSec(diff);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [lockRemainingSec]);

  const recordFailedAttempt = () => {
    const prev = Number(localStorage.getItem(ATTEMPTS_KEY) || '0');
    const next = prev + 1;
    localStorage.setItem(ATTEMPTS_KEY, String(next));

    if (next >= MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOCK_DURATION_MS;
      localStorage.setItem(LOCK_UNTIL_KEY, String(lockUntil));
      setLockRemainingSec(60);
      return true;
    }
    return false;
  };

  const resetAttempts = () => {
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(LOCK_UNTIL_KEY);
    setLockRemainingSec(0);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockRemainingSec > 0 || !username.trim() || !password) return;

    setLocalError(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, username.trim(), password);
      resetAttempts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setLocalError(
          'Metode Email/Password belum diaktifkan di Firebase Console. Klik tautan setup awal di bawah.'
        );
      } else {
        const lockedNow = recordFailedAttempt();
        if (lockedNow) {
          setLocalError(
            'Terlalu banyak percobaan login gagal (5 kali). Silakan tunggu 1 menit sebelum mencoba kembali.'
          );
        } else {
          setLocalError('Username atau password salah');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInitialAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    setSetupSuccess(null);

    if (!setupEmail.trim() || setupPassword.length < 6) {
      setSetupError('Masukkan email valid dan password minimal 6 karakter.');
      return;
    }

    setSetupLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        setupEmail.trim(),
        setupPassword
      );

      // Simpan peran admin di koleksi "panitia" di Firestore (tanpa menyimpan password)
      await setDoc(doc(db, 'panitia', cred.user.uid), {
        email: setupEmail.trim(),
        name: setupName.trim() || 'Admin Sekolah',
        role: 'admin',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSetupSuccess('Akun admin awal berhasil dibuat dan otomatis login.');
      setSetupPassword('');
      setTimeout(() => setShowSetupModal(false), 900);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('operation-not-allowed')) {
        setSetupError(
          'Provider Email/Password belum aktif di Firebase Console (Authentication → Sign-in method → Email/Password).'
        );
      } else if (msg.includes('email-already-in-use')) {
        setSetupError(
          'Akun ini sudah terdaftar di Firebase Auth. Silakan langsung masuk menggunakan form login.'
        );
      } else {
        setSetupError(`Gagal membuat akun admin awal: ${msg}`);
      }
    } finally {
      setSetupLoading(false);
    }
  };

  const isSubmitDisabled =
    loading || lockRemainingSec > 0 || !username.trim() || !password;

  const displayedError =
    lockRemainingSec > 0
      ? `Terlalu banyak percobaan login gagal. Tunggu ${lockRemainingSec} detik lagi.`
      : localError || authError;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#2563eb] to-[#3730a3] flex flex-col items-center justify-center px-4 py-8">
      {/* Kartu Putih Tengah Layar */}
      <div className="w-full max-w-[420px] bg-white rounded-[28px] shadow-[0_24px_60px_-15px_rgba(15,23,42,0.35)] p-7 sm:p-9 text-slate-900">
        {/* 1. Logo Sekolah (~80px di tengah) */}
        <div className="flex justify-center mb-4">
          {resolvedLogoUrl && !logoFailed ? (
            <img
              src={resolvedLogoUrl}
              alt="Logo SMP Negeri 1 Tambak"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-20 h-20 object-contain rounded-2xl"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md">
              <Shield className="w-10 h-10" />
            </div>
          )}
        </div>

        {/* 2. Judul Tebal Besar */}
        <h1 className="text-center text-[22px] sm:text-2xl font-extrabold tracking-tight text-slate-900">
          SMP NEGERI 1 TAMBAK
        </h1>

        {/* 3. Subjudul Abu-abu */}
        <p className="text-center text-sm font-medium text-slate-500 mt-1">
          Berkarakter Kuat Berprestasi Hebat
        </p>

        {/* 4. Label Kecil */}
        <div className="text-center mt-5 mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
            Login Panel Panitia E-Voting
          </span>
        </div>

        {/* Form Login (hanya 2 field: Username & Password, tanpa pilihan peran) */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* 5. Input Username */}
          <div>
            <label
              htmlFor="panitia-username"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Username
            </label>
            <input
              id="panitia-username"
              type="email"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="admin@spensata.sch.id"
              className="w-full px-4 py-3 rounded-2xl bg-blue-50/80 border border-blue-200 focus:border-2 focus:border-[#2563eb] focus:bg-white text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
            />
          </div>

          {/* 6. Input Password dengan ikon mata */}
          <div>
            <label
              htmlFor="panitia-password"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="panitia-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder="Masukkan password"
                className="w-full pl-4 pr-11 py-3 rounded-2xl bg-blue-50/80 border border-blue-200 focus:border-2 focus:border-[#2563eb] focus:bg-white text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:text-blue-700 transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Pesan error jelas dan ramah di atas tombol */}
          {displayedError && (
            <div
              role="alert"
              className="rounded-2xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs font-semibold text-rose-700 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {/* 7. Tombol Biru Penuh Lebar "Masuk" */}
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full py-3.5 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-blue-600/25"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <span>Masuk</span>
            )}
          </button>
        </form>

        {/* 8. Teks kecil abu-abu */}
        <p className="text-center text-xs text-slate-400 mt-5">
          Lupa password? Hubungi admin sekolah.
        </p>
      </div>

      {/* Footer di bawah kartu */}
      <div className="mt-6 text-center space-y-1 text-white/85">
        <div className="text-xs font-semibold">E-Voting SMP Negeri 1 Tambak</div>
        <div className="text-[11px] text-white/70">Copyright &copy; 2026</div>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              setSetupError(null);
              setSetupSuccess(null);
              setShowSetupModal(true);
            }}
            className="text-[11px] text-white/60 hover:text-white underline underline-offset-2 cursor-pointer"
          >
            Setup pertama? Buat akun admin awal / panduan Firebase Auth
          </button>
        </div>
      </div>

      {/* Modal Setup Akun Admin Awal & Petunjuk Firebase Console */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                Setup Akun Admin Awal
              </h2>
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                aria-label="Tutup dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3.5 text-xs text-slate-700 space-y-1.5 leading-relaxed">
              <div className="font-bold text-blue-900">
                Langkah Setup di Firebase Console:
              </div>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Buka <strong>Firebase Console &rarr; Authentication &rarr; Sign-in method</strong>.
                </li>
                <li>
                  Aktifkan provider <strong>Email/Password</strong> lalu klik Simpan.
                </li>
                <li>
                  Gunakan form di bawah ini sekali saja untuk mendaftarkan{' '}
                  <code>admin@spensata.sch.id</code> sebagai peran <code>admin</code> di koleksi{' '}
                  <code>panitia</code>.
                </li>
              </ol>
            </div>

            <form onSubmit={handleCreateInitialAdmin} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Admin Awal
                </label>
                <input
                  type="email"
                  value={setupEmail}
                  onChange={(e) => setSetupEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Admin
                </label>
                <input
                  type="text"
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password Awal (minimal 6 karakter)
                </label>
                <input
                  type="password"
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Masukkan password awal untuk dibuat"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm outline-none focus:border-blue-600"
                />
              </div>

              {setupError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                  {setupError}
                </div>
              )}

              {setupSuccess && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{setupSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={setupLoading}
                className="w-full py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
              >
                {setupLoading ? 'Membuat Akun...' : 'Buat Akun Admin Awal'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
