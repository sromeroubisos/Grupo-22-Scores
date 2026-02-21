'use client';

import Link from 'next/link';

interface PaginationProps {
    offset: number;
    limit: number;
    hasMore: boolean;
    baseUrl: URLSearchParams;
    pathname: string;
}

export function Pagination({ offset, limit, hasMore, baseUrl, pathname }: PaginationProps) {
    if (offset === 0 && !hasMore) return null;

    const prevOffset = Math.max(0, offset - limit);
    const nextOffset = offset + limit;

    const prevUrl = new URLSearchParams(baseUrl.toString());
    prevUrl.set('offset', prevOffset.toString());

    const nextUrl = new URLSearchParams(baseUrl.toString());
    nextUrl.set('offset', nextOffset.toString());

    return (
        <div className="flex items-center justify-between border-t border-divider pt-4 mt-6">
            <Link
                href={`${pathname}?${prevUrl.toString()}`}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${offset === 0
                        ? 'pointer-events-none opacity-50 bg-surface border border-divider text-system-secondary'
                        : 'bg-surface border border-divider hover:bg-surface-hover hover:text-foreground text-system-secondary'
                    }`}
            >
                Anterior
            </Link>

            <span className="text-sm text-system-secondary">
                Mostrando {offset + 1} - {hasMore ? offset + limit : offset + limit /* approximated */}
            </span>

            <Link
                href={`${pathname}?${nextUrl.toString()}`}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${!hasMore
                        ? 'pointer-events-none opacity-50 bg-surface border border-divider text-system-secondary'
                        : 'bg-surface border border-divider hover:bg-surface-hover hover:text-foreground text-system-secondary'
                    }`}
            >
                Siguiente
            </Link>
        </div>
    );
}
