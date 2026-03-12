# Statistics Hub -> Flash UI Binding

## Objetivo

Definir como la arquitectura funcional del Sports Statistics Hub debe vivir dentro del layout Flash UI del proyecto, de forma que `/estadisticas` deje de ser una pagina placeholder y pase a ser un hub real, coherente y escalable.

La decision principal es esta:

- El hub se implementa como una pagina vertical de bloques grandes dentro de `.container`.
- El patron base no es una landing estatica; es una consola editorial de datos.
- La referencia tecnica mas cercana en el repo es [`src/components/admin/entities/tournament/standings/TournamentStandingsTab.tsx`](/c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/src/components/admin/entities/tournament/standings/TournamentStandingsTab.tsx), especialmente por su header, barra contextual, tabla premium y comportamiento responsive.
- La entrada publica actual [`src/app/estadisticas/page.tsx`](/c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/src/app/estadisticas/page.tsx) debe reemplazarse por una composicion real de componentes.

## Direccion visual

El hub debe conservar estos rasgos del Flash UI provisto:

- Fondo profundo y premium: `#0a0b0c` y superficies `#141619`.
- Acentos turf: `#1ed760`, `#0f4d27`, `#c5ff4d`.
- Tipografia dual: Inter para UI y JetBrains Mono para datos.
- Cards overview con peso visual alto.
- Tabla principal fuerte, editorial y deportiva.
- Bloque final de visualizacion + insights, no como decoracion sino como lectura guiada del dataset.

## Flujo final de pagina

Orden obligatorio de render:

1. `context_header`
2. `stats_navigation_tabs`
3. `filters_bar`
4. `overview_modules`
5. `main_primary_data_section`
6. `visualizations_and_insights`
7. `future_secondary_sections`

La pagina debe sentirse como una secuencia de lectura:

1. El usuario entiende que torneo o contexto esta mirando.
2. Elige el modo estadistico.
3. Recorta el universo con filtros.
4. Consume lideres y KPIs.
5. Baja a la tabla fuerte.
6. Interpreta el dataset con chart + insights.
7. Profundiza con comparaciones, logs o records.

## Mapeo funcional -> visual

| Bloque funcional | Vive en | Rol en el layout | Regla de comportamiento | Regla de escala |
|---|---|---|---|---|
| `context_header` | `.context-header` | Encabezado editorial competitivo | Muestra contexto real y acciones globales | En mobile apila contexto y acciones; maximo 2 acciones visibles |
| `stats_navigation_tabs` | `.stats-nav > .nav-item` | Navegacion principal | Cambia dataset, tabla, chart e insights | Scroll horizontal en mobile |
| `filters_bar` | `.filter-bar` | Recorte del universo estadistico | Todos los bloques inferiores reaccionan al mismo estado | Drawer o collapse en mobile |
| `overview_modules` | `.overview-grid > .stat-card` | Lideres y KPIs rapidos | Cada card se alimenta del dataset actual | 4 columnas desktop, 2 tablet, 1 mobile, carrusel si sobra contenido |
| `main_statistics_sections` | `.table-section` | Nucleo tabular del hub | Las columnas cambian por tab activa | Scroll horizontal, primera columna sticky |
| `charts_and_visualizations` | `.viz-container > .viz-card:first-child` | Lectura grafica principal | El chart depende de la tab y filtros activos | Pasa de 2fr/1fr a 1 columna en tablet/mobile |
| `overview_modules.trend_summary` y `highlights` | `.viz-container > .viz-card:last-child` | Insights editoriales | Resume hallazgos utiles del dataset actual | Reordena debajo del chart en pantallas chicas |
| `comparison_tools` | Section header o subpanel contextual | Comparacion ad hoc | Se activa por boton/toggle, no fijo | Puede reemplazar temporalmente tabla o viz |
| `match_level_breakdowns` | Seccion secundaria | Drill-down contextual | Se abre desde row click o tab especifica | Nunca debe competir con la tabla principal |
| `records_and_history` | Tab propia o bloque final | Historico y records | Reusa cards + tabla | Puede crecer como modulo independiente |

## Binding por seccion

### 1. Context header

Estructura recomendada:

```tsx
<section className="context-header">
  <div className="header-main">
    <h1 />
    <div className="header-meta" />
  </div>
  <div className="header-actions" />
</section>
```

