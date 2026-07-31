// UMBRALES DE CONVOCATORIA: dos por unión, sobre OVR crudo, con descuento por
// titularidad.
//
// La convocatoria contesta cuatro preguntas distintas y cada una tiene su
// perilla. Estos tests las vigilan POR SEPARADO, porque el error que hay que
// evitar es que al apretar una se afloje la otra sin que nadie se entere:
//
//   · cuán bueno hay que ser para ESA unión → DEBUT_BY_REPUTATION
//   · si el amateurismo descalifica         → AMATEUR_SURCHARGE
//   · si arrancás de titular o del banco    → STARTER_BY_REPUTATION
//   · cuánto te bancan una vez adentro      → SQUAD_DISCOUNT

import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EVENTS, buildCareerSummary, debutLevel, hashSeed, runCareer, starterLevel, unionReputation, type Chooser } from '../../index.ts';
import type { CareerState, StartRouteId } from '../../types/career.ts';

const rotating: Chooser = (e, s) => e.options[hashSeed(`${e.id}:${s.player.seasonsPlayed}`) % e.options.length].id;
const PUESTOS = ['prop', 'lock', 'backrow', 'scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback'] as const;

/** Muestra chica pero suficiente para separar bandas de 20% de bandas de 70%. */
const N = 120;

// `startRoute` es el de 1.28.0: 'amateur' = club del barrio, 'development' =
// academia de un club pago. Antes acá había un tipo con 'development' repetido,
// que era un typo inofensivo mientras las dos etiquetas hacían lo mismo.
function carreras(code: string, startRoute: StartRouteId): CareerState[] {
    const out: CareerState[] = [];
    for (let i = 0; i < N; i++) {
        out.push(runCareer(
            { position: PUESTOS[i % PUESTOS.length], nationalityCountryCode: code, startRoute },
            hashSeed(`${startRoute}:${code}:${i}`) % 0x7fffffff,
            rotating,
        ));
    }
    return out;
}

const PRO = 'full-time-professional' as const;

/**
 * UN REPRESENTANTE POR BANDA, del 0 al 5. Se declara una sola vez porque la
 * reasignación de 2026-07.6 movió nueve uniones de banda y estos tests tenían la
 * lista repetida en cinco lugares: Paraguay y Uruguay eran rep 0 y rep 1, y hoy
 * son rep 1 y rep 2. Con la lista suelta, corregirla en cuatro de los cinco
 * lugares era el resultado más probable.
 */
const BANDAS = ['cz', 'ro', 'ge', 'ar', 'ie', 'nz'] as const;

// ── La tabla, sin correr el motor ────────────────────────────────────────────

test('el abanico es ANCHO: en rugby el plantel de una unión es diminuto', () => {
    // Cuatro puntos entre la unión más chica y Nueva Zelanda era el problema
    // original. El abanico del rugby tiene que ser mucho más ancho que el de un
    // simulador de fútbol, no más angosto.
    const piso = debutLevel(BANDAS[0], PRO); // rep 0
    const techo = debutLevel('nz', PRO); // rep 5
    assert.ok(techo - piso >= 18, `el abanico quedó angosto: ${piso} a ${techo}`);
});

test('la escalera: monótona creciente y ningún salto menor a 3', () => {
    // Ésta es LA regla de forma, y es la única. La escalera completa no es el
    // diseño; el diseño es que subir de nivel de unión siempre cueste y que se
    // note. Un salto de 1 punto entre rep 1 y rep 2 —que es donde había quedado
    // una calibración anterior— borra una frontera real: jugar para Japón no
    // puede costar lo mismo que jugar para Uruguay.
    const porRep = [0, 1, 2, 3, 4, 5].map((rep) => {
        const code = BANDAS[rep];
        assert.equal(unionReputation(code), rep, `control: ${code} tiene que ser rep ${rep}`);
        return debutLevel(code, PRO);
    });

    const saltos = porRep.slice(1).map((v, i) => v - porRep[i]);
    for (const [i, salto] of saltos.entries()) {
        assert.ok(salto >= 3, `el salto rep${i}→rep${i + 1} es de ${salto}: la frontera desaparece (escalera ${porRep.join(', ')})`);
    }
});


