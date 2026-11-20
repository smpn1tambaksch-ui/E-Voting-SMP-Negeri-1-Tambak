/**
 * Utilitas konversi link Google Drive menjadi URL thumbnail gambar,
 * pembuat inisial placeholder, serta parser/eksporter CSV data pemilih.
 */

import { Voter, VoterCategory } from '../types';

/**
 * Mengekstrak FILE_ID dari berbagai format URL Google Drive:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID&export=view
 * - https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000
 */
export function extractDriveFileId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Format /file/d/FILE_ID/...
  const filePathMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (filePathMatch && filePathMatch[1]) {
    return filePathMatch[1];
  }

  // Format ?id=FILE_ID atau &id=FILE_ID (termasuk /open?id= dan /uc?id=)
  const queryIdMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryIdMatch && queryIdMatch[1]) {
    return queryIdMatch[1];
  }

  return null;
}

/**
 * Mengubah link Google Drive menjadi URL thumbnail beresolusi tinggi (w1000)
 * agar dapat dirender pada tag <img> tanpa blokir CORS/redirect.
 */
export function convertDriveUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const fileId = extractDriveFileId(trimmed);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  // Jika pengguna menempel link gambar langsung non-Drive yang valid
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  return null;
}

/**
 * Menghasilkan maksimal 2 huruf inisial dari nama untuk placeholder foto.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'PS';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Membersihkan nomor identitas agar aman sebagai document ID Firestore
 * (hanya huruf, angka, garis bawah, atau tanda hubung).
 */
export function sanitizeVoterId(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

export interface ParsedCsvResult {
  validRows: Array<{
    voterNumber: string;
    name: string;
    classOrRole: string;
    category: VoterCategory;
  }>;
  errors: string[];
}

/**
 * Mem-parsing isi teks CSV pemilih dengan kolom:
 * NISN/NIP/NIK, Nama, Kelas/Jabatan, Kategori (siswa/guru/karyawan)
 * Menolak baris kosong, format salah, maupun duplikat nomor identitas.
 */
export function parseVotersCsv(
  csvText: string,
  existingIds: Set<string>
): ParsedCsvResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const validRows: ParsedCsvResult['validRows'] = [];
  const errors: string[] = [];
  const seenInCsv = new Set<string>();

  lines.forEach((line, index) => {
    // Mendukung pemisah koma (,) atau titik koma (;)
    const separator = line.includes(';') && !line.includes(',') ? ';' : ',';
    const cols = line.split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''));

    // Lewati baris header jika terdeteksi
    if (
      index === 0 &&
      (cols[0]?.toLowerCase().includes('nisn') ||
        cols[0]?.toLowerCase().includes('nip') ||
        cols[1]?.toLowerCase() === 'nama')
    ) {
      return;
    }

    if (cols.length < 4) {
      errors.push(`Baris ${index + 1}: kolom kurang dari 4 (harus NISN/NIP/NIK, Nama, Kelas/Jabatan, Kategori).`);
      return;
    }

    const rawId = cols[0];
    const voterNumber = sanitizeVoterId(rawId);
    const name = cols[1];
    const classOrRole = cols[2];
    const rawCat = cols[3].toLowerCase();

    if (!voterNumber) {
      errors.push(`Baris ${index + 1}: NISN/NIP/NIK tidak valid ("${rawId}").`);
      return;
    }

    if (!name || !classOrRole) {
      errors.push(`Baris ${index + 1}: Nama atau Kelas/Jabatan kosong.`);
      return;
    }

    if (rawCat !== 'siswa' && rawCat !== 'guru' && rawCat !== 'karyawan') {
      errors.push(`Baris ${index + 1}: Kategori "${cols[3]}" harus berupa siswa, guru, atau karyawan.`);
      return;
    }

    if (seenInCsv.has(voterNumber)) {
      errors.push(`Baris ${index + 1}: Duplikat di dalam CSV untuk nomor ${voterNumber}.`);
      return;
    }

    if (existingIds.has(voterNumber)) {
      errors.push(`Baris ${index + 1}: Nomor ${voterNumber} (${name}) sudah terdaftar di database (ditolak).`);
      return;
    }

    seenInCsv.add(voterNumber);
    validRows.push({
      voterNumber,
      name: name.slice(0, 120),
      classOrRole: classOrRole.slice(0, 80),
      category: rawCat,
    });
  });

  return { validRows, errors };
}

/**
 * Mengunduh daftar pemilih sebagai file CSV (UTF-8 BOM agar rapi di Excel).
 */
export function exportVotersToCsv(voters: Voter[], filename: string): void {
  const escapeCell = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const header = ['NISN/NIP/NIK', 'Nama', 'Kelas/Jabatan', 'Kategori', 'Status Memilih'];
  const rows = voters.map((v) => [
    escapeCell(v.voterNumber),
    escapeCell(v.name),
    escapeCell(v.classOrRole),
    escapeCell(v.category),
    escapeCell(v.hasVoted ? 'Sudah Memilih' : 'Belum Memilih'),
  ]);

  const csvContent =
    '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
