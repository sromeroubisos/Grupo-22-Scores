# Stitch prompt — Playoff Builder panel (G22 Scores)

Enhanced via the `stitch-design` skill's Prompt Enhancement Pipeline.
Run with `generate_screen_from_text` once the Stitch MCP server is connected
(it is not connected in this environment).

---

Operational sports-tournament admin console. A collapsible "Playoff
Constructor" panel embedded in a phase card. Calm dark control-room vibe,
information-dense but uncluttered, precise accents, zero decoration.
Minimalist atmosphere.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, desktop-first, responsive to mobile (1→2 col grids)
- Palette: Basalt BG (#0F141A app), Basalt Surface (#151B22 panels), Elevated (#1B232C inputs/hover), Basalt Border (#26313B dividers), Info Blue (#38BDF8 primary/selected/focus), Action Green (#22C55E CTA/active), Ink (#F4F7FA text), Dim (#98A6B3 secondary text)
- Type: Inter for UI, JetBrains Mono for codes/IDs/metrics
- Styles: 12px radius panels / 8px controls / pill checks; 1px borders for separation, minimal shadows; selected = blue border + 12% blue fill + blue ring + filled circular check

**PAGE STRUCTURE:**
1. **Panel header:** 36px accent-tinted rounded icon chip (wand) + title "Constructor de Playoff" with phase name subtitle; right side a status pill ("Cuadro generado" green / "Sin generar" dim) and a chevron toggle.
2. **Intro callout:** thin info-blue tinted note explaining auto-advancement.
3. **Plantilla:** SectionHeader + 2-col grid of OptionCards (icon + title + description + top-right check), 4 templates: Eliminación simple, Oro/Plata, Oro/Plata/Bronce/Estímulo, Estructura personalizada.
4. **Cruces de la primera ronda:** SectionHeader + 2 OptionCards: "Por seed (1 vs 16, 2 vs 15…)", "Aleatorios".
5. **Configuración panel:** boxed sub-panel — Equipos select, "3.º y 4.º puesto" checkbox, and renamable cup-name inputs (2-col).
6. **Programación de horarios:** boxed sub-panel, 2 OptionCards Manual/Automática; when Automática, a 2-col field grid (inicio, días entre rondas, duración, descanso, canchas).
7. **Actions row:** top divider; dominant green primary CTA "Generar bracket" (or "Regenerar cuadro"), quiet outlined-red "Borrar cuadro".
8. **Bracket board:** below — horizontal-scroll cup sections (Oro/Plata/Bronce/Estímulo accent dots), one column per round, match cards with mono codes and placeholder vs resolved teams.

**INTERACTION NOTES:**
- Single-select groups use the OptionCard checked state (never a faint 1px border).
- Empty state when no bracket: centered dim message + the primary CTA.