Binding:

- `h1`: nombre logico del hub o de la seccion activa.
- `.header-meta .badge`: deporte, torneo, temporada, fase, grupo, categoria.
- `.header-actions .btn-action`: `EXPORT CSV`, `SHARE DATA`, `REFRESH`.
- `REFRESH` debe ser la accion dominante con fondo `turf_primary`.

Comportamiento:

- El texto principal cambia con `activeTab`.
- Los badges se recalculan con filtros globales.
- `refresh` debe disparar loading, estado disabled temporal y feedback de exito o refresh silencioso.

### 2. Stats navigation tabs

Tabs minimas:

- `overview`
- `team_stats`
- `player_stats`
- `attack`
- `defense`
- `discipline`
- `set_pieces`
- `advanced`
- `records`

Reglas:

- `set_pieces` solo aparece en deportes compatibles.
- `records` puede ser lazy o condicional.
- El cambio de tab no es cosmetico: debe actualizar `section header`, `columns`, `rows`, `chartType`, `insights`.

Implementacion sugerida:

- Reusar el comportamiento horizontal y sticky de tabs ya aplicado en la documentacion [`docs/TAB_NAVIGATION_UPDATE.md`](/c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/docs/TAB_NAVIGATION_UPDATE.md).
- Mantener uppercase, tracking amplio y scroll horizontal en mobile.

### 3. Filters bar

Contrato funcional:

- `season`
- `competition`
- `phase`
- `group`
- `category`
- `team`
- `player`
- `home_away`
- `last_n_games`
- `stat_scope`

Reglas:

- Todos viven en un solo estado compartido.
- Si la pagina soporta deep-linking, los filtros deben reflejarse en URL.
- `team` y `player` deben ser buscables.
- En mobile, el bloque debe colapsar o moverse a drawer para no romper la lectura vertical.

Patron de implementacion:

- Reusar la nocion de panel/filtros del standings tab, pero como barra horizontal debajo de tabs.
- Desktop: grid auto-fit.
- Mobile: una columna + CTA "More filters".

### 4. Overview modules

Rol:

- No mostrar numeros fijos.
- Mostrar lideres reales del estado actual.

Default mapping recomendado:

| Slot | Fuente | Label | Value | Identidad |
|---|---|---|---|---|
| 1 | `top_performers.top_points_scorer` | `Top Points Scorer` | total | jugador |
| 2 | `top_performers.top_try_scorer` | `Top Try Scorer` | total | jugador |
| 3 | `top_performers.top_tackler` | `Total Tackles` | total | jugador |
| 4 | `top_performers.top_meters_gained` | `Meters Gained` | total | jugador |

Reglas:

- Cada card debe tener `label`, `value`, `identity`, `supporting context`.
- `value` usa JetBrains Mono.
- Una card puede llevar borde destacado para la metrica prioritaria del contexto activo.
- Si hay mas de 4 insights prioritarios, usar segunda fila en desktop y slider en mobile.

### 5. Main primary data section

La tabla es el centro del hub. No puede ser estatica.

Estructura:

```tsx
<section className="table-section">
  <div className="section-header" />
  <StatsTable />
</section>
```

Header del modulo:

- izquierda: titulo dinamico de la tab activa
- derecha: metadata contextual como cantidad de filas, scope, unidad estadistica y export

Mapping por tab:

| Tab | Dataset principal | Header title | Enfoque |
|---|---|---|---|
| `overview` | resumen mixto | `Team Aggregated Stats` | ranking compacto o team stats resumida |
| `team_stats` | `team_stats` | `Team Statistics` | rendimiento general por equipo |
| `player_stats` | `player_stats` | `Player Statistics` | volumen y produccion individual |
| `attack` | `attack` | `Attack Metrics` | produccion ofensiva |
| `defense` | `defense` | `Defense Metrics` | contencion y recuperacion |
| `discipline` | `discipline` | `Discipline Metrics` | penales y tarjetas |
| `set_pieces` | `set_pieces` | `Set Piece Efficiency` | scrum, lineout, tasa de exito |
| `advanced` | `advanced` | `Advanced Performance` | indices y eficiencias |
| `records` | `records_and_history.records` | `Records and History` | records historicos |

Columnas clave por dataset:

