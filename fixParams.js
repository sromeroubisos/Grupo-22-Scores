const fs = require('fs');
const path = require('path');

function fixParams(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            fixParams(fullPath);
        } else if (fullPath.endsWith('route.ts')) {
            let config = fs.readFileSync(fullPath, 'utf8');

            // Fix: { params }: { params: { id: string } } -> { params }: { params: Promise<{ id: string }> }
            let updated = config.replace(
                /\{\s*params\s*\}\s*:\s*\{\s*params\s*:\s*\{([^}]+)\}\s*\}/g,
                '{ params }: { params: Promise<{$1}> }'
            );

            // We changed params to a Promise. So references to params.id become (await params).id
            // However, Next.js route parameters might be accessed as `params.id`
            // Let's replace ONLY `params.xxx` where `xxx` is usually id, phaseId, etc.
            updated = updated.replace(/params\.([a-zA-Z0-9_]+)/g, '(await params).$1');

            if (updated !== config) {
                fs.writeFileSync(fullPath, updated);
            }
        }
    });
}
fixParams('src/app/api');
