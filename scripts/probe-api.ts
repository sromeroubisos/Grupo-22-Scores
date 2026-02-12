// scripts/probe-api.ts
import { writeFileSync } from "fs";

const API_KEY = '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131';
const API_HOST = 'flashscore4.p.rapidapi.com';

const URLS_TO_TEST = [
    '/rugby-union/europe/six-nations/',
    '/rugby-union/six-nations/',
    '/six-nations/'
];

async function main() {
    const results: any[] = [];
    console.log("Starting API Probe...");

    for (const testUrl of URLS_TO_TEST) {
        const endpoint = `https://${API_HOST}/api/flashscore/v2/tournaments/ids?tournament_url=${encodeURIComponent(testUrl)}`;
        const t0 = Date.now();

        try {
            console.log(`Testing: ${testUrl}`);
            const res = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'x-rapidapi-host': API_HOST,
                    'x-rapidapi-key': API_KEY
                }
            });

            const ms = Date.now() - t0;
            let body: any = null;
            const contentType = res.headers.get("content-type");

            if (contentType?.includes("application/json")) {
                body = await res.json();
            } else {
                body = await res.text();
            }

            results.push({
                testUrl,
                status: res.status,
                ok: res.ok,
                ms,
                response: body
            });
            console.log(`[${res.status}] ${testUrl} - ${ms}ms`);

        } catch (e) {
            console.error(`[ERROR] ${testUrl}`, e);
            results.push({ testUrl, error: String(e) });
        }
    }

    writeFileSync("api-probe-results.json", JSON.stringify(results, null, 2), "utf-8");
    console.log("Saved api-probe-results.json");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
