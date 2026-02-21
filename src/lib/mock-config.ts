export const isProd = process.env.NODE_ENV === 'production';
export const USE_MOCK_DATA = !isProd && process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
