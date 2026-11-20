import React, { useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  RotateCcw,
  Save,
} from 'lucide-react';
import { resetDummyData } from '../../data/seedData';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { ElectionSettings } from '../../types';
import { DriveImage } from '../DriveImage';

interface AdminSettingsSectionProps {
  settings: ElectionSettings;
}

/**
 * Halaman Pengaturan Admin:
 * - Timer sesi bilik (detik memilih & reset setelah submit) yang berlaku realtime di semua perangkat
 * - Toggle Mode Petugas & Tampilkan hasil ke publik
 * - Input Link Logo Sekolah (Google Drive) + pratinjau
 * - Reset data uji coba (5 siswa, 2 guru, 1 karyawan, 2 paslon per organisasi)
 * - Petunjuk setup Firebase & contoh aturan keamanan Firestore
 */
export const AdminSettingsSection: React.FC<AdminSettingsSectionProps> = ({
  settings,
}) => {
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [schoolLogoUrl, setSchoolLogoUrl] = useState(settings.schoolLogoUrl);
  const [voteTimeoutSeconds, setVoteTimeoutSeconds] = useState(settings.voteTimeoutSeconds);
  const [resetAfterSubmitSeconds, setResetAfterSubmitSeconds] = useState(
    settings.resetAfterSubmitSeconds
  );
  const [officerMode, setOfficerMode] = useState(settings.officerMode);
  const [showPublicResults, setShowPublicResults] = useState(settings.showPublicResults);
  const [announcement, setAnnouncement] = useState(settings.announcement);

  const [logoStatus, setLogoStatus] = useState<'empty' | 'loaded' | 'error'>(
    settings.schoolLogoUrl.trim() ? 'loaded' : 'empty'
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    const safeVoteTimeout = Math.min(600, Math.max(15, Math.trunc(voteTimeoutSeconds || 90)));
    const safeResetSec = Math.min(60, Math.max(1, Math.trunc(resetAfterSubmitSeconds || 3)));

    try {
      await setDoc(doc(db, 'settings', 'election'), {
        schoolName: (schoolName.trim() || 'SMP Negeri 1 Tambak').slice(0, 120),
        schoolLogoUrl: schoolLogoUrl.trim().slice(0, 500),
        isElectionOpen: settings.isElectionOpen,
        voteTimeoutSeconds: safeVoteTimeout,
        resetAfterSubmitSeconds: safeResetSec,
        officerMode,
        showPublicResults,
        announcement: announcement.trim().slice(0, 300),
        updatedAt: serverTimestamp(),
      });
      setSaveMessage('Pengaturan tersimpan dan langsung berlaku realtime di semua bilik suara.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/election');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDummy = async () => {
    setResetting(true);
    setSaveMessage(null);
    try {
      await resetDummyData(true, schoolLogoUrl.trim(), settings.isElectionOpen);
      setConfirmReset(false);
      setSaveMessage(
        'Data uji coba berhasil direset (5 siswa, 2 guru, 1 karyawan, dan 2 paslon per organisasi).'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSaveSettings}
        className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 space-y-6"
      >
        <div>
          <h2 className="text-lg font-bold text-white">Pengaturan Bilik &amp; Pemilihan</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Setiap perubahan disimpan ke Firestore dan otomatis aktif di semua perangkat tanpa deploy ulang.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nama Sekolah
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Pengumuman Bilik &amp; Dashboard
            </label>
            <input
              type="text"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Kosongkan jika tidak ada pengumuman"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Batas Waktu Memilih (detik)
            </label>
            <input
              type="number"
              min={15}
              max={600}
              value={voteTimeoutSeconds}
              onChange={(e) => setVoteTimeoutSeconds(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white font-mono-num text-sm outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Default 90 detik. Jika habis sebelum submit, suara tidak disimpan &amp; bilik kembali ke awal.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reset Otomatis Setelah Submit (detik)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={resetAfterSubmitSeconds}
              onChange={(e) => setResetAfterSubmitSeconds(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white font-mono-num text-sm outline-none focus:border-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Default 3 detik untuk jeda layar &quot;Terima kasih&quot; sebelum pemilih berikutnya.
            </p>
          </div>
        </div>

        {/* Link Logo Sekolah Google Drive + Pratinjau */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center pt-2 border-t border-slate-700/70">
          <div className="md:col-span-2 space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Link Logo Sekolah (Google Drive)
            </label>
            <input
              type="url"
              value={schoolLogoUrl}
              onChange={(e) => setSchoolLogoUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
            />
            {schoolLogoUrl.trim() !== '' && logoStatus === 'error' && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-2.5 text-xs text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Logo gagal dimuat. Pastikan akses file Drive diatur &quot;Siapa saja yang memiliki link&quot;.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl bg-[#0f172a] border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
              {schoolLogoUrl.trim() && logoStatus !== 'error' ? (
                <DriveImage
                  url={schoolLogoUrl}
                  alt="Pratinjau logo sekolah"
                  fallbackText={schoolName}
                  variant="logo"
                  className="w-14 h-14"
                  onStatusChange={setLogoStatus}
                />
              ) : (
                <span className="text-[11px] text-slate-500 text-center px-1">
                  Nama saja
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400">
              Tampil di header bilik, sidebar admin, dan layar hasil.
            </div>
          </div>
        </div>

        {/* Toggle Mode Petugas & Hasil Publik */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-700/70">
          <label className="flex items-start justify-between gap-4 p-4 rounded-xl bg-[#0f172a] border border-slate-700/80 cursor-pointer">
            <div>
              <div className="text-sm font-bold text-white">Mode Petugas</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Petugas memasukkan nomor pemilih untuk mengaktifkan sesi, lalu pemilih langsung memilih tanpa mengetik apa pun.
              </div>
            </div>
            <input
              type="checkbox"
              checked={officerMode}
              onChange={(e) => setOfficerMode(e.target.checked)}
              className="w-5 h-5 accent-blue-600 mt-0.5 shrink-0"
            />
          </label>

          <label className="flex items-start justify-between gap-4 p-4 rounded-xl bg-[#0f172a] border border-slate-700/80 cursor-pointer">
            <div>
              <div className="text-sm font-bold text-white">Tampilkan Hasil ke Publik</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Jika nonaktif, hasil quick count hanya bisa dilihat panitia hingga pemilihan resmi ditutup.
              </div>
            </div>
            <input
              type="checkbox"
              checked={showPublicResults}
              onChange={(e) => setShowPublicResults(e.target.checked)}
              className="w-5 h-5 accent-blue-600 mt-0.5 shrink-0"
            />
          </label>
        </div>

        {saveMessage && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-3.5 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-300 font-semibold">
                  Hapus seluruh suara &amp; muat ulang 8 pemilih + 6 paslon uji coba?
                </span>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={handleResetDummy}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                >
                  {resetting ? 'Mereset...' : 'Ya, Reset Sekarang'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-2 rounded-xl bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 text-xs font-bold cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Data Uji Coba</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
          </button>
        </div>
      </form>

      {/* Petunjuk Setup Firebase & Contoh Aturan Keamanan Firestore */}
      <section className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-bold text-white">
            Panduan Setup Firebase &amp; Aturan Keamanan Firestore
          </h2>
        </div>

        <ol className="list-decimal list-inside text-xs sm:text-sm text-slate-300 space-y-1.5 leading-relaxed">
          <li>
            Buat proyek baru di <strong>Firebase Console</strong>, lalu aktifkan layanan{' '}
            <strong>Cloud Firestore</strong> dan <strong>Authentication (Google / Email-Password)</strong>.
          </li>
          <li>
            Daftarkan Web App pada pengaturan proyek Firebase dan salin konfigurasi ke file{' '}
            <code className="text-slate-100">firebase-applet-config.json</code>.
          </li>
          <li>
            Terapkan aturan keamanan <code className="text-slate-100">firestore.rules</code> berikut agar
            suara hanya masuk saat pemilihan terbuka, pemilih tidak bisa memilih dua kali, dan data suara tetap rahasia:
          </li>
        </ol>

        <pre className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 text-[11px] font-mono-num text-emerald-300 overflow-x-auto leading-relaxed">
{`// Ringkasan aturan inti firestore.rules:
// 1. Koleksi voters/{voterId}: bilik hanya boleh get 1 ID persis & mengubah hasVoted: false -> true saat isElectionOpen().
// 2. Koleksi votes/{voteId}: dokumen suara tanpa ID pemilih, hanya boleh create saat isElectionOpen() & paslon valid.
// 3. Pembacaan koleksi votes hanya diizinkan untuk isAdmin() atau setelah pemilihan ditutup / showPublicResults == true.`}
        </pre>
      </section>
    </div>
  );
};
