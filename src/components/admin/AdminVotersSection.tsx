import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Voter, VoterCategory } from '../../types';
import {
  exportVotersToCsv,
  parseVotersCsv,
  sanitizeVoterId,
} from '../../utils/driveImage';

interface AdminVotersSectionProps {
  voters: Voter[];
  onlyNotVoted?: boolean;
}

/**
 * Mengelola daftar pemilih (Siswa, Guru, Karyawan) serta daftar warga yang belum memilih.
 * Mendukung filter kategori/kelas, pencarian, ekspor CSV, tambah/ubah manual, dan impor CSV anti-duplikat.
 */
export const AdminVotersSection: React.FC<AdminVotersSectionProps> = ({
  voters,
  onlyNotVoted = false,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | VoterCategory>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Tambah/Ubah Pemilih Manual
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVoter, setEditingVoter] = useState<Voter | null>(null);
  const [voterNumber, setVoterNumber] = useState('');
  const [name, setName] = useState('');
  const [classOrRole, setClassOrRole] = useState('');
  const [category, setCategory] = useState<VoterCategory>('siswa');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal Impor CSV
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{
    added: number;
    errors: string[];
  } | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const baseList = useMemo(() => {
    return onlyNotVoted ? voters.filter((v) => !v.hasVoted) : voters;
  }, [voters, onlyNotVoted]);

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    baseList.forEach((v) => {
      if (categoryFilter === 'all' || v.category === categoryFilter) {
        if (v.classOrRole) set.add(v.classOrRole);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [baseList, categoryFilter]);

  const filteredVoters = useMemo(() => {
    return baseList
      .filter((v) => (categoryFilter === 'all' ? true : v.category === categoryFilter))
      .filter((v) => (classFilter === 'all' ? true : v.classOrRole === classFilter))
      .filter((v) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.voterNumber.toLowerCase().includes(q) ||
          v.classOrRole.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.classOrRole.localeCompare(b.classOrRole) || a.name.localeCompare(b.name));
  }, [baseList, categoryFilter, classFilter, searchQuery]);

  const openAddModal = () => {
    setEditingVoter(null);
    setVoterNumber('');
    setName('');
    setClassOrRole('');
    setCategory('siswa');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (v: Voter) => {
    setEditingVoter(v);
    setVoterNumber(v.voterNumber);
    setName(v.name);
    setClassOrRole(v.classOrRole);
    setCategory(v.category);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSaveVoter = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const sanitizedId = sanitizeVoterId(voterNumber);
    if (!sanitizedId || !name.trim() || !classOrRole.trim()) {
      setFormError('NISN/NIP/NIK, nama lengkap, dan kelas/jabatan wajib diisi.');
      return;
    }

    // Tolak duplikat nomor identitas saat menambah pemilih baru
    if (!editingVoter && voters.some((v) => v.id === sanitizedId)) {
      setFormError(`Nomor "${sanitizedId}" sudah terdaftar di database. Duplikat ditolak.`);
      return;
    }

    setSaving(true);
    try {
      if (editingVoter) {
        await updateDoc(doc(db, 'voters', editingVoter.id), {
          name: name.trim().slice(0, 120),
          classOrRole: classOrRole.trim().slice(0, 80),
          category,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'voters', sanitizedId), {
          voterNumber: sanitizedId,
          name: name.trim().slice(0, 120),
          classOrRole: classOrRole.trim().slice(0, 80),
          category,
          hasVoted: false,
          votedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'voters');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVoter = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'voters', id));
      setConfirmDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `voters/${id}`);
    }
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result || ''));
      setImportFeedback(null);
    };
    reader.readAsText(file);
  };

  const handleRunCsvImport = async () => {
    const existingIds = new Set(voters.map((v) => v.id));
    const { validRows, errors } = parseVotersCsv(csvText, existingIds);

    if (validRows.length === 0) {
      setImportFeedback({
        added: 0,
        errors: errors.length > 0 ? errors : ['Tidak ada baris CSV valid yang dapat diimpor.'],
      });
      return;
    }

    setImporting(true);
    try {
      for (let i = 0; i < validRows.length; i += 400) {
        const batch = writeBatch(db);
        validRows.slice(i, i + 400).forEach((row) => {
          batch.set(doc(db, 'voters', row.voterNumber), {
            voterNumber: row.voterNumber,
            name: row.name,
            classOrRole: row.classOrRole,
            category: row.category,
            hasVoted: false,
            votedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }

      setImportFeedback({ added: validRows.length, errors });
      if (errors.length === 0) {
        setCsvText('');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'voters/importCsv');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar Filter, Pencarian, dan Aksi */}
      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'siswa', 'guru', 'karyawan'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategoryFilter(cat);
                  setClassFilter('all');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#0f172a] border border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Semua Kategori' : cat}
              </button>
            ))}

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              aria-label="Filter kelas atau jabatan"
              className="px-3 py-2 rounded-xl bg-[#0f172a] border border-slate-700 text-xs font-semibold text-slate-200 outline-none"
            >
              <option value="all">Semua Kelas / Jabatan</option>
              {classOptions.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportVotersToCsv(
                  filteredVoters,
                  `${onlyNotVoted ? 'belum-memilih' : 'data-pemilih'}-smpn1-tambak.csv`
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor CSV ({filteredVoters.length})</span>
            </button>

            {!onlyNotVoted && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setImportFeedback(null);
                    setIsImportOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Impor CSV</span>
                </button>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Pemilih</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan NISN / NIP / NIK, nama lengkap, atau kelas/jabatan..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 focus:border-blue-500 text-sm text-white outline-none"
          />
        </div>
      </div>

      {/* Tabel Data Pemilih */}
      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl overflow-hidden">
        {filteredVoters.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {onlyNotVoted
              ? 'Semua pemilih pada filter ini sudah menggunakan hak suaranya.'
              : 'Tidak ada data pemilih yang cocok dengan pencarian.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f172a] text-xs uppercase text-slate-400 border-b border-slate-700/80">
                <tr>
                  <th className="px-5 py-3.5">NISN / NIP / NIK</th>
                  <th className="px-5 py-3.5">Nama Lengkap</th>
                  <th className="px-5 py-3.5">Kelas / Jabatan</th>
                  <th className="px-5 py-3.5">Kategori</th>
                  <th className="px-5 py-3.5">Status</th>
                  {!onlyNotVoted && <th className="px-5 py-3.5 text-right">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredVoters.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-mono-num text-slate-300">{v.voterNumber}</td>
                    <td className="px-5 py-3 font-semibold text-white">{v.name}</td>
                    <td className="px-5 py-3 text-slate-300">{v.classOrRole}</td>
                    <td className="px-5 py-3 capitalize text-slate-300">{v.category}</td>
                    <td className="px-5 py-3">
                      {v.hasVoted ? (
                        <span className="text-xs font-bold text-emerald-400">
                          ✓ Sudah Memilih
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-400">
                          • Belum Memilih
                        </span>
                      )}
                    </td>
                    {!onlyNotVoted && (
                      <td className="px-5 py-3 text-right">
                        {confirmDeleteId === v.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteVoter(v.id)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer"
                            >
                              Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1 rounded-lg bg-slate-700 text-slate-200 text-xs cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditModal(v)}
                              className="p-2 rounded-lg bg-[#0f172a] hover:bg-slate-700 text-slate-300 cursor-pointer"
                              aria-label={`Ubah ${v.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(v.id)}
                              className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 cursor-pointer"
                              aria-label={`Hapus ${v.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah / Ubah Pemilih Manual */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {editingVoter ? 'Ubah Data Pemilih' : 'Tambah Pemilih Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVoter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  NISN / NIP / NIK
                </label>
                <input
                  type="text"
                  disabled={Boolean(editingVoter)}
                  value={voterNumber}
                  onChange={(e) => setVoterNumber(e.target.value)}
                  placeholder="Contoh: 0091234506"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 disabled:opacity-60 text-white font-mono-num text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Rizky Ramadhan"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as VoterCategory)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none"
                  >
                    <option value="siswa">Siswa</option>
                    <option value="guru">Guru</option>
                    <option value="karyawan">Karyawan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Kelas / Jabatan
                  </label>
                  <input
                    type="text"
                    value={classOrRole}
                    onChange={(e) => setClassOrRole(e.target.value)}
                    placeholder="Contoh: 9A / Guru IPA"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor CSV Pemilih */}
      {isImportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Impor Data Pemilih (CSV)</h2>
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#0f172a] border border-slate-700/80 p-4 text-xs text-slate-300 space-y-1.5">
              <div className="font-bold text-white">Format Kolom CSV (urut dari kiri ke kanan):</div>
              <code className="block text-emerald-400">
                NISN/NIP/NIK, Nama Lengkap, Kelas/Jabatan, Kategori (siswa/guru/karyawan)
              </code>
              <div className="text-slate-400">
                Contoh: <code className="text-slate-200">0098877661, Andi Pratama, 7B, siswa</code>.
                Nomor identitas yang duplikat otomatis ditolak.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Pilih File .CSV (Opsional)
              </label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileUpload}
                className="block w-full text-xs text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Atau Tempel Isi CSV Langsung
              </label>
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'NISN,Nama,Kelas,Kategori\n0098877661,Andi Pratama,7B,siswa\n198001012005011002,Siti Aminah,Guru Matematika,guru'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white font-mono-num text-xs outline-none focus:border-blue-500"
              />
            </div>

            {importFeedback && (
              <div className="space-y-2">
                {importFeedback.added > 0 && (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-3 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Berhasil mengimpor {importFeedback.added} pemilih baru.</span>
                  </div>
                )}
                {importFeedback.errors.length > 0 && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200 space-y-1 max-h-36 overflow-y-auto">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Baris yang ditolak / duplikat ({importFeedback.errors.length}):</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {importFeedback.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={importing || !csvText.trim()}
                onClick={handleRunCsvImport}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
              >
                {importing ? 'Mengimpor...' : 'Proses Impor CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
