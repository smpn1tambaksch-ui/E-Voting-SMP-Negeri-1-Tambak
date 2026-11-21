import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { db } from '../firebase';
import { Candidate, ElectionSettings, Organization, Voter } from '../types';
import { sanitizeVoterId } from '../utils/driveImage';
import { DriveImage } from './DriveImage';

interface BoothViewProps {
  settings: ElectionSettings;
  candidates: Candidate[];
  onNavigateResults: () => void;
}

type BoothStep = 'standby' | 'confirm' | 'ballot' | 'summary' | 'thanks';

const ORG_CONFIG: Record<
  Organization,
  {
    label: string;
    fullName: string;
    emoji: string;
    accentBg: string;
    accentBorder: string;
    accentText: string;
    badgeBg: string;
    buttonBg: string;
    fallbackGrad: string;
  }
> = {
  OSIS: {
    label: 'OSIS',
    fullName: 'Ketua & Wakil Ketua OSIS',
    emoji: '🎓',
    accentBg: 'bg-blue-600/15',
    accentBorder: 'border-blue-500',
    accentText: 'text-blue-400',
    badgeBg: 'bg-blue-600',
    buttonBg: 'bg-blue-600 hover:bg-blue-500',
    fallbackGrad: 'from-blue-950 via-slate-900 to-slate-900',
  },
  PRAMUKA: {
    label: 'Pramuka',
    fullName: 'Pratama Putra / Putri Pramuka',
    emoji: '⚜️',
    accentBg: 'bg-amber-600/15',
    accentBorder: 'border-amber-500',
    accentText: 'text-amber-400',
    badgeBg: 'bg-amber-600',
    buttonBg: 'bg-amber-600 hover:bg-amber-500',
    fallbackGrad: 'from-amber-950 via-slate-900 to-slate-900',
  },
  PMR: {
    label: 'PMR',
    fullName: 'Ketua & Wakil Ketua PMR',
    emoji: '🩺',
    accentBg: 'bg-rose-600/15',
    accentBorder: 'border-rose-500',
    accentText: 'text-rose-400',
    badgeBg: 'bg-rose-600',
    buttonBg: 'bg-rose-600 hover:bg-rose-500',
    fallbackGrad: 'from-rose-950 via-slate-900 to-slate-900',
  },
};

const ORG_ORDER: Organization[] = ['OSIS', 'PRAMUKA', 'PMR'];

/**
 * Mengubah teks misi (satu baris per butir) menjadi daftar bersih tanpa nomor ganda.
 */
function parseMissionLines(mission: string): string[] {
  return mission
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter((line) => line.length > 0);
}

/**
 * Halaman Bilik Suara (Pemilih) yang dirancang sederhana, responsif,
 * ramah layar sentuh (tombol >= 56px), dengan timer sesi otomatis.
 */