- `team_stats`: `team`, `matches_played`, `wins`, `draws`, `losses`, `points_for`, `points_against`, `points_difference`, `tries_scored`, `competition_points`
- `player_stats`: `player`, `team`, `position`, `matches_played`, `minutes`, `points`, `tries`, `assists`, `tackles`, `yellow_cards`, `red_cards`
- `attack`: `team_or_player`, `tries_scored`, `points_scored`, `line_breaks`, `offloads`, `meters_gained`, `points_per_attack`
- `defense`: `team_or_player`, `points_conceded`, `tries_conceded`, `tackles_made`, `missed_tackles`, `turnovers_won`
- `discipline`: `team_or_player`, `penalties_conceded`, `yellow_cards`, `red_cards`, `suspensions`
- `set_pieces`: `team`, `scrums_won`, `scrums_lost`, `lineouts_won`, `lineouts_lost`, `set_piece_success_rate`
- `advanced`: `team_or_player`, `attack_efficiency`, `defense_efficiency`, `points_per_visit`, `conversion_rate`, `net_performance_index`
- `records`: `record_name`, `holder`, `value`, `season`, `competition`

Visual rules:

- Primera columna sticky.
- Hover claro en fila.
- Equipo usa `team-cell` con logo.
- Diferencial positivo en turf, negativo en rojo.
- Metricas premium o de resultado pueden usar `highlight-col`.
- En `advanced`, cada columna compleja debe tener tooltip o microcopy.

### 6. Visualizations and insights

Ubicacion:

- Bloque inmediatamente posterior a la tabla.
- Grid `2fr / 1fr` en desktop.

Panel izquierdo:

- Chart principal de la tab activa.
- No repetir la misma informacion exacta de la tabla; debe sintetizarla.

Panel derecho:

- Insights editoriales o automaticos.
- Deben explicar hallazgos, no decorar.

Chart mapping:

| Tab | Grafico recomendado |
|---|---|
| `overview` | line chart o stacked bar de tendencia general |
| `team_stats` | bar chart comparando puntos, tries o diferencial |
| `player_stats` | bar chart de top scorers, top tacklers o meters |
| `attack` | stacked bar ofensivo |
| `defense` | bar chart de tackles, turnovers o puntos concedidos |
| `discipline` | bar chart de penales y tarjetas |
| `set_pieces` | barras de eficiencia de scrum y lineout |
| `advanced` | radar o comparative metrics chart |

Fuentes de insights:

- `trend_summary`
- `highlights`
- notas de metricas avanzadas
- deltas de comparacion
- records destacados

Regla editorial:

- Cada insight debe decir algo accionable o interpretable.
- Ejemplo correcto: "Attack efficiency: Springboks leading with 4.2 points per 22m entry."
- Ejemplo incorrecto: texto genericamente motivacional o filler.

### 7. Future secondary sections

#### Comparison tools

- No debe vivir fijo.
- Trigger recomendado: boton `Compare` en el `section-header`.
- `compare_teams`: cards side-by-side + radar chart.
- `compare_players`: cards side-by-side + diff table.

#### Match level breakdowns

- Debajo del bloque de visualizacion o dentro de tabs especificas.
- Aparece como drill-down contextual desde click en fila o seleccion de entidad.
- Reusa el lenguaje visual de `.table-section`.

#### Records and history

- Puede ser tab propia o bloque final.
- Reusar mini cards para hitos y tabla historica para all-time leaders.

## Component tree recomendado

```tsx
<StatisticsHubPage>
  <StatisticsHubHeader />
  <StatisticsHubTabs />
  <StatisticsHubFilters />
  <StatisticsOverviewCards />
  <StatisticsMainTable />
  <StatisticsVizInsights />
  <StatisticsSecondaryModules />
</StatisticsHubPage>
```

Contratos minimos:

```ts
type ContextHeaderProps = {
  sport: string;
  competitionName: string;
  season: string;
  phase?: string;
  category?: string;
  region?: string;
  actions: HeaderAction[];
};

type StatsTabsProps = {
  tabs: StatsTab[];
  activeTab: string;
  onTabChange: (tab: string) => void;
};

type StatsFiltersProps = {
  filters: FilterDefinition[];
  values: StatsFilterValues;
  onChange: (patch: Partial<StatsFilterValues>) => void;
  onReset: () => void;
};

type OverviewCardsProps = {
  cards: OverviewCard[];
};

type StatsTableProps = {
  title: string;
  subtitle?: string;
  columns: StatsColumn[];
  rows: StatsRow[];
  sort: SortState;
  onRowClick?: (row: StatsRow) => void;
};

type StatsVisualizationProps = {
  chartType: StatsChartType;
  data: ChartSeries[];
  insights: InsightItem[];
};
```

