import { type NextRequest } from 'next/server';
import { handleAuthCallback } from '@/lib/auth/callbackHandler';

export async function GET(request: NextRequest) {
    return handleAuthCallback(request);
}
