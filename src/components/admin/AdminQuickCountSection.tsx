import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Candidate, Organization, VoteBallot, Voter, VoterCategory } from '../../types';
import { exportVotersToCsv } from '../../utils/driveImage';
import { AnimatedNumber } from '../AnimatedNumber';
import { DriveImage } from '../DriveImage';

interface AdminQuickCountSectionProps {
  candidates: Candidate[];
  voters: Voter[];
  votes: VoteBallot[];
  showFullBreakdown?: boolean;
}

const ORGS: Array<{
  key: Organization;
  label: string;
  emoji: string;
  barGrad: string;
}> = [
  { key: 'OSIS', label: 'OSIS', emoji: '🎓', barGrad: 'from-blue-600 to-cyan-400' },
  { key: 'PRAMUKA', label: 'Pramuka', emoji: '⚜️', barGrad: 'from-amber-600 to-yellow-400' },
  { key: 'PMR', label: 'PMR', emoji: '🩺', barGrad: 'from-rose-600 to-pink-400' },
];

/**
 * Menampilkan Quick Count realtime per organisasi (OSIS, Pramuka, PMR),
 * sorotan partisipasi per kategori & per kelas, serta sub-tab Belum Memilih & Ekspor.
 */
export const AdminQuickCountSection: React.FC<AdminQuickCountSectionProps> = ({
  candidates,
  voters,
  votes,
  showFullBreakdown = true,
}) => {
  const [selectedOrg, setSelectedOrg] = useState<Organization>('OSIS');
  const [subTab, setSubTab] = useState<'quick-count' | 'belum-memilih' | 'ekspor'>('quick-count');
  const [catFilter, setCatFilter] = useState<'all' | VoterCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Hitung total suara per kandidat
  const voteCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    votes.forEach((v) => {
      map[v.osisCandidateId] = (map[v.osisCandidateId] || 0) + 1;
      map[v.pramukaCandidateId] = (map[v.pramukaCandidateId] || 0) + 1;
      map[v.pmrCandidateId] = (map[v.pmrCandidateId] || 0) + 1;
    });
    return map;
  }, [votes]);

  const activeOrgMeta = ORGS.find((o) => o.key === selectedOrg)!;

  const activeOrgCandidates = useMemo(() => {
    return candidates
      .filter((c) => c.org === selectedOrg)
      .sort((a, b) => a.number - b.number);
  }, [candidates, selectedOrg]);

  // Statistik partisipasi keseluruhan, per kategori, dan per kelas
  const participation = useMemo(() => {
    const total = voters.length;
    const voted = voters.filter((v) => v.hasVoted).length;
    const pct = total > 0 ? (voted / total) * 100 : 0;

    const byCategory: Array<{ key: VoterCategory; label: string; voted: number; total: number }> = [
      { key: 'siswa', label: 'Siswa', voted: 0, total: 0 },
      { key: 'guru', label: 'Guru', voted: 0, total: 0 },
      { key: 'karyawan', label: 'Karyawan', voted: 0, total: 0 },
    ];

    const classMap = new Map<string, { voted: number; total: number }>();

    voters.forEach((v) => {
      const catEntry = byCategory.find((c) => c.key === v.category);
      if (catEntry) {
        catEntry.total += 1;
        if (v.hasVoted) catEntry.voted += 1;
      }

      if (v.category === 'siswa') {
        const cls = v.classOrRole || 'Tanpa Kelas';
        const cur = classMap.get(cls) || { voted: 0, total: 0 };
        cur.total += 1;
        if (v.hasVoted) cur.voted += 1;
        classMap.set(cls, cur);
      }
    });

    const byClass = Array.from(classMap.entries())
      .map(([className, data]) => ({ className, ...data }))
      .sort((a, b) => a.className.localeCompare(b.className));

    return { total, voted, pct, byCategory, byClass };
  }, [voters]);

  const notVotedList = useMemo(() => {
    return voters
      .filter((v) => !v.hasVoted)
      .filter((v) => (catFilter === 'all' ? true : v.category === catFilter))
      .filter((v) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.voterNumber.toLowerCase().includes(q) ||
          v.classOrRole.toLowerCase().includes(q)
        );
      });
  }, [voters, catFilter, searchTerm]);

  const handleExportQuickCountCsv = () => {
    const header = ['Organisasi', 'Nomor Urut', 'Ketua', 'Wakil', 'Jumlah Suara', 'Persentase'];
    const total = votes.length;
    const rows = candidates
      .slice()
      .sort((a, b) => a.org.localeCompare(b.org) || a.number - b.number)
      .map((c) => {
        const count = voteCountMap[c.id] || 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : '0.00';
        return [
          c.org,
          String(c.number),
          `"${c.ketuaName.replace(/"/g, '""')}"`,
          `"${c.wakilName.replace(/"/g, '""')}"`,
          String(count),
          `${pct}%`,
        ].join(',');
      });

    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quick-count-smpn1-tambak-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Kartu Sorotan Partisipasi (latar cokelat gelap, border emas dengan glow, bar kuning-oranye) */}
      {showFullBreakdown && (
        <section className="rounded-2xl bg-[#271c12] border border-amber-500/45 shadow-[0_0_28px_rgba(245,158,11,0.12)] p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Sorotan Partisipasi Pemilih
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">
                Progres Kehadiran Warga Sekolah
              </h2>
            </div>
            <div className="text-left sm:text-right">
              <div className="font-mono-num text-2xl font-extrabold text-amber-300">
                <AnimatedNumber value={participation.pct} decimals={1} suffix="%" />
              </div>
              <div className="text-xs text-amber-200/80 font-mono-num">
                {participation.voted} dari {participation.total} pemilih sudah memilih
              </div>
            </div>
          </div>

          <div className="h-3.5 rounded-full bg-[#160f09] border border-amber-500/25 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500"
              style={{ width: `${Math.min(100, participation.pct)}%` }}
            />
          </div>

          {/* Rincian per kategori dan per kelas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div>
              <div className="text-xs font-semibold text-amber-200/80 mb-3">
                Partisipasi per Kategori
              </div>
              <div className="grid grid-cols-3 gap-3">
                {participation.byCategory.map((cat) => {
                  const p = cat.total > 0 ? Math.round((cat.voted / cat.total) * 100) : 0;
                  return (
                    <div
                      key={cat.key}
                      className="rounded-xl bg-[#1a120b] border border-amber-500/20 p-3"
                    >
                      <div className="text-xs text-amber-200/70">{cat.label}</div>
                      <div className="font-mono-num text-base font-bold text-white mt-0.5">
                        {cat.voted}/{cat.total}
                      </div>
                      <div className="font-mono-num text-xs text-amber-400">{p}%</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-amber-200/80 mb-3">
                Partisipasi per Kelas (Siswa)
              </div>
              {participation.byClass.length === 0 ? (
                <div className="text-xs text-amber-200/60">Belum ada data pemilih siswa.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {participation.byClass.map((cls) => {
                    const p = cls.total > 0 ? Math.round((cls.voted / cls.total) * 100) : 0;
                    return (
                      <div
                        key={cls.className}
                        className="px-3 py-2 rounded-xl bg-[#1a120b] border border-amber-500/20 text-xs"
                      >
                        <span className="font-bold text-white mr-2">{cls.className}</span>
                        <span className="font-mono-num text-amber-300">
                          {cls.voted}/{cls.total} ({p}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Tab Pill Besar Organisasi + Sub-Tab */}
      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Pill Tab Organisasi */}
          <div className="flex items-center gap-2 flex-wrap">
            {ORGS.map((org) => {
              const isActive = selectedOrg === org.key;
              return (
                <button
                  key={org.key}
                  type="button"
                  onClick={() => setSelectedOrg(org.key)}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                      : 'bg-[#0f172a] border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <span>{org.emoji}</span>
                  <span>{org.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sub-Tab Lebih Kecil */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#0f172a] border border-slate-700 self-start">
            <button
              type="button"
              onClick={() => setSubTab('quick-count')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'quick-count'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Quick Count
            </button>
            <button
              type="button"
              onClick={() => setSubTab('belum-memilih')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'belum-memilih'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Belum Memilih
            </button>
            <button
              type="button"
              onClick={() => setSubTab('ekspor')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                subTab === 'ekspor'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ekspor
            </button>
          </div>
        </div>

        {/* Sub-tab 1: Quick Count Realtime */}
        {subTab === 'quick-count' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Perolehan Suara Realtime ·{' '}
                <strong className="text-white">{activeOrgMeta.label}</strong>
              </span>
              <span className="font-mono-num text-slate-300">
                Total Surat Suara Masuk: <strong className="text-white">{votes.length}</strong>
              </span>
            </div>

            {activeOrgCandidates.length === 0 ? (
              <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-8 text-center text-sm text-slate-400">
                Belum ada pasangan calon terdaftar untuk {activeOrgMeta.label}.
              </div>
            ) : (
              <div className="space-y-4">
                {activeOrgCandidates.map((cand) => {
                  const count = voteCountMap[cand.id] || 0;
                  const pct = votes.length > 0 ? (count / votes.length) * 100 : 0;

                  return (
                    <div
                      key={cand.id}
                      className="rounded-xl bg-[#0f172a] border border-slate-700/70 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="w-14 shrink-0">
                        <DriveImage
                          url={cand.photoUrl}
                          alt={cand.ketuaName}
                          fallbackText={`${cand.ketuaName} ${cand.wakilName}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-mono-num text-xs font-bold text-blue-400 mr-2">
                              Paslon #{String(cand.number).padStart(2, '0')}
                            </span>
                            <span className="font-bold text-white text-base">
                              {cand.ketuaName} &amp; {cand.wakilName}
                            </span>
                          </div>
                          <div className="flex items-baseline gap-2 shrink-0">
                            <span className="font-mono-num text-xl font-extrabold text-white">
                              <AnimatedNumber value={count} />
                            </span>
                            <span className="text-xs text-slate-400">suara</span>
                            <span className="font-mono-num text-sm font-bold text-emerald-400 ml-1">
                              (<AnimatedNumber value={pct} decimals={1} suffix="%" />)
                            </span>
                          </div>
                        </div>

                        <div className="h-3.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${activeOrgMeta.barGrad} transition-all duration-500`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sub-tab 2: Ringkasan Belum Memilih */}
        {subTab === 'belum-memilih' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari nama, NISN/NIP, atau kelas..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0f172a] border border-slate-700 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'siswa', 'guru', 'karyawan'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCatFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize cursor-pointer ${
                      catFilter === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#0f172a] border border-slate-700 text-slate-300'
                    }`}
                  >
                    {cat === 'all' ? 'Semua' : cat}
                  </button>
                ))}
              </div>
            </div>

            {notVotedList.length === 0 ? (
              <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-6 text-center text-sm text-slate-400">
                Tidak ada pemilih yang belum memilih pada filter ini.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#0f172a] text-xs text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3">NISN / NIP / NIK</th>
                      <th className="px-4 py-3">Nama</th>
                      <th className="px-4 py-3">Kelas / Jabatan</th>
                      <th className="px-4 py-3">Kategori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {notVotedList.slice(0, 12).map((v) => (
                      <tr key={v.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono-num text-slate-300">
                          {v.voterNumber}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-white">{v.name}</td>
                        <td className="px-4 py-2.5 text-slate-300">{v.classOrRole}</td>
                        <td className="px-4 py-2.5 capitalize text-amber-400 font-medium">
                          {v.category}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sub-tab 3: Ekspor Data */}
        {subTab === 'ekspor' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#0f172a] border border-slate-700/80 p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="font-bold text-white text-base">Ekspor Rekap Quick Count</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Unduh hasil perolehan suara seluruh paslon OSIS, Pramuka, dan PMR dalam format CSV.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportQuickCountCsv}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Hasil Quick Count (.csv)</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#0f172a] border border-slate-700/80 p-5 flex flex-col justify-between gap-4">
              <div>
                <h3 className="font-bold text-white text-base">Ekspor Daftar Belum Memilih</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Unduh daftar warga sekolah yang belum menggunakan hak suara ({voters.filter((v) => !v.hasVoted).length} orang).
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  exportVotersToCsv(
                    voters.filter((v) => !v.hasVoted),
                    `belum-memilih-smpn1-tambak-${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Unduh Daftar Belum Memilih (.csv)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
