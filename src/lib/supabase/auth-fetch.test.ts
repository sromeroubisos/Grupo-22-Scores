import test from 'node:test';
import assert from 'node:assert/strict';

import {
    __resetRefreshGraceForTests,
    coerceRefreshFailureToRetryable,
} from './auth-fetch.ts';

/**
 * El fallo de refresh se disfraza de 503 para sobrevivir a una carrera real
 * entre cliente y servidor. Lo que estos tests fijan es la otra mitad: que el
 * disfraz se caiga. Sin tope, un refresh token muerto devuelve el mismo error
 * para siempre, auth-js lo lee como reintentable, nunca emite SIGNED_OUT, y el
 * navegador queda pidiendo /token cada pocos segundos sin salida.
 */

const SUPABASE_URL = 'https://proj.supabase.co';
const REFRESH_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;

function respuestaMuerta() {
    return new Response(
        JSON.stringify({
            code: 'refresh_token_not_found',
            message: 'Invalid Refresh Token: Refresh Token Not Found',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
}

function initCon(token: string): RequestInit {
    return { method: 'POST', body: JSON.stringify({ refresh_token: token }) };
}

let relojEnMs = 1_700_000_000_000;

function instalarReloj() {
    const real = Date.now;
    relojEnMs = 1_700_000_000_000;
    Date.now = () => relojEnMs;
    return () => { Date.now = real; };
}

function avanzarReloj(ms: number) {
    relojEnMs += ms;
}

// Reintenta como reintentaría un cliente real, hasta que la coerción se rinda.
async function insistirHastaQueSuelte(token: string, topeDeIntentos = 20) {
    let ultima = respuestaMuerta();
    let intentos = 0;

    while (intentos < topeDeIntentos) {
        ultima = await coerceRefreshFailureToRetryable(
            REFRESH_URL,
            SUPABASE_URL,
            respuestaMuerta(),
            initCon(token),
        );
        intentos += 1;
        if (ultima.status === 400) break;
        avanzarReloj(5_000);
    }

    return { ultima, intentos };
}

test('la carrera sigue protegida: el primer fallo se disfraza de 503', async () => {
    __resetRefreshGraceForTests();

    const salida = await coerceRefreshFailureToRetryable(
        REFRESH_URL,
        SUPABASE_URL,
        respuestaMuerta(),
        initCon('token-en-carrera'),
    );

    assert.equal(salida.status, 503, 'el primer fallo tiene que seguir preservando la sesión');
    assert.equal(salida.headers.get('X-G22-Original-Auth-Status'), '400');
    assert.equal(salida.headers.get('X-G22-Auth-Preserved-Reason'), 'invalid_refresh_token');
});

test('la gracia se termina: el token muerto termina soltando su error real', async () => {
    __resetRefreshGraceForTests();
    const restaurar = instalarReloj();

    try {
        const { ultima, intentos } = await insistirHastaQueSuelte('token-muerto');

        assert.equal(ultima.status, 400, 'el bucle nunca soltó el error real de Supabase');
        assert.ok(intentos <= 6, `tardó ${intentos} intentos en cortar; el bucle tiene que morir rápido`);

        const cuerpo = await ultima.json() as { code?: string };
        assert.equal(cuerpo.code, 'refresh_token_not_found', 'auth-js necesita el código real para limpiar');
    } finally {
        restaurar();
    }
});

test('el presupuesto es por token: un muerto no se come la gracia de otra sesión', async () => {
    // En el servidor este módulo es uno solo para todos los usuarios. Un
    // contador global dejaría que el token podrido de alguien desloguee al
    // que sí está en una carrera legítima.
    __resetRefreshGraceForTests();
    const restaurar = instalarReloj();

    try {
        const gastado = await insistirHastaQueSuelte('token-de-otro-usuario');
        assert.equal(gastado.ultima.status, 400);

        const recienLlegado = await coerceRefreshFailureToRetryable(
            REFRESH_URL,
            SUPABASE_URL,
            respuestaMuerta(),
            initCon('token-de-un-tercero'),
        );

        assert.equal(recienLlegado.status, 503, 'la gracia de una sesión no se gasta en otra');
    } finally {
        restaurar();
    }
});

test('una renovación exitosa devuelve la gracia entera', async () => {
    __resetRefreshGraceForTests();
    const restaurar = instalarReloj();

    try {
        await insistirHastaQueSuelte('token-que-revive');

        await coerceRefreshFailureToRetryable(
            REFRESH_URL,
            SUPABASE_URL,
            new Response(JSON.stringify({ access_token: 'nuevo' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
            initCon('token-que-revive'),
        );

        const despues = await coerceRefreshFailureToRetryable(
            REFRESH_URL,
            SUPABASE_URL,
            respuestaMuerta(),
            initCon('token-que-revive'),
        );

        assert.equal(despues.status, 503, 'después de renovar bien, el expediente arranca limpio');
    } finally {
        restaurar();
    }
});

test('el rate limit se sigue preservando siempre, sin gastar gracia', async () => {
    // Un 429 es transitorio de verdad: no tiene por qué agotarse nunca.
    __resetRefreshGraceForTests();
    const restaurar = instalarReloj();

    try {
        for (let intento = 0; intento < 8; intento += 1) {
            const salida = await coerceRefreshFailureToRetryable(
                REFRESH_URL,
                SUPABASE_URL,
                new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } }),
                initCon('token-limitado'),
            );

            assert.equal(salida.status, 503, `el 429 dejó de preservarse en el intento ${intento + 1}`);
            assert.equal(salida.headers.get('X-G22-Auth-Preserved-Reason'), 'rate_limited');
            avanzarReloj(5_000);
        }
    } finally {
        restaurar();
    }
});

test('una llamada que no es de refresh no se toca', async () => {
    __resetRefreshGraceForTests();

    const original = new Response('{"error":"invalid_grant"}', {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
    });

    const salida = await coerceRefreshFailureToRetryable(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        SUPABASE_URL,
        original,
        { method: 'POST', body: JSON.stringify({ email: 'x@y.z' }) },
    );

    assert.equal(salida, original, 'el login con contraseña no pasa por la coerción');
});

test('un 500 de Supabase se deja pasar tal cual', async () => {
    // Ya es reintentable para auth-js: disfrazarlo no agrega nada y gastaría
    // gracia que le hace falta al 400.
    __resetRefreshGraceForTests();

    const original = new Response('boom', { status: 500 });
    const salida = await coerceRefreshFailureToRetryable(
        REFRESH_URL,
        SUPABASE_URL,
        original,
        initCon('token-con-servidor-caido'),
    );

    assert.equal(salida, original);
});
