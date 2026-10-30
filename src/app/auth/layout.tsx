import type { ReactNode } from 'react'

import { unindexedMetadata } from '@/lib/seo/sectionMeta'

export const metadata = unindexedMetadata('Cuenta')

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default function AuthLayout({ children }: { children: ReactNode }) {
    return children
}
