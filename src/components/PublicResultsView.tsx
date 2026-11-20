import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeft, Lock } from 'lucide-react';
import { db } from '../firebase';
import { Candidate, ElectionSettings, Organization, VoteBallot } from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { DriveImage } from './DriveImage';

interface PublicResultsViewProps {
  settings: ElectionSettings;
  candidates: Candidate[];
  onBackToBooth: () => void;
}

const ORG_LIST: Array<{
  key: Organization;
  title: string;
  emoji: string;
  barGradient: string;
  accentText: string;
}> = [
  {
    key: 'OSIS',
    title: 'Hasil Pemilihan OSIS',
    emoji: '🎓',
    barGradient: 'from-blue-600 to-cyan-400',
    accentText: 'text-blue-400',
  },
  {
    key: 'PRAMUKA',
    title: 'Hasil Pemilihan Pramuka',
    emoji: '⚜️',
    barGradient: 'from-amber-600 to-yellow-400',
    accentText: 'text-amber-400',
  },
  {
    key: 'PMR',
    title: 'Hasil Pemilihan PMR',
    emoji: '🩺',
    barGradient: 'from-rose-600 to-pink-400',
    accentText: 'text-rose-400',
  },
];

/**
 * Halaman Hasil Pemilihan untuk publik.
 * Hanya aktif jika pemilihan sudah ditutup oleh panitia ATAU toggle "Tampilkan hasil ke publik" aktif.
 */
export const PublicResultsView: React.FC<PublicResultsViewProps> = ({
  settings,
  candidates,
  onBackToBooth,
}) => {
  const [votes, setVotes] = useState<VoteBallot[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const canView = !settings.isElectionOpen || settings.showPublicResults;

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setPermissionDenied(false);

    const votesQuery = query(
      collection(db, 'votes'),
      where('electionScope', '==', 'smpn1tambak')
    );
    const unsubscribe = onSnapshot(
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
        setLoading(false);
      },
      (err) => {
        console.warn('Akses hasil publik dibatasi:', err.message);
        setPermissionDenied(true);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [canView]);

  const talliesByOrg = useMemo(() => {
    const counts: Record<string, number> = {};
    votes.forEach((v) => {
      counts[v.osisCandidateId] = (counts[v.osisCandidateId] || 0) + 1;
      counts[v.pramukaCandidateId] = (counts[v.pramukaCandidateId] || 0) + 1;
      counts[v.pmrCandidateId] = (counts[v.pmrCandidateId] || 0) + 1;
    });

    return ORG_LIST.map((org) => {
      const orgCandidates = candidates
        .filter((c) => c.org === org.key)
        .sort((a, b) => a.number - b.number);
      const totalOrgVotes = votes.length;

      return {
        ...org,
        totalVotes: totalOrgVotes,
        rows: orgCandidates.map((c) => {
          const count = counts[c.id] || 0;
          const pct = totalOrgVotes > 0 ? (count / totalOrgVotes) * 100 : 0;
          return { candidate: c, count, pct };
        }),
      };
    });
  }, [votes, candidates]);

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-[#0f172a]/95 sticky top-0 z-20 backdrop-blur-md">
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
                Rekapitulasi Hasil Pemilihan
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToBooth}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1e293b] hover:bg-slate-700 border border-slate-700 text-sm font-semibold text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Bilik</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!canView || permissionDenied ? (
          <div className="max-w-lg mx-auto bg-[#1e293b] border border-slate-700 rounded-2xl p-8 text-center mt-12">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">
              Hasil Pemilihan Masih Dirahasiakan
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              Quick count hanya dapat dipantau oleh panitia selama pemungutan suara berlangsung.
              Hasil resmi akan tampil untuk publik setelah pemilihan ditutup oleh panitia.
            </p>
            <button
              type="button"
              onClick={onBackToBooth}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold cursor-pointer"
            >
              Kembali ke Bilik Suara
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="rounded-2xl bg-gradient-to-r from-[#16a34a] to-[#0d9488] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  Hasil Pemilihan Ketua &amp; Wakil
                </h1>
                <p className="text-emerald-50/90 text-sm mt-1">
                  OSIS, Pramuka, dan PMR · {settings.schoolName}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-5 py-3 text-right">
                <div className="text-xs text-emerald-50/80">Total Suara Masuk</div>
                <div className="text-2xl font-extrabold text-white">
                  <AnimatedNumber value={votes.length} suffix=" Suara" />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-64 rounded-2xl bg-[#1e293b] border border-slate-700 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {talliesByOrg.map((org) => (
                  <section
                    key={org.key}
                    className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span>{org.emoji}</span>
                        <span>{org.key}</span>
                      </h2>
                      <span className={`text-xs font-semibold ${org.accentText} font-mono-num`}>
                        {org.totalVotes} suara
                      </span>
                    </div>

                    <div className="space-y-4">
                      {org.rows.map(({ candidate, count, pct }) => (
                        <div key={candidate.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="font-semibold text-white truncate">
                              <span className="font-mono-num text-slate-400 mr-1.5">
                                #{candidate.number}
                              </span>
                              {candidate.ketuaName} &amp; {candidate.wakilName}
                            </div>
                            <div className="font-mono-num text-xs font-bold text-slate-200 shrink-0">
                              <AnimatedNumber value={count} /> ({pct.toFixed(1)}%)
                            </div>
                          </div>
                          <div className="h-3 rounded-full bg-[#0f172a] overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${org.barGradient} transition-all duration-500`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
