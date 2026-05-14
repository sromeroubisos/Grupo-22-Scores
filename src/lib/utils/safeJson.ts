/**
 * Helpers for safely parsing JSON bodies in Next.js Route Handlers.
 *
 * Many API routes call `await request.json()` directly. If the client sends
 * malformed JSON (or no body at all on a method that expects one), the
 * uncaught SyntaxError bubbles up as a generic 500 with no useful context.
 *
 * Use these helpers so the route can return a clean 400 instead.
 */

import { NextResponse } from 'next/server';

/**
 * Returns the parsed JSON body, or `null` if it can't be parsed.
 * Never throws.
 */
export async function safeJson<T = unknown>(request: Request): Promise<T | null> {
    try {
        return (await request.json()) as T;
    } catch {
        return null;
    }
}

/**
 * Like {@link safeJson}, but returns a discriminated result so callers can
 * tell the difference between "valid empty body" and "parse error".
 */
export async function safeJsonResult<T = unknown>(
    request: Request,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    try {
        const data = (await request.json()) as T;
        return { ok: true, data };
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid JSON body',
        };
    }
}

/**
 * One-shot helper that either returns the parsed body or a 400 NextResponse
 * ready to be returned from a Route Handler:
 *
 * ```ts
 * export async function POST(req: Request) {
 *     const body = await readJsonOr400<MyShape>(req);
 *     if (body instanceof NextResponse) return body;
 *     // ...use body
 * }
 * ```
 */
export async function readJsonOr400<T = unknown>(
    request: Request,
): Promise<T | NextResponse> {
    const result = await safeJsonResult<T>(request);
    if (result.ok === true) return result.data;
    const errorMessage = (result as { error: string }).error;
    return NextResponse.json(
        { error: 'Invalid JSON body', details: errorMessage },
        { status: 400 },
    );
}
