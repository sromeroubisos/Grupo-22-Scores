


import { RelatedSectionData } from '@/lib/services/relatedResolver';
import { RelatedList } from './RelatedList';
import { Pagination } from './Pagination';

interface RelatedSectionProps {
    data: RelatedSectionData;
    baseUrl: URLSearchParams;
    pathname: string;
    offset: number;
    limit: number;
}

export function RelatedSection({ data, baseUrl, pathname, offset, limit }: RelatedSectionProps) {
    const { title, result } = data;
    const { items, nextOffset, totalApprox } = result;

    return (
        <section className="mb-8 last:mb-0 bg-surface rounded-xl border border-divider p-6 shadow-sm">
            <header className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-foreground capitalize tracking-tight">{title}</h3>
                {totalApprox !== undefined && (
                    <span className="bg-accent-blue/10 text-accent-blue px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap">
                        {totalApprox} total
                    </span>
                )}
            </header>

            {items.length > 0 ? (
                <>
                    <RelatedList items={items} />
                    {(offset > 0 || nextOffset !== undefined) && (
                        <Pagination
                            offset={offset}
                            limit={limit}
                            hasMore={nextOffset !== undefined}
                            baseUrl={baseUrl}
                            pathname={pathname}
                        />
                    )}
                </>
            ) : (
                <div className="py-12 border-2 border-dashed border-divider rounded-lg text-center flex flex-col justify-center items-center">
                    <svg className="h-10 w-10 text-system-secondary opacity-50 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <p className="text-sm font-medium text-foreground">No hay {title.toLowerCase()} disponibles</p>
                    <p className="text-xs text-system-secondary mt-1 max-w-sm">No se encontraron entidades relacionadas de este tipo vinculadas aquí.</p>
                </div>
            )}
        </section>
    );
}
