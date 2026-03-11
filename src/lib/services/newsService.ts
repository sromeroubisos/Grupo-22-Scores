import type { Database } from '@/lib/database.types';

export type NewsItem = Database['public']['Tables']['news']['Row'];
export type NewsInsert = Database['public']['Tables']['news']['Insert'];
export type NewsUpdate = Database['public']['Tables']['news']['Update'];

export const newsService = {
    async getAll() {
        const response = await fetch('/api/news');
        if (!response.ok) throw new Error('Failed to fetch news');
        const data = await response.json();
        return data.data as NewsItem[];
    },

    async getById(id: string) {
        // We can fetch all and find, or use a specific single fetch if API supports it
        // The current API doesn't have a direct GET /api/news?id=XYZ but let's check
        const response = await fetch(`/api/news?id=${id}`);
        if (!response.ok) throw new Error('Failed to fetch news item');
        const data = await response.json();
        // The API returns an array even for single ID if not handled specifically,
        // let's assume it returns { data: NewsItem } or { data: NewsItem[] }
        return Array.isArray(data.data) ? data.data[0] : data.data;
    },

    async create(news: NewsInsert) {
        const response = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(news),
        });
        if (!response.ok) throw new Error('Failed to create news');
        return response.json();
    },

    async update(id: string, news: NewsUpdate) {
        const response = await fetch('/api/news', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...news, id }),
        });
        if (!response.ok) throw new Error('Failed to update news');
        return response.json();
    },

    async delete(id: string) {
        const response = await fetch(`/api/news?id=${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete news');
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
