import test from 'node:test';
import assert from 'node:assert/strict';

import { idDeJugador } from './rugbyPassMatchBundle.ts';

// EL PREFIJO DEL JUGADOR, desde la ficha de un partido.
//
// La formacion, la cronologia y la planilla salian con el slug pelado
// (`tommaso-menoncello`), y la pantalla arma el link con lo que le den:
// `/players/<id>`. Con el slug pelado la ficha abria igual —no daba 404— pero
// VACIA, con el slug de titulo, porque la API no lo reconocia como de RugbyPass
// y se lo pasaba a FlashScore.
//
// Es la tercera vez que el mismo descuido muerde: ya paso con la ficha del
// partido y con la del torneo. Por eso queda pinchado con un test.

test('el id de un jugador sale con el prefijo del proveedor', () => {
    assert.equal(idDeJugador('tommaso-menoncello'), 'rp-player-tommaso-menoncello');
    assert.equal(idDeJugador('ox-nche'), 'rp-player-ox-nche');
});

test('sin jugador no hay id, y no un `rp-player-null`', () => {
    // Un evento de reloj (arranque, entretiempo, final) no tiene jugador. Un id
    // armado igual seria un link a una ficha que no existe.
    assert.equal(idDeJugador(null), null);
    assert.equal(idDeJugador(undefined), null);
    assert.equal(idDeJugador(''), null);
});
