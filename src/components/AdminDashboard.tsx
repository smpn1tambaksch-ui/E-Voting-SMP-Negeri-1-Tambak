import React, { useEffect, useMemo, useRef, useState } from 'react';
import { User, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LogOut,
  Menu,
  Monitor,
  Power,
  UserCheck,
  UserX,
  Users,
  Briefcase,
  X,
} from 'lucide-react';
import { resetDummyData } from '../data/seedData';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  AdminMenuTab,
  Candidate,
  ElectionSettings,
  PanitiaUser,
  VoteBallot,
  Voter,
} from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { DriveImage } from './DriveImage';
import { AdminCandidatesSection } from './admin/AdminCandidatesSection';
import { AdminPanitiaSection } from './admin/AdminPanitiaSection';
import { AdminQuickCountSection } from './admin/AdminQuickCountSection';
import { AdminSettingsSection } from './admin/AdminSettingsSection';
import { AdminVotersSection } from './admin/AdminVotersSection';

interface AdminDashboardProps {
  user: User;
  panitiaProfile: PanitiaUser;
  settings: ElectionSettings;
  candidates: Candidate[];
  onBackToBooth: () => void;
}

const MENU_ITEMS: Array<{
  id: AdminMenuTab;
  label: string;
  emoji: string;
  adminOnly?: boolean;
}> = [
  { id: 'beranda', label: 'Beranda', emoji: '🏠' },
  { id: 'quick-count', label: 'Quick Count', emoji: '📊' },
  { id: 'belum-memilih', label: 'Belum Memilih', emoji: '📋' },
  { id: 'paslon', label: 'Paslon', emoji: '🧑‍🎓' },
  { id: 'pemilih', label: 'Data Pemilih', emoji: '👥' },
  { id: 'kelola-panitia', label: 'Kelola Akun Panitia', emoji: '🛡️', adminOnly: true },
  { id: 'pengaturan', label: 'Pengaturan', emoji: '⚙️' },
];

/**
 * Dashboard Panitia/Admin bergaya gelap modern (tema SPECTRA).
 * Menampilkan Quick Count realtime, progres partisipasi, daftar belum memilih,
 * manajemen paslon, impor CSV pemilih, kelola akun panitia, dan kontrol buka/tutup pemilihan.
 */
