/**
 * This script iterates through all mock tournament data and attempts to fetch
 * real logos and names from the application's API.
 * 
 * Usage: 
 * 1. Start your dev server: npm run dev
 * 2. Run this script: npx ts-node --esm scripts/sync-logos.ts
 */

import fs from 'fs';
import path from 'path';

const TOURNAMENTS_DIR = './src/lib/data/tournaments';
const API_BASE = 'http://localhost:3000/api/tournaments';

async function syncFile(filename: string) {
    const filePath = path.join(TOURNAMENTS_DIR, filename);
    if (!fs.statSync(filePath).isFile() || filename === 'index.ts') return;

    console.log(`\nSyncing ${filename}...`);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Simple regex to find tournament objects
    // This is a bit fragile but works for the current structure
    const tournamentRegex = /\{ id: '([^']+)', name: '([^']+)', url: '([^']+)'/g;
    let match;
    let newContent = content;

    while ((match = tournamentRegex.exec(content)) !== null) {
        const [fullMatch, id, name, url] = match;

        try {
            console.log(`  Fetching data for: ${name} (${id})`);
            const res = await fetch(`${API_BASE}?url=${encodeURIComponent(url)}&id=${id}`);
            const data = await res.json();

            if (data.ok && data.details) {
                const realLogo = data.details.image_path || data.details.logo || data.details.logo_path;
                const realNameEs = data.details.name_es || data.details.name;

                if (realLogo || realNameEs) {
                    // Update the object in newContent
                    // Look for the end of the object
                    const startIndex = newContent.indexOf(fullMatch);
                    const endIndex = newContent.indexOf('}', startIndex);
                    const objectStr = newContent.substring(startIndex, endIndex + 1);

                    let updatedObject = objectStr;

                    if (realLogo && !objectStr.includes('logoUrl')) {
                        updatedObject = updatedObject.replace(' }', `, logoUrl: '${realLogo}' }`);
                    }
                    if (realNameEs && !objectStr.includes('nameEs') && realNameEs !== name) {
                        updatedObject = updatedObject.replace(' }', `, nameEs: '${realNameEs}' }`);
                    }

                    if (updatedObject !== objectStr) {
                        newContent = newContent.replace(objectStr, updatedObject);
                        console.log(`    ✅ Updated logo and/or nameEs`);
                    }
                }
            }
        } catch (err: any) {
            console.error(`    ❌ Error fetching ${id}:`, err?.message || 'Unknown error');
        }
    }

    fs.writeFileSync(filePath, newContent);
}

async function main() {
    console.log('Starting Tournament Data Sync...');
    const files = fs.readdirSync(TOURNAMENTS_DIR);

    for (const file of files) {
        await syncFile(file);
    }

    console.log('\nSync Complete!');
}

main().catch(console.error);
