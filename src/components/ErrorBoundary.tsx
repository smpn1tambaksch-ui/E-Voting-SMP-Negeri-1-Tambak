import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * ErrorBoundary untuk menangkap error runtime maupun error izin Firestore
 * agar aplikasi menampilkan pesan yang informatif dan dapat dipulihkan.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message || 'Terjadi kesalahan sistem.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary menangkap error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed && parsed.error) {
          friendlyMsg = `Operasi database (${parsed.operationType} pada ${parsed.path}) ditolak: ${parsed.error}`;
        }
      } catch {
        // Bukan JSON error Firestore, tampilkan pesan asli
      }

      return (
        <div className="min-h-screen bg-[#0f172a] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-[#1e293b] border border-slate-700 rounded-2xl p-8 shadow-2xl">
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="text-xl font-bold text-white mb-2">
              Terjadi Gangguan Sistem
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed mb-6 break-words">
              {friendlyMsg}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
