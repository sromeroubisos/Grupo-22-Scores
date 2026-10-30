# G22 Scores: del código al contrato

Informe de estrategia comercial · g22scores.com · 28 · 08 · 2026

Qué es realmente el producto, quién compite, quién compra, cuánto puede cobrar y por dónde entra al mercado. Análisis construido sobre el código de producción, no sobre el brief.

Contenido

1. [Resumen ejecutivo](#s0)
2. [El proyecto, definido](#s1)
3. [Competidores](#s2)
4. [Benchmarking](#s3)
5. [Precios de mercado](#s4)
6. [Modelos de negocio](#s5)
7. [Clientes potenciales](#s6)
8. [FODA](#s7)
9. [Viabilidad comercial](#s8)
10. [Estrategia de precios](#s9)
11. [ROI del cliente](#s10)
12. [Estrategia de venta](#s11)
13. [Entrada al mercado](#s12)
14. [Propuesta comercial](#s13)
15. [Recomendación final](#s14)
16. [Fuentes y método](#s15)

---

## 00 · Resumen ejecutivo

G22 Scores no es un prototipo: es una plataforma en producción con 190 migraciones de base de datos, 205 endpoints, 145 archivos de test y un sistema de cobro con MercadoPago ya implementado. Cubre las tres capas que en el mercado se venden por separado — **sitio público de datos** (fixtures, tablas, rankings, fichas de jugador), **backend de gestión de torneos y clubes**, y **producto de audiencia** (prode, fantasy, notificaciones). Ningún competidor relevado combina las tres.

El hallazgo que reordena toda la estrategia llegó el 25 de junio de 2026: la UAR lanzó **Conecta Rugby APP**, gratuita, que reemplaza la planilla electrónica TEP dentro de BDUAR y gestiona planteles, sanciones y cierre de partido desde la cancha. [Fuente oficial](https://uar.com.ar/conecta-rugby-app-la-nueva-aplicacion-movil-para-potenciar-la-gestion-y-capacitacion-del-rugby-argentino/) `[Encontrado]`. Eso cierra la puerta de «el sistema oficial de carga de partidos» — y a la vez abre la buena: Conecta Rugby es *hacia adentro*. No publica fixture navegable, ni tabla en vivo, ni ficha histórica de jugador, ni ranking, ni nada para el hincha. G22 no debe competir contra la federación por el back-office; debe ser **la capa pública que la federación no va a construir**.

**La tesis en una línea: sistema cerrado contra sistema abierto**

**La UAR construyó un sistema cerrado. G22 es un sistema abierto.** Esa es la frase con la que hay que abrir toda reunión, y no es una metáfora: Conecta Rugby exige usuario y contraseña de BDUAR — [su única puerta es un login](https://app.conecta.rugby/login) `[Encontrado]` — y solo entra quien tiene un rol federado: jugador fichado, entrenador, referí, dirigente. La madre, el padre, el amigo, el ex jugador, el hincha, el periodista local, el sponsor: **ninguno tiene forma de entrar.** Están afuera por diseño, porque el sistema no fue hecho para ellos.

**Y una precisión que importa para cómo se dice esto en una reunión:** que el sistema federativo sea cerrado no es un defecto, es su naturaleza — un registro oficial con habilitaciones, sanciones e incidencias médicas *debe* ser cerrado. El diagnóstico no es «lo hicieron mal», es «eso resuelve el adentro y el afuera no existe». En un ambiente donde las uniones trabajan con gente de la UAR, la diferencia entre esas dos frases decide si el proyecto tiene mercado.

G22 no le pide credenciales a nadie para mirar. Cualquiera que quiera saber cómo va el partido de su hijo un sábado a las tres de la tarde, entra y lo ve. Ese es el producto, y es exactamente lo que un sistema de gestión federativa no puede ser sin dejar de ser lo que es.

**Pero abierto ya no alcanza solo.** Rugby Pro Score — competidor argentino detectado en agosto de 2026, operando la Primera de la Unión Cordobesa — también es abierto: su marcador en vivo se ve sin cuenta. Lo que no hace es *guardar*. No archiva los partidos y no tiene tabla de posiciones. Es un marcador que se enciende el sábado y se apaga el domingo. Eso abre el segundo eje, y es el que decide contra ellos: **efímero contra permanente.** Un partido cargado en G22 sigue estando en 2030, y de esa carga sale sola la tabla, el acumulado del jugador y el ranking del club.

La posición completa, entonces, tiene dos ejes y nadie más ocupa el cruce: **abierto** —contra la UAR y Rugby Manager, que piden credenciales— **y permanente** —contra Rugby Pro Score, que muestra y olvida.

G22 no vende «software de gestión de torneos» — ese mercado ya lo están comoditizando la UAR (gratis) y Rugby Manager (ARS 70.000–105.000/mes). G22 vende **acceso, visibilidad y memoria**: que el sábado se sigan las cinco categorías del club en un lugar y sin barrera, que el lunes los números ya existan, y que el pibe que debuta en M16 llegue a Primera con historial. Eso no lo da ninguna planilla oficial.

**Y en el camino, los jugadores**

La consecuencia del sistema abierto es un mecanismo de adquisición que el sistema cerrado no puede tener. La madre entra a ver el partido de su hijo — no le pidieron nada, no se registró, solo miró. Vuelve el sábado siguiente. En algún momento hace clic en el nombre del hijo y aparece su ficha: partidos, puntos, tries, tarjetas, temporada tras temporada. **Y ahí el que se registra es el jugador**, porque nadie resiste ver su propia historia escrita.

El orden importa: **primero entra el que mira, después el que juega.** Conecta Rugby empieza por el federado y termina ahí — 1.000+ descargas frente a los 45.000 jugadores que la URBA mueve cada fin de semana `[Encontrado]`. G22 empieza por el entorno del jugador, que es entre cinco y diez veces más grande, y llega al jugador gratis. Ese es el motor de la monetización B2C — prode, fantasy, notificaciones — y es un costo de adquisición que ningún competidor de este mercado puede igualar, porque todos exigen pertenecer antes de dejarte mirar.

- **US$ 39–149** — Precio recomendado por club / mes
- **US$ 1.200–3.600** — Canon anual de unión, más los planes de club
- **US$ 75–240k** — Valor por costo de reemplazo hoy
- **91** — Clubes solo en URBA
- **25** — Uniones provinciales en la UAR
- **~450** — Partidos por fin de semana en URBA
Los dos primeros son recomendación de este informe (§9). El tercero es una valuación por costo de reemplazo (§14-H). Los tres últimos son datos verificados (§6).

### Las cinco conclusiones

1. **Cliente ideal: la unión provincial mediana, no el club suelto ni la UAR.** Una unión del interior (Córdoba, Rosario, Cuyo, Mar del Plata, Salta, Entre Ríos, Nordeste) tiene 20–40 clubes, presupuesto de tecnología cercano a cero, ninguna cobertura pública decente de sus categorías juveniles, y una sola firma decide. Vender ahí es un contrato que arrastra 30 clubes de golpe.
2. **Los cinco competidores reales** son Rugby Pro Score, Conecta Rugby (UAR), Rugby Manager, el sitio de la propia unión y el statu quo de WhatsApp + Excel. Rugby Pro Score entra directo al primer puesto: es el único que hace lo mismo, abierto, con el mismo discurso —dos minutos, sin instalación, demo por WhatsApp— y publica el mismo torneo que G22 en la Unión Cordobesa. Sportlomo, PlayHQ y LeagueRepublic son referencias de pricing, no amenazas en Argentina hoy.
3. **El eje del discurso es cerrado contra abierto.** No «gestionamos mejor tu torneo» — ahí G22 compite contra algo gratis y oficial. Sí «tu torneo pasa a ser visible para las diez mil personas que hoy no pueden entrar a verlo».
4. **El pricing actual del código está subvaluado en el tramo alto.** Los planes Inicial US$ 15 y Pro US$ 39 son coherentes con el mercado; «Organización» a US$ 149/mes deja plata sobre la mesa frente a un contrato de unión, que debería ser anual y de cuatro cifras.
5. **El canal es venta directa con demo de un partido real** — la mecánica que las landings ya describen. No hay licitaciones públicas de software de rugby en LatAm que ganar `[Sin dato]`, y los integradores no existen en este vertical.
6. **No hay ventana: la comparación ya está ocurriendo.** Rugby Pro Score cubre la Primera de la Unión Cordobesa y G22 cubre el Top 10 del Centro — es el mismo torneo. No es un competidor que viene, es uno que ya está publicando los mismos partidos el mismo sábado. Eso no invalida la tesis, la refuerza —alguien más vio el hueco y lo está ocupando— pero mueve toda la urgencia al producto: **lo que diferencia a G22 tiene que verse en la primera pantalla**, porque el club va a abrir las dos y decidir sin llamar a nadie.
7. **Sí conviene convertirlo en negocio**, pero como *plataforma vertical de datos deportivos con capa SaaS*, no como fábrica de software a medida. El activo defendible no es el código: es la base histórica acumulada y el hábito del hincha.

---

## 01 · El proyecto, definido

Todo lo de esta sección sale de leer el repositorio y el sitio en producción, no de la descripción del proyecto. Donde el código y el discurso comercial difieren, mando el código.

### Qué problema resuelve

El rugby amateur argentino genera un volumen de información enorme y lo pierde entero. Solo la URBA mueve **~450 partidos y ~45.000 jugadores por fin de semana** entre 91 clubes `[Encontrado]` ([La Nación](https://www.lanacion.com.ar/deportes/rugby/el-torneo-urba-se-expande-91-clubes-nid2228845/)). De ese volumen, lo que sobrevive públicamente es la tabla de las divisiones superiores. Las juveniles — M19, M17, M16, donde está la mitad del deporte — no existen en ningún lado consultable. El resultado circula por WhatsApp el sábado a la noche y se evapora el domingo.

Tres consecuencias concretas, y cada una es un argumento de venta distinto:

- **El club no tiene memoria.** Un jugador que pasa ocho años en el club no tiene una sola estadística acumulada. El cuerpo técnico reconstruye los partidos de memoria.
- **La unión no tiene producto.** No puede ofrecerle a un sponsor una audiencia medible, porque no tiene una propiedad digital donde esa audiencia esté. La UAR factura **~US$ 10 millones anuales en sponsors** `[Encontrado]` ([El Cronista](https://www.cronista.com/apertura/empresas/los-secretos-del-rugby-argentino-para-atraer-millones-en-sponsors-sin-apostar-al-juego/)); una unión provincial no captura casi nada de eso, en parte porque no tiene dónde exhibirlo.
- **El hincha no tiene dónde mirar.** El equivalente de Promiedos — que mueve ~34 millones de visitas mensuales en fútbol `[Estimado]` ([Similarweb](https://www.similarweb.com/es/website/promiedos.com.ar/)) — no existe para el rugby argentino.

### Qué proceso optimiza

La cadena que va del papel al público: planilla en la mesa de control → resultado en un grupo de WhatsApp → alguien lo pasa a una planilla → alguien actualiza la tabla → alguien lo publica en Instagram. G22 la colapsa a un solo acto: **alguien del club carga desde el celular durante el partido, y el fixture, la tabla, las estadísticas del equipo, la ficha del jugador, el ranking, el prode y el equipo de la semana se derivan de esa única carga.** No hay doble ingreso de datos en ningún punto del sistema — eso está garantizado por arquitectura, no por disciplina.

**El límite de esa afirmación, y es el hallazgo comercial más importante de agosto**

La carga única es cierta **adentro** de G22 y **falsa a nivel ecosistema**. El club ya está obligado a cerrar el partido en BDUAR a través de Conecta Rugby: G22 es, hoy, un segundo sistema encima de uno obligatorio.

La primera unión consultada lo dijo textual y por eso no avanzó — *«ya cargamos obligados en BDUAR y eso solo ya nos genera un costo alto»* (URNE, agosto de 2026) `[Verificado en campo]`. **Es una objeción de trabajo, no de precio**, y va a aparecer en toda conversación con una unión mientras no esté resuelta.

**Pero el sistema obligatorio ya está roto, y eso convierte la objeción en la mejor puerta de entrada.** Dos hechos de campo `[Verificado]`: cargar en BDUAR le resulta difícil a la gente —coincide con las reseñas públicas de la app, «no puedo entrar», «no salen los partidos», y con sus 1.000+ descargas frente a los 45.000 jugadores de la URBA sola—; y **sin médico fijo el cierre digital no se puede firmar**, de modo que la promesa de cerrar el partido en vivo desde la cancha no le funciona a buena parte de los clubes. La consecuencia es que **hoy ya cargan dos veces**: papel en la cancha y transcripción posterior a una herramienta que les cuesta, sin que de todo ese trabajo salga nada público. G22 no pide una segunda carga: ofrece que la primera sea fácil y sirva para algo. Ver §14-I: llevar la planilla al formato oficial pasa a ser la prioridad número uno.

**G22 tampoco tiene firma médica, y no debe tenerla.** No es una carencia: es la diferencia de responsabilidad entre los dos sistemas. BDUAR es el registro oficial —habilitaciones, sanciones, incidencias médicas— y necesita firma para cerrar, por eso se traba sin médico. G22 es la capa de captura y publicación, y *nadie firma una tabla de posiciones*: por eso publica igual. La planilla que genera sale con los casilleros en blanco para firmar en papel, que es el flujo que los clubes ya tienen.

**Y tres límites que el proyecto no debe cruzar:** no simular ni reemplazar la firma médica —el protocolo de conmoción existe por seguridad del jugador—; no presentar la planilla de G22 como el acta oficial, porque es un documento de trabajo que acelera el oficial; y no construir captura digital de firmas por ahora, que abre preguntas de validez legal sin necesidad. Lo que sí es un argumento propio y conviene decirlo: cuando no hay médico la incidencia igual ocurrió, y hoy se pierde en un papel — cargada en G22 queda con el minuto, el jugador y quién decidió sacarlo, y el club tiene el lunes un registro real para llevarle a un profesional. No reemplaza al protocolo: le da materia prima. Es lo correcto y además es lo vendible, porque ninguna unión adopta algo que parezca debilitar su cumplimiento médico.

### Cómo funciona hoy

Next.js 16 / React 19 sobre Supabase (Postgres) desplegado en Vercel, con MercadoPago para cobros, web-push para notificaciones, y una PWA que se opera desde el teléfono. El sitio está online en [g22scores.com](https://g22scores.com), con 17 disciplinas en el catálogo y torneos publicados incluyendo el Top 14 de URBA y el Top 10 del Centro `[Verificado en producción]`.

La pieza técnica más delicada está resuelta y vale como argumento de venta: el **reloj de partido se deriva del servidor**, no de un contador del navegador. Sobrevive a un refresh, a la pestaña en segundo plano, al cambio de dispositivo, y a dos operadores cargando en simultáneo — la transición es atómica en una sola sentencia SQL. Cualquiera que haya intentado operar un marcador en vivo con un *setInterval* sabe por qué esto importa un sábado con cinco partidos.

### Componentes

| Capa | Qué incluye | Estado |
| --- | --- | --- |
| Sitio público | Torneos, fixtures, resultados, tablas, rankings, clubes, jugadores, estadísticas, búsqueda universal, noticias, páginas de club con pestaña «Hoy» | En producción |
| Gestor de torneos | Crear torneo y temporadas, fixture, importación por planilla, alta de clubes y planteles, partidos, equipos, usuarios y permisos por club | En producción |
| Panel de club | Dashboard, plantel, planteles por categoría, rivales, sponsors, noticias, documentos, invitaciones, auditoría, integraciones | En producción |
| Centro de partido | Carga en vivo desde celular, eventos con minuto, reloj derivado del servidor, formaciones, planilla PDF, revisión | En producción |
| Audiencia (B2C) | Prode con ligas privadas y scoring automático, fantasy / Equipo de la Semana, favoritos, notificaciones push, encuestas de video, minijuego «Carrera de Rugby» | En producción |
| Datos e integraciones | Ingesta desde RugbyArchive, Flashscore y SofaScore; crons de sincronización; endpoint OpenAPI de resultados; integración WhatsApp; OCR de planillas (tesseract) y lectura de PDF/Excel | En producción, parcial |
| Comercial | Landings de embudo */para-clubes* y */para-torneos*, captura de leads con atribución de origen, checkout MercadoPago, webhooks, gestión de suscripción | En producción |
| Motor multideporte | Reglas por deporte: rugby union, hockey sobre césped (23 torneos y 105 partidos reales en producción), fútbol americano, handball, y catálogo de 17 disciplinas | En producción |

### Qué variables controla y qué predice

Distingo lo que el sistema *registra* de lo que *calcula* y de lo que *predice*, porque la venta se hace con lo segundo y lo tercero, no con lo primero.

- **Registra:** partidos, eventos con minuto (tries, conversiones, penales, tarjetas, cambios), planteles, formaciones, incidencias, estado y reloj del partido.
- **Calcula, sin que nadie mantenga una tabla a mano:** posiciones con reglas de bonus configurables, estadísticas de partido, acumulados de jugador y equipo por temporada, historiales cruzados entre clubes, ranking de clubes, derivados del club (familia de categorías).
- **Predice:** hoy, el módulo *predictor* y el prode. Esta es la línea más débil del producto frente al discurso: hay infraestructura de predicción, no un modelo predictivo entrenado con valor comercial demostrable. **No lo vendas como IA.**

### Situación actual vs. solución propuesta

| Dimensión | Hoy, sin G22 | Con G22 |
| --- | --- | --- |
| Resultado de juveniles | Grupo de WhatsApp; no queda registro | Publicado en vivo, permanente, con su propia tabla |
| Tabla de posiciones | Planilla que alguien actualiza el lunes | Se deriva sola de la carga del partido |
| Ficha del jugador | No existe | Partidos, puntos, tries, tarjetas, temporada tras temporada |
| Cierre administrativo | Papel → planilla → mail | Carga única desde el celular; planilla PDF si la unión la exige |
| Propiedad digital de la unión | Sitio estático o cuenta de Instagram | Sitio con tráfico medible, con marca propia en plan Organización |
| Sponsors | Cartel en la cancha | Módulo de sponsors por club, con exposición en la página del club |

### Madurez tecnológica

**TRL 8 — sistema completo, calificado en operación real**

**Lo que respalda el TRL 8:** 806 commits en 6,5 meses (feb–ago 2026), 190 migraciones aplicadas, 205 endpoints, 145 archivos de test, cobro implementado punta a punta, datos reales de dos deportes en producción, y documentación interna de auditoría y rollback por migración.

**Lo que falta para TRL 9:** no hay evidencia en el repositorio de clientes pagos activos, ni de una temporada completa operada por un tercero sin acompañamiento. El sistema está listo; la prueba comercial no está hecha. Esa es exactamente la brecha que cierra el plan de §12.

### Propuestas de valor, y cuáles sirven como argumento comercial

| Propuesta de valor | ¿Argumento de venta? | A quién le habla |
| --- | --- | --- |
| **Abierto: cualquiera puede mirar, sin cuenta ni rol federado** | **Sí — el eje de todo.** Es la única diferencia que la federación no puede copiar sin dejar de ser federación | Todos, y en especial las familias |
| Todas las categorías del club en una sola vista, en vivo | **Sí — el más fuerte.** Es un dolor concreto de todos los sábados y ningún competidor lo cubre | Dirigente y prensa del club |
| Historial de jugador que persiste temporada a temporada | **Sí.** Emocional y único; se prueba en 10 segundos abriendo una ficha | Entrenador, jugador, familia |
| Carga única: todo lo demás se deriva | **Sí.** Ataca el trabajo duplicado, que es el costo real | Secretaría de la unión |
| Audiencia ya instalada — el torneo entra donde el hincha ya mira | **Sí, con reserva.** Es cierto en la medida en que el tráfico exista; hay que medirlo antes de afirmarlo | Organizador de torneo |
| Multideporte con reglas por disciplina | **Sí, para la unión polideportiva y el club social**, que tiene hockey además de rugby | Club grande, club social |
| Cero instalación, se opera del celular | Sí, como remoción de objeción, no como titular | Todos |
| Prode, fantasy y minijuegos | **No al comprador B2B.** Al dirigente le suena a distracción; guardalo para la conversación de sponsors y engagement | Hincha, sponsor |
| Predicción / IA | **No.** Hoy no hay modelo que sostenga la afirmación. Prometerlo abre un flanco que no se puede defender en una demo | — |

**Tres límites que el propio equipo dejó documentados — y que hay que respetar en el discurso comercial**

Están escritos en el código de las landings, y esa honestidad es un activo: una landing que la demo desmiente es peor que una landing floja.

- **No hay carga sin señal.** El service worker solo cachea GET; no hay cola de escritura. Si en la cancha no hay datos, no se publica nada en vivo. Es la objeción más probable en el interior y hay que llevarla respondida.
- **No hay exportación de datos.** Existe exportación de placas (imágenes), no un export de estadísticas. Hoy se resuelve pasando una planilla a mano. Para vender a una unión, esto debería estar resuelto antes de firmar (§14-I).
- **No hay minutos jugados** en la ficha del jugador. Se cuentan partidos, puntos, tries, conversiones, penales y tarjetas.

---

## 02 · Competidores

Ordenados por amenaza real en el mercado que G22 va a atacar primero — rugby argentino — y no por tamaño de la empresa. Sportradar es una compañía enorme y una amenaza nula para este negocio; Conecta Rugby es gratis y es la amenaza número uno.

### Competidores directos en Argentina

| Empresa / producto | País | Qué es | Modelo y precio | Cliente | Diferencia vs. G22 | Amenaza |
| --- | --- | --- | --- | --- | --- | --- |
| Rugby Pro Score · *rugbyproscore.com.ar* | Argentina | El competidor más parecido que existe. «Digitaliza todo lo que pasa en cancha: marcador en vivo, estadísticas por jugador, plantel y resumen automático». Declara 7+ módulos, creación de partido en 2 minutos, sin instalación, desde el celular, demo por WhatsApp. Cubre la Primera de la Unión Cordobesa y el Torneo del Interior 2026. Su marcador se ve **sin cuenta**. **Choca de frente con G22 hoy:** los dos cubren el Top 10 de la UCR — el mismo torneo, las mismas fechas `[Verificado]` | **La unión paga la Primera.** El club recibe Primera sin costo y paga aparte cada categoría adicional que quiera sumar. Sin página de precios pública `[Sin dato]` de los montos | Uniones provinciales y sus clubes | **Es abierto, como G22 — ahí no hay diferencia.** La diferencia es que **no guarda los partidos y no tiene tabla de posiciones**: es un marcador en vivo, no una base de datos. Sin historial, sin acumulados que se deriven, y sin páginas indexadas en buscadores — una búsqueda restringida a su dominio no devuelve ningún resultado `[Encontrado]` | Muy alta |
| Conecta Rugby APP · *(UAR)* | Argentina | App oficial lanzada el 25-jun-2026. Reemplaza la planilla TEP dentro de BDUAR: cierre de partido desde la cancha, planteles, formaciones, incidencias médicas y disciplinarias, sanciones automáticas, protocolos de conmoción World Rugby, aula virtual con ~140.000 usuarios registrados | Gratis, con login obligatorio `[Encontrado]` | Solo roles federados: clubes, entrenadores, referís, dirigentes, uniones | **Es un sistema cerrado.** Se entra con usuario y contraseña de BDUAR y solo si tenés rol federado; 1.000+ descargas frente a 45.000 jugadores solo en URBA. No publica fixture navegable, tabla en vivo, ficha histórica ni nada al que mira desde afuera. G22 no debe competir acá: debe ser **el sistema abierto** que la federación no puede construir sin dejar de ser federación | Muy alta |
| Rugby Manager | Argentina | SaaS de organización de clubes de rugby: roles (jugador, coach, dirigente, padres), asistencia a entrenamientos, estadísticas, gestión económica del tercer tiempo con QR, buscador de amistosos, mensajería. Declara 25 uniones regionales, +400 clubes, +90.000 jugadores y +150.000 padres | ARS 70.000/mes (Abono Básico) · ARS 105.000/mes (RM Plus) · ≈ US$ 64–95 al tipo de cambio 1.100 configurado en el propio proyecto · Prueba gratis 2 meses `[Encontrado]` | Clubes de rugby amateur argentinos | Fuerte puertas adentro (vida del club, pagos, comunicación). **Débil o nulo del lado público**: no es un sitio de resultados ni tiene producto para el hincha. Es el competidor más comparable y la mejor referencia de precio | Muy alta |
| Sitio de la propia unión · *(URBA, uniones provinciales)* | Argentina | Canal oficial con resultados, tablas e info de clubes, mantenido a mano o con sistema propio sobre BDUAR | Gratis para el hincha; costo interno de la unión `[Sin dato]` | Hincha, prensa | Cubre solo divisiones superiores, sin ficha de jugador ni historial navegable ni juveniles. **Es el competidor institucional** y a la vez el mejor cliente: G22 le reemplaza el trabajo manual | Media |
| GesDeportiva | España / Argentina | Software de gestión de competiciones adoptado por la Confederación Argentina de Básquetbol desde 2022: fases, fichaje, planillas, arbitraje, estadísticas en vivo | $ 1.500 por club/año `[Encontrado]` (moneda no explicitada en la fuente, probable ARS) | Federaciones nacionales | Precedente clave: **demuestra que una federación argentina compra software de gestión**. Precio por club irrisorio → el modelo de la federación es «que salga casi nada por club». Ojo con ese ancla | Media |
| Apps «Torneos X» de Ibaires | Argentina | Decenas de apps casi idénticas, una por liga barrial de fútbol (Torneos AHRU, Todo Lomas, Liga Máster, Baires Fútbol…): resultados, goleadores, fotos | `[Sin dato]` | Ligas barriales de fútbol | Prueba que hay demanda de «resultados en el bolsillo» en el amateur argentino, pero fragmentada y sin marca. G22 juega el juego opuesto: una sola marca con audiencia acumulada | Baja |
| DigitalClub (Tindat) | Argentina | SaaS de gestión de socios y clubes: perfiles, acceso, pagos, facturación, comunicación masiva | Sin precio público `[Sin dato]` | Clubes y asociaciones civiles | Compite por el presupuesto del club, no por el problema deportivo. Es gestión societaria, no competición | Baja |

### Competidores regionales e internacionales

| Empresa | País | Producto | Modelo y precio | Ventajas | Desventajas | Amenaza |
| --- | --- | --- | --- | --- | --- | --- |
| Clupik | España / LatAm | Gestión de clubes y competiciones multideporte, con vertical de rugby explícito. Inscripciones, cobros, comunicación, entrenamientos, tienda online. Declara +1.000 clubes en 25+ países | Clubes AR: gratis / US$ 39 / US$ 99 mes · Ligas LatAm: gratis / US$ 29 / US$ 79 mes · App propia: +US$ 49/mes `[Encontrado]` | Precios públicos y agresivos, localización LatAm real, vertical rugby | Producto de gestión de club, no plataforma pública de datos. Sin ficha histórica de jugador ni audiencia propia | Alta |
| Sportlomo | Irlanda / global | El benchmark internacional para federaciones de rugby: registro y membresía, scheduling, live scoring, gobernanza y *safeguarding*, pagos con split-fee, apps de árbitro. Cliente citado: Munster Rugby | Sin tarifas públicas; declara «sin cuotas para clubes» — lo paga la federación `[Sin dato]` | Producto más completo del vertical, credibilidad ante federaciones | Sin presencia declarada en LatAm; producto pesado y caro de implementar; nada del lado hincha | Media a futuro |
| PlayHQ | Australia | Plataforma de competencias de federaciones nacionales; apps marca blanca | AUD 6–10 por registración según tamaño + 1,99% servicio + 1,99% comercio + AUD 0,30 `[Encontrado]` | Modelo de fee por registración, transparente y escalable | Traslada el costo al participante — fricción alta en Argentina | Baja |
| LeagueRepublic | Reino Unido | Gestión de ligas amateur multideporte con sitio propio, API y widgets | Gratis / US$ 17,90 / 30,40 / 60,90 / 89,60 mes según nº de equipos + 1% por transacción `[Encontrado]` | Plan gratuito robusto; escalonado por equipos, no por usuarios | Sin capa B2C ni estadística individual profunda; sin español | Baja |
| Playoff | España | Gestión de clubes y **federaciones**: licencias federativas, fixtures, rankings, arbitraje, control QR, API. +80 federaciones | € 34,95 / 49,95 / 69,95 mes + IVA; Premiun federaciones a medida `[Encontrado]` | Producto específico para federaciones con precio público | Solo España; sin LatAm declarado | Baja |
| Spawtz | Reino Unido | Gestión de ligas y sedes | £ 15 → 5 por equipo/trimestre según volumen `[Encontrado]` | Precio por equipo, sin costo fijo — modelo replicable | Solo UK, fútbol de alquiler de cancha | Baja |
| SportsEngine · *(Stack Sports / NBC)* | EE. UU. | Registro, pagos, sitios, comunicación y streaming para asociaciones grandes | Express US$ 79/mes · Premium US$ 129/mes · Pro US$ 2.199/año; Motion: US$ 295 setup + 1% + 2,9%+0,30 `[Encontrado]` | Ecosistema enorme, streaming propio | EE. UU., precios opacos por producto, irrelevante en rugby argentino | Baja |
| TeamSnap | EE. UU. | Roster, calendario, comunicación, streaming para equipos y ligas | Gratis / US$ 5,84 / 8,34 / 10,84 mes por equipo; clubes y ligas a cotizar `[Encontrado]` | UX pulida, adopción masiva | Nivel equipo, no competición; sin LatAm | Baja |
| Jersey Watch | EE. UU. | Sitio + registro + scheduling para ligas chicas | US$ 348/año (≈29/mes); primer mes US$ 19 `[Encontrado]` | Precio simple, sin contrato largo | Solo EE. UU. | Baja |
| Challonge | Global | Brackets y torneos de eliminación, muy usado en eSports | Gratis con publicidad / US$ 12 mes o 6,99 anual `[Encontrado]` | Simplísimo, gratis | Brackets, no ligas de temporada larga con estadística | Baja |
| Sportradar · Genius Sports | Global | Derechos y distribución de datos para apuestas y medios | API desde US$ 1.250/mes; paquetes de datos in-game US$ 4.000–6.000/mes `[Encontrado]` | Escala y derechos exclusivos | Otro negocio y otra liga. Relevante solo como **referencia de cuánto vale un dato deportivo estructurado** — y como comprador futuro, no como competidor | Nula hoy |
| Rugby Xplorer · *(Rugby Australia)* | Australia / NZ | Plataforma unificada de la federación australiana, de base a elite | Infraestructura federativa `[Sin dato]` | Modelo de referencia de «la federación construye lo suyo» | No comercializable fuera de su federación | Nula |

### Competidores indirectos — los que realmente hay que desplazar

| Sustituto | Por qué gana hoy | Cómo se lo desplaza |
| --- | --- | --- |
| WhatsApp + planilla de papel + Excel | Costo cero, cero fricción de adopción, ya funciona «lo suficiente» | No atacar el costo: atacar lo que se pierde. El grupo no deja historial ni tabla ni ficha de jugador |
| Instagram del club | Es donde ya está la audiencia y es gratis | No competir: G22 alimenta a Instagram. La exportación de placas ya existe y es exactamente eso |
| Google Sheets del organizador | Flexible, gratis, lo controla él | Importación desde planilla (ya implementada) para que no arranque de cero |
| Wikipedia y medios deportivos | Gratis, indexado, con historial de torneos grandes | Ganar en profundidad: juveniles, femenino y ficha individual, donde ninguno llega |
| No hacer nada | El competidor más frecuente en venta B2B a instituciones amateurs | Piloto gratuito de un partido: convierte una decisión de presupuesto en una decisión de calendario |

---

## 03 · Benchmarking

Comparación contra los cuatro competidores que importan en la decisión de compra de una unión o un club de rugby argentino. Escala: ●●● fuerte · ●● adecuado · ● débil · — no aplica.

| Criterio | G22 Scores | Rugby Pro Score | Conecta Rugby (UAR) | Rugby Manager | Clupik | Sportlomo |
| --- | --- | --- | --- | --- | --- | --- |
| Precio | ●●● US$ 0–149/mes | ●● Unión paga Primera; el club paga las demás categorías | ●●● Gratis | ●● ≈US$ 64–95/mes | ●● US$ 29–99/mes | ● Contrato federativo |
| Precisión del dato | ●●● Evento con minuto, reloj de servidor | ●● Marcador y estadística por jugador | ●●● Es el dato oficial | ●● Nivel club | ●● Nivel club | ●●● Grado federativo |
| Automatización (tabla y stats derivadas) | ●●● Todo se deriva de una carga | ● Sin tabla de posiciones derivada | ● Cierre administrativo | ●● Parcial | ●● Parcial | ●●● |
| Inteligencia artificial | ● Predictor incipiente; **no vender como IA** | — | — | — | — | — |
| Predicción / prode | ●●● Prode con ligas privadas y scoring automático | — | — | — | — | — |
| Integración con sistemas existentes | ●● OpenAPI de resultados, importación por planilla, WhatsApp, ingesta de terceros. **Falta integrar BDUAR** | ● Sin información pública | ●●● Es BDUAR | ● | ●● | ●●● |
| Compatibilidad multideporte | ●●● Rugby, hockey, fútbol americano, handball + catálogo de 17 | — Solo rugby | ● Solo rugby | ● Solo rugby | ●●● Multideporte | ●●● Multideporte |
| Instalación | ●●● Ninguna: PWA desde el navegador | ●●● Ninguna | ●● App a descargar | ●● App | ●● App | ●● |
| Tiempo de implementación | ●●● Un partido en la primera demo | ●●● Dos minutos, igual que G22 | ●● Alta federativa | ●● | ●● | ● Meses |
| Escalabilidad | ●●● Postgres + Vercel; ya opera dos deportes | ●● Sin información pública | ●●● | ●● | ●●● | ●●● |
| Mantenimiento | ●● 190 migraciones con rollback documentado; equipo chico | ●● Sin información pública | ●●● Recursos de la UAR | ●● | ●●● | ●●● |
| Soporte | ●● Fundador; acompañamiento en la demo | ●● Demo por WhatsApp | ●● Estructura federativa | ●● | ●● Por plan | ●●● |
| Ahorro operativo para el cliente | ●●● Elimina el doble ingreso de datos | ●● Digitaliza la carga en cancha | ●● Digitaliza la planilla | ●● | ●● | ●●● |
| Retorno de inversión | ●●● Horas + sponsors + costo evitado de desarrollo | ●● Primera sin costo para el club | ●●● Es gratis | ●● | ●● | ● |
| Facilidad de adopción | ●●● Dos minutos de instrucción por partido | ●●● Muy alta | ●● Obligatoria, y eso ayuda | ●● | ●● | ● |
| **Acceso sin cuenta ni rol federado** | **●●● Cualquiera entra y mira** | **●●● Cualquiera entra y mira** | **— Login de BDUAR obligatorio** | **— Solo usuarios del club** | **— Solo usuarios del club** | **●● Sitios públicos por federación** |
| **Sitio público para el hincha** | **●●● Fixtures, tablas, rankings, fichas, búsqueda** | **●● Marcador en vivo, sin navegación del torneo** | **— No tiene** | **● Marginal** | **● Marginal** | **●● Sitios con datos en vivo** |
| **Historial persistente de jugador** | **●●● Temporada tras temporada, de M16 a Primera** | **— No guarda los partidos** | **● Interno** | **●● Interno** | **●** | **●●** |
| **Cobertura de juveniles** | **●●● Cada categoría con su tabla propia** | **●● Pero el club las paga aparte** | **●● Administrativa** | **●●** | **●●** | **●●** |
| **Producto de audiencia** | **●●● Prode, fantasy, push, favoritos, placas** | **—** | **—** | **—** | **—** | **—** |

Las cinco últimas filas están en negrita a propósito: son las cinco donde G22 gana sin discusión, y son las cinco sobre las que hay que construir todo el discurso comercial. En las quince de arriba, G22 empata o pierde contra alguien. La primera de las cinco —**acceso sin cuenta**— es la que explica a las otras cuatro: si hay que pedir permiso para entrar, no hay hincha, no hay audiencia, no hay sponsor y no hay ficha que nadie mire. Contra Rugby Pro Score, en cambio, esa fila empata y la que decide es **historial persistente**: es la única de las veinte donde ellos marcan cero y G22 marca lleno.

**Cara a cara con Rugby Pro Score — el único empate real**

Contra la UAR y Rugby Manager, la línea que decide es *abierto contra cerrado*. Contra Rugby Pro Score esa línea no sirve: los dos son abiertos, los dos cargan en dos minutos desde el celular, los dos hacen la demo por WhatsApp. Empatan en catorce de las veinte filas de arriba. La diferencia está en cuatro:

- **Permanencia.** Ellos no guardan los partidos; G22 sí. Es la diferencia entre un marcador y una base de datos, y es la que se acumula: cada fin de semana que pasa, la ventaja de G22 crece sola y la de ellos vuelve a cero.
- **Tabla y acumulados derivados.** Sin archivo no hay tabla de posiciones, ni acumulado de jugador, ni ranking de clubes, ni historial cruzado. Todo eso en G22 sale solo de la carga que ya se hizo.
- **Indexación.** Sus páginas no aparecen en una búsqueda restringida a su propio dominio; las de G22 sí `[Encontrado]`. Un marcador que Google no ve no genera una sola visita orgánica: obliga a que alguien mande el link cada sábado.
- **Multideporte.** Ellos son solo rugby. G22 ya opera hockey sobre césped, fútbol americano y handball en producción.

**Cómo se dice en una reunión:** «lo que ellos te muestran el sábado, nosotros te lo mostramos el sábado y además te lo dejamos para siempre — con la tabla armada sola y la ficha de cada jugador creciendo temporada a temporada». No hay que atacarlos: hay que preguntar qué pasa con el partido del sábado pasado.

**Dónde G22 es mejor, más barato o más fácil**

- **Mejor:** es el único que entrega las tres capas juntas. Un club que hoy quiera lo mismo necesita Rugby Manager *más* un sitio propio *más* alguien que lo actualice.
- **Más barato:** el plan Pro (US$ 39) queda por debajo del Básico de Rugby Manager (≈US$ 64) entregando además el frente público. Contra Sportlomo o un desarrollo propio, la diferencia es de un orden de magnitud.
- **Más fácil:** cero instalación y una demo que es un partido real del cliente. El ciclo «ver para creer» dura un fin de semana, no un trimestre.
- **Más rentable para el cliente:** es el único cuyo output — una página con tráfico — es *vendible a un sponsor*. Los demás son costo puro.

---

## 04 · Precios de mercado

Todas las cifras con su etiqueta de evidencia. Las conversiones a dólares usan el tipo de cambio 1.100 ARS/USD que el propio proyecto tiene configurado para el cobro con MercadoPago — es un supuesto operativo del negocio, no una cotización de mercado.

**Software de gestión deportiva — precio de lista**

| Producto | Plan | Precio | Unidad | Evidencia |
| --- | --- | --- | --- | --- |
| Rugby Manager (AR) | Básico | ARS 70.000 ≈ US$ 64 | por club / mes | `[Encontrado]` · conversión a USD `[Supuesto]` |
| Rugby Manager (AR) | RM Plus | ARS 105.000 ≈ US$ 95 | por club / mes | `[Encontrado]` · conversión a USD `[Supuesto]` |
| Conecta Rugby (UAR) | App oficial | US$ 0 | — | `[Encontrado]` |
| GesDeportiva (CABB) | Federación | $ 1.500 | por club / año | `[Encontrado]` |
| Clupik — clubes AR | Pro / Elite | US$ 39 / 99 | por club / mes | `[Encontrado]` |
| Clupik — ligas LatAm | Amateur / Top | US$ 29 / 79 · US$ 199 / 599 anual | por liga / mes | `[Encontrado]` |
| Clupik — app propia | Add-on | US$ 49 | mes | `[Encontrado]` |
| Playoff (ES) | Base / Pro / Top | € 34,95 / 49,95 / 69,95 + IVA | por club / mes | `[Encontrado]` |
| LeagueRepublic | Gold S/M/L/XL | US$ 17,90 / 30,40 / 60,90 / 89,60 | por liga / mes, por nº de equipos | `[Encontrado]` |
| Spawtz | Escalonado | £ 15 → £ 5 | por equipo / trimestre | `[Encontrado]` |
| Jersey Watch | Anual | US$ 348 | por liga / año | `[Encontrado]` |
| SportsEngine | Express / Premium / Pro | US$ 79 / 129 mes · US$ 2.199 año | por organización | `[Encontrado]` |
| TeamSnap | Basic → Ultra | US$ 5,84 → 10,84 | por equipo / mes | `[Encontrado]` |
| Challonge | Premier | US$ 12 mes · 6,99 anual | por organizador | `[Encontrado]` |
| Sportlyzer | Full anual | € 1.000 | por club / año | `[Encontrado]` |
| Sportlomo | Federación | No publicado | — | `[Sin dato]` |

**Modelos por transacción — la alternativa al abono**

| Producto | Estructura | Evidencia |
| --- | --- | --- |
| PlayHQ | AUD 10 / 8 / 6 por registración según tamaño (<2.000 / <10.000 / <50.000 participantes) + 1,99% servicio + 1,99% comercio + AUD 0,30 | `[Encontrado]` |
| SportsEngine Motion | US$ 295 de setup + 1% fee tecnológico + 2,9% + US$ 0,30 de procesamiento, sin abono | `[Encontrado]` |
| LeagueRepublic | 1% por transacción sobre el plan | `[Encontrado]` |
| Jersey Watch | 3,5% + US$ 1 por transacción, trasladable al usuario | `[Encontrado]` |
| MercadoPago (el que usa G22) | Comisión vigente según acreditación | `[Sin dato en esta investigación]` |

**Datos deportivos y audiencia — el techo del negocio**

| Concepto | Precio | Evidencia |
| --- | --- | --- |
| API Sportradar, entrada | desde US$ 1.250 / mes | `[Encontrado]` |
| Sportmonks (fútbol) | desde € 34 / mes | `[Encontrado]` |
| The Odds API | US$ 30–249 / mes | `[Encontrado]` |
| Paquete de datos in-game para apuestas (~300 líneas/mes) | US$ 4.000–6.000 / mes; US$ 20–30 por partido adicional | `[Encontrado]` |
| Sportradar — contrato de datos Indian Super League, 4 años | > ₹57 crore ≈ US$ 6,8 M | `[Encontrado]` |
| Suscripción B2C de rugby (RugbyPass) | US$ 9,99 / 19,99 mes · US$ 99 / 199 año | `[Encontrado]` |
| Mercado global de software de gestión deportiva | US$ 4,3 B (2025) → 14,8 B (2033), CAGR 17,1% — Grand View · US$ 11,33 B (2026) → 19,15 B (2031), CAGR 11,07% — Mordor · US$ 8,25 B (2024) → 23,67 B (2031), CAGR 15,53% — Verified | `[Encontrado]` — las tres difieren por definición de alcance; usar el rango, no una cifra |
| Ingresos por sponsors de la UAR | ≈ US$ 10 M / año, 60% al rugby amateur | `[Encontrado]` |
| CPM publicitario digital en Argentina | — | `[Sin dato]` — IAB Argentina no publica una cifra accesible. No estimar el ingreso publicitario sobre un CPM inventado |
| Licitaciones públicas de software de rugby en LatAm | — | `[Sin dato]` — no se halló ninguna. Las decisiones se toman por desarrollo propio o contratación directa |

**Las tres lecturas que importan**

1. **El piso lo pone Conecta Rugby: cero.** El back-office de partido ya no se puede cobrar en rugby argentino. Cualquier precio debe justificarse con lo que la app oficial *no* hace.
2. **El techo por club lo pone Rugby Manager: ≈US$ 64–95/mes.** Es la prueba más valiosa de todo este informe: un club de rugby argentino ya paga ese número por software. La disposición a pagar existe y está medida.
3. **El techo por federación lo pone GesDeportiva: casi nada por club.** Una federación negocia por volumen y aplasta el precio unitario. Por eso el contrato de unión tiene que venderse como *plataforma* con precio de plataforma, nunca como «precio por club × cantidad de clubes».

---

## 05 · Modelos de negocio

Doce modelos evaluados. Las columnas de margen, dificultad y riesgo son juicio comercial `[Supuesto]` apoyado en los precios de §4 y en la estructura del producto; el precio potencial se ancla en datos donde existen.

| Modelo | Precio potencial | Margen | Dificultad de venta | Cierre | Escalabilidad | Inversión inicial | Recurrencia | Veredicto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 · Venta del sistema completo | US$ 40–120k | Alta una vez | Muy alta | 9–18 meses | Nula | Alta | Ninguna | **Descartar.** Mata el activo: si se vende el sistema, se pierde la base de datos histórica, que es lo único defendible |
| 2 · Hardware + software | — | — | — | — | — | — | — | **No aplica.** El producto no tiene hardware y no debería tenerlo |
| 3 · Proyecto de integración | US$ 8–25k por unión | Media | Alta | 6–12 meses | Baja | Media | Ninguna | Solo como *envoltorio contable* para que una unión pueda imputarlo a un proyecto en vez de a un abono |
| 4 · Licencia de software | US$ 5–15k / año | Alta | Alta | 6–12 meses | Media | Baja | Anual | Viable para una unión que exija propiedad. Segunda opción |
| 5 · SaaS multi-tenant | US$ 15–149 / mes | Muy alta | Media | 1–3 meses | Muy alta | Ya hecha | Mensual | **Núcleo del negocio.** Ya está construido y cobrando |
| 6 · Suscripción anual con descuento | 10 meses por 12 | Muy alta | Media | 1–3 meses | Muy alta | Baja | Anual | **Sí, y prioritario.** El deporte amateur es estacional: cobrar por temporada calza con cómo la unión presupuesta |
| 7 · Pago por «cabina» → **por categoría / torneo** | US$ 8–20 por categoría / mes | Alta | Media | 1–2 meses | Alta | Baja | Mensual | **Sí.** Es la unidad natural de valor: cada categoría es su propio torneo con su tabla. Escala con el uso real |
| 8 · Pago por «planta» → **por club o unión** | US$ 39–149 club · US$ 3–12k unión/año | Muy alta | Media a alta | 2–6 meses | Alta | Baja | Anual | **Sí — el contrato grande.** Una unión firma una vez y entran 30 clubes |
| 9 · Contrato de mantenimiento | 15–20% del contrato | Media | Baja | — | Media | Nula | Anual | Solo tiene sentido acompañando el modelo 4 |
| 10 · Reparto de ahorro | — | — | Muy alta | >12 meses | Nula | Alta | Variable | **Descartar.** El ahorro son horas de voluntarios y dirigentes, no una factura de energía. No es auditable, entonces no es cobrable |
| 11 · Piloto pago + implementación | Piloto US$ 0–400 | — | Baja | 2–6 semanas | Alta | Baja | Convierte a 5/6/8 | **Sí, como puerta.** Pero el piloto *gratuito* de un partido es mejor: elimina la única decisión que puede frenar a un dirigente |
| 12 · Consultoría + implementación | US$ 2–6k por carga histórica | Media | Baja | 1–2 meses | Baja | Nula | Ninguna | **Sí, como upsell.** Digitalizar el historial de un club de 100 años es un servicio con margen y crea dependencia sana |
| 13 · Publicidad y sponsors *(agregado)* | Depende del tráfico | Alta | Media | 3–9 meses | Muy alta | Nula | Por campaña | Solo con audiencia medida. Antes de vender esto hay que poder mostrar un número de Analytics |
| 14 · Licencia de datos *(agregado)* | US$ 500–5.000 / mes | Muy alta | Alta | 9–18 meses | Muy alta | Media | Mensual | **El premio a 3–5 años.** El endpoint OpenAPI ya existe. Requiere ser la fuente canónica del rugby argentino primero |

**El modelo de Rugby Pro Score valida la tesis — y deja ver dónde se equivocaron**

Su estructura es exactamente la que este informe recomienda en §10: **la unión paga poco y habilita; el club paga el resto.** Que alguien más haya llegado ahí de forma independiente es la mejor confirmación disponible de que es el modelo correcto para este mercado, y ahorra el costo de probarlo.

**Pero el corte que eligieron está invertido.** Hicieron que la unión pague la *Primera* y que el club pague las *juveniles*. La Primera es justamente la categoría que ya tiene cobertura: la publica el sitio de la unión, la levanta el medio local, la sigue el hincha igual. Las juveniles son la categoría que no existe en ningún lado, donde está el dolor y donde está la carga emocional — la madre del M17 que juega a doscientos kilómetros. Le pusieron precio a la puerta de entrada y regalaron lo que ya era gratis.

**La contrajugada de G22 es simple y no requiere construir nada:** incluir todas las categorías del club en un solo precio. Que la decisión del club sea «todo mi club, un precio», y no «cuánto me sale agregar la M17». Frente a un club que ya escuchó la propuesta de ellos, esa comparación se explica en una frase y gana.

**La combinación recomendada**

**SaaS anual por unión (8) como motor + SaaS mensual por club (5/7) como entrada + consultoría de carga histórica (12) como upsell + licencia de datos (14) como opción a largo plazo.** Los modelos 1, 2 y 10 se descartan explícitamente. El 11 se usa como táctica de entrada, no como línea de ingreso.

---

## 06 · Clientes potenciales

Seis segmentos, ordenados por prioridad comercial real. La prioridad no sigue el tamaño del cliente sino el producto de *dolor × capacidad de decidir rápido × arrastre*.

| Segmento | Problema concreto | Capacidad de pago | Acceso comercial | Probabilidad de adopción | Prioridad |
| --- | --- | --- | --- | --- | --- |
| **Unión provincial mediana** · 20–40 clubes | Sus juveniles y su femenino no existen públicamente; la tabla la actualiza una persona a mano; no tiene con qué ir a buscar un sponsor | Media. Presupuesto chico pero real; US$ 3–8k/año es defendible | **Alto.** Estructura chica, el presidente o el secretario deciden, se los ubica por WhatsApp | Alta | **1 — objetivo primario** |
| **Club de rugby grande** · 5+ categorías | Cinco partidos cada sábado y ninguna forma de seguirlos juntos; sin historial de jugadores; prensa del club rehaciendo todo a mano | Media-alta. Ya hay clubes pagando ≈US$ 64–95/mes a Rugby Manager | **Muy alto.** Se entra por la prensa del club o el entrenador, sin comité | Muy alta | **2 — puerta de entrada** |
| **Organizador de torneo independiente** · seven, TDI, copas, escuelas | Arma el torneo en Excel y lo publica por Instagram; cada edición arranca de cero | Baja-media. US$ 15–39/mes es su techo | **Muy alto.** Autoservicio puro, sin ciclo de venta | Alta | **3 — volumen y autoservicio** |
| **Club polideportivo / social** · rugby + hockey | Dos o tres deportes, cada uno con su planilla; ninguna vista unificada del club | Media-alta | Medio. Decide una comisión | Media | **4 — donde el multideporte gana** |
| **Federación nacional** · UAR, Chile, Uruguay, Brasil | Tiene resuelto el back-office; le falta el frente público y el producto de audiencia | Alta | **Bajo.** Ciclo largo, política interna, y en Argentina ya construyó lo suyo | Baja hoy | **5 — no antes del caso de éxito** |
| **Medios y sponsors** | No hay dato estructurado de rugby amateur argentino para cubrir ni para segmentar audiencia | Alta | Bajo hoy | Baja hoy | **6 — monetización posterior** |

### Organizaciones reales, por país

| País | Uniones y federaciones | Clubes y torneos | Lectura comercial |
| --- | --- | --- | --- |
| **Argentina** | 25 uniones de la UAR: URBA, Cordobesa, Tucumán, Rosario, Cuyo, Mar del Plata, Santafesina, Salta, Entrerriana, Nordeste, Oeste de Buenos Aires, Austral, Andina, Jujeña, Misiones, San Luis, Sanjuanina, Santiagueña, Santacruceña, del Sur, Valle de Chubut, Los Lagos del Sur, Tierra del Fuego, Formosa, UARV `[Encontrado]` | 91 clubes en URBA; Top 14, Primera A/B/C, Segunda, Tercera, femenino, juveniles e infantiles; Torneo del Interior A y B, Nacional de Clubes, Campeonato Argentino; CASI, SIC, Belgrano, Newman, Hindú, Alumni, CUBA, Regatas Bella Vista, Pucará, Champagnat, Los Tilos | **Mercado inicial.** ~450 partidos por fin de semana solo en URBA. Empezar por una unión del interior, no por URBA |
| Brasil | Confederação Brasileira de Rugby | Cobras Brasil Rugby (Súper Rugby Américas) | Segundo mercado por tamaño; barrera de idioma y de estructura |
| Chile | Chile Rugby | Selknam; clasificado al Mundial 2027 por primera vez `[Encontrado]` | **El más atractivo de la región.** Clasificación al Mundial = presupuesto, atención y urgencia de profesionalizar |
| Uruguay | Unión de Rugby del Uruguay | Peñarol Rugby, Yacaré XV | Chico pero maduro y cercano culturalmente |
| Colombia · México · Perú · Paraguay | Federación Colombiana de Rugby, FMRU | `[Sin dato]` de escala | Mercados de desarrollo; no priorizar |
| España | FERugby | División de Honor | Ya lo cubren Playoff y Clupik con precio público. Entrar solo con un diferencial claro |
| EE. UU. | USA Rugby, Major League Rugby | `[Sin dato]` — no relevado | Mercado caro de atender; SportsEngine y TeamSnap ya instalados |
| Regional | Sudamérica Rugby / CONSUR | Súper Rugby Américas: 7 franquicias en AR, BR, CL, UY | Vía de legitimación regional más que cliente pagador |

### Contexto de escala

- **134** — Uniones miembro de World Rugby
- **~8 M** — Jugadores registrados en el mundo
- **25** — Uniones provinciales argentinas
- **91** — Clubes en URBA
- **~45.000** — Jugadores URBA por fin de semana
- **US$ 10 M** — Sponsors anuales de la UAR
Todos `[Encontrado]`. Fuentes en §15. No se halló una cifra oficial consolidada de jugadores federados totales en Argentina `[Sin dato]` — no la uses en una propuesta.

### Dimensionamiento del mercado alcanzable

| Nivel | Definición | Cálculo | Valor anual |
| --- | --- | --- | --- |
| SOM año 1 · *lo alcanzable* | 3 uniones provinciales + 25 clubes pagos + 40 organizadores en autoservicio | 3 × US$ 5.000 + 25 × US$ 60 × 12 + 40 × US$ 20 × 12 | ≈ US$ 42.600 `[Supuesto]` |
| SAM Argentina rugby | 25 uniones + ~450 clubes de rugby `[Estimado]` a partir de los «+400 clubes» que declara Rugby Manager | 25 × US$ 5.000 + 450 × US$ 60 × 12 × 35% de penetración | ≈ US$ 238.000 `[Supuesto]` |
| SAM ampliado | + hockey, handball y fútbol amateur argentino, con el mismo motor multideporte | Multiplicador 4–8× sobre el SAM de rugby | US$ 1–2 M `[Supuesto]` |
| TAM referencia | Mercado global de software de gestión deportiva | Tres consultoras, tres definiciones | US$ 4,3–11,3 mil M `[Encontrado]` |

El TAM global es contexto, no una promesa: G22 no compite por él. El número que gobierna las decisiones del próximo año es el SOM: **alrededor de US$ 40.000 anuales recurrentes es un objetivo exigente pero alcanzable en doce meses**, y es suficiente para probar la tesis.

---

## 07 · FODA

**Fortalezas**

- **Técnicas:** producto en producción, no un demo. 190 migraciones con rollback documentado, 145 archivos de test, reloj de partido derivado del servidor y atómico ante operadores concurrentes.
- **Técnicas:** motor multideporte real — rugby, hockey sobre césped (23 torneos y 105 partidos en producción), fútbol americano y handball, con reglas propias por disciplina.
- **Producto:** única solución que integra sitio público, gestión y audiencia. Todo se deriva de una sola carga.
- **Comerciales:** embudo ya construido — dos landings segmentadas, captura de leads con atribución de origen, checkout funcionando.
- **Comerciales:** el argumento de venta más difícil de copiar es emocional y verificable en diez segundos: la ficha del jugador que sobrevive de M16 a Primera.
- **Económicas:** costo marginal por cliente casi nulo. Vercel + Supabase escala sin equipo de infraestructura.
- **Culturales:** el equipo documenta lo que el producto *no* hace y lo saca del copy. Eso sostiene la demo y evita la venta que se cae al primer uso.

**Oportunidades**

- **El hueco que dejó la UAR:** Conecta Rugby resuelve el back-office detrás de un login federado y no toca lo público. El espacio quedó vacío, y una federación no puede llenarlo sin renunciar al control de acceso que la define.
- **El entorno del jugador es un mercado sin atender:** madres, padres, hermanos, amigos y ex jugadores son cinco a diez veces más gente que los jugadores federados, y hoy ningún sistema del rugby argentino los deja entrar.
- **Juveniles y femenino:** la mitad del deporte, sin cobertura pública de nadie. Menor competencia y mayor carga emocional.
- **Mercado:** software de gestión deportiva creciendo a 11–17% anual con LatAm identificado como región emergente en las tres consultoras.
- **Chile 2027:** primera clasificación al Mundial. Presupuesto y urgencia de profesionalizar, en un mercado sin incumbente.
- **Multideporte:** el mismo motor abre hockey y handball argentinos, ambos con menos competencia que el rugby.
- **Sponsors:** la UAR mueve US$ 10 M anuales; las uniones provinciales capturan una fracción mínima por no tener propiedad digital medible.
- **Datos:** el endpoint OpenAPI ya existe. Ser la fuente canónica del rugby amateur argentino habilita un negocio de licenciamiento a 3–5 años.

**Debilidades**

- **Sin historial comercial:** no hay evidencia de clientes pagos ni de una temporada completa operada por un tercero. Es la debilidad número uno.
- **Sin métrica de audiencia publicada:** el discurso «tu torneo entra donde el hincha ya mira» necesita un número. Hoy no está a mano.
- **Sin carga offline:** el service worker solo cachea GET. En canchas del interior sin señal, no se publica nada en vivo. Es la objeción más previsible.
- **Sin exportación de datos:** hay export de placas, no de estadísticas. Una unión no debería firmar sin eso resuelto.
- **Dependencia de que el club cargue:** el producto entero depende de un voluntario con un celular. Si no carga, el partido queda vacío y se nota.
- **Recursos humanos:** equipo mínimo. Soporte, ventas y desarrollo recaen sobre las mismas personas — el cuello de botella no es técnico.
- **Dependencia de proveedores:** Supabase, Vercel y MercadoPago concentran riesgo operativo y de costo en dólares.
- **Ingesta de terceros:** importar de Flashscore, SofaScore y RugbyArchive tiene un riesgo de términos de uso que conviene revisar antes de vender el dato.

**Amenazas**

- **Rugby Pro Score gana la comparación en Córdoba y la usa para escalar.** Probabilidad alta, impacto alto: mismo producto, mismo discurso, misma jugada comercial, y publicando el mismo torneo que G22 ahora mismo — no es una amenaza futura, es una comparación en curso. *Mitigación:* velocidad, y atacar por donde ellos cobran — todas las categorías incluidas en un precio. Si además agregan archivo y tabla, la ventaja de G22 se reduce a la base histórica ya cargada y al multideporte; por eso cargar historia temprano no es un upsell, es una defensa.
- **Rugby Pro Score:** mismo producto, abierto como G22, publicando el mismo torneo de la Unión Cordobesa el mismo fin de semana. Si suma archivo y tabla, el diferencial se reduce mucho.
- **Que la UAR extienda Conecta Rugby al frente público.** Tiene los datos oficiales, la obligatoriedad y presupuesto, aunque su ejecución hasta hoy es floja. Si lo hace bien, el diferencial se evapora.
- **Rugby Manager,** con 400+ clubes declarados y relación con 25 uniones, sumando la capa pública que hoy le falta.
- **Clupik,** con vertical de rugby, presencia LatAm y precios públicos agresivos.
- **Sportlomo** entrando a Sudamérica por acuerdo con World Rugby.
- **Resistencia al cambio:** el dirigente amateur no cambia procesos a mitad de temporada, y la ventana de decisión es de pocas semanas al año.
- **Ciclos de venta largos:** las comisiones directivas se renuevan y la decisión se reinicia con ellas.
- **Riesgo reputacional en un ecosistema chico:** las uniones trabajan con gente de la UAR y todo lo que se diga vuelve. Quedar como «el que anda diciendo que el sistema oficial no funciona» cierra el mercado entero, y ninguna venta lo compensa. El análisis de los límites de BDUAR es interno: hacia afuera, la posición es siempre complementaria.
- **Ciberseguridad y datos de menores:** el sistema guarda planteles juveniles. Un incidente con datos de menores es existencial, no reputacional.
- **Concentración de clientes:** con tres uniones como base, perder una es perder un tercio del ingreso.

**Las cuatro amenazas que hay que gestionar activamente**

1. **Que la UAR amplíe Conecta Rugby hacia lo público.** Probabilidad media, impacto máximo — atenuada por una ejecución hasta hoy floja: adopción baja, quejas de usabilidad y un cierre digital que se traba sin médico presente. *Mitigación:* no posicionarse como sustituto sino como complemento, y buscar temprano una relación de integración con BDUAR en vez de una competencia frontal. Un G22 que *consume* el dato oficial es un aliado; uno que pretende reemplazarlo es un rival de una federación.
2. **Rugby Manager sumando la capa pública.** Probabilidad media-alta, impacto alto. Ya tiene la distribución que a G22 le falta. *Mitigación:* velocidad. La ventaja es de tiempo, y la base histórica cargada es lo que la vuelve durable.
3. **Datos de menores.** Probabilidad baja, impacto existencial. *Mitigación:* política de privacidad específica para juveniles, minimización de datos personales, consentimiento por club y auditoría de accesos, *antes* del primer contrato con una unión.

**Las tres oportunidades que hay que capturar ya**

1. **El hueco público que la UAR dejó abierto.** Es una ventana, no un estado permanente. Se captura firmando dos o tres uniones antes de que alguien la note.
2. **Juveniles y femenino como cabeza de playa.** Nadie los cubre, el dolor es alto y el argumento es imposible de rebatir. Además es donde la ficha histórica genera más apego.
3. **Chile rumbo al Mundial 2027.** Mercado con presupuesto fresco, urgencia y sin incumbente. Es la mejor apuesta de expansión regional y hay que empezar la conversación en 2026, no en 2027.

---

## 08 · Viabilidad comercial

| Factor | Evaluación | Veredicto |
| --- | --- | --- |
| Tamaño de mercado | SOM año 1 ≈ US$ 43k; SAM rugby argentino ≈ US$ 238k; ampliado a multideporte, US$ 1–2 M | **Chico pero suficiente** para un equipo pequeño rentable. No es un mercado de capital de riesgo |
| Demanda potencial | Demostrada: Rugby Manager cobra ≈US$ 64–95/mes a clubes de rugby argentinos, la CABB compró GesDeportiva, la UAR construyó su propia app | **Validada.** Nadie tiene que crear la categoría |
| Barreras de entrada | Bajas para construir un clon; altas para acumular base histórica, confianza institucional y hábito de hincha | **Correr rápido.** El foso se cava con datos y relaciones, no con código |
| Diferenciación | Las tres capas juntas; ficha de jugador persistente; cobertura de juveniles; multideporte | **Real y demostrable en una demo** |
| Competencia | Un competidor gratuito y oficial en el back-office; uno pago con distribución; uno regional con precio público | **Intensa, pero con un hueco claro** — nadie ocupa el frente público |
| Disposición a pagar | Confirmada al nivel del club. En la unión hay que probarla — no hay dato público de presupuesto de unión provincial `[Sin dato]` | **Alta en club, por validar en unión** |
| Tiempo de venta | Club: 2–6 semanas. Unión: 2–6 meses. Federación nacional: 9–18 meses | **Aceptable** si se empieza por club y unión |
| Complejidad de implementación | Un partido en la primera demo; una temporada completa migrada por planilla | **Baja — es la mayor ventaja operativa** |
| Expansión a otras «plantas» | De un club a su unión, y de una unión a las 24 restantes. El caso de éxito viaja solo en un ambiente donde todos se conocen | **Alta** |
| Replicación en otras industrias | El motor ya opera hockey sobre césped, fútbol americano y handball en producción | **Alta y ya probada,** no teórica |

### Cómo posicionarlo

La pregunta no es cosmética: define el precio, el contrato y quién firma.

| Posicionamiento | Implicancia | ¿Conviene? |
| --- | --- | --- |
| Producto | Cerrado, se compra y se instala | No — no hay nada que instalar |
| Software / SaaS | Abono por acceso a funcionalidad | Parcialmente. Es la mecánica de cobro, no el argumento |
| Servicio | Se vende trabajo humano | No — mata el margen y no escala |
| Plataforma | Dos lados: clubes que cargan, hinchas que consumen; el valor crece con cada carga | **Sí — es lo que estructuralmente ya es** |
| Solución industrial integral | Proyecto llave en mano | No aplica a este vertical |
| Empresa especializada | Casa de software vertical deportivo | Sí como identidad de marca, junto al anterior |

**El posicionamiento recomendado**

**Plataforma vertical de datos deportivos con capa SaaS de gestión.** «Plataforma» porque el valor no está en las funciones sino en la red que se forma cuando el club carga, el hincha mira y el sponsor paga por esa mirada. «Vertical» porque la ventaja es saber que el 2T de rugby arranca en 2400 segundos y que un hockey son cuartos de 15 — cosas que un genérico multideporte no modela bien. «Con capa SaaS» porque es la mecánica de cobro que ya está construida.

La diferencia práctica: una plataforma se vende diciendo *«tu torneo entra donde el hincha ya está»*; un software se vende listando funcionalidades. La primera frase justifica un precio; la segunda invita a compararlo con algo gratis.

---

## 09 · Estrategia de precios

El proyecto ya tiene planes implementados: Gratis, Inicial US$ 15, Pro US$ 39 y Organización US$ 149, con promo fundador de US$ 9 y US$ 29 por seis meses. La estructura es correcta. Los dos cambios que propongo son de *empaquetado*, no de números en el tramo bajo.

### La base de costos, y por qué no define el precio

| Costo | Mensual | Anual | Naturaleza |
| --- | --- | --- | --- |
| Supabase | US$ 200 | US$ 2.400 | Infraestructura de servicio |
| Vercel | US$ 150 | US$ 1.800 | Infraestructura de servicio |
| Claude Code | US$ 100 | US$ 1.200 | Desarrollo, no escala con clientes |
| RapidAPI | US$ 20 | US$ 240 | Datos externos |
| **Total** | **US$ 470** | **US$ 5.640** | **Fijo** `[Real]` |

Los cuatro son **costos fijos, no costos por cliente**: los planes de Supabase y Vercel ya están contratados y traen margen de crecimiento incluido, así que servir al club número treinta y uno no cuesta prácticamente nada. La consecuencia es que **el precio no se calcula sobre el costo** — se calcula sobre el valor entregado y sobre lo que cobra la competencia. El costo no dice cuánto cobrar; dice cuántos clientes hacen falta.

| Combinación | Ingreso bruto mensual | ¿Cubre los US$ 505 de equilibrio? |
| --- | --- | --- |
| Solo clubes C | — | Nunca alcanza: harían falta 34. **C es suministro de datos, no ingreso** |
| 7 clubes A | US$ 553 | Sí, pero es el segmento más difícil de conseguir primero |
| 12 clubes B | US$ 540 | Sí |
| **1 unión mediana + 2 clubes A + 4 B** | US$ 538 | **Sí — el camino más realista, y todo dentro de una sola unión** |

El umbral de US$ 505 asume un 7% entre comisión de MercadoPago e impuestos `[Supuesto]`. Los costos son datos reales aportados por el equipo. El cálculo no incluye remuneración del fundador: incorporarla mueve el equilibrio a una escala cercana a los 30 clubes.

### Calibración contra la competencia

Cada banda está puesta **por debajo del competidor más cercano de su segmento**. No por vocación de barato: sin clientes pagos, sin caso escrito y con una app oficial gratuita en el mercado, G22 todavía no tiene permiso para ser la opción cara.

| Competidor | Precio | Banda de G22 | Diferencia |
| --- | --- | --- | --- |
| Rugby Manager · RM Plus | ARS 105.000 ≈ US$ 95 `[Encontrado]` | A · US$ 79 | −17% |
| Rugby Manager · Básico | ARS 70.000 ≈ US$ 64 `[Encontrado]` | B · US$ 45 | −30% |
| Clupik Elite | US$ 99 `[Encontrado]` | A · US$ 79 | −20% |
| Clupik Pro *con MercadoPago* | US$ 35 + 15 = US$ 50 `[Encontrado]` | B · US$ 45 | −10% |
| Clupik Élite *con MercadoPago* | US$ 89 + 12 = US$ 101 `[Encontrado]` | A · US$ 79 | −22% |
| Competize · Manager profesional | € 81 ≈ US$ 88 por 30 competiciones `[Encontrado]` | A · US$ 79 | −10% |
| Score7 · Essentials / Pro / Unlimited | US$ 9 / 18 / 27 `[Encontrado]` | C · US$ 15 | El más barato del mercado; sin páginas de club ni ficha de jugador, y con su marca y publicidad en la página pública |
| Competize · Torneos pequeños | € 19 ≈ US$ 20,50 `[Encontrado]` | C · US$ 15 | −27% |
| Tournify *por evento* | Gratis hasta 8 equipos · € 40 hasta 60 · € 120 sin límite `[Encontrado]` | Torneo único | Modelo que G22 no cubre hoy |
| Conecta Rugby (UAR) | Gratis, cerrado `[Encontrado]` | Todas | Otro producto: back-office con login |
| Rugby Pro Score | Unión paga la Primera; el club paga cada categoría extra `[Sin dato]` de montos | Todas | G22 incluye todas las categorías |

Clupik **cobra aparte la integración con MercadoPago** —US$ 15 al mes en Pro, US$ 12 en Élite— y para un club argentino que le cobra a sus socios eso no es opcional. Contado así, su precio real es US$ 50 y US$ 101, y **la escalera de G22 queda por debajo de todos los competidores relevantes sin una sola excepción**. El mercado además tiene dos pisos: herramientas de torneo genéricas (Score7, Competize, Tournify, Challonge) entre US$ 9 y 27, y plataformas de club y federación (Clupik, Rugby Manager, Playoff) entre US$ 38 y 101. G22 debe fijar precio como el segundo grupo y defenderse del primero con profundidad de producto, no con descuento. La banda A se fijó en US$ 79 y no en US$ 99 —donde empataba con Clupik Elite y superaba a Rugby Manager Plus— porque a ese nivel se pierde el único mensaje de precio fuerte disponible. Cuesta unos US$ 900 de margen anual en el escenario realista y compra que ningún club grande pueda decir «me sale lo mismo que el otro». **Con dos casos escritos y tráfico medido, A vuelve a US$ 99.**

### Los tres niveles comerciales

|   | A · Alta capacidad · *máxima división o polideportivo* | B · Capacidad media · *Primera A/B — el objetivo* | C · Capacidad baja · *ascenso, rural, escuela, femenino* |
| --- | --- | --- | --- |
| Precio mensual | US$ 79 | US$ 45 | US$ 15 |
| Precio por temporada *(10 meses por 12)* | US$ 790 | US$ 450 | US$ 150 · o sin cargo a cambio de que carguen todas sus categorías |
| Torneos activos | 1 | Hasta 5 | Ilimitados |
| Categorías | **Todas** | **Todas** | **Todas** — cobrar por categoría frena lo que construye el activo |
| Ficha de jugador con historial | **Sí** | **Sí** | **Sí** — no se pone detrás de un plan |
| Página pública sin marca de agua | Sí | Sí | Sí |
| Fixture avanzado y estadísticas detalladas | — | Sí | Sí |
| Exportación de datos *(a construir)* | — | Excel / PDF | Excel / PDF / API |
| Placas para redes | Sí | Sí, con marca del club | Sí, con marca de la unión |
| Módulo de sponsors | — | Sí | Sí, con reporte de exposición |
| Varios administradores | — | — | Sí, con permisos por club |
| Marca blanca y dominio propio | — | — | Sí |
| Prode y fantasy del torneo | — | Sí | Sí, con ligas privadas de la unión |
| Carga histórica | — | 1 temporada | Hasta 5, cotizadas aparte |
| Soporte | Email | Prioritario | Dedicado + acompañamiento en la primera fecha |

### Los dos cambios respecto de lo implementado

1. **Eliminar «Inicial US$ 15» y subir el piso pago a US$ 19 con 3 categorías.** El plan de una sola categoría no le sirve a ningún club de rugby real — todos tienen mínimo Primera, Intermedia y una juvenil. Un plan que nadie puede usar solo produce fricción y bajas.
2. **Incluir todas las categorías del club en el precio del plan, sin cobrar por categoría adicional.** Es la contrajugada directa a Rugby Pro Score, que le cobra al club cada categoría que suma sobre la Primera. Convierte la conversación de «cuánto me sale agregar la M17» en «todo mi club, un precio», y de paso empuja al club a cargar juveniles — que es donde G22 acumula el dato que nadie más tiene. Cobrar por categoría maximiza el ticket de hoy y frena exactamente el comportamiento que construye el activo.
3. **Sacar Organización del abono mensual y convertirlo en contrato anual con precio a medida.** US$ 149/mes son US$ 1.788 al año: por debajo de lo que vale para una unión de 30 clubes, y encima presentado en el formato equivocado. Una unión no aprueba abonos mensuales; aprueba un renglón de presupuesto por temporada.

### Precio del canon de unión

Este es el precio de la **capa institucional sola** —el torneo—, no de la plataforma entera: los clubes compran su parte por separado (§10). Por eso los números son más bajos que un contrato central y por eso se aprueban sin asamblea.

| Nivel | Equipos inscriptos en el torneo | Canon por temporada | Costo por equipo e inclusiones |
| --- | --- | --- | --- |
| C · Chica | hasta 60 equipos | US$ 1.200 | ≈ US$ 20 · 3 licencias C sin cargo |
| B · Mediana *— objetivo primario* | 61 – 200 equipos | US$ 2.400 | ≈ US$ 12 · 6 licencias C sin cargo |
| A · Grande | 201 – 500 equipos | US$ 4.800 | ≈ US$ 10 · 12 licencias C sin cargo |
| A+ · URBA o federación nacional | 500+ equipos | US$ 6.000 – 12.000 | ≈ US$ 8 o menos · a medida |

Todos `[Supuesto]`: no existe un precio público de contrato de unión de rugby en LatAm. La unión se mide por **equipos inscriptos**, no por clubes — una unión de 30 clubes con seis categorías son 180 equipos — porque es lo que refleja la carga real y está publicado en el fixture. El costo por equipo baja con la escala, igual que en PlayHQ, Spawtz y LeagueRepublic `[Encontrado]`, y eso vuelve el precio no negociable: la unión no discute su número, verifica en qué banda cae. Cada banda incluye licencias C sin cargo para los clubes más chicos, que la unión asigna — es lo que la blinda del reclamo de que la plataforma es solo para los grandes.

### Otros precios

| Concepto | Precio | Racional |
| --- | --- | --- |
| Piloto | US$ 0 | Un partido real, acompañado. Cobrarlo agrega una decisión de presupuesto justo donde hay que eliminar fricción — y el trabajo marginal es de una tarde |
| Implementación inicial, unión | US$ 800 – 2.500 `[Supuesto]` | Alta de clubes, importación de fixture y planteles, capacitación. Bonificable al firmar el anual: es un cierre, no una línea de ingreso |
| Por categoría adicional | US$ 8 – 15 / mes | Unidad natural de crecimiento dentro del club |
| Instalación | US$ 0 | No hay nada que instalar, y decirlo es un argumento |
| Mantenimiento | Incluido | Es SaaS. Cobrarlo aparte lo haría parecer un desarrollo a medida y abriría una negociación innecesaria |

**Opciones de upselling**

- **Carga histórica:** US$ 500–3.000 por club o torneo según profundidad `[Supuesto]`. Alto margen, crea dependencia sana y es el mejor argumento emocional que existe.
- **Marca blanca con dominio propio** para la unión: +US$ 1.000–2.000 al año.
- **Módulo de sponsors con reporte de exposición:** se paga solo con un anunciante.
- **Deporte adicional** en el mismo club: +50% sobre el plan, no el doble.
- **Acceso API a los datos del torneo** para medios locales o para el sitio propio de la unión.
- **Torneo único, por evento:** US$ 39 hasta 24 equipos y US$ 89 sin límite, por hasta 30 días — el modelo que usa Tournify (€ 40 y € 120) `[Encontrado]` y que G22 hoy no cubre. El rugby argentino está lleno de eventos de una sola vez —seven, encuentros de infantiles, torneos de verano— cuyos organizadores nunca van a contratar una temporada. Descontando lo pagado del plan anual si contratan dentro de los 90 días, cada evento se convierte en un piloto pago. No requiere desarrollo: es empaquetado.

**Precio recomendado y su justificación**

**Club: US$ 49/mes o US$ 490/año. Unión mediana: US$ 6.000/año.**

- **Contra el costo:** el costo marginal de servir un club más es prácticamente cero. El costo real es soporte humano, y eso escala con la cantidad de cuentas, no con el precio.
- **Contra el valor generado:** §10 estima 400–500 horas administrativas anuales para una unión mediana. A cualquier valoración razonable de esa hora, US$ 6.000 se recupera con el ahorro de tiempo antes de contar sponsors o costo evitado de desarrollo.
- **Contra la competencia:** US$ 49 queda por debajo del Básico de Rugby Manager (≈US$ 64) `[Encontrado]` entregando además todo el frente público. Es el mensaje de precio más fuerte disponible: *más producto, menos plata*.
- **Contra el margen:** con 30 clubes y 3 uniones, el ingreso bruto ronda US$ 35–40k anuales con un costo de infraestructura de tres cifras. El margen bruto queda por encima del 85% `[Supuesto]`.

**Sobre la promo fundador:** mantenerla, pero cambiarle el nombre. «Precio fundador» sugiere que después sube y activa resistencia. «Tarifa temporada 2026» calza con cómo un club piensa el calendario y hace natural la recotización el año siguiente.

---

## 10 · ROI del cliente

Antes de los números, una advertencia que vale más que los números: **el ROI de una unión amateur no se construye sobre horas ahorradas.** Esas horas son de dirigentes y voluntarios, no salen de una factura, y ningún tesorero de unión las va a computar como ahorro. Presentar un ROI basado en costo horario es la forma más rápida de perder credibilidad en esa reunión. Los dos casos que siguen usan cada uno la palanca que corresponde a su comprador.

### Escenario 1 · Club que hoy ya paga software — el único ROI de caja dura

| Concepto | Valor | Evidencia |
| --- | --- | --- |
| Situación actual | Club de rugby con 5 categorías, pagando un SaaS de gestión de club | `[Encontrado]` — mercado real |
| Costo actual | ARS 70.000 / mes ≈ US$ 64 · US$ 768 / año | `[Encontrado]` — Abono Básico de Rugby Manager, precio en pesos verificado en su sitio · conversión a USD `[Supuesto]` a 1.100 |
| Inversión con G22 Profesional anual | US$ 490 / año | Propuesta de este informe |
| Ahorro directo | US$ 278 / año — 36% | Cálculo |
| Beneficio adicional no monetizado | Página pública del club, fixture y tabla en vivo de las 5 categorías, ficha histórica por jugador, placas para redes, módulo de sponsors | Producto verificable |
| **ROI** | **+57% sobre la inversión, desde el primer mes** | Es sustitución de un gasto existente |
| **Payback** | **Inmediato** | No hay inversión incremental |

Este es el caso más fácil de vender y el único cuyo ahorro aparece en un extracto bancario. Si en la prospección aparece un club que ya paga software, es la primera puerta que hay que golpear.

### Escenario 2 · Unión provincial mediana — 28 clubes

**Situación actual y costos**

| Variable | Valor | Origen |
| --- | --- | --- |
| Clubes | 28 | `[Supuesto]` — perfil de unión del interior |
| Partidos por fin de semana | ~70 | `[Estimado]` — 28 clubes ÷ 2 × 5 categorías. Consistente con URBA, que con 91 clubes y ~10 niveles de categoría juega ~450 `[Encontrado]` |
| Fechas por temporada | 18 | `[Supuesto]` |
| Partidos por año | ~1.000 | Cálculo: 70 × 18 = 1.260, redondeado a la baja por fechas libres y suspensiones |
| Minutos administrativos por partido, cadena completa | 15 – 25 – 35 | `[Supuesto]` — transcribir, consolidar, publicar |
| Horas administrativas al año | 250 – 415 – 583 | Cálculo |
| Sponsors digitales vendibles hoy | 0 | No hay propiedad digital con audiencia medible |
| Costo de construir algo equivalente | US$ 75.000 – 240.000 | `[Estimado]` — 2,5 a 4 años-desarrollador, derivado del volumen del repositorio (806 commits, 190 migraciones, 205 endpoints, 1.380 archivos) a un costo cargado de US$ 2.500–5.000 mensuales `[Supuesto]` |

**Tres escenarios de retorno**

| Concepto | Conservador | Realista | Optimista |
| --- | --- | --- | --- |
| Horas administrativas liberadas | 250 h | 415 h | 583 h |
| Sponsors digitales vendidos | 1 · US$ 1.200 | 2 · US$ 3.000 | 3 · US$ 6.000 |
| Canon digital recuperado de los clubes · *US$ 15 / 20 / 25 por club/mes* | US$ 5.040 | US$ 6.720 | US$ 8.400 |
| **Ingreso y ahorro monetizable** | **US$ 6.240** | **US$ 9.720** | **US$ 14.400** |
| Inversión año 1 *(contrato + implementación)* | US$ 7.500 | US$ 7.500 | US$ 7.500 |
| Inversión recurrente | US$ 6.000 | US$ 6.000 | US$ 6.000 |
| **ROI año 1** | **−17%** | **+30%** | **+92%** |
| **ROI recurrente** | **+4%** | **+62%** | **+140%** |
| **Payback** | **> 24 meses** | **≈ 9 meses** | **≈ 6 meses** |

Las horas liberadas están calculadas pero **no valorizadas en dinero**, a propósito: no existe una cifra pública confiable de costo horario administrativo aplicable a una unión amateur argentina `[Sin dato]`, y valorizar horas de voluntarios es exactamente el error que vuelve inverosímil una propuesta. Se muestran como beneficio operativo, no como ingreso.

**Lo que este cálculo revela — y es la conclusión más importante del informe**

Sin el canon recuperado de los clubes, **el contrato de unión no cierra en ningún escenario**: US$ 1.200 a 6.000 de sponsors contra US$ 6.000 de abono da negativo o apenas empata. Con el canon, cierra en dos de los tres escenarios.

De ahí sale la estructura comercial correcta: **dos compradores que pagan por dos productos distintos.** El precedente argentino existe — GesDeportiva le cobra por club a la Confederación de Básquetbol, $ 1.500 al año por club `[Encontrado]` — y Rugby Pro Score ya opera una variante en Córdoba, cobrándole la Primera a la unión y las categorías extra al club.

**Modelo recomendado — canon institucional más plan de club:**

| Paga | Compra | Precio |
| --- | --- | --- |
| La unión | El **torneo**: sitio oficial con su marca, fixture y tabla de todas las divisiones, estadísticas consolidadas, exportación, reporte de temporada, soporte dedicado. Lo usan todos sus clubes sin costo | US$ 1.200 – 3.600 / temporada |
| El club | Su **casa**: página propia, todas sus categorías incluidas, fichas de jugador con historial, placas, sponsors, panel | US$ 19 – 49 / mes |
| El hincha | Ver todo, sin cuenta | US$ 0 |

**La regla que sostiene el modelo:** el club que no paga *igual aparece en el torneo*, con su resultado y su posición. Sin club rehén, la unión puede pagar tranquila —no financia algo por lo que después le cobran a sus clubes— y el club paga por su propia casa, no por el derecho a existir.

**Evidencia de campo: para muchas uniones el canon directamente no entra**

La URNE, en agosto de 2026, rechazó avanzar diciendo que *no veía viable el gasto de la unión* `[Verificado en campo]`. Con eso, el modelo de cobro doble necesita **dos vías, elegidas por capacidad**, igual que los clubes: **canon** para uniones de banda A y A+ y las B con presupuesto propio; **adopción sin costo** para las de banda C y para toda B que diga que el gasto no es viable. En la segunda vía el ingreso sale entero de los clubes — 28 clubes en banda B son US$ 15.120 por temporada, bastante más que cualquier canon.

La regla operativa es rígida: **si la unión dice que el gasto no es viable, se cambia de vía en el acto, no se negocia el número.** Un canon regateado fija un techo con esa unión y con todas las que hablen con ella.

**Y el efecto contraintuitivo sobre el precio:** cobrarle a los dos hace que el número de la unión *baje*, de los US$ 3.000–12.000 que costaría toda la plataforma a US$ 1.200–3.600 por la capa institucional sola. Eso no resigna ingreso: lo aumenta, porque el canon entra en la firma del presidente sin pasar por asamblea y se suma a la adopción progresiva de los clubes. Una unión mediana con 17 de 28 clubes adheridos el primer año deja US$ 2.400 más US$ 3.876 = **US$ 6.276**, contra los US$ 6.384 del modelo de clubes solos *a adopción total*, que el primer año no ocurre nunca `[Supuesto]`.

**Qué es dato y qué es supuesto en esta sección**

- **Datos reales:** el precio de Rugby Manager, el precio de GesDeportiva a la CABB, los 450 partidos y 91 clubes de URBA, los US$ 10 M de sponsors de la UAR, y el volumen del repositorio de G22.
- **Estimaciones derivadas:** partidos por fin de semana de una unión mediana (por ratio de URBA), y el costo de reconstruir el sistema (por volumen de código).
- **Supuestos puros:** los 28 clubes, las 18 fechas, los minutos por partido, el valor de un sponsor digital provincial y el tipo de cambio. **Ninguno debe presentarse a un cliente como si fuera un dato.** En una propuesta real, estos números se completan con los del cliente en la primera reunión — y esa es, además, una buena excusa para pedirla.

---

## 11 · Estrategia de venta

| Canal | Viabilidad | Costo de adquisición | Ciclo | Rol |
| --- | --- | --- | --- | --- |
| **Venta directa a clubes** | Muy alta — el dirigente o el jefe de prensa deciden solos | Bajo: WhatsApp y un partido de demo | 2–6 semanas | **Canal principal** |
| **Venta directa a uniones** | Alta — estructura chica, decisión concentrada | Medio: reuniones y acompañamiento | 2–6 meses | **Canal principal** — es lo que da escala |
| Referencia entre clubes | Muy alta — el rugby argentino es un ambiente donde todos se conocen | Casi nulo | Semanas | **Multiplicador** — hay que provocarlo, no esperarlo |
| Autoservicio web | Alta para organizadores chicos: el checkout ya funciona | Nulo por venta | Días | **Cola larga** — volumen sin costo comercial |
| Prensa deportiva regional | Media — el medio local necesita el dato que G22 tiene | Bajo | Meses | Secundario: genera demanda, no cierra |
| Integradores y empresas de automatización | **No existen en este vertical** | — | — | Descartar |
| Alianzas con Siemens, Schneider, ABB, Rockwell | **No aplica.** Son proveedores de automatización industrial, ajenos por completo a este mercado | — | — | Descartar |
| Consultoras | Baja — el ticket no paga su intervención | Alto | Largo | Descartar |
| Licitaciones | No se halló ninguna licitación pública de software de rugby en LatAm `[Sin dato]` | — | — | Descartar hasta que aparezca evidencia |
| Partners tecnológicos *(marcas deportivas, medios, apuestas reguladas)* | Media a futuro | Medio | Largo | Etapa 2, con audiencia medida |
| Sudamérica Rugby / World Rugby | Baja hoy, alta después del primer caso de éxito documentado | Alto | >12 meses | Legitimación regional, no ingreso |

**La arquitectura de canales**

**Principal:** venta directa, con la demo de un partido real como único material de venta que importa. **Secundarios:** referencia entre clubes — a provocar pidiendo una presentación concreta en cada cierre, no esperando que ocurra — y autoservicio para la cola larga. **Descartados por ahora:** integradores, consultoras y licitaciones. En un mercado de 25 uniones y unos cientos de clubes, *toda la lista de prospectos entra en una planilla*. No hace falta un canal indirecto para llegar a un universo que se puede recorrer a pie.

---

## 12 · Entrada al mercado

Plan concreto para conseguir el primer cliente pago. Está construido sobre la mecánica que las landings del propio proyecto ya describen — la demo con un partido real — porque es la correcta y ya está escrita.

### Cliente ideal del primer contrato

**Un club de rugby del interior con cinco o más categorías, prensa activa en redes, y un torneo de unión que hoy no publica sus juveniles.** No la unión: el club. El club decide en una reunión, la unión decide en una comisión. Y un club que funciona es la mejor carta de presentación para la unión un mes después.

Señales de que es el club correcto: publica resultados en Instagram todos los sábados (ya siente el dolor y ya hace el trabajo); tiene juveniles compitiendo; alguien identificable se ocupa de la comunicación; y — la mejor señal de todas — ya paga algún software de gestión.

### Quién decide

| Rol | Qué le importa | Cómo entrarle |
| --- | --- | --- |
| **Jefe de prensa / comunicación del club** · *iniciador y campeón interno* | Que el sábado no sea un caos; tener material para publicar sin rehacerlo a mano | Es la puerta. Mostrale la página del club en vivo con las cinco categorías y la exportación de placas |
| **Entrenador o coordinador de juveniles** · *influenciador* | Tener los números el lunes sin mirar el video entero | Mostrale la ficha de un jugador con historial de tres temporadas |
| **Dirigente / secretario** · *decide y firma* | Que no genere trabajo nuevo, que no dependa de una persona sola, y cuánto sale | Precio anual cerrado, cero instalación, y el compromiso de acompañar la primera fecha |
| **Tesorero** · *veto* | Que entre en el presupuesto de la temporada | Tarifa anual por temporada, no abono mensual. Y si ya pagan otro software, el argumento es sustitución, no gasto nuevo |

### El problema a atacar en la primera conversación

Uno solo, y no es «tu gestión es ineficiente»: **«el sábado tu club juega cinco partidos y nadie de afuera puede seguir ninguno».** Es concreto, ocurre todas las semanas, lo sufre la persona con la que estás hablando, y la solución se demuestra en una pantalla. Todo lo demás — estadísticas, historial, sponsors, prode — es lo que se descubre después de entrar, no lo que abre la puerta.

La versión de esa frase que cierra reuniones agrega el nombre de alguien: **«la madre de un M17 que juega de visitante a doscientos kilómetros hoy no tiene forma de saber cómo va. Ni el sistema de la UAR ni el de ustedes se lo permiten, porque los dos piden usuario. El nuestro no.»** Nadie discute eso, porque todos en la sala conocen a esa madre.

### La oferta inicial

| Elemento | Definición |
| --- | --- |
| Qué se ofrece | Cargar un partido real del club, en vivo, acompañado, el fin de semana que le quede cómodo |
| Precio del piloto | US$ 0 |
| Duración | Un fin de semana para el primer partido; **cuatro fechas** para el piloto completo, que es lo que tarda en volverse hábito |
| Qué hace G22 | Alta del club, carga del plantel, capacitación de 15 minutos por WhatsApp, y presencia remota durante el primer partido |
| Qué hace el club | Poner una persona en la mesa de control con un celular |
| Qué queda | Todo lo cargado queda publicado, aunque el club no siga. La demo no se borra — y ese compromiso es lo que la vuelve creíble |
| Compromiso pedido | Ninguno de compra. Uno solo: una reunión de 20 minutos al terminar la cuarta fecha |

### KPIs del piloto

| KPI | Qué mide | Umbral de éxito |
| --- | --- | --- |
| Partidos cargados / partidos jugados | Adopción real, el único KPI que de verdad importa | ≥ 80% en la fecha 4 |
| Categorías activas | Si se expandió más allá de Primera | ≥ 3 de 5 |
| Personas distintas que cargaron | Si dejó de depender de un héroe | ≥ 2 |
| Minutos por partido cargado | Fricción operativa | ≤ 5 min de trabajo adicional |
| Visitas a la página del club | Que la audiencia apareció | Tendencia creciente en 4 fechas |
| Placas exportadas y publicadas | Que se integró al flujo de comunicación del club | ≥ 1 por fecha |
| Errores de carga corregidos a posteriori | Confianza en el dato | Tendencia decreciente |

### Cómo demostrar el valor y convertir

El informe de cierre del piloto tiene que ser corto y tiene que mostrar cuatro cosas: **lo que existe ahora y antes no existía** (la lista de partidos publicados, con link), **quién lo miró** (visitas a la página del club), **lo que se dejó de hacer** (la tabla se actualizó sola, las placas salieron del sistema), y **lo que queda si dicen que no** (todo, publicado, pero congelado).

La conversión no se pide como «¿lo compran?» sino como una pregunta de calendario: **«¿arrancamos la temporada completa desde la fecha que viene?»**. Es la diferencia entre pedir una decisión de presupuesto y pedir una decisión de continuidad — y a esta altura ya hay una persona adentro del club que no quiere volver a la planilla.

### Si el club ya vio a Rugby Pro Score

Va a pasar, sobre todo en Córdoba y en el Torneo del Interior. No hay que compararse por funcionalidades, porque en la mayoría se empata y el que compara pierde. Hay que hacer dos preguntas y dejar que las conteste el club:

1. **«¿Dónde está el partido del sábado pasado?»** Si no lo pueden abrir, la diferencia queda demostrada sin que la hayas afirmado. Y si el club ya venía cargando con ellos, esa temporada perdida duele más de lo que cualquier argumento puede lograr.
2. **«¿Cuánto les sale sumar la M17 y la M19?»** En su modelo, cada categoría es un extra que paga el club. En el de G22, están incluidas. Es la única comparación de precio que conviene hacer, porque es la única donde el número juega a favor.

Y una corrección sobre el orden de la prospección, porque el mapa no es el que parecía: **en Córdoba no hay una ventana que cerrar — ya están los dos adentro del mismo torneo.** G22 publica el Top 10 del Centro y ellos transmiten la Primera de la UCR: es el mismo campeonato, las mismas fechas, los mismos clubes. No es entrar a desplazar a un proveedor instalado; es una comparación que ya está ocurriendo delante del cliente, se juegue o no.

Eso cambia dos cosas. **Primero, Córdoba no se posterga: se atiende ya**, porque es la única unión donde el argumento no hay que explicarlo — se abre una pantalla al lado de la otra. Ellos muestran el partido de hoy; G22 muestra el de hoy, la tabla, los cinco anteriores y la ficha de cada jugador. **Segundo, la comparación deja de ser un pitch y pasa a ser producto:** lo que no esté visible en la primera pantalla de G22 no cuenta, porque el club va a mirar las dos y decidir sin llamar a nadie.

Hay además un argumento específico para la conducción de la UCR, con la reserva de que su contrato no es público `[Supuesto]`: si la unión le está pagando a un proveedor por cubrir la Primera, está pagando por una categoría que **ya se publica en G22 sin costo, y con tabla e historial que el otro no tiene**. Esa conversación no se gana con una propuesta comercial: se gana mandando los dos links.

### Cómo convertir el primer caso en los siguientes

1. **Documentar el piloto como caso, con nombre y números.** Un PDF de dos páginas: partidos publicados, categorías cubiertas, visitas, y una cita textual del jefe de prensa. Sin eso, el segundo cliente cuesta lo mismo que el primero.
2. **Pedir la presentación en el mismo momento del cierre**, y pedirla concreta: «¿a qué dos clubes de tu torneo les serviría esto?». En un ambiente donde todos se conocen, la referencia directa vale más que cualquier campaña.
3. **Usar al club como puerta a su unión.** Es literalmente lo que la landing ya promete: *«muchos torneos entraron porque un club llegó primero»*. Con dos o tres clubes de la misma unión publicando, la unión enfrenta un hecho consumado y la conversación cambia de «¿lo adoptamos?» a «¿cómo lo ordenamos?».
4. **Publicar la cobertura como contenido, y dejarla abierta.** Cada tabla de juveniles indexada y sin login es adquisición orgánica por partida doble: el club que la busca y la encuentra ya entiende el producto antes de la primera llamada, y la familia que la encuentra se vuelve usuaria sin que nadie le venda nada. **No poner nunca el resultado detrás de un registro** — sería renunciar a lo único que ningún competidor puede copiar.
5. **Repetir el patrón en la unión siguiente,** ya con dos casos documentados. El objetivo de doce meses es tres uniones y treinta clubes — no una federación nacional.

---

## 13 · Propuesta comercial

Estructura de la propuesta a presentar ante una unión o un club grande. Doce páginas como máximo; si no entra, es que todavía no está clara.

| # | Sección | Contenido | Regla |
| --- | --- | --- | --- |
| 1 | Problema | «Su torneo juega 70 partidos cada fin de semana. Hoy se publican los de Primera, y para ver el resto hay que tener usuario.» Con el número real del cliente, tomado en la primera reunión | Una página. El número tiene que ser **de ellos**, no del informe. Cerrar con la pregunta: ¿cuántas familias quedan afuera? |
| 2 | Solución | Una carga, y de ahí salen fixture, tabla, estadísticas, ficha de jugador y ranking | Mostrar una pantalla real, no un diagrama |
| 3 | Tecnología | PWA sin instalación, reloj de servidor, permisos por club, multideporte | Media página. Nadie compra por la arquitectura, pero un tecnólogo del otro lado puede vetar |
| 4 | Beneficios | Por rol: dirigente, prensa, entrenador, hincha | Cuatro bloques cortos, uno por persona en la sala |
| 5 | Lo que cambia | Tabla de antes y después, con el proceso actual del cliente | Es la sección que más convence |
| 6 | Números | El modelo de §10 con las cifras del cliente. Horas como beneficio operativo, sponsors y canon como ingreso | **Nunca valorizar horas de voluntarios en dinero** |
| 7 | Implementación | Alta, importación de fixture y planteles por planilla, capacitación, primera fecha acompañada | Enfatizar que no arrancan de cero |
| 8 | Cronograma | Semana 1 alta e importación · semana 2 capacitación · semana 3 primera fecha acompañada · semanas 4–7 piloto · semana 8 revisión | Ocho semanas, no un año |
| 9 | Precio | Tarifa por temporada, con el escalonado de §9 y lo incluido explícito | Un número, no un menú. El menú va en anexo |
| 10 | Soporte | Canal directo por WhatsApp, tiempos de respuesta comprometidos, acompañamiento de la primera fecha de cada temporada | Comprometer solo lo que un equipo chico puede cumplir un sábado |
| 11 | Garantías | Los datos son del club y se entregan si se van; el contenido publicado no se borra; sin permanencia mínima; salida sin penalidad | La ausencia de permanencia es un argumento de venta, no una concesión |
| 12 | KPIs | Los de §12, acordados antes de arrancar | Acordar el umbral *antes* convierte la renovación en una verificación, no en una negociación |
| 13 | Caso de uso | El piloto anterior, con nombre, links y números | Sin caso, esta sección se reemplaza por la demo en vivo — nunca por una promesa |
| 14 | Próximos pasos | Una sola acción con fecha: elegir el partido de la demo | Nunca cerrar con «quedamos a disposición» |

**Lo que la propuesta NO debe decir**

- **Que hay inteligencia artificial o mantenimiento predictivo.** No lo hay. Una sola pregunta del otro lado desarma toda la propuesta.
- **Que se puede cargar sin señal.** No se puede. Mejor llevar la respuesta preparada: se anota en papel y se carga al terminar; se pierde el minuto a minuto, no el dato.
- **Que se exportan las estadísticas.** Todavía no. Se exportan placas. Si la unión lo pide, se compromete con fecha (§14-I).
- **Una cifra de audiencia sin respaldo.** Si no hay un número de Analytics para mostrar, no se afirma.

---

## 14 · Recomendación final

### A · Cliente ideal

**El club de rugby del interior con cinco o más categorías y prensa activa** para el primer contrato, y **la unión provincial mediana de 20 a 40 clubes** como objetivo de escala. No la UAR ni URBA: son ciclos largos, política interna y, en el caso de la UAR, ya construyó lo suyo. La secuencia correcta es club → unión → región, y no al revés.

### B · Cinco competidores

**1. Rugby Pro Score** — el mismo producto, abierto como G22, mismo discurso de venta, publicando el mismo torneo que G22 en la Unión Cordobesa; le cobra la Primera a la unión y las demás categorías al club. **2. Conecta Rugby (UAR)** — gratis, oficial, obligatorio; define el piso de precio del back-office en cero. **3. Rugby Manager** — ARS 70.000–105.000/mes, 400+ clubes; es el competidor más comparable y la mejor prueba de disposición a pagar. **4. El sitio de la propia unión** — el incumbente institucional, y a la vez el mejor prospecto. **5. WhatsApp más Excel** — el sustituto que gana casi todas las veces y contra el que hay que diseñar la demo.

### C · Ventaja competitiva

**Ser el sistema abierto donde todos los demás son cerrados.** Conecta Rugby resolvió el back-office detrás de un login de BDUAR y dejó vacío el frente: nadie publica juveniles, nadie tiene ficha histórica de jugador, nadie le da al que mira desde afuera dónde mirar. Y la federación no puede corregirlo sin renunciar al control de acceso que es su razón de ser — **no es un descuido suyo, es una imposibilidad estructural**, y por eso la ventaja es defendible. Esa formulación además es la única segura: en un ecosistema donde las uniones trabajan con gente de la UAR, decir «no lo hicieron» cierra puertas y decir «no lo pueden hacer sin dejar de ser lo que son» las abre. **Y ser el único que además es permanente.** Rugby Pro Score también es abierto, así que contra ellos el eje se mueve: muestran el partido y lo pierden — sin archivo, sin tabla derivada, sin páginas que Google indexe. G22 gana en las cinco filas en negrita de §3, pero la que decide contra cada rival es distinta: *acceso sin cuenta* contra la UAR y Rugby Manager, *historial persistente* contra Rugby Pro Score. Todo lo demás es paridad. **El discurso comercial debe pararse solo ahí** — y no en «gestionamos tu torneo», que es exactamente donde G22 compite contra algo gratis.

### D · Cuánto cobrar

**Por capacidad de pago, con criterio público y verificable — la división del primer equipo para el club, los equipos inscriptos para la unión.** Nunca se pregunta cuánto pueden pagar. **Clubes:** A · alta capacidad —máxima división de su unión o polideportivo— US$ 79 al mes o US$ 790 por temporada; B · capacidad media —Primera A/B, el objetivo— US$ 45 o US$ 450; C · capacidad baja —ascenso, rural, escuela, femenino— US$ 15 o US$ 150, o sin cargo a cambio de que carguen todas sus categorías. Todas las categorías y la ficha con historial van en las tres bandas. **Uniones, por equipos inscriptos:** hasta 60 equipos US$ 1.200 por temporada; 61–200 US$ 2.400; 201–500 US$ 4.800; más de 500 US$ 6.000–12.000 a medida. Cada banda incluye licencias C sin cargo para los clubes más chicos. **Torneo único:** US$ 39 hasta 24 equipos y US$ 89 sin límite, descontables del plan anual dentro de los 90 días. **Piloto gratis siempre.** Toda la escalera queda por debajo de los competidores relevantes sin excepción, una vez contado el cargo por MercadoPago que Clupik factura aparte. **La banda A se fijó en US$ 79 y no en US$ 99** porque a ese nivel se pierde el único mensaje de precio fuerte disponible; con dos casos escritos y tráfico medido, vuelve a US$ 99.

### E · Modelo de negocio

**Cobro doble sobre dos productos separados: canon institucional a la unión más plan de club.** La unión paga entre US$ 1.200 y 12.000 por temporada según los equipos que inscriba, y compra *el torneo* —sitio con su marca, tablas de todas las divisiones, datos consolidados, exportación—; cada club paga entre US$ 15 y 79 mensuales según su división y compra *su casa* —página propia, todas sus categorías, historial de jugadores, placas, sponsors. El hincha no paga nunca. La línea es innegociable: **el club que no paga igual aparece en el torneo**, porque en el momento en que un club sienta que paga algo que la unión ya pagó, se caen las dos ventas. El canon de la unión es deliberadamente bajo para que entre en la firma del presidente sin pasar por asamblea, que es el obstáculo real de estas ventas. **Upsell:** carga histórica, marca blanca, deporte adicional. **Opción a 3–5 años:** licencia de datos vía el endpoint OpenAPI que ya existe. **Descartar:** venta del sistema, hardware y reparto de ahorro.

### F · Canal de ventas

**Venta directa, con la demo de un partido real como único material que importa.** Secundarios: referencia entre clubes — provocada, pidiendo dos nombres concretos en cada cierre — y autoservicio web para la cola larga, que ya está construido. Descartar integradores, consultoras y licitaciones: no existen en este vertical, y con 25 uniones y unos cientos de clubes todo el universo de prospectos entra en una planilla.

### G · Primer cliente

**Piloto gratuito de cuatro fechas en un club que ya publica resultados en Instagram todos los sábados** — ya siente el dolor y ya hace el trabajo. Entrada por el jefe de prensa, no por la comisión directiva. Alta, plantel cargado, quince minutos de capacitación, primera fecha acompañada. Cierre por calendario, no por presupuesto: *«¿arrancamos la temporada completa desde la fecha que viene?»*. Y de ahí a su unión, que es lo que la propia landing ya promete.

### H · Valor comercial

**Hoy, sin clientes pagos verificados: US$ 75.000 a 240.000**, por costo de reemplazo. La estimación deriva del volumen real del repositorio — 806 commits en 6,5 meses, 190 migraciones, 205 endpoints, 145 archivos de test, 1.380 archivos fuente — equivalente a entre 2,5 y 4 años-desarrollador `[Estimado]`, a un costo cargado de US$ 2.500 a 5.000 mensuales `[Supuesto]`. **Con ingreso recurrente, el múltiplo reemplaza al costo.** A US$ 40.000 de ARR y un múltiplo de 3 a 6 veces — habitual en SaaS vertical de nicho `[Supuesto]` — la valuación va a US$ 120.000–240.000; a US$ 150.000 de ARR, a US$ 450.000–900.000. La conclusión práctica: **el primer año de facturación vale más que otros seis meses de desarrollo.** Cada función nueva sin cliente pago mueve el numerador equivocado.

### I · Qué mejorar antes de vender

Cinco cosas, en orden de urgencia: **Llevar la planilla PDF al formato que la unión acepta.** Es lo primero y es trabajo chico con retorno desproporcionado: el proyecto *ya genera* la planilla; lo que falta es que tenga la forma del acta oficial. Con eso el club carga una vez en G22 desde el celular y se lleva el documento listo para firmar y volcar al sistema oficial — G22 reemplaza al papel, no a BDUAR, y la objeción de la carga doble deja de existir. **Resolver el resto de la cadena contra BDUAR.** Dos niveles más, del más rápido al más valioso: *(a)* la planilla del punto anterior, que no requiere permiso de nadie; *(b)* importación por fecha de lo que la unión ya carga, incluida la lectura de la foto del acta, con la importación por planilla y el OCR que ya están en el proyecto; *(c)* integración real con BDUAR, que es el premio pero depende de una conversación con la UAR. Mientras esto no exista, cada venta a una unión arranca cuesta arriba. **Exportación real de datos** a Excel y PDF. Hoy solo hay placas. Ninguna unión debería firmar sin esto, y ninguna propuesta debería prometerlo sin fecha. **Una métrica de audiencia publicable.** Todo el argumento «tu torneo entra donde el hincha ya mira» depende de un número que hoy no está a mano. Sin él, es una afirmación indefendible en la primera reunión. **Política de datos de menores.** El sistema guarda planteles juveniles. Consentimiento por club, minimización de datos personales y auditoría de accesos — *antes* del primer contrato con una unión, no después. **Cola de escritura offline** o, como mínimo, un modo de carga diferida para canchas sin señal. Es la objeción más previsible del interior y hoy no tiene respuesta técnica, solo una respuesta honesta. **Un caso documentado.** Dos páginas con nombre, links y números. Es lo más barato de producir y lo que más acelera el segundo cliente. **Hacer visible el archivo en el producto.** La permanencia es la ventaja decisiva contra el competidor más parecido, y hoy no se ve en la primera pantalla. Un «historial» navegable por club y por jugador, indexado, es lo que convierte esa ventaja en algo que el cliente nota sin que se lo expliquen. Y una cosa a **no** hacer: no construir más funcionalidades antes de tener un cliente pago. El producto ya excede lo que el mercado necesita para decidir; lo que falta es prueba comercial, no software.

### J · ¿Convertirlo en negocio?

**Sí, con una condición y un límite claros.** **Sí,** porque las tres preguntas que hunden a la mayoría de los proyectos ya están respondidas: el producto existe y funciona en producción; la demanda está probada — un competidor cobra ≈US$ 64 al mes por menos producto y una confederación argentina ya compró software de gestión; y hay un hueco real y verificable que la propia federación acaba de dejar abierto al resolver el back-office y no tocar lo público. **La condición:** dejar de construir y salir a vender. La brecha entre G22 y un negocio no es técnica — es que nadie pagó todavía. Seis meses más de desarrollo no mueven la aguja; tres clubes pagando la mueven entera. **El límite:** es un negocio de nicho, no una startup de capital de riesgo. El mercado alcanzable del rugby argentino ronda los US$ 240.000 anuales y llega a US$ 1–2 millones si el motor multideporte captura hockey y handball. Eso alcanza para un negocio rentable de equipo chico con márgenes altos, y no alcanza para una ronda de inversión. **Es una decisión, no una limitación** — pero conviene tomarla a conciencia, porque define si el próximo año se dedica a vender o a levantar capital. Con estos números, se dedica a vender.

---

## 15 · Fuentes y método

### Cómo se construyó

Tres fuentes de evidencia, en orden de confiabilidad. **Primera:** el repositorio del proyecto y el sitio en producción — todo lo de §1 se verificó leyendo código, migraciones, contenido de las landings e historial de git, y navegando g22scores.com. Donde el discurso comercial y el código diferían, mandó el código. **Segunda:** páginas oficiales de precios de competidores, sitios institucionales y prensa, consultadas en agosto de 2026. **Tercera:** informes de mercado de consultoras, usados solo como contexto de magnitud.

**Sistema de evidencia**

- `[Verificado]` — comprobado directamente en el código del proyecto o en el sitio en producción.
- `[Encontrado]` — publicado por una fuente citada, con URL.
- `[Estimado]` — derivado por cálculo a partir de un dato encontrado; la derivación se explicita.
- `[Supuesto]` — juicio comercial sin respaldo externo. No presentar a un cliente como dato.
- `[Sin dato]` — buscado y no hallado. Se declara en vez de rellenarse.

**Vacíos declarados**

No se hallaron, y por eso no se usan: cifra oficial consolidada de jugadores federados en Argentina; presupuestos o balances de la UAR, URBA y las uniones provinciales; cantidad de socios y cuota social de los clubes grandes; CPM publicitario digital argentino de IAB; tarifas de Sportlomo; licitaciones públicas de software deportivo en LatAm; y datos de tráfico propios de g22scores.com. Los cuatro primeros afectan directamente la precisión del ROI de §10 y deberían completarse con datos del cliente en la primera reunión.

### Fuentes citadas

**El proyecto**

- Repositorio Grupo-22-Scores: *src/lib/billing/plans.ts*, *src/content/para-clubes.ts*, *src/content/para-torneos.ts*, *CLAUDE.md*, *ESTADO.md*, *PRODUCT.md*, *supabase/migrations/*, historial de git (feb–ago 2026)
- [g22scores.com](https://g22scores.com) — sitio en producción, consultado el 28-ago-2026

**Competidores y precios**

- [Conecta Rugby — pantalla de login, única puerta de acceso](https://app.conecta.rugby/login) · [Conecta Rugby en Google Play — 1.000+ descargas, requiere credenciales](https://play.google.com/store/apps/details?id=com.bduar.app&hl=es_AR)
- [UAR — Conecta Rugby APP](https://uar.com.ar/conecta-rugby-app-la-nueva-aplicacion-movil-para-potenciar-la-gestion-y-capacitacion-del-rugby-argentino/) · [UAR — Conecta Rugby 2026](https://uar.com.ar/conecta-rugby-se-renueva-una-nueva-plataforma-y-la-actualizacion-de-capacitaciones-para-2026/)
- [Rugby Manager — planes y alcance](https://www.rugbymanager.com.ar/about/)
- [Rugby Pro Score — sitio y propuesta](https://www.rugbyproscore.com.ar/) · [marcador en vivo público, Primera UCR](https://www.rugbyproscore.com.ar/tv/e73469486129). Su modelo comercial —la unión paga la Primera, el club paga las demás categorías— fue aportado por el equipo de G22, no está publicado `[Supuesto verificable]`
- [CABB — GesDeportiva](https://www.argentina.basketball/liga-federal/noticia/26477/digitalizacion-transparencia-y-eficiencia-las-claves-del-sistema-gesdeportiva-utilizado-por-la-cab)
- [Clupik — precios Argentina](https://clupik.com/precios-arg/) · [Clupik — precios competiciones LatAm](https://clupik.com/precios-competiciones-latam/) · [Clupik — vertical rugby](https://clupik.com/software-rugby/)
- [Sportlomo — federaciones](https://sportlomo.com/national-sports-and-federations/)
- [PlayHQ — pricing](https://get.playhq.com/pricing) · [LeagueRepublic](https://us.leaguerepublic.com/pricing.html) · [Spawtz](https://www.spawtz.com/Products/League%20and%20Venue%20Management%20Software/Price) · [Jersey Watch](https://www.jerseywatch.com/pricing) · [Challonge](https://challonge.com/pricing) · [Playoff](https://playoffinformatica.com/precio/) · [Sportlyzer](https://www.sportlyzer.com/en/pricing)
- [SportsEngine Motion](https://www.sportsengine.com/motion/pricing/) · [SportsEngine (Capterra)](https://www.capterra.com/p/134125/SportsEngine/pricing) · [TeamSnap](https://www.teamsnap.com/pricing) · [TeamSnap (TrustRadius)](https://www.trustradius.com/products/teamsnap/pricing)
- [Rugby Xplorer](https://xplorer.rugby/) · [RugbyPass](https://www.rugbypass.com/app/)

**Mercado y datos deportivos**

- [UAR — las 25 uniones miembro](https://uar.com.ar/union/uniones-miembros/) · [Reglamento General UAR 2025](https://uar.com.ar/wp-content/uploads/REGLAMENTO_GENERAL_UAR-2025.pdf)
- [La Nación — URBA: 91 clubes, 45.000 jugadores, 450 partidos por fecha](https://www.lanacion.com.ar/deportes/rugby/el-torneo-urba-se-expande-91-clubes-nid2228845/) · [La Nación — Top 12 a Top 14 en 2026](https://www.lanacion.com.ar/deportes/rugby/urba-ampliara-la-cantidad-de-clubes-en-su-torneo-principal-en-2026-pasara-del-top-12-a-un-top-14-nid06122024/)
- [El Cronista — US$ 10 M anuales en sponsors de la UAR](https://www.cronista.com/apertura/empresas/los-secretos-del-rugby-argentino-para-atraer-millones-en-sponsors-sin-apostar-al-juego/)
- [World Rugby — 134 uniones, ~8 M jugadores](https://www.world.rugby/organisation/about-us/membership-growth?lang=es)
- [Chile — clasificación al Mundial 2027](https://es.wikipedia.org/wiki/Chile_en_la_Copa_Mundial_de_Rugby_de_2027) · [Súper Rugby Américas 2025](https://es.wikipedia.org/wiki/Super_Rugby_Am%C3%A9ricas_2025)
- [Grand View Research](https://www.grandviewresearch.com/industry-analysis/sports-management-software-market-report) · [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/sportsmanagementsoftware-market) · [Verified Market Research](https://www.verifiedmarketresearch.com/product/sports-management-software-market/) — software de gestión deportiva
- [LSports — costo de datos deportivos](https://www.lsports.eu/blog/sports-data-cost/) · [Sports Handle — datos oficiales para apuestas](https://sportshandle.com/sports-betting-official-data-cost/)
- [Similarweb — Promiedos](https://www.similarweb.com/es/website/promiedos.com.ar/) · [Yogonet — regulación del juego online por provincia](https://www.yogonet.com/latinoamerica/noticias/2025/07/23/105076-argentina-en-que-provincias-esta-regulado-el-juego-online)
- [URBA](https://urba.org.ar/) · [CBRu](https://brasilrugby.com.br/) · [Chile Rugby](https://chile.rugby/) · [URU](https://uru.org.uy/) · [FMRU](https://mexrugby.com/) · [FERugby](https://ferugby.es/)

**Nota sobre el encargo**

La consigna original describía un proyecto industrial de cabinas de pintura, sistemas HVAC, control predictivo e integración con PLC y SCADA. El proyecto conectado no tiene nada de eso: es una plataforma web de datos y gestión de torneos deportivos. Este informe aplica el mismo marco de las quince secciones al producto real. Las secciones que no tenían traducción posible — alianzas con Siemens, Schneider, ABB o Rockwell; venta de hardware; reparto de ahorro energético — se responden explicando por qué no aplican, en lugar de forzarlas.

Informe de estrategia comercial y competitiva · G22 Scores · 28 de agosto de 2026 · Construido sobre el repositorio del proyecto, el sitio en producción y 60+ fuentes públicas citadas. · Los datos etiquetados como Supuesto son juicio comercial y no deben presentarse a un cliente como hechos.