## Estado y data binding

Estado minimo compartido:

```ts
type StatisticsHubState = {
  activeTab: StatsTabId;
  filters: StatsFilterValues;
  selectedEntityId?: string | null;
  compareMode?: 'teams' | 'players' | null;
  loading: boolean;
  refreshing: boolean;
};
```

Prioridades de datos:

- Header: `competition`, `season`, `phase`, `category`, `sport`
- Overview cards: `top_performers`, `team_leaders`, `ranking_modules`
- Tabla principal: `active_tab_dataset` + `filters` + `stat_scope`
- Charts: `charts_and_visualizations` + `active_tab` + `selected_entity`
- Insights: `trend_summary`, `highlights`, `advanced_metrics_interpretation`, `records`

Regla critica:

- No duplicar datasets entre cards, tabla y charts con logicas separadas.
- Debe existir un selector unico que derive la vista completa desde `activeTab + filters + selectedEntity`.

## Responsive binding

### Desktop

- Header en dos zonas.
- Tabs completas en fila.
- Filters en grid auto-fit.
- Overview en 4 columnas.
- Tabla ancha con scroll si hace falta.
- Viz en `2fr / 1fr`.

### Tablet

- Overview en 2 columnas.
- Viz en 1 columna.
- La tabla sigue siendo el bloque dominante.

### Mobile

- Header vertical.
- Tabs con scroll horizontal.
- Filtros en una columna o drawer.
- Overview en una sola columna o slider.
- Tabla con `overflow-x: auto`.
- Acciones maximo 2 visibles; el resto a menu.

## Comportamiento e interaccion

### Tab change

Debe actualizar en una sola transicion:

- tab activa
- titulo del modulo principal
- columnas de tabla
- filas
- tipo de chart
- lista de insights

### Filter change

Debe actualizar:

- badges del header
- overview cards
- dataset de tabla
- visualizaciones
- insights

### Refresh

Significa:

- recalculo o refetch de agregados
- boton disabled temporalmente
- feedback visual breve

### Row click

Debe abrir:

- detalle de equipo
- detalle de jugador
- breakdown por partido

## Recomendacion de implementacion en este repo

Secuencia recomendada:

1. Crear componentes nuevos bajo `src/components/statistics/`.
2. Usar [`src/components/admin/entities/tournament/standings/TournamentStandingsTab.module.css`](/c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/src/components/admin/entities/tournament/standings/TournamentStandingsTab.module.css) como referencia de tokens, spacing, tabla sticky y cards glass.
3. Reemplazar el placeholder de [`src/app/estadisticas/page.tsx`](/c:/Users/srome/OneDrive/Escritorio/Grupo-22-Scores/src/app/estadisticas/page.tsx) por una composicion real.
4. Mantener el layout publico en una sola columna vertical, sin sidebar fija de 3 columnas como el admin standings.
5. Extraer helpers puros para:
   - resolver `columns` por `activeTab`
   - resolver `chartType` por `activeTab`
   - resolver `overview cards` por dataset
   - resolver `insights` por dataset

Decision de arquitectura:

- `TournamentStandingsTab` sirve como patron visual y tecnico, pero no debe copiarse literal.
- El hub publico necesita priorizar lectura editorial vertical por encima de la consola operativa admin.

## Criterios de aceptacion

- Cada bloque funcional tiene una ubicacion clara dentro del layout Flash UI.
- Las tabs cambian realmente el contenido principal.
- La barra de filtros controla todo el hub.
- Las overview cards muestran lideres reales del dataset actual.
- La tabla principal cambia columnas y rows segun la tab activa.
- El chart principal es coherente con la tab activa.
- El panel de insights resume hallazgos utiles.
- La pagina se percibe como centro estadistico profesional, no como demo visual.

## Regla final

Si una decision visual entra en conflicto con la claridad estadistica, gana la claridad estadistica. El Flash UI debe amplificar la lectura del dato, no competir con ella.
