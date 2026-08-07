# staging-urba — carga de las tablas de staging

Derivado de `vinculaciones.csv`, `altas.csv` y `mapeo-pendiente.csv`. Se regenera.
No toca `clubs` ni `club_external_ids`: sólo puebla el staging de la Etapa 0.

Requisito: el DDL de la Etapa 0 ya corrido (las tres tablas creadas y vacías).

Correr **en este orden**, verificando el count al final de cada archivo:

| # | archivo | filas | acumulado |
|---|---|---:|---|
| 1 | `stg_urba_vinculaciones_part1.sql` | 400 | 400 / 426 |
| 2 | `stg_urba_vinculaciones_part2.sql` | 26 | 426 / 426 |
| 3 | `stg_urba_altas_part1.sql` | 400 | 400 / 1012 |
| 4 | `stg_urba_altas_part2.sql` | 400 | 800 / 1012 |
| 5 | `stg_urba_altas_part3.sql` | 212 | 1012 / 1012 |
| 6 | `stg_urba_mapeo_pendiente_part1.sql` | 400 | 400 / 1106 |
| 7 | `stg_urba_mapeo_pendiente_part2.sql` | 400 | 800 / 1106 |
| 8 | `stg_urba_mapeo_pendiente_part3.sql` | 306 | 1106 / 1106 |

Los `INSERT` llevan `ON CONFLICT DO NOTHING`, así que reintentar una parte es seguro.
Ojo: por eso mismo, si una parte se corre dos veces el count NO se duplica — pero
tampoco avisa. El count acumulado de cada archivo es la única señal.

Verificación final, con las tres tablas completas:

```sql
SELECT 'vinculaciones' t, count(*) FROM public.stg_urba_vinculaciones
UNION ALL SELECT 'altas',           count(*) FROM public.stg_urba_altas
UNION ALL SELECT 'mapeo_pendiente', count(*) FROM public.stg_urba_mapeo_pendiente;
-- esperado: 426 / 1012 / 1106
```