test('la escalera sube siempre: ninguna unión más fuerte es más fácil', () => {
    // El reparto viejo tenía Australia (rep 4) MÁS difícil que Nueva Zelanda
    // (rep 5) en la medición. Acá se vigila la monotonía de la tabla.
    const codes = BANDAS;
    for (let i = 1; i < codes.length; i++) {
        assert.ok(
            debutLevel(codes[i], PRO) > debutLevel(codes[i - 1], PRO),
            `${codes[i]} no puede ser más fácil que ${codes[i - 1]}`,
        );
        assert.ok(
            starterLevel(codes[i]) > starterLevel(codes[i - 1]),
            `titular ${codes[i]} no puede ser más fácil que ${codes[i - 1]}`,
        );
    }
});

test('ser titular siempre cuesta más que entrar, y el recargo no lo toca', () => {
    for (const code of BANDAS) {
        assert.ok(starterLevel(code) > debutLevel(code, PRO), `${code}: titular tiene que costar más que debutar`);
        // El recargo del amateur se paga sólo para ENTRAR. Una vez adentro, el
        // tipo ya demostró que juega a ese nivel.
        assert.equal(starterLevel(code), starterLevel(code), `${code}: el titular no depende del vínculo`);
    }
});

test('el amateur paga un recargo y el profesional no', () => {
    for (const code of ['nz', BANDAS[1], BANDAS[0]]) {
        const amateur = debutLevel(code, 'amateur');
        const compensado = debutLevel(code, 'amateur-compensated');
        const semipro = debutLevel(code, 'semi-professional');
        const pro = debutLevel(code, PRO);

        assert.equal(semipro, pro, `${code}: el semipro ya no es amateur, paga lo mismo que el pro`);
        assert.equal(amateur, compensado, `${code}: compensado sigue siendo amateur, paga igual`);
        assert.ok(amateur > pro, `${code}: el amateur tiene que pelearla más arriba`);
    }
});

test('el recargo del amateur ESCALA con la reputación', () => {
    const recargo = (code: string) => debutLevel(code, 'amateur') - debutLevel(code, PRO);
    assert.ok(
        recargo('nz') >= recargo(BANDAS[0]) + 15,
        `el recargo tiene que abrirse mucho entre puntas (rep0 ${recargo(BANDAS[0])}, nz ${recargo('nz')})`,
    );
});

test('la ruta amateur: entra en una unión chica, es imposible de rep 3 para arriba', () => {
    // El techo REAL de la ruta amateur está MEDIDO, no supuesto: sobre 1.170
    // carreras amateurs el OVR pico topea en 77, con p99 en 73 y mediana 58.
    // Los modificadores suman poco encima (forma +3, escasez +2; el de club
    // nunca, y el de proyección sólo cuando el OVR todavía es bajo).
    //
    const TECHO_AMATEUR = 77;
    /**
     * LO QUE UN AMATEUR PUEDE PONER SOBRE LA MESA en su mejor temporada: el pico
     * medido más los dos únicos modificadores que le suman de verdad. El de club
     * no le toca nunca —juega en banda baja por definición, y el −3 no se le
     * cobra— y el de proyección se apaga a los 28, mucho antes de que un amateur
     * llegue a este pico.
     *
     * ACÁ VIVÍA `TECHO_AMATEUR + 15`, que era un margen inventado. La tabla de
     * debut bajó 6 en 1.27.0 y el umbral de rep 3 quedó en 92, o sea EXACTAMENTE
     * en ese margen: el test se puso rojo sin que "imposible para un amateur"
     * dejara de ser cierto ni por un décimo (medido, 0,0% de amateurs con caps en
     * Argentina). Un margen arbitrario que se convierte en un borde es un margen
     * mal escrito. Ahora la frontera es la de verdad —el valor máximo que un
     * amateur puede alcanzar— y no se mueve cuando se recalibra la tabla.
     */
    const VALOR_MAXIMO_AMATEUR = TECHO_AMATEUR + 3 + 2; // forma + escasez
    assert.ok(debutLevel(BANDAS[0], 'amateur') <= TECHO_AMATEUR - 10, 'rep 0 tiene que ser alcanzable para un amateur');
    assert.ok(debutLevel(BANDAS[1], 'amateur') <= TECHO_AMATEUR - 5, 'rep 1 tiene que ser alcanzable con esfuerzo');
    assert.ok(debutLevel('ar', 'amateur') > VALOR_MAXIMO_AMATEUR, 'rep 3 tiene que ser imposible para un amateur');
    assert.ok(debutLevel('nz', 'amateur') > 100, 'rep 5 no existe para un amateur');
});



test('una unión sin reputación modelada no rompe: cae al piso', () => {
    assert.equal(unionReputation(null), 0);
    assert.equal(unionReputation('xx-no-existe'), 0);
    assert.equal(debutLevel('xx-no-existe', PRO), debutLevel(BANDAS[0], PRO));
});

