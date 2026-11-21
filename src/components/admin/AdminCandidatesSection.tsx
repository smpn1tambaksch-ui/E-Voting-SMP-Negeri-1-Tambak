import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AlertTriangle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { Candidate, Organization } from '../../types';
import { DriveImage } from '../DriveImage';

interface AdminCandidatesSectionProps {
  candidates: Candidate[];
}

const ORG_TABS: Array<{ key: Organization; label: string; emoji: string }> = [
  { key: 'OSIS', label: 'OSIS', emoji: '🎓' },
  { key: 'PRAMUKA', label: 'Pramuka', emoji: '⚜️' },
  { key: 'PMR', label: 'PMR', emoji: '🩺' },
];

/**
 * Halaman Kelola Pasangan Calon (Tambah / Ubah / Hapus) untuk OSIS, Pramuka, dan PMR.
 * Dilengkapi pratinjau langsung foto Google Drive & pesan peringatan izin file Drive.
 */
export const AdminCandidatesSection: React.FC<AdminCandidatesSectionProps> = ({
  candidates,
}) => {
  const [activeOrg, setActiveOrg] = useState<Organization>('OSIS');
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // State form paslon
  const [org, setOrg] = useState<Organization>('OSIS');
  const [number, setNumber] = useState(1);
  const [ketuaName, setKetuaName] = useState('');
  const [wakilName, setWakilName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [vision, setVision] = useState('');
  const [mission, setMission] = useState('');
  const [imageStatus, setImageStatus] = useState<'empty' | 'loaded' | 'error'>('empty');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((c) => c.org === activeOrg)
      .sort((a, b) => a.number - b.number);
  }, [candidates, activeOrg]);

  const openAddModal = () => {
    setEditingCandidate(null);
    setOrg(activeOrg);
    const nextNum =
      filteredCandidates.length > 0
        ? Math.max(...filteredCandidates.map((c) => c.number)) + 1
        : 1;
    setNumber(nextNum);
    setKetuaName('');
    setWakilName('');
    setPhotoUrl('');
    setVision('');
    setMission('');
    setImageStatus('empty');
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (cand: Candidate) => {
    setEditingCandidate(cand);
    setOrg(cand.org);
    setNumber(cand.number);
    setKetuaName(cand.ketuaName);
    setWakilName(cand.wakilName);
    setPhotoUrl(cand.photoUrl);
    setVision(cand.vision);
    setMission(cand.mission);
    setImageStatus(cand.photoUrl.trim() ? 'loaded' : 'empty');
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!ketuaName.trim() || !wakilName.trim() || !vision.trim() || !mission.trim()) {
      setFormError('Nama ketua, nama wakil, visi, dan misi wajib diisi.');
      return;
    }

    if (number < 1 || number > 99) {
      setFormError('Nomor urut harus antara 1 sampai 99.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        org,
        number: Math.trunc(number),
        ketuaName: ketuaName.trim().slice(0, 100),
        wakilName: wakilName.trim().slice(0, 100),
        photoUrl: photoUrl.trim().slice(0, 500),
        vision: vision.trim().slice(0, 1000),
        mission: mission.trim().slice(0, 3000),
        updatedAt: serverTimestamp(),
      };

      if (editingCandidate) {
        await updateDoc(doc(db, 'candidates', editingCandidate.id), payload);
      } else {
        const newId = `${org.toLowerCase()}_${Date.now()}`;
        await setDoc(doc(db, 'candidates', newId), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      setIsFormOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'candidates');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'candidates', id));
      setConfirmDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `candidates/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {ORG_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveOrg(tab.key)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeOrg === tab.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-[#0f172a] border border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Paslon {activeOrg}</span>
        </button>
      </div>

      {filteredCandidates.length === 0 ? (
        <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-10 text-center text-slate-400">
          Belum ada pasangan calon untuk organisasi {activeOrg}. Klik tombol di atas untuk menambah.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCandidates.map((cand) => (
            <div
              key={cand.id}
              className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-5 flex flex-col gap-4"
            >
              <div className="relative">
                <DriveImage
                  url={cand.photoUrl}
                  alt={`${cand.ketuaName} & ${cand.wakilName}`}
                  fallbackText={`${cand.ketuaName} ${cand.wakilName}`}
                />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-xl bg-blue-600 text-white font-mono-num text-sm font-bold shadow-md">
                  No. {String(cand.number).padStart(2, '0')}
                </div>
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">
                  {cand.ketuaName} &amp; {cand.wakilName}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-3 leading-relaxed">
                  {cand.vision}
                </p>
              </div>

              {confirmDeleteId === cand.id ? (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3 space-y-2">
                  <div className="text-xs text-rose-200 font-semibold">
                    Hapus paslon nomor {cand.number}?
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(cand.id)}
                      className="flex-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                    >
                      Ya, Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/70">
                  <button
                    type="button"
                    onClick={() => openEditModal(cand)}
                    className="flex-1 py-2 rounded-xl bg-[#0f172a] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Ubah</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(cand.id)}
                    className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-center cursor-pointer"
                    aria-label="Hapus paslon"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Tambah / Ubah Paslon */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingCandidate ? 'Ubah Data Paslon' : 'Tambah Paslon Baru'}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Organisasi
                  </label>
                  <select
                    value={org}
                    onChange={(e) => setOrg(e.target.value as Organization)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none"
                  >
                    <option value="OSIS">OSIS</option>
                    <option value="PRAMUKA">Pramuka</option>
                    <option value="PMR">PMR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nomor Urut
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={number}
                    onChange={(e) => setNumber(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white font-mono-num text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nama Calon Ketua
                  </label>
                  <input
                    type="text"
                    value={ketuaName}
                    onChange={(e) => setKetuaName(e.target.value)}
                    placeholder="Contoh: Bagas Prasetyo"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nama Calon Wakil Ketua
                  </label>
                  <input
                    type="text"
                    value={wakilName}
                    onChange={(e) => setWakilName(e.target.value)}
                    placeholder="Contoh: Zahra Amelia"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Link Foto Google Drive + Pratinjau Langsung */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Link Foto Paslon (Google Drive)
                  </label>
                  <input
                    type="url"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-400">
                    Mendukung format <code className="text-slate-300">/file/d/ID/view</code> atau <code className="text-slate-300">?id=ID</code>. Link asli disimpan utuh di database.
                  </p>
                  {photoUrl.trim() !== '' && imageStatus === 'error' && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Foto gagal dimuat. Pastikan akses file Drive diatur{' '}
                        <strong>&quot;Siapa saja yang memiliki link&quot;</strong>.
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-1.5">
                    Pratinjau (3:4)
                  </div>
                  <div className="w-28">
                    <DriveImage
                      url={photoUrl}
                      alt="Pratinjau foto paslon"
                      fallbackText={`${ketuaName} ${wakilName}`}
                      onStatusChange={setImageStatus}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Visi
                </label>
                <textarea
                  rows={2}
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                  placeholder="Tuliskan visi pasangan calon..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Misi (tulis satu butir misi per baris)
                </label>
                <textarea
                  rows={4}
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                  placeholder={'Menghidupkan kembali ekstrakurikuler minat dan bakat siswa.\nMengadakan program Jumat Bersih dan Peduli Lingkungan.\nMembuka kotak aspirasi siswa secara berkala.'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Setiap baris otomatis ditampilkan sebagai daftar bernomor (1, 2, 3, ...) pada kartu surat suara.
                </p>
              </div>

              {formError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Paslon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
