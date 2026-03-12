const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://vxsolicapdcpemfsahbk.supabase.co',
    'YOUR_SUPABASE_SERVICE_ROLE_KEY'
);

const sql = `
ALTER TABLE public.clubs 
ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

ALTER TABLE public.matches 
ADD COLUMN IF NOT EXISTS clock JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS round_label TEXT;

COMMENT ON COLUMN public.clubs.categories IS 'Array de etiquetas de categorías (ej: M19, Superior)';
COMMENT ON COLUMN public.matches.clock IS 'Estado del reloj en vivo (periodo, tiempo transcurrido)';
COMMENT ON COLUMN public.matches.notes IS 'Notas adicionales del partido';
COMMENT ON COLUMN public.matches.round_label IS 'Etiqueta manual de la jornada/ronda';

NOTIFY pgrst, 'reload schema';
`;

async function run() {
    console.log('Applying migration...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        if (error.message.includes('function "exec_sql" does not exist')) {
            console.error('ERROR: El helper "exec_sql" no está instalado en tu base de datos.');
            console.log('Debes ejecutar el SQL manualmente en el Dashboard de Supabase.');
        } else {
            console.error('Error ejecutando migración:', error);
        }
        process.exit(1);
    } else {
        console.log('✅ Migración aplicada exitosamente.');
        process.exit(0);
    }
}

run();