// ── El invariante que cierra la puerta de atrás ──────────────────────────────

test('NINGÚN evento puede otorgar caps', () => {
    // El problema de fondo no era que `nt-first-callup-nerves` estuviera mal
    // calibrado: era que un evento fuera un SEGUNDO camino de código para
    // otorgar caps. El segundo camino siempre se desincroniza del primero — acá
    // se desincronizó hasta regalar caps de los All Blacks a un jugador de 66.
    //
    // Los caps salen de `evaluateNationalTeam` y de nadie más. Un evento puede
    // mover CUÁNTO juega el que ya fue convocado (`testShare`), nunca sumar.
    const prohibidos = ['capBoost', 'caps', 'nationalTeam', 'nationalStatus'];
    for (const event of ALL_EVENTS) {
        for (const option of event.options) {
            for (const outcome of option.outcomes) {
                for (const key of prohibidos) {
                    assert.ok(
                        !(key in outcome.effect),
                        `${event.id} · ${option.id}: un evento no puede tocar '${key}'`,
                    );
                }
            }
        }
    }
});

test('un internacional representa a UNA sola unión (Reg. 8.2: la captura es definitiva)', () => {
    // Este test sostiene una decisión que se toma en otro lado: la antigüedad en
    // el plantel (`squadSeasons`, en `simulate-season.ts`) se cuenta como racha
    // de temporadas y NO se corta al cambiar de unión, porque cambiar de unión
    // después de debutar hoy es imposible — `captureFor` sella `capturedBy` y
    // `canRepresent` rechaza el resto.
    //
    // El día que se implemente la transferencia internacional del 8.6/8.8 —hoy
    // documentada como pendiente en `engine/eligibility.ts`— esto se va a poner
    // en rojo, y ahí hay que ir a cortar la racha por unión. Es el aviso.
    const todos = [
        ...carreras('ar', 'professional'),
        ...carreras('fj', 'professional'),
        ...carreras('uy', 'development'),
    ];
    let internacionales = 0;
    for (const state of todos) {
        const uniones = Object.keys(state.player.nationalStats);
        if (uniones.length === 0) continue;
        internacionales++;
        assert.equal(
            uniones.length,
            1,
            `caps con ${uniones.length} uniones (${uniones.join(', ')}): la captura dejó de ser definitiva`,
        );
        assert.equal(uniones[0], state.player.nationalTeam, 'la planilla no es de la camiseta que viste');
    }
    assert.ok(internacionales > 50, `sólo ${internacionales} internacionales: el test no probó nada`);
});

// ── El comportamiento, corriendo el motor ────────────────────────────────────

function pctConCap(states: CareerState[]): number {
    return (100 * states.filter((s) => buildCareerSummary(s).caps > 0).length) / states.length;
}

test('el cap de un tier 1 significa algo y el de un tier 3 es alcanzable', () => {
    // La separación es TODO el punto del cambio: antes el abanico entero eran
    // 8 puntos porcentuales (61,8% a 69,3%) y encima estaba invertido en el medio.
    const tier1 = pctConCap(carreras('nz', 'professional'));
    const tier3 = pctConCap(carreras('py', 'professional'));
    assert.ok(tier3 - tier1 >= 30, `la separación quedó chica (nz ${tier1.toFixed(0)}%, py ${tier3.toFixed(0)}%)`);
});

test('el amateur de una unión sin profesionales llega, y es la recompensa de la ruta', () => {
    // Si sos un jugador decente de una unión sin profesionalismo, jugás para tu
    // selección. Ése es el premio de la ruta amateur y ahora se cobra.
    //
    // LA MUESTRA CAMBIÓ con la reasignación de 2026-07.6, y el motivo es que la
    // muestra vieja dejó de describir lo que el test dice. Bélgica, Suiza y
    // Países Bajos juegan el Rugby Europe Championship: son primera división
    // europea y pasaron a rep 1, así que un amateur ahí ya no entra al 40% sino
    // al 20% — y está bien, porque ya no son "uniones sin profesionales". Los de
    // acá son rep 0 de verdad.
    // SE SACÓ EL TECHO DE 60%, y es una decisión de diseño, no una banda que se
    // aflojó porque molestaba. En una unión sin profesionales tiene que llegar
    // cualquiera más o menos competente: Tailandia tiene tres jugadores de nivel y
    // los tres juegan para Tailandia. Que casi todos sean convocados es el
    // fenómeno correcto, no un umbral flojo — de ahí a que le vaya bien hay un
    // trecho, y ése lo deciden los caps, el fixture y el rival.
    //
    // El techo estaba violado desde antes de 1.27.0 (medía 97,3% con la tabla
    // vieja y 99,2% con la nueva), así que tampoco estaba midiendo lo que creía.
    //
    // LO QUE SÍ SE VIGILA sigue vivo en otro test: que el cap de un tier 1
    // signifique algo y el de un tier 3 sea alcanzable exige 30 puntos de
    // separación entre puntas. Ahí está la historia, no en el techo de acá.
    const pct = pctConCap(['cz', 'at', 'no', 'dk'].flatMap((c) => carreras(c, 'amateur')));
    assert.ok(pct >= 25, `${pct.toFixed(1)}%: la ruta amateur volvió a quedarse sin selección`);
});

