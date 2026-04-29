'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from './Button';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  footer,
  showCloseButton = true,
  closeOnOverlayClick = true,
  className,
}: ModalProps) {
  /* Lock body scroll when open */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  /* Close on Escape */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = size === 'sm' ? 'ca-modal--sm' : size === 'lg' ? 'ca-modal--lg' : '';

  return createPortal(
    <div
      className="ca-modal-backdrop"
      onClick={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-desc' : undefined}
    >
      <div className={cn('ca-modal', 'ca-modal--responsive', sizeClass, className)}>
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              {title && (
                <h2 id="modal-title" className="text-lg font-bold text-[var(--ca-text)]">
                  {title}
                </h2>
              )}
              {description && (
                <p id="modal-desc" className="mt-1 text-sm text-[var(--ca-text-secondary)]">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="flex-shrink-0"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        <div className="text-[var(--ca-text)]">{children}</div>
        {footer && (
          <div className="mt-6 pt-4 border-t border-[var(--ca-border)] flex items-center justify-end gap-3 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* Confirm Modal preset */
export interface ConfirmModalProps extends Omit<ModalProps, 'children' | 'footer'> {
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  confirmVariant?: 'primary' | 'danger';
  isConfirming?: boolean;
}

export function ConfirmModal({
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  confirmVariant = 'primary',
  isConfirming = false,
  onClose,
  ...modalProps
}: ConfirmModalProps) {
  return (
    <Modal
      {...modalProps}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            isLoading={isConfirming}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {modalProps.description ? (
        <p className="text-sm text-[var(--ca-text-secondary)]">{modalProps.description}</p>
      ) : null}
    </Modal>
  );
}
