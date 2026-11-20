/**
 * Data uji coba (dummy) untuk E-Voting SMP Negeri 1 Tambak:
 * - 5 Siswa
 * - 2 Guru
 * - 1 Karyawan
 * - 2 Paslon per organisasi (OSIS, Pramuka, PMR)
 */

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_SETTINGS, Organization, VoterCategory } from '../types';

interface DummyVoter {
  voterNumber: string;
  name: string;
  classOrRole: string;
  category: VoterCategory;
}

interface DummyCandidate {
  id: string;
  org: Organization;
  number: number;
  ketuaName: string;
  wakilName: string;
  photoUrl: string;
  vision: string;
  mission: string;
}

export const DUMMY_VOTERS: DummyVoter[] = [
  { voterNumber: '0091234501', name: 'Ahmad Fauzi Pratama', classOrRole: '9A', category: 'siswa' },
  { voterNumber: '0091234502', name: 'Siti Nur Aisyah', classOrRole: '9B', category: 'siswa' },
  { voterNumber: '0091234503', name: 'Dimas Aditya Saputra', classOrRole: '8A', category: 'siswa' },
  { voterNumber: '0091234504', name: 'Nabila Putri Rahmawati', classOrRole: '8B', category: 'siswa' },
  { voterNumber: '0091234505', name: 'Rizky Maulana Hakim', classOrRole: '7A', category: 'siswa' },
  { voterNumber: '198405122010011001', name: 'Budi Santoso, S.Pd.', classOrRole: 'Guru IPA', category: 'guru' },
  { voterNumber: '198811232015022002', name: 'Ratna Dewi Lestari, M.Pd.', classOrRole: 'Guru Bahasa Indonesia', category: 'guru' },
  { voterNumber: '199203152019031003', name: 'Hendro Wijaya', classOrRole: 'Staf Tata Usaha', category: 'karyawan' },
];

export const DUMMY_CANDIDATES: DummyCandidate[] = [
  {
    id: 'osis_1',
    org: 'OSIS',
    number: 1,
    ketuaName: 'Bagas Prasetyo',
    wakilName: 'Zahra Amelia',
    photoUrl: '',
    vision: 'Mewujudkan OSIS SMPN 1 Tambak yang aktif, kreatif, berakhlak mulia, dan berprestasi di era digital.',
    mission:
      '1. Menghidupkan kembali ekstrakurikuler minat dan bakat siswa.\n2. Mengadakan program Jumat Bersih dan Peduli Lingkungan.\n3. Membuka kotak aspirasi siswa secara berkala dan transparan.',
  },
  {
    id: 'osis_2',
    org: 'OSIS',
    number: 2,
    ketuaName: 'Farhan Ramadhan',
    wakilName: 'Keisha Maharani',
    photoUrl: '',
    vision: 'Menjadikan OSIS sebagai wadah kolaborasi siswa yang disiplin, inklusif, dan berdaya saing.',
    mission:
      '1. Menyelenggarakan pekan olahraga dan seni antar kelas.\n2. Meningkatkan literasi sekolah lewat pojok baca digital.\n3. Menggalakkan budaya 5S (Senyum, Sapa, Salam, Sopan, Santun).',
  },
  {
    id: 'pramuka_1',
    org: 'PRAMUKA',
    number: 1,
    ketuaName: 'Teguh Wibowo',
    wakilName: 'Intan Permatasari',
    photoUrl: '',
    vision: 'Membentuk Pramuka Penggalang SMPN 1 Tambak yang tangguh, mandiri, dan cinta alam.',
    mission:
      '1. Latihan rutin keterampilan kepramukaan yang menyenangkan.\n2. Mengadakan perkemahan bakti dan penanaman pohon.\n3. Membina regu inti untuk lomba tingkat kwartir ranting.',
  },
  {
    id: 'pramuka_2',
    org: 'PRAMUKA',
    number: 2,
    ketuaName: 'Arif Hidayatullah',
    wakilName: 'Melati Kusuma',
    photoUrl: '',
    vision: 'Pramuka berkarakter Dasa Darma, siap menolong sesama, dan unggul dalam prestasi.',
    mission:
      '1. Menguatkan kedisiplinan upacara dan baris-berbaris.\n2. Mengembangkan pioneering dan tali-temali kreatif.\n3. Menjalin kerja sama kegiatan sosial bersama masyarakat Tambak.',
  },
  {
    id: 'pmr_1',
    org: 'PMR',
    number: 1,
    ketuaName: 'Nadia Syifa Azzahra',
    wakilName: 'Fajar Nugroho',
    photoUrl: '',
    vision: 'Mewujudkan PMR Madya yang sigap, terampil dalam pertolongan pertama, dan berjiwa kemanusiaan.',
    mission:
      '1. Pelatihan P3K dan tandu darurat rutin setiap minggu.\n2. Menjaga kesiapsiagaan pos UKS saat upacara dan acara sekolah.\n3. Kampanye pola hidup bersih dan sehat untuk seluruh warga sekolah.',
  },
  {
    id: 'pmr_2',
    org: 'PMR',
    number: 2,
    ketuaName: 'Aulia Rahma Putri',
    wakilName: 'Ilham Saputra',
    photoUrl: '',
    vision: 'PMR SMPN 1 Tambak sebagai garda terdepan kepedulian kesehatan dan solidaritas siswa.',
    mission:
      '1. Mengadakan penyuluhan gizi seimbang dan kesehatan remaja.\n2. Menggalang aksi sosial tanggap bencana bersama PMI.\n3. Melengkapi dan merawat kotak P3K di setiap ruang kelas.',
  },
];

