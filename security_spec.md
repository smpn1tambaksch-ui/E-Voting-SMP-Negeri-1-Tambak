# Spesifikasi Keamanan E-Voting SMP Negeri 1 Tambak

## 1. Invarian Data (Data Invariants)
1. **Kerahasiaan Suara**: Dokumen `/votes/{voteId}` TIDAK boleh memiliki field `voterId`, `voterNumber`, atau `name`. Hanya menyimpan `osisCandidateId`, `pramukaCandidateId`, `pmrCandidateId`, dan `createdAt`.
2. **Satu Pemilih Satu Suara**: Dokumen `/voters/{voterId}` yang sudah berstatus `hasVoted == true` tidak dapat diubah kembali oleh perangkat bilik suara (`allow update` menolak perubahan selain transisi `false -> true`).
3. **Pemilihan Harus Terbuka**: Bilik suara hanya boleh mencatat suara dan mengubah `hasVoted` ketika `/settings/election.isElectionOpen == true`.
4. **Integritas Paslon**: Setiap ID paslon pada `/votes/{voteId}` harus merujuk ke dokumen `/candidates/{id}` yang benar-benar ada dan sesuai organisasinya (`OSIS`, `PRAMUKA`, `PMR`).
5. **Isolasi Daftar Pemilih**: Bilik suara hanya boleh membaca satu pemilih berdasarkan ID persis (`get`), dilarang melakukan `list` seluruh pemilih kecuali admin terautentikasi.
6. **Kerahasiaan Quick Count**: Pembacaan koleksi `/votes` oleh publik ditolak selama pemilihan berlangsung kecuali `showPublicResults == true` atau `isElectionOpen == false`. Admin selalu dapat membaca `/votes` secara realtime.

## 2. The "Dirty Dozen" Payloads (12 Uji Penolakan)
1. **Shadow Field Injection on Vote**: Mengirim `{ osisCandidateId, pramukaCandidateId, pmrCandidateId, createdAt, voterId: "123" }` ke `/votes` -> `PERMISSION_DENIED`.
2. **Double Vote Replay**: Mengirim update `{ hasVoted: true, votedAt, updatedAt }` ke `/voters/1001` ketika `hasVoted` sudah `true` -> `PERMISSION_DENIED`.
3. **Vote Status Rollback**: Non-admin mengirim `{ hasVoted: false }` ke `/voters/1001` -> `PERMISSION_DENIED`.
4. **Voter Profile Tampering by Booth**: Non-admin mengubah `{ name: "Nama Palsu", hasVoted: true }` pada `/voters/1001` -> `PERMISSION_DENIED`.
5. **Voting While Election Closed**: Mengirim suara ke `/votes` saat `settings/election.isElectionOpen == false` -> `PERMISSION_DENIED`.
6. **Cross-Organization Candidate Spoof**: Memasukkan ID paslon PRAMUKA ke field `osisCandidateId` di `/votes` -> `PERMISSION_DENIED`.
7. **Orphan Candidate Reference**: Memasukkan `osisCandidateId: "nonexistent_id"` di `/votes` -> `PERMISSION_DENIED`.
8. **Spoofed Server Timestamp**: Mengirim `createdAt` manual di masa lalu pada `/votes` (bukan `request.time`) -> `PERMISSION_DENIED`.
9. **Unauthenticated Voter List Scraping**: Memanggil `getDocs(collection(db, 'voters'))` tanpa login admin -> `PERMISSION_DENIED`.
10. **Unauthenticated Settings Modification**: Non-admin mencoba mengubah `isElectionOpen: true` di `/settings/election` -> `PERMISSION_DENIED`.
11. **Privilege Escalation on Admins**: User biasa mencoba membuat dokumen di `/admins/{uid}` -> `PERMISSION_DENIED`.
12. **Resource Poisoning / Oversized ID**: Membuat dokumen atau memanggil `get` dengan ID > 128 karakter atau karakter ilegal di `/voters/{id}` -> `PERMISSION_DENIED`.