export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  panitiaProfile,
  settings,
  candidates,
  onBackToBooth,
}) => {
  const [activeTab, setActiveTab] = useState<AdminMenuTab>('beranda');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [voters, setVoters] = useState<Voter[]>([]);
  const [votes, setVotes] = useState<VoteBallot[]>([]);
  const [togglingElection, setTogglingElection] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const autoSeededRef = useRef(false);

  const visibleMenuItems = useMemo(() => {
    return MENU_ITEMS.filter(
      (item) => !item.adminOnly || panitiaProfile.role === 'admin'
    );
  }, [panitiaProfile.role]);

  // Jam realtime untuk kartu glassmorphism di Hero Banner
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Realtime listener koleksi pemilih & suara (hanya berjalan saat admin login)
  useEffect(() => {
    const votersQuery = query(
      collection(db, 'voters'),
      where('category', 'in', ['siswa', 'guru', 'karyawan'])
    );
    const unsubVoters = onSnapshot(
      votersQuery,
      (snap) => {
        const list: Voter[] = snap.docs.map((d) => ({
          id: d.id,
          voterNumber: d.data().voterNumber,
          name: d.data().name,
          classOrRole: d.data().classOrRole,
          category: d.data().category,
          hasVoted: Boolean(d.data().hasVoted),
          votedAt: d.data().votedAt ?? null,
          createdAt: d.data().createdAt,
          updatedAt: d.data().updatedAt,
        }));
        setVoters(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'voters')
    );

    const votesQuery = query(
      collection(db, 'votes'),
      where('electionScope', '==', 'smpn1tambak')
    );
    const unsubVotes = onSnapshot(
      votesQuery,
      (snap) => {
        const list: VoteBallot[] = snap.docs.map((d) => ({
          id: d.id,
          osisCandidateId: d.data().osisCandidateId,
          pramukaCandidateId: d.data().pramukaCandidateId,
          pmrCandidateId: d.data().pmrCandidateId,
          createdAt: d.data().createdAt,
        }));
        setVotes(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'votes')
    );

    return () => {
      unsubVoters();
      unsubVotes();
    };
  }, []);

  // Inisialisasi otomatis data uji coba jika database masih benar-benar kosong
  useEffect(() => {
    if (autoSeededRef.current) return;
    if (candidates.length === 0 && voters.length === 0) {
      const timer = window.setTimeout(() => {
        if (!autoSeededRef.current) {
          autoSeededRef.current = true;
          void resetDummyData(false);
        }
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [candidates.length, voters.length]);

  const stats = useMemo(() => {
    const total = voters.length;
    const voted = voters.filter((v) => v.hasVoted).length;
    const notVoted = total - voted;
    const students = voters.filter((v) => v.category === 'siswa').length;
    const staff = voters.filter(
      (v) => v.category === 'guru' || v.category === 'karyawan'
    ).length;

    return { total, voted, notVoted, students, staff };
  }, [voters]);

  const handleToggleElection = async () => {
    setTogglingElection(true);
    try {
      await setDoc(doc(db, 'settings', 'election'), {
        schoolName: settings.schoolName,
        schoolLogoUrl: settings.schoolLogoUrl,
        isElectionOpen: !settings.isElectionOpen,
        voteTimeoutSeconds: settings.voteTimeoutSeconds,
        resetAfterSubmitSeconds: settings.resetAfterSubmitSeconds,
        officerMode: settings.officerMode,
        showPublicResults: settings.showPublicResults,
        announcement: settings.announcement,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/election');
    } finally {
      setTogglingElection(false);
    }
  };

  const formattedTime = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedDate = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const renderSidebarContent = (isMobile = false) => {
    const collapsed = !isMobile && sidebarCollapsed;

    return (
      <div className="flex flex-col h-full bg-[#1e293b] border-r border-slate-800">
        {/* Logo Sekolah & Tombol Lipat Sidebar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2 min-h-[72px]">
          <div className="flex items-center gap-3 min-w-0">
            {settings.schoolLogoUrl.trim() !== '' && (
              <DriveImage
                url={settings.schoolLogoUrl}
                alt={`Logo ${settings.schoolName}`}
                fallbackText={settings.schoolName}
                variant="logo"
                className="w-9 h-9 rounded-lg shrink-0"
              />
            )}
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {settings.schoolName}
                </div>
                <div className="text-[11px] text-slate-400 truncate">Panel Panitia</div>
              </div>
            )}
          </div>

          {!isMobile ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="p-1.5 rounded-lg bg-[#0f172a] hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white cursor-pointer shrink-0"
              aria-label={collapsed ? 'Perluas sidebar' : 'Lipat sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 rounded-lg bg-[#0f172a] text-slate-300 cursor-pointer"
              aria-label="Tutup menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Menu Navigasi */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {visibleMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-300 border-l-2 border-blue-500'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border-l-2 border-transparent'
                } ${collapsed ? 'justify-center px-2' : ''}`}
              >
                <span className="text-base shrink-0" aria-hidden="true">
                  {item.emoji}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Footer Profil Panitia + Bilik Suara + Logout */}
        <div className="p-3 border-t border-slate-800 space-y-2.5">
          {!collapsed && (
            <div className="px-3 py-2 rounded-xl bg-[#0f172a] border border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-white truncate">
                  {panitiaProfile.name || user.displayName || 'Panitia Pemilihan'}
                </div>
                <span className="text-[10px] font-bold uppercase text-blue-400 shrink-0">
                  {panitiaProfile.role}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {panitiaProfile.email || user.email}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onBackToBooth}
            title="Buka Tampilan Bilik Suara"
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-colors cursor-pointer ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <Monitor className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Buka Bilik Suara</span>}
          </button>

          <button
            type="button"
            onClick={() => void signOut(auth)}
            title="Logout"
            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-bold transition-colors cursor-pointer ${
              collapsed ? 'justify-center px-2' : ''
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex">
      {/* Sidebar Desktop Tetap */}
      <aside
        className={`hidden lg:block sticky top-0 h-screen shrink-0 transition-all duration-200 ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Drawer Sidebar Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            {renderSidebarContent(true)}
          </div>
        </div>
      )}

      {/* Area Konten Utama */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Mobile */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#1e293b] border-b border-slate-800 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-xl bg-[#0f172a] border border-slate-700 text-slate-200 cursor-pointer"
            aria-label="Buka menu navigasi"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-white truncate px-2">
            {settings.schoolName}
          </span>
          <button
            type="button"
            onClick={onBackToBooth}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
          >
            Bilik
          </button>
        </div>

        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {/* Banner Hero Gradasi Hijau */}
          <section className="rounded-2xl bg-gradient-to-r from-[#16a34a] to-[#0d9488] p-6 sm:p-7 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Pemilihan Ketua &amp; Wakil
              </h1>
              <p className="text-emerald-50/90 text-sm sm:text-base mt-1">
                OSIS, Pramuka &amp; PMR · {settings.schoolName}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Jam Realtime Kartu Kaca Transparan (Glassmorphism) */}
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-2.5 text-white">
                <div className="font-mono-num text-xl font-extrabold leading-none">
                  {formattedTime}
                </div>
                <div className="text-[11px] text-emerald-50/85 mt-1">{formattedDate}</div>
              </div>

              {/* Pill Status Pemilihan & Tombol Buka/Tutup Pemilihan */}
              <div className="flex items-center gap-2.5 bg-black/20 backdrop-blur-md border border-white/15 rounded-xl p-2">
                <span
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider ${
                    settings.isElectionOpen
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-rose-500 text-white'
                  }`}
                >
                  {settings.isElectionOpen ? 'Dibuka' : 'Ditutup'}
                </span>

                <button
                  type="button"
                  disabled={togglingElection}
                  onClick={handleToggleElection}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    settings.isElectionOpen
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-white hover:bg-slate-100 text-slate-900'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>
                    {settings.isElectionOpen ? 'Tutup Pemilihan' : 'Buka Pemilihan'}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Bar Pengumuman (latar merah muda terang, teks merah tebal, ikon di kiri) */}
          {settings.announcement.trim() !== '' && (
            <div className="rounded-xl bg-rose-100 border border-rose-200 px-4 py-3 flex items-center gap-3 text-rose-700 text-sm font-bold shadow-sm">
              <span className="text-lg shrink-0" aria-hidden="true">
                📢
              </span>
              <span>{settings.announcement}</span>
            </div>
          )}

          {/* 5 Kartu Statistik (tampil pada Beranda) */}
          {activeTab === 'beranda' && (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* 1. Total Pemilih (Indigo) */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-950/90 to-[#1e293b] border border-indigo-500/30 p-5 shadow-lg hover:border-indigo-400/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                    Total Pemilih
                  </span>
                  <Users className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  <AnimatedNumber value={stats.total} />
                </div>
              </div>

              {/* 2. Sudah Memilih (Hijau) */}
              <div className="rounded-2xl bg-gradient-to-br from-emerald-950/90 to-[#1e293b] border border-emerald-500/30 p-5 shadow-lg hover:border-emerald-400/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    Sudah Memilih
                  </span>
                  <UserCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  <AnimatedNumber value={stats.voted} />
                </div>
              </div>

              {/* 3. Belum Memilih (Oranye) */}
              <div className="rounded-2xl bg-gradient-to-br from-orange-950/90 to-[#1e293b] border border-orange-500/30 p-5 shadow-lg hover:border-orange-400/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-orange-300">
                    Belum Memilih
                  </span>
                  <UserX className="w-5 h-5 text-orange-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  <AnimatedNumber value={stats.notVoted} />
                </div>
              </div>

              {/* 4. Siswa (Biru) */}
              <div className="rounded-2xl bg-gradient-to-br from-blue-950/90 to-[#1e293b] border border-blue-500/30 p-5 shadow-lg hover:border-blue-400/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300">
                    Siswa
                  </span>
                  <GraduationCap className="w-5 h-5 text-blue-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  <AnimatedNumber value={stats.students} />
                </div>
              </div>

              {/* 5. Guru & Karyawan (Ungu) */}
              <div className="rounded-2xl bg-gradient-to-br from-purple-950/90 to-[#1e293b] border border-purple-500/30 p-5 shadow-lg hover:border-purple-400/50 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-purple-300">
                    Guru &amp; Karyawan
                  </span>
                  <Briefcase className="w-5 h-5 text-purple-400" />
                </div>
                <div className="text-3xl font-extrabold text-white">
                  <AnimatedNumber value={stats.staff} />
                </div>
              </div>
            </section>
          )}

          {/* Konten Sesuai Menu Aktif */}
          {activeTab === 'beranda' && (
            <AdminQuickCountSection
              candidates={candidates}
              voters={voters}
              votes={votes}
              showFullBreakdown={true}
            />
          )}

          {activeTab === 'quick-count' && (
            <AdminQuickCountSection
              candidates={candidates}
              voters={voters}
              votes={votes}
              showFullBreakdown={true}
            />
          )}

          {activeTab === 'belum-memilih' && (
            <AdminVotersSection voters={voters} onlyNotVoted={true} />
          )}

          {activeTab === 'paslon' && (
            <AdminCandidatesSection candidates={candidates} />
          )}

          {activeTab === 'pemilih' && (
            <AdminVotersSection voters={voters} onlyNotVoted={false} />
          )}

          {activeTab === 'kelola-panitia' && panitiaProfile.role === 'admin' && (
            <AdminPanitiaSection currentUserId={user.uid} />
          )}

          {activeTab === 'pengaturan' && (
            <AdminSettingsSection settings={settings} />
          )}
        </main>
      </div>
    </div>
  );
};