export const BoothView: React.FC<BoothViewProps> = ({
  settings,
  candidates,
  onNavigateResults,
}) => {
  const [step, setStep] = useState<BoothStep>('standby');
  const [inputNumber, setInputNumber] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(null);

  const [activeVoter, setActiveVoter] = useState<Voter | null>(null);
  const [activeOrg, setActiveOrg] = useState<Organization>('OSIS');
  const [selections, setSelections] = useState<Partial<Record<Organization, Candidate>>>({});

  const [timeLeft, setTimeLeft] = useState<number>(settings.voteTimeoutSeconds);
  const [resetCountdown, setResetCountdown] = useState<number>(settings.resetAfterSubmitSeconds);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Ref pengunci untuk mencegah double-submit saat klik cepat bersamaan
  const submitLockRef = useRef(false);

  const candidatesByOrg = useMemo(() => {
    const map: Record<Organization, Candidate[]> = {
      OSIS: [],
      PRAMUKA: [],
      PMR: [],
    };
    candidates.forEach((c) => {
      if (map[c.org]) {
        map[c.org].push(c);
      }
    });
    ORG_ORDER.forEach((org) => {
      map[org].sort((a, b) => a.number - b.number);
    });
    return map;
  }, [candidates]);

  const resetToStandby = useCallback((notice?: string) => {
    setStep('standby');
    setInputNumber('');
    setActiveVoter(null);
    setActiveOrg('OSIS');
    setSelections({});
    setLookupError(null);
    setSubmitError(null);
    setIsSubmitting(false);
    submitLockRef.current = false;
    setTimeoutNotice(notice ?? null);
  }, []);

  // Hitung mundur timer memilih saat sesi bilik aktif (ballot / summary)
  useEffect(() => {
    if (step !== 'ballot' && step !== 'summary') return;

    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step]);

  // Tutup sesi otomatis jika waktu habis sebelum suara dikirim
  useEffect(() => {
    if ((step === 'ballot' || step === 'summary') && timeLeft === 0) {
      resetToStandby(
        `Waktu sesi bilik (${settings.voteTimeoutSeconds} detik) telah habis. Tidak ada suara yang disimpan dan status pemilih tetap belum memilih.`
      );
    }
  }, [step, timeLeft, settings.voteTimeoutSeconds, resetToStandby]);

  // Hitung mundur otomatis kembali ke halaman awal setelah submit
  useEffect(() => {
    if (step !== 'thanks') return;

    const timer = window.setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          resetToStandby();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, resetToStandby]);

  // Cari data pemilih berdasarkan NISN / NIP / NIK (tanpa PIN)
  const handleLookupVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setTimeoutNotice(null);

    if (!settings.isElectionOpen) {
      setLookupError('Pemilihan saat ini sedang ditutup oleh panitia.');
      return;
    }

    const sanitized = sanitizeVoterId(inputNumber);
    if (!sanitized) {
      setLookupError('Masukkan nomor NISN (siswa) atau NIP/NIK (guru/karyawan) yang valid.');
      return;
    }

    // Pastikan setiap organisasi memiliki minimal 1 paslon sebelum sesi dimulai
    const missingOrg = ORG_ORDER.find((org) => candidatesByOrg[org].length === 0);
    if (missingOrg) {
      setLookupError(
        `Daftar paslon untuk organisasi ${missingOrg} belum tersedia. Hubungi panitia untuk melengkapi data paslon.`
      );
      return;
    }

    setLookupLoading(true);
    try {
      const voterSnap = await getDoc(doc(db, 'voters', sanitized));
      if (!voterSnap.exists()) {
        setLookupError(
          `Nomor "${sanitized}" tidak ditemukan dalam daftar pemilih tetap. Periksa kembali atau hubungi panitia.`
        );
        return;
      }

      const data = voterSnap.data();
      const voter: Voter = {
        id: voterSnap.id,
        voterNumber: data.voterNumber,
        name: data.name,
        classOrRole: data.classOrRole,
        category: data.category,
        hasVoted: Boolean(data.hasVoted),
        votedAt: data.votedAt ?? null,
      };

      if (voter.hasVoted) {
        setLookupError(
          `Pemilih atas nama ${voter.name} (${voter.classOrRole}) sudah menggunakan hak suaranya dan tidak dapat memilih kembali.`
        );
        return;
      }

      setActiveVoter(voter);
      setSelections({});
      setActiveOrg('OSIS');

      // Jika Mode Petugas aktif, panitia mengaktifkan sesi langsung ke surat suara tanpa pemilih mengetik ulang
      if (settings.officerMode) {
        setTimeLeft(settings.voteTimeoutSeconds);
        setStep('ballot');
      } else {
        setStep('confirm');
      }
    } catch (err) {
      console.error('Gagal memeriksa data pemilih:', err);
      setLookupError('Terjadi kendala saat memeriksa data pemilih. Coba beberapa saat lagi.');
    } finally {
      setLookupLoading(false);
    }
  };

  // Konfirmasi identitas ("Ini saya") lalu mulai timer sesi bilik
  const handleConfirmIdentity = () => {
    if (!activeVoter) return;
    setTimeLeft(settings.voteTimeoutSeconds);
    setStep('ballot');
  };

  const handleSelectCandidate = (candidate: Candidate) => {
    setSelections((prev) => ({
      ...prev,
      [candidate.org]: candidate,
    }));
  };

  const allSelected = ORG_ORDER.every((org) => Boolean(selections[org]));

  const handleNextStepFromBallot = () => {
    const currentIndex = ORG_ORDER.indexOf(activeOrg);
    if (currentIndex < ORG_ORDER.length - 1) {
      setActiveOrg(ORG_ORDER[currentIndex + 1]);
    } else if (allSelected) {
      setStep('summary');
    }
  };

  // Kirim suara secara atomik menggunakan Firestore Transaction (mencegah suara ganda & menjaga kerahasiaan)
  const handleSubmitBallot = async () => {
    if (!activeVoter || !allSelected || submitLockRef.current || isSubmitting) return;

    const osisChoice = selections.OSIS!;
    const pramukaChoice = selections.PRAMUKA!;
    const pmrChoice = selections.PMR!;

    submitLockRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const voterRef = doc(db, 'voters', activeVoter.id);
      const settingsRef = doc(db, 'settings', 'election');
      // ID acak dokumen suara anonim (tidak mengandung ID pemilih)
      const ballotId = `v_${crypto.randomUUID().replace(/-/g, '')}`;
      const voteRef = doc(db, 'votes', ballotId);

      await runTransaction(db, async (transaction) => {
        const [freshSettingsSnap, freshVoterSnap] = await Promise.all([
          transaction.get(settingsRef),
          transaction.get(voterRef),
        ]);

        if (!freshSettingsSnap.exists() || !freshSettingsSnap.data().isElectionOpen) {
          throw new Error('ELECTION_CLOSED');
        }

        if (!freshVoterSnap.exists()) {
          throw new Error('VOTER_NOT_FOUND');
        }

        if (freshVoterSnap.data().hasVoted === true) {
          throw new Error('ALREADY_VOTED');
        }

        // 1. Kunci status pemilih di koleksi voters
        transaction.update(voterRef, {
          hasVoted: true,
          votedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. Simpan suara di koleksi votes secara terpisah TANPA ID pemilih
        transaction.set(voteRef, {
          electionScope: 'smpn1tambak',
          osisCandidateId: osisChoice.id,
          pramukaCandidateId: pramukaChoice.id,
          pmrCandidateId: pmrChoice.id,
          createdAt: serverTimestamp(),
        });
      });

      setResetCountdown(settings.resetAfterSubmitSeconds);
      setStep('thanks');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'ALREADY_VOTED') {
        setSubmitError('Suara atas identitas ini sudah tercatat sebelumnya.');
      } else if (code === 'ELECTION_CLOSED') {
        setSubmitError('Pemilihan baru saja ditutup oleh panitia.');
      } else {
        console.error('Gagal menyimpan suara:', err);
        setSubmitError('Gagal mengirim suara. Silakan coba klik kirim sekali lagi atau panggil panitia.');
      }
      submitLockRef.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const canViewPublicResults = !settings.isElectionOpen || settings.showPublicResults;
  const isTimerCritical = (step === 'ballot' || step === 'summary') && timeLeft <= 10;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col">
      {/* Header Bilik Suara */}
      <header className="sticky top-0 z-30 bg-[#0f172a]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {settings.schoolLogoUrl.trim() !== '' && (
              <DriveImage
                url={settings.schoolLogoUrl}
                alt={`Logo ${settings.schoolName}`}
                fallbackText={settings.schoolName}
                variant="logo"
                className="w-10 h-10 rounded-lg shrink-0"
              />
            )}
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-bold text-white truncate">
                {settings.schoolName}
              </div>
              <div className="text-xs text-slate-400 truncate">
                Bilik Suara Elektronik · OSIS, Pramuka &amp; PMR
              </div>
            </div>
          </div>

          {/* Kanan: Hitung mundur sesi atau tombol navigasi standby */}
          <div className="flex items-center gap-3 shrink-0">
            {(step === 'ballot' || step === 'summary') && (
              <div
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-colors ${
                  isTimerCritical
                    ? 'bg-rose-600/20 border-rose-500 text-rose-300 animate-pulse'
                    : 'bg-[#1e293b] border-slate-700 text-slate-200'
                }`}
                aria-live="polite"
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span className="text-xs font-medium hidden sm:inline">Sisa Waktu</span>
                <span className="font-mono-num text-lg font-bold">
                  {timeLeft}d
                </span>
              </div>
            )}

            {step === 'standby' && canViewPublicResults && (
              <button
                type="button"
                onClick={onNavigateResults}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1e293b] hover:bg-slate-700 border border-slate-700 text-xs sm:text-sm font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Hasil Pemilihan</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Bar Pengumuman bila diisi admin */}
      {settings.announcement.trim() !== '' && step === 'standby' && (
        <div className="bg-rose-100 border-b border-rose-200 text-rose-800 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center gap-2.5 text-sm font-bold">
            <span aria-hidden="true">📢</span>
            <span>{settings.announcement}</span>
          </div>
        </div>
      )}

      {/* Konten Utama Bilik Suara */}
      <main className="flex-1 flex flex-col justify-center max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        <AnimatePresence mode="wait">
          {/* === LANGKAH 1: HALAMAN AWAL / STANDBY === */}
          {step === 'standby' && (
            <motion.div
              key="standby"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="max-w-xl w-full mx-auto"
            >
              {timeoutNotice && (
                <div className="mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/40 p-4 flex items-start gap-3 text-amber-200 text-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-amber-300 mb-0.5">Sesi Berakhir Otomatis</div>
                    <p>{timeoutNotice}</p>
                  </div>
                </div>
              )}

              <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
                {!settings.isElectionOpen ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4 text-3xl">
                      🔒
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                      Pemilihan Belum Dibuka
                    </h1>
                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                      Bilik suara sedang menunggu panitia mengaktifkan pemilihan.
                      Silakan tunggu arahan petugas di tempat pemungutan suara.
                    </p>
                    {canViewPublicResults && (
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={onNavigateResults}
                          className="min-h-[56px] px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
                        >
                          Lihat Hasil Pemilihan
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
                        {settings.officerMode
                          ? 'Mode Petugas Aktif · Aktivasi Bilik'
                          : 'Bilik Suara Terbuka · Verifikasi Identitas'}
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
                        {settings.officerMode
                          ? 'Aktifkan Sesi Pemilih'
                          : 'Masukkan NISN atau NIP/NIK'}
                      </h1>
                      <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                        {settings.officerMode
                          ? 'Petugas memasukkan NISN (siswa) atau NIP/NIK (guru & karyawan), lalu menyerahkan perangkat kepada pemilih.'
                          : 'Ketik NISN (untuk siswa) atau NIP/NIK (untuk guru & karyawan) Anda. Tidak memerlukan PIN.'}
                      </p>
                    </div>

                    <form onSubmit={handleLookupVoter} className="space-y-4">
                      <div>
                        <label
                          htmlFor="voter-id-input"
                          className="block text-sm font-semibold text-slate-200 mb-2"
                        >
                          Nomor Identitas (NISN / NIP / NIK)
                        </label>
                        <input
                          id="voter-id-input"
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          autoFocus
                          value={inputNumber}
                          onChange={(e) => {
                            setInputNumber(e.target.value);
                            if (lookupError) setLookupError(null);
                          }}
                          placeholder="Contoh: 0091234501"
                          className="w-full min-h-[56px] px-4 rounded-xl bg-[#0f172a] border border-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 text-white font-mono-num text-lg placeholder:text-slate-500 outline-none transition-all"
                        />
                      </div>

                      {lookupError && (
                        <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-4 text-sm text-rose-200 flex items-start gap-3">
                          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                          <span>{lookupError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={lookupLoading}
                        className="w-full min-h-[56px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-base font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30"
                      >
                        {lookupLoading ? (
                          <span>Memeriksa Data...</span>
                        ) : settings.officerMode ? (
                          <>
                            <UserCheck className="w-5 h-5" />
                            <span>Aktifkan Sesi Bilik Sekarang</span>
                          </>
                        ) : (
                          <>
                            <span>Cek Identitas</span>
                            <ArrowRight className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </form>

                    <div className="mt-6 pt-5 border-t border-slate-700/70 flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        Suara dijamin rahasia &amp; terpisah dari identitas
                      </span>
                      <span className="font-mono-num">
                        Batas {settings.voteTimeoutSeconds} detik
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* === LANGKAH 2: KONFIRMASI IDENTITAS ("INI SAYA") === */}
          {step === 'confirm' && activeVoter && (
            <motion.div
              key="confirm"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="max-w-lg w-full mx-auto"
            >
              <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">
                  Konfirmasi Data Pemilih
                </div>
                <h1 className="text-2xl font-bold text-white mb-6">
                  Apakah data berikut benar milik Anda?
                </h1>

                <div className="rounded-xl bg-[#0f172a] border border-slate-700/80 p-5 space-y-3 mb-6">
                  <div>
                    <div className="text-xs text-slate-400">Nama Lengkap</div>
                    <div className="text-xl font-bold text-white mt-0.5">
                      {activeVoter.name}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    <div>
                      <div className="text-xs text-slate-400">NISN / NIP / NIK</div>
                      <div className="font-mono-num text-sm font-semibold text-slate-200 mt-0.5">
                        {activeVoter.voterNumber}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Kelas / Jabatan</div>
                      <div className="text-sm font-semibold text-slate-200 mt-0.5">
                        {activeVoter.classOrRole} ·{' '}
                        <span className="capitalize">{activeVoter.category}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleConfirmIdentity}
                    className="w-full min-h-[56px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-base font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Ini Saya, Mulai Memilih ({settings.voteTimeoutSeconds}d)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => resetToStandby()}
                    className="w-full min-h-[56px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-base font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Bukan Saya / Kembali</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* === LANGKAH 3: 3 SURAT SUARA (OSIS, PRAMUKA, PMR) === */}
          {step === 'ballot' && activeVoter && (
            <motion.div
              key="ballot"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Navigasi 3 Organisasi */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1e293b] border border-slate-700/80 rounded-2xl p-4">
                <div>
                  <div className="text-xs text-slate-400">
                    Pemilih aktif: <span className="text-slate-200 font-semibold">{activeVoter.name}</span> ({activeVoter.classOrRole})
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white mt-0.5">
                    {ORG_CONFIG[activeOrg].emoji} Surat Suara {ORG_CONFIG[activeOrg].fullName}
                  </h1>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {ORG_ORDER.map((org, idx) => {
                    const cfg = ORG_CONFIG[org];
                    const isActive = activeOrg === org;
                    const isPicked = Boolean(selections[org]);
                    return (
                      <button
                        key={org}
                        type="button"
                        onClick={() => setActiveOrg(org)}
                        className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                          isActive
                            ? `${cfg.badgeBg} text-white border-transparent shadow-lg`
                            : isPicked
                            ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'
                            : 'bg-[#0f172a] border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <span className="font-mono-num">{idx + 1}.</span>
                        <span>{cfg.label}</span>
                        {isPicked && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Kartu Paslon untuk Organisasi Aktif (rata tengah, lebar maks 400px, tinggi sama) */}
              <div className="flex flex-wrap justify-center items-stretch gap-6">
                {candidatesByOrg[activeOrg].map((cand) => {
                  const cfg = ORG_CONFIG[activeOrg];
                  const isSelected = selections[activeOrg]?.id === cand.id;
                  const missionItems = parseMissionLines(cand.mission);

                  return (
                    <div
                      key={cand.id}
                      className={`w-full sm:w-[calc(50%-0.75rem)] lg:w-[calc(33.333%-1rem)] sm:max-w-[400px] bg-[#1e293b] rounded-2xl p-5 flex flex-col border-2 transition-all ${
                        isSelected
                          ? `${cfg.accentBorder} shadow-xl`
                          : 'border-slate-700/80 hover:border-slate-500'
                      }`}
                    >
                      {/* Foto 3:4 & Satu Badge Nomor Urut di Pojok */}
                      <div className="relative mb-4">
                        <DriveImage
                          url={cand.photoUrl}
                          alt={`Paslon ${cand.number} ${cand.ketuaName} & ${cand.wakilName}`}
                          fallbackText={`${cand.ketuaName} ${cand.wakilName}`}
                          accentClass={cfg.fallbackGrad}
                        />
                        <div
                          className={`absolute top-3 left-3 px-3.5 py-1.5 rounded-xl ${cfg.badgeBg} text-white font-mono-num text-lg font-extrabold shadow-lg`}
                        >
                          {String(cand.number).padStart(2, '0')}
                        </div>
                        {isSelected && (
                          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shadow-lg">
                            <Check className="w-4 h-4" />
                            <span>Terpilih</span>
                          </div>
                        )}
                      </div>

                      {/* Nama Ketua & Wakil */}
                      <div className="mb-4 pb-4 border-b border-slate-700/70">
                        <div className="text-xs text-slate-400">Ketua &amp; Wakil Ketua</div>
                        <h2 className="text-lg font-bold text-white leading-snug mt-0.5">
                          {cand.ketuaName}
                        </h2>
                        <div className="text-[15px] font-semibold text-slate-300">
                          &amp; {cand.wakilName}
                        </div>
                      </div>

                      {/* Visi & Misi Langsung Tampil (teks minimal 14-15px, jarak lega) */}
                      <div className="flex-1 space-y-4 mb-6">
                        <div>
                          <div className="text-xs font-bold tracking-wider uppercase text-slate-400 mb-1">
                            VISI
                          </div>
                          <p className="text-[15px] leading-relaxed text-slate-200">
                            {cand.vision}
                          </p>
                        </div>

                        <div>
                          <div className="text-xs font-bold tracking-wider uppercase text-slate-400 mb-1.5">
                            MISI
                          </div>
                          <ol className="list-decimal pl-5 space-y-1.5 text-[15px] leading-relaxed text-slate-200">
                            {missionItems.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ol>
                        </div>
                      </div>

                      {/* Tombol Pilih menempel sejajar di bagian bawah kartu */}
                      <div className="mt-auto">
                        <button
                          type="button"
                          onClick={() => handleSelectCandidate(cand)}
                          className={`w-full min-h-[56px] px-4 rounded-xl text-white text-base font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 hover:bg-emerald-500'
                              : cfg.buttonBg
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="w-5 h-5" />
                              <span>Paslon Terpilih</span>
                            </>
                          ) : (
                            <span>Pilih Paslon No. {cand.number}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Navigasi Bawah Bilik */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const idx = ORG_ORDER.indexOf(activeOrg);
                    if (idx > 0) setActiveOrg(ORG_ORDER[idx - 1]);
                    else resetToStandby();
                  }}
                  className="min-h-[56px] px-6 rounded-xl bg-[#1e293b] hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>
                    {ORG_ORDER.indexOf(activeOrg) > 0
                      ? `Kembali ke ${ORG_CONFIG[ORG_ORDER[ORG_ORDER.indexOf(activeOrg) - 1]].label}`
                      : 'Batalkan Sesi'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={!selections[activeOrg] && (activeOrg !== 'PMR' || !allSelected)}
                  onClick={handleNextStepFromBallot}
                  className="min-h-[56px] px-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400 text-white text-base font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {activeOrg === 'PMR' ? (
                    <>
                      <span>{allSelected ? 'Tinjau Ringkasan Pilihan' : 'Pilih Semua Organisasi'}</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  ) : (
                    <>
                      <span>
                        Lanjut ke {ORG_CONFIG[ORG_ORDER[ORG_ORDER.indexOf(activeOrg) + 1]].label}
                      </span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* === LANGKAH 4: RINGKASAN PILIHAN SEBELUM KIRIM === */}
          {step === 'summary' && activeVoter && allSelected && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="max-w-4xl w-full mx-auto space-y-6"
            >
              <div className="bg-[#1e293b] border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
                  Langkah Terakhir · Konfirmasi Pilihan
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                  Periksa Pilihan Anda Sebelum Dikirim
                </h1>
                <p className="text-sm text-slate-300 mb-6">
                  Setelah menekan tombol kirim, suara akan dicatat secara rahasia dan hak suara Anda dikunci.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {ORG_ORDER.map((org) => {
                    const cand = selections[org]!;
                    const cfg = ORG_CONFIG[org];
                    return (
                      <div
                        key={org}
                        className="rounded-xl bg-[#0f172a] border border-slate-700 p-4 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className={`text-sm font-bold ${cfg.accentText}`}>
                              {cfg.emoji} {cfg.label}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-lg ${cfg.badgeBg} text-white font-mono-num text-xs font-bold`}
                            >
                              No. {String(cand.number).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="font-bold text-white text-base">
                            {cand.ketuaName}
                          </div>
                          <div className="text-sm text-slate-300 mb-4">
                            &amp; {cand.wakilName}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveOrg(org);
                            setStep('ballot');
                          }}
                          className="w-full min-h-[44px] rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                        >
                          Ubah Pilihan {cfg.label}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {submitError && (
                  <div className="mb-5 rounded-xl bg-rose-500/10 border border-rose-500/40 p-4 text-sm text-rose-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setStep('ballot')}
                    className="sm:w-1/3 min-h-[56px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold transition-colors cursor-pointer"
                  >
                    Kembali ke Surat Suara
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleSubmitBallot}
                    className="sm:w-2/3 min-h-[56px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-lg font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/30"
                  >
                    <CheckCircle2 className="w-6 h-6" />
                    <span>{isSubmitting ? 'Menyimpan Suara...' : 'Kirim Suara Sekarang'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* === LANGKAH 5: LAYAR TERIMA KASIH === */}
          {step === 'thanks' && (
            <motion.div
              key="thanks"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="max-w-lg w-full mx-auto"
            >
              <div className="bg-[#1e293b] border border-emerald-500/40 rounded-2xl p-8 sm:p-10 text-center shadow-2xl">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                  className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto mb-6"
                >
                  <Check className="w-12 h-12 text-emerald-400 stroke-[3]" />
                </motion.div>

                <h1 className="text-3xl font-extrabold text-white mb-3">
                  Terima Kasih!
                </h1>
                <p className="text-base text-slate-200 leading-relaxed mb-6">
                  Suara Anda untuk pemilihan OSIS, Pramuka, dan PMR {settings.schoolName} telah
                  berhasil dicatat secara rahasia.
                </p>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0f172a] border border-slate-700 text-sm text-slate-300 font-mono-num">
                  <span>Kembali ke halaman awal dalam</span>
                  <span className="text-emerald-400 font-bold">{resetCountdown}d</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