test('debutar joven es posible: las uniones eligen por proyección, no por el pico', () => {
    // El bono de edad es proporcional a lo que le falta al jugador para su techo.
    // Sin él, el internacional de un tier 1 debutaba a los 27-28 —cuando los de
    // verdad debutan entre los 21 y los 24— porque el portón terminaba midiendo
    // el OVR PICO, que llega a los 27.
    const edades = [...carreras('ie', 'professional'), ...carreras('ar', 'professional')]
        .map((s) => s.seasons.find((x) => x.capsGained > 0))
        .filter((x): x is NonNullable<typeof x> => x !== undefined)
        .map((x) => x.age);
    assert.ok(edades.length > 0, 'el escenario no se dio nunca: el test no probó nada');
    const media = edades.reduce((a, b) => a + b, 0) / edades.length;
    assert.ok(media <= 26, `la edad media de primer cap en un tier 1 quedó en ${media.toFixed(1)}`);
    const jovenes = edades.filter((a) => a <= 21).length;
    assert.ok(jovenes > 0, 'ni un solo debut a los 21 o menos en un tier 1: se perdió la cola de prospectos');
});


test('un amateur NO llega a los All Blacks ni a Los Pumas', () => {
    // 5,6% de amateurs en los All Blacks era un disparate. La tabla lo mata sin
    // ningún caso especial: el umbral con recargo es 110 en Nueva Zelanda y 92 en
    // Argentina, contra un valor máximo alcanzable de 82.
    //
    // ESTE TEST DEJÓ DE MEDIR AMATEURS EN 1.26.0 Y NADIE SE ENTERÓ. Cuando la ruta
    // pasó a ser una rama SORTEADA, `carreras(code, 'development')` dejó de
    // significar "carreras amateurs" y pasó a significar "carreras que arrancan
    // abajo" — la mayoría de las cuales termina profesional. El test seguía verde
    // porque el umbral era alto, no porque midiera lo que dice: con la tabla de
    // 1.27.0 saltó a 24,2% y la lectura literal habría sido "un cuarto de los
    // amateurs juega para los All Blacks", cuando el número real es 0,0%.
    //
    // Ahora se mide por TEMPORADA y no por carrera, y ésa es la unidad correcta.
    // Filtrar carreras "que nunca pasaron de amateur" tampoco servía: en Nueva
    // Zelanda son 2 de 120, así que la muestra no alcanzaba para probar nada. Lo
    // que hay que contar es cuántas temporadas jugadas SIENDO amateur dieron caps,
    // y de ésas hay miles —desde 1.26.0 todas las carreras arrancan amateur a los
    // 18—, así que el denominador es grande en cualquier unión.
    const AMATEUR = new Set(['amateur', 'amateur-compensated']);

    for (const code of ['nz', 'ar']) {
        let temporadasAmateur = 0;
        let conCaps = 0;
        // Rama AMATEUR: es donde viven las temporadas amateurs. Con la rama de
        // academia el jugador entra compensado y sale del escalón enseguida, así
        // que el denominador se caía a 141 y el test dejaba de probar nada.
        for (const state of carreras(code, 'amateur')) {
            state.history.forEach((h, i) => {
                if (!AMATEUR.has(h.employment)) return;
                temporadasAmateur++;
                if ((state.seasons[i]?.capsGained ?? 0) > 0) conCaps++;
            });
        }
        assert.ok(temporadasAmateur > 200, `${code}: sólo ${temporadasAmateur} temporadas amateurs, la muestra no prueba nada`);
        const pct = (100 * conCaps) / temporadasAmateur;
        assert.ok(pct <= 1, `${code}: ${pct.toFixed(1)}% de temporadas amateurs con caps es irreal`);
    }
});

