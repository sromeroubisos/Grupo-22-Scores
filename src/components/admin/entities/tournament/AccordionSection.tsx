'use client';

import { useState, ReactNode } from 'react';

interface AccordionSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
}

export function AccordionSection({
  title,
  description,
  children,
  defaultOpen = false,
  storageKey
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen;
    if (storageKey) {
      const saved = localStorage.getItem(storageKey);
      return saved !== null ? saved === 'true' : defaultOpen;
    }
    return defaultOpen;
  });

  const toggleOpen = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (storageKey) {
      localStorage.setItem(storageKey, String(newState));
    }
  };

  return (
    <div className="accordion-section p-10 border border-[var(--border)] bg-[rgba(255,255,255,0.03)] rounded-xl my-10 shadow-xl shadow-black/10">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between cursor-pointer group"
      >
        <div className="flex-1 text-left">
          <h4 className="text-sm uppercase tracking-[0.2em] text-[#999] group-hover:text-white font-extrabold mb-2 transition-colors">
            {title}
          </h4>
          {description && (
            <p className="text-[13px] text-[#777] leading-relaxed mt-2">{description}</p>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-300 text-[#888] group-hover:text-white ${isOpen ? 'rotate-180' : ''
            }`}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      <div
        className={`accordion-content overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[5000px] opacity-100 mt-6' : 'max-h-0 opacity-0'
          }`}
      >
        {children}
      </div>
    </div>
  );
}