/**
 * Mengisi ulang seluruh data uji coba (menghapus suara, kandidat, dan pemilih lama,
 * lalu menuliskan 8 pemilih, 6 paslon, dan pengaturan default).
 */
export async function resetDummyData(preserveLogoAndOpen = false, currentLogo = '', currentOpen = false): Promise<void> {
  try {
    // 1. Hapus dokumen lama di koleksi votes, candidates, dan voters
    const [votesSnap, candSnap, votersSnap] = await Promise.all([
      getDocs(query(collection(db, 'votes'), where('electionScope', '==', 'smpn1tambak'))),
      getDocs(query(collection(db, 'candidates'), where('org', 'in', ['OSIS', 'PRAMUKA', 'PMR']))),
      getDocs(query(collection(db, 'voters'), where('category', 'in', ['siswa', 'guru', 'karyawan']))),
    ]);

    const refsToDelete = [
      ...votesSnap.docs.map((d) => d.ref),
      ...candSnap.docs.map((d) => d.ref),
      ...votersSnap.docs.map((d) => d.ref),
    ];

    // Batas Firestore batch = 500 operasi
    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    // 2. Tulis pengaturan, paslon uji coba, dan pemilih uji coba
    const seedBatch = writeBatch(db);

    seedBatch.set(doc(db, 'settings', 'election'), {
      ...DEFAULT_SETTINGS,
      schoolLogoUrl: preserveLogoAndOpen ? currentLogo : '',
      isElectionOpen: preserveLogoAndOpen ? currentOpen : false,
      updatedAt: serverTimestamp(),
    });

    for (const c of DUMMY_CANDIDATES) {
      seedBatch.set(doc(db, 'candidates', c.id), {
        org: c.org,
        number: c.number,
        ketuaName: c.ketuaName,
        wakilName: c.wakilName,
        photoUrl: c.photoUrl,
        vision: c.vision,
        mission: c.mission,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const v of DUMMY_VOTERS) {
      seedBatch.set(doc(db, 'voters', v.voterNumber), {
        voterNumber: v.voterNumber,
        name: v.name,
        classOrRole: v.classOrRole,
        category: v.category,
        hasVoted: false,
        votedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await seedBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'resetDummyData');
  }
}
