// Atributos del jugador de rugby. Escala 1-20 salvo los ocultos.
// Diseñados específicamente para rugby — no son atributos de fútbol reciclados.

import type { AttrScore } from './common.ts'

export interface TechnicalAttrs {
  tackle: AttrScore          // Placaje (técnica)
  handling: AttrScore        // Manos: recibir y soltar el balón
  passShort: AttrScore       // Pase corto, cadena de mano
  passLong: AttrScore        // Pase largo / saltado
  kickPosts: AttrScore       // Patada a palos (conversión, penal, drop)
  kickTactical: AttrScore    // Patada táctica: hueco, box-kick, grubber
  kickPunt: AttrScore        // Despeje a touch
  ballCarry: AttrScore       // Carrera con balón
  ruckSupport: AttrScore     // Apoyo al portador, lectura del breakdown
  ruckClean: AttrScore       // Limpieza de ruck (barrer al jaguar)
  jackal: AttrScore          // Robo en el suelo (jackaling)
  scrum: AttrScore           // Empuje y técnica en melé
  lineoutJump: AttrScore     // Salto en touch
  lineoutThrow: AttrScore    // Lanzamiento a touch (hooker)
  maul: AttrScore            // Trabajo en maul
  aerial: AttrScore          // Balones aéreos
}

export interface MentalAttrs {
  decisions: AttrScore       // Decisiones
  vision: AttrScore          // Visión de juego
  anticipation: AttrScore    // Anticipación / lectura del rival
  leadership: AttrScore      // Liderazgo
  discipline: AttrScore      // Disciplina (inverso de cometer penaltis)
  teamwork: AttrScore        // Trabajo en equipo
  concentration: AttrScore   // Concentración
  determination: AttrScore   // Determinación / carácter
  composure: AttrScore       // Compostura bajo presión
  workrate: AttrScore        // Disposición al trabajo sucio
  positioning: AttrScore     // Posicionamiento defensivo
  initiative: AttrScore      // Iniciativa, romper guion
}

export interface PhysicalAttrs {
  pace: AttrScore             // Velocidad punta
  acceleration: AttrScore     // Aceleración
  agility: AttrScore          // Agilidad, cambios de dirección
  strength: AttrScore         // Fuerza
  power: AttrScore            // Potencia (explosividad)
  stamina: AttrScore          // Resistencia
  jumping: AttrScore          // Salto
  balance: AttrScore          // Equilibrio tras contacto
  recovery: AttrScore         // Recuperación entre cargas
  injuryProneness: AttrScore  // Propensión a lesiones (alto = malo)
}

/** Atributos ocultos al usuario salvo por scouting / tiempo en el club. */
export interface HiddenAttrs {
  ambition: AttrScore
  professionalism: AttrScore
  loyalty: AttrScore
  adaptability: AttrScore
  greed: AttrScore
  controversy: AttrScore
}

export interface Attributes {
  technical: TechnicalAttrs
  mental: MentalAttrs
  physical: PhysicalAttrs
  hidden: HiddenAttrs
}

/** Atributos clave por posición — para evaluación contextual. */
export const KEY_TECHNICAL_BY_POSITION: Record<number, (keyof TechnicalAttrs)[]> = {
  1: ['scrum', 'tackle', 'maul'],
  2: ['lineoutThrow', 'scrum', 'jackal', 'handling'],
  3: ['scrum', 'tackle', 'maul'],
  4: ['lineoutJump', 'scrum', 'maul'],
  5: ['lineoutJump', 'scrum', 'maul'],
  6: ['tackle', 'maul', 'lineoutJump', 'ruckClean'],
  7: ['jackal', 'tackle', 'ruckSupport'],
  8: ['ballCarry', 'tackle', 'handling', 'lineoutJump'],
  9: ['passShort', 'kickTactical', 'handling'],
  10: ['kickPosts', 'kickTactical', 'passShort', 'passLong'],
  11: ['ballCarry', 'aerial'],
  12: ['tackle', 'passShort', 'ballCarry'],
  13: ['tackle', 'ballCarry', 'passShort'],
  14: ['ballCarry', 'aerial'],
  15: ['kickPunt', 'kickTactical', 'aerial', 'ballCarry']
}
