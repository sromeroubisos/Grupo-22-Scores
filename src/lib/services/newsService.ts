import type { Database } from '@/lib/database.types';

export type NewsItem = Database['public']['Tables']['news']['Row'];
export type NewsInsert = Database['public']['Tables']['news']['Insert'];
export type NewsUpdate = Database['public']['Tables']['news']['Update'];

async function getErrorMessage(response: Response, fallback: string) {
    try {
        const data = await response.json();
        if (typeof data?.error === 'string' && data.error.trim()) {
            return data.error;
        }
        if (data?.error && typeof data.error === 'object') {
            const values = [data.error.message, data.error.details, data.error.hint]
                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
            if (values.length > 0) {
                return values.join(' | ');
            }
        }
    } catch {
        // Ignore JSON parsing errors and fall back to text/status.
    }

    const text = await response.text().catch(() => '');
    return text || fallback;
}

export const newsService = {
    async getAll() {
        const response = await fetch('/api/news');
        if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch news'));
        const data = await response.json();
        return data.data as NewsItem[];
    },

    async getById(id: string) {
        const response = await fetch(`/api/news?id=${id}`);
        if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to fetch news item'));
        const data = await response.json();
        return Array.isArray(data.data) ? data.data[0] : data.data;
    },

    async create(news: NewsInsert) {
        const response = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(news),
        });
        if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create news'));
        return response.json();
    },

    async update(id: string, news: NewsUpdate) {
        const response = await fetch('/api/news', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...news, id }),
        });
        if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to update news'));
        return response.json();
    },

    async delete(id: string) {
        const response = await fetch(`/api/news?id=${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete news'));
        return response.json();
    },

    async uploadImage(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            console.log('Starting image upload to /api/upload...');
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Upload failed: Status ${response.status}`, errorText);
                throw new Error(`Failed to upload image. Server said: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            return data.url as string;
        } catch (error) {
            console.error('newsService.uploadImage encountered an error:', error);
            throw error;
        }
    }
};
