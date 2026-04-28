import type { ReactNode } from 'react';
import '../club-admin/styles/club-admin-design-system.css';

interface ClubAdminLayoutProps {
  children: ReactNode;
}

export default function ClubAdminLayout({ children }: ClubAdminLayoutProps) {
  return (
    <div data-club-admin="true" className="club-admin-scope">
      {children}
    </div>
  );
}
