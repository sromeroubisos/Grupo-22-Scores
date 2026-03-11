-- Crear tabla squad_members para gestión de planteles
-- Esta tabla relaciona jugadores (people) con divisiones/planteles (divisions)

CREATE TABLE IF NOT EXISTS squad_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relaciones
    division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,

    -- Información del jugador en el plantel
    position TEXT NOT NULL, -- Posición específica (ej: "Pilar Izquierdo", "Medioscrum")
    role TEXT DEFAULT 'suplente' CHECK (role IN ('titular', 'suplente', 'desarrollo')),
    jersey_number INTEGER CHECK (jersey_number >= 1 AND jersey_number <= 99),
    status TEXT DEFAULT 'disponible' CHECK (status IN ('disponible', 'lesionado', 'suspendido', 'convocado', 'baja')),

    -- Orden manual para organización
    "order" INTEGER DEFAULT 0,

    -- Notas técnicas del staff
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraint único: un jugador no puede estar dos veces en el mismo plantel
    UNIQUE(division_id, person_id)
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_squad_members_division ON squad_members(division_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_person ON squad_members(person_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_status ON squad_members(status);
CREATE INDEX IF NOT EXISTS idx_squad_members_role ON squad_members(role);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_squad_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER squad_members_updated_at
    BEFORE UPDATE ON squad_members
    FOR EACH ROW
    EXECUTE FUNCTION update_squad_members_updated_at();

-- RLS (Row Level Security) - Políticas de seguridad
ALTER TABLE squad_members ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública (opcional, ajustar según necesidades)
CREATE POLICY "Allow public read access on squad_members"
    ON squad_members
    FOR SELECT
    TO public
    USING (true);

-- Permitir inserción solo a usuarios autenticados
CREATE POLICY "Allow authenticated insert on squad_members"
    ON squad_members
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Permitir actualización solo a usuarios autenticados
CREATE POLICY "Allow authenticated update on squad_members"
    ON squad_members
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Permitir eliminación solo a usuarios autenticados
CREATE POLICY "Allow authenticated delete on squad_members"
    ON squad_members
    FOR DELETE
    TO authenticated
    USING (true);

-- Comentarios para documentación
COMMENT ON TABLE squad_members IS 'Relaciona jugadores (people) con planteles (divisions). Gestiona la composición de cada plantel con roles, dorsales y estados.';
COMMENT ON COLUMN squad_members.position IS 'Posición específica del jugador en el plantel';
COMMENT ON COLUMN squad_members.role IS 'Rol del jugador: titular, suplente, o desarrollo';
COMMENT ON COLUMN squad_members.jersey_number IS 'Número de camiseta/dorsal del jugador';
COMMENT ON COLUMN squad_members.status IS 'Estado actual del jugador: disponible, lesionado, suspendido, convocado, baja';
COMMENT ON COLUMN squad_members."order" IS 'Orden manual para organizar jugadores en el plantel';
COMMENT ON COLUMN squad_members.notes IS 'Notas técnicas del staff sobre el jugador';
