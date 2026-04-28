'use client';

import { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ClubAdminToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export function ClubAdminToast({ message, type = 'info', onClose, duration = 3500 }: ClubAdminToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  const icon = type === 'success' ? <CheckCircle size={18} /> : type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />;
  const className = `club-admin-toast ${type}`;

  return (
    <div className={className} role="status" aria-live="polite">
      <span className="club-admin-toast-icon">{icon}</span>
      <span className="club-admin-toast-message">{message}</span>
    </div>
  );
}
