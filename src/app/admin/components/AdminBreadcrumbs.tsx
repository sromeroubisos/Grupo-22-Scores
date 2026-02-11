import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface AdminBreadcrumbsProps {
    items: BreadcrumbItem[];
}

export default function AdminBreadcrumbs({ items }: AdminBreadcrumbsProps) {
    return (
        <nav className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] mb-6 select-none">
            {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                    {index > 0 && (
                        <ChevronRight className="w-3 h-3 text-[var(--muted2)] opacity-50" />
                    )}
                    {item.href ? (
                        <Link
                            href={item.href}
                            className="hover:text-white hover:underline decoration-[var(--accent)] underline-offset-4 transition-all duration-200"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-white">{item.label}</span>
                    )}
                </div>
            ))}
        </nav>
    );
}
