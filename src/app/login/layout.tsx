import type { ReactNode } from 'react'

import { unindexedMetadata } from '@/lib/seo/sectionMeta'

export const metadata = unindexedMetadata('Ingresar')

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default function LoginLayout({ children }: { children: ReactNode }) {
    return children
}
