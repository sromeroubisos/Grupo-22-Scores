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

  const icon = type === 'success'
    ? <CheckCircle size={18} className="ca-toast__icon" />
    : type === 'error'
    ? <AlertCircle size={18} className="ca-toast__icon" />
    : <Info size={18} className="ca-toast__icon" />;

  return (
    <div className={`ca-toast ca-toast--${type}`} role="status" aria-live="polite">
      <span className="ca-toast__icon">{icon}</span>
      <span className="ca-toast__message">{message}</span>
    </div>
  );
}