test('la carrera internacional de un tier 1 tiene COLA, la de un tier 3 no', () => {
    // El objetivo de esta vuelta dejó de ser el promedio y pasó a ser la FORMA.
    // En el rugby real la distribución de caps es de cola larga: muchísimos se
    // quedan en menos de diez, un grupo llega a treinta o cuarenta, y unos pocos
    // pasan los ochenta.
    //
    // OJO CON EL PROMEDIO: con el estado `trial` los promedios volvieron a
    // invertirse (tier 1 58,2 contra tier 3 63,3) porque el tier 1 lava a una
    // parte grande de sus debutantes en la gira mientras el tier 3 los mete
    // derecho al plantel. La mediana cuenta la historia correcta —tier 1 50,
    // tier 3 62— y el promedio ya no es un objetivo. Está anotado en §17.
    const capsDe = (code: string) => carreras(code, 'professional')
        .map((s) => buildCareerSummary(s).caps)
        .filter((c) => c > 0);

    const tier1 = [...capsDe('ie'), ...capsDe('ar')];
    const tier3 = [...capsDe('py'), ...capsDe('uy')];
    assert.ok(tier1.length > 0 && tier3.length > 0, 'el escenario no se dio nunca');

    const cola = (xs: number[]) => xs.filter((c) => c < 10).length / xs.length;
    assert.ok(cola(tier1) >= 0.15, `el tier 1 perdió su cola: sólo ${(100 * cola(tier1)).toFixed(1)}% bajo 10 caps`);
    assert.ok(cola(tier1) > cola(tier3), 'la cola tiene que ser MÁS gruesa en el tier 1, que es donde se compite por el puesto');

    // Y la mediana por debajo del promedio: si están pegadas, no hay cola.
    const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
    const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(mediana(tier1) < promedio(tier1), 'la mediana del tier 1 tiene que quedar por debajo del promedio');
});


// ── El descuento por titularidad y la pérdida de la camiseta ─────────────────

test('el que entra al plantel se sostiene, pero no es impune', () => {
    // Antes, al que ya había debutado no se le aplicaba NINGUNA puerta —ni
    // umbral ni tope de edad— y su probabilidad tenía piso en 0,45: seguía yendo
    // a la selección cinco años después de caerse a 50. Eso no es inercia.
    //
    // Ahora: dos temporadas seguidas por debajo del umbral con descuento y se
    // queda sin la camiseta. Se verifica que el estado exista y sea coherente.
    const todos = [
        ...carreras('nz', 'professional'),
        ...carreras('ar', 'professional'),
        ...carreras('uy', 'professional'),
    ];

    const conCaps = todos.filter((s) => buildCareerSummary(s).caps > 0);
    assert.ok(conCaps.length > 0, 'el escenario no se dio nunca: el test no probó nada');

    for (const state of conCaps) {
        // Un internacional nunca vuelve a 'uncapped': o está adentro, o lo
        // dejaron afuera. `dropped` conserva los caps.
        assert.notEqual(state.player.nationalStatus, 'uncapped', 'un internacional no puede volver a ser uncapped');
        if (state.player.nationalStatus === 'dropped') {
            assert.ok(state.player.caps > 0, 'el que perdió la camiseta conserva sus caps');
            assert.notEqual(state.player.nationalTeam, null, 'la unión que lo capturó no se borra');
        }
    }

    const perdieron = todos.filter((s) => s.seasons.some((x) => x.lostShirt));
    assert.ok(perdieron.length > 0, 'nadie perdió nunca la camiseta: el descuento es impunidad otra vez');
});

test('perder la camiseta exige DOS temporadas seguidas afuera, no una', () => {
    // El caso de reset: una temporada floja no te saca. Es la inercia que el
    // rugby tiene de verdad.
    const todos = [...carreras('nz', 'professional'), ...carreras('ie', 'professional')];
    let revisadas = 0;
    for (const state of todos) {
        state.seasons.forEach((season, i) => {
            if (!season.lostShirt) return;
            revisadas++;
            const previa = state.seasons[i - 1];
            assert.ok(previa !== undefined, 'no se puede perder la camiseta en la primera temporada');
            assert.ok(!previa.calledUp, 'la temporada previa a perderla tiene que haber sido sin convocatoria');
            assert.ok(
                previa.nationalStatus === 'squad' || previa.nationalStatus === 'starter',
                'la temporada previa tiene que haber sido todavía dentro del plantel',
            );
        });
    }
    assert.ok(revisadas > 0, 'el escenario no se dio nunca: el test no probó nada');
});
