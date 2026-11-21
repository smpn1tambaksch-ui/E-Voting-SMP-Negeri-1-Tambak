/**
 * Definisi tipe data utama untuk aplikasi E-Voting SMP Negeri 1 Tambak.
 * Struktur ini disinkronkan dengan schema di firebase-blueprint.json.
 */

export type Organization = 'OSIS' | 'PRAMUKA' | 'PMR';

export type VoterCategory = 'siswa' | 'guru' | 'karyawan';

export type PanitiaRole = 'admin' | 'panitia';

export interface PanitiaUser {
  id: string; // Sama dengan Firebase Auth UID
  email: string;
  name: string;
  role: PanitiaRole;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ElectionSettings {
  schoolName: string;
  schoolLogoUrl: string;
  isElectionOpen: boolean;
  voteTimeoutSeconds: number;
  resetAfterSubmitSeconds: number;
  officerMode: boolean;
  showPublicResults: boolean;
  announcement: string;
  updatedAt?: unknown;
}

export interface Candidate {
  id: string;
  org: Organization;
  number: number;
  ketuaName: string;
  wakilName: string;
  photoUrl: string;
  vision: string;
  mission: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Voter {
  id: string; // Sama dengan voterNumber (NISN/NIP/NIK)
  voterNumber: string;
  name: string;
  classOrRole: string;
  category: VoterCategory;
  hasVoted: boolean;
  votedAt: unknown | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VoteBallot {
  id: string;
  electionScope?: string;
  osisCandidateId: string;
  pramukaCandidateId: string;
  pmrCandidateId: string;
  createdAt?: unknown;
}

export type AppView = 'booth' | 'results' | 'admin';

export type AdminMenuTab =
  | 'beranda'
  | 'quick-count'
  | 'belum-memilih'
  | 'paslon'
  | 'pemilih'
  | 'kelola-panitia'
  | 'pengaturan';

export const DEFAULT_SETTINGS: ElectionSettings = {
  schoolName: 'SMP Negeri 1 Tambak',
  schoolLogoUrl: '',
  isElectionOpen: false,
  voteTimeoutSeconds: 90,
  resetAfterSubmitSeconds: 3,
  officerMode: false,
  showPublicResults: false,
  announcement: 'Gunakan hak suara Anda secara jujur, rahasia, dan bertanggung jawab.',
};
