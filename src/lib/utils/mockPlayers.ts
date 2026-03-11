// Datos mock para pruebas rápidas de planteles

export const MOCK_PLAYERS = [
    { first_name: 'Juan', last_name: 'Martínez', position: 'Pilar Izquierdo', weight: 110, height: 185 },
    { first_name: 'Carlos', last_name: 'Rodríguez', position: 'Hooker', weight: 105, height: 180 },
    { first_name: 'Diego', last_name: 'Sánchez', position: 'Pilar Derecho', weight: 115, height: 188 },
    { first_name: 'Mateo', last_name: 'González', position: 'Segunda Línea', weight: 108, height: 198 },
    { first_name: 'Lucas', last_name: 'Fernández', position: 'Segunda Línea', weight: 112, height: 200 },
    { first_name: 'Tomás', last_name: 'López', position: 'Ala', weight: 95, height: 188 },
    { first_name: 'Santiago', last_name: 'García', position: 'Octavo', weight: 100, height: 190 },
    { first_name: 'Agustín', last_name: 'Pérez', position: 'Medio Scrum', weight: 82, height: 175 },
    { first_name: 'Facundo', last_name: 'Romero', position: 'Apertura', weight: 85, height: 178 },
    { first_name: 'Nicolás', last_name: 'Torres', position: 'Wing', weight: 88, height: 182 },
    { first_name: 'Joaquín', last_name: 'Díaz', position: 'Centro', weight: 92, height: 185 },
    { first_name: 'Martín', last_name: 'Morales', position: 'Centro', weight: 90, height: 183 },
    { first_name: 'Franco', last_name: 'Benítez', position: 'Wing', weight: 86, height: 180 },
    { first_name: 'Emiliano', last_name: 'Castro', position: 'Fullback', weight: 88, height: 182 },
    { first_name: 'Ignacio', last_name: 'Silva', position: 'Ala', weight: 98, height: 190 },
];

export const MOCK_STAFF = [
    { first_name: 'Roberto', last_name: 'Méndez', role: 'head_coach' },
    { first_name: 'Pablo', last_name: 'Vargas', role: 'assistant_coach' },
    { first_name: 'Gustavo', last_name: 'Ruiz', role: 'physical_trainer' },
    { first_name: 'Fernando', last_name: 'Campos', role: 'physio' },
    { first_name: 'Marcelo', last_name: 'Ortiz', role: 'doctor' },
];

export function generateMockBirthDate() {
    // Genera fechas de nacimiento entre 18 y 35 años
    const today = new Date();
    const year = today.getFullYear() - (18 + Math.floor(Math.random() * 17));
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
