import React, { useEffect, useState } from 'react';
import { convertDriveUrl, getInitials } from '../utils/driveImage';

interface DriveImageProps {
  url: string;
  alt: string;
  fallbackText: string;
  variant?: 'portrait' | 'logo';
  className?: string;
  accentClass?: string;
  onStatusChange?: (status: 'empty' | 'loaded' | 'error') => void;
}

/**
 * Komponen gambar tangguh untuk foto paslon (rasio seragam 3:4, loading="lazy")
 * dan logo sekolah yang dikonversi otomatis dari link Google Drive.
 */
export const DriveImage: React.FC<DriveImageProps> = ({
  url,
  alt,
  fallbackText,
  variant = 'portrait',
  className = '',
  accentClass = 'from-slate-800 via-slate-800 to-slate-900',
  onStatusChange,
}) => {
  const resolvedUrl = convertDriveUrl(url);
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    resolvedUrl ? 'loading' : 'error'
  );

  useEffect(() => {
    if (!resolvedUrl) {
      setImgState('error');
      onStatusChange?.('empty');
    } else {
      setImgState('loading');
    }
  }, [resolvedUrl, onStatusChange]);

  const handleLoad = () => {
    setImgState('loaded');
    onStatusChange?.('loaded');
  };

  const handleError = () => {
    setImgState('error');
    onStatusChange?.('error');
  };

  if (!resolvedUrl || imgState === 'error') {
    if (variant === 'logo') {
      return null;
    }

    // Placeholder siluet & inisial untuk foto paslon 3:4
    const initials = getInitials(fallbackText);
    return (
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-gradient-to-br ${accentClass} border border-slate-700/70 flex flex-col items-center justify-center select-none ${className}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          className="w-20 h-20 text-slate-500/35 mb-2"
          fill="currentColor"
        >
          <circle cx="44" cy="40" r="16" />
          <path d="M18 92c0-15 12-26 26-26s26 11 26 26H18z" />
          <circle cx="80" cy="44" r="13" opacity="0.75" />
          <path d="M60 92c2-12 11-21 22-21 12 0 21 9 21 21H60z" opacity="0.75" />
        </svg>
        <span className="text-xl font-bold tracking-wider text-slate-300/80">
          {initials}
        </span>
      </div>
    );
  }

  if (variant === 'logo') {
    return (
      <img
        src={resolvedUrl}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        className={`object-contain ${className}`}
      />
    );
  }

  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-slate-900 ${className}`}>
      <img
        src={resolvedUrl}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        className="w-full h-full object-cover object-top transition-transform duration-300"
      />
    </div>
  );
};
