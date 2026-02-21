import Link from 'next/link';
import { RelatedItem } from '@/lib/services/relatedResolver';
import { RelatedRow } from './RelatedRow';

interface RelatedListProps {
    items: RelatedItem[];
}

const getIcon = (type: string) => {
    switch (type) {
        case 'match': return '⚽';
        case 'club': return '🏉';
        case 'player': return '👤';
        case 'tournament': return '🏆';
        default: return '📄';
    }
};

export function RelatedList({ items }: RelatedListProps) {
    if (!items || items.length === 0) return null;

    return (
        <ul className="divide-y divide-divider border border-divider rounded-lg overflow-hidden bg-background">
            {items.map((item) => (
                <li key={item.id}>
                    <RelatedRow item={item} getIcon={getIcon} />
                </li>
            ))}
        </ul>
    );
}
