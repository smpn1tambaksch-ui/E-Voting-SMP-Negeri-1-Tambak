import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Plus,
  ShieldCheck,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  getSecondaryAuth,
  handleFirestoreError,
  OperationType,
} from '../../firebase';
import { PanitiaRole, PanitiaUser } from '../../types';

interface AdminPanitiaSectionProps {
  currentUserId: string;
}

/**
 * Menu khusus peran 'admin': Kelola Akun Panitia.
 * - Melihat daftar akun panitia & admin di koleksi 'panitia'
 * - Menambah akun panitia baru (email + password) tanpa keluar dari sesi admin aktif
 * - Mengaktifkan / menonaktifkan akun panitia
 * - Mengirim email reset password melalui Firebase Authentication
 */
export const AdminPanitiaSection: React.FC<AdminPanitiaSectionProps> = ({
  currentUserId,
}) => {
  const [accounts, setAccounts] = useState<PanitiaUser[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<PanitiaRole>('panitia');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'panitia'),
      where('role', 'in', ['admin', 'panitia'])
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PanitiaUser[] = snap.docs.map((d) => ({
          id: d.id,
          email: d.data().email,
          name: d.data().name,
          role: d.data().role,
          active: Boolean(d.data().active),
          mustChangePassword: Boolean(d.data().mustChangePassword),
          createdAt: d.data().createdAt,
          updatedAt: d.data().updatedAt,
        }));
        list.sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
        setAccounts(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'panitia')
    );

    return () => unsub();
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !name.trim() || password.length < 6) {
      setFormError('Email, nama lengkap, dan password minimal 6 karakter wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        trimmedEmail,
        password
      );
      const newUid = cred.user.uid;
      await signOut(secondaryAuth);

      await setDoc(doc(db, 'panitia', newUid), {
        email: trimmedEmail,
        name: name.trim().slice(0, 120),
        role,
        active: true,
        mustChangePassword: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setIsAddOpen(false);
      setEmail('');
      setName('');
      setPassword('');
      setRole('panitia');
      setFeedback({
        type: 'success',
        message: `Akun ${trimmedEmail} (${role}) berhasil dibuat.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('email-already-in-use')) {
        setFormError('Alamat email tersebut sudah terdaftar di Firebase Authentication.');
      } else if (msg.includes('operation-not-allowed')) {
        setFormError('Provider Email/Password belum diaktifkan di Firebase Console.');
      } else {
        setFormError(`Gagal membuat akun panitia: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (target: PanitiaUser) => {
    if (target.id === currentUserId) {
      setFeedback({
        type: 'error',
        message: 'Anda tidak dapat menonaktifkan akun yang sedang digunakan.',
      });
      return;
    }

    try {
      await updateDoc(doc(db, 'panitia', target.id), {
        active: !target.active,
        updatedAt: serverTimestamp(),
      });
      setFeedback({
        type: 'success',
        message: `Akun ${target.email} telah ${target.active ? 'dinonaktifkan' : 'diaktifkan kembali'}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `panitia/${target.id}`);
    }
  };

  const handleResetPassword = async (target: PanitiaUser) => {
    try {
      await sendPasswordResetEmail(auth, target.email);
      await updateDoc(doc(db, 'panitia', target.id), {
        mustChangePassword: true,
        updatedAt: serverTimestamp(),
      });
      setFeedback({
        type: 'success',
        message: `Tautan reset password telah dikirim ke email ${target.email}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setFeedback({
        type: 'error',
        message: `Gagal mengirim email reset password ke ${target.email}: ${msg}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <span>Kelola Akun Panitia</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tambah akun panitia baru, nonaktifkan akses panitia, atau kirim tautan reset password.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setIsAddOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Akun Panitia</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-2xl p-4 text-xs sm:text-sm flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="bg-[#1e293b] border border-slate-700/80 rounded-2xl overflow-hidden">
        {accounts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Belum ada akun panitia terdaftar di koleksi <code className="text-slate-200">panitia</code>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f172a] text-xs uppercase text-slate-400 border-b border-slate-700/80">
                <tr>
                  <th className="px-5 py-3.5">Username / Email</th>
                  <th className="px-5 py-3.5">Nama</th>
                  <th className="px-5 py-3.5">Peran</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.map((acc) => {
                  const isSelf = acc.id === currentUserId;
                  return (
                    <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3 font-mono-num text-slate-200">
                        {acc.email}
                        {isSelf && (
                          <span className="ml-2 text-[11px] text-blue-400 font-sans font-semibold">
                            (Anda)
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-semibold text-white">{acc.name}</td>
                      <td className="px-5 py-3 uppercase text-xs font-bold text-indigo-300">
                        {acc.role}
                      </td>
                      <td className="px-5 py-3">
                        {acc.active ? (
                          <span className="text-xs font-bold text-emerald-400">
                            ● Aktif
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-rose-400">
                            ○ Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(acc)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0f172a] hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            <span>Reset Password</span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(acc)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                                acc.active
                                  ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300'
                                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                              }`}
                            >
                              {acc.active ? (
                                <>
                                  <UserMinus className="w-3.5 h-3.5" />
                                  <span>Nonaktifkan</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Aktifkan</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah Akun Panitia */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[#1e293b] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">Tambah Akun Panitia Baru</h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Username (Email)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="panitia1@spensata.sch.id"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
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
                  placeholder="Nama panitia"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password Awal (minimal 6 karakter)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Peran
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PanitiaRole)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0f172a] border border-slate-700 text-white text-sm outline-none"
                >
                  <option value="panitia">Panitia</option>
                  <option value="admin">Admin Penuh</option>
                </select>
              </div>

              {formError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3 text-xs text-rose-200">
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold cursor-pointer"
                >
                  {saving ? 'Membuat...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
