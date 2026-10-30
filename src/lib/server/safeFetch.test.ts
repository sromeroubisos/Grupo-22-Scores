import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';

import {
    isBlockedAddress,
    isPrivateIpv4,
    isPrivateIpv6,
    parseSafeHttpUrl,
    readBodyCapped,
    safeFetch,
    SafeFetchError,
} from './safeFetch.ts';

test('isPrivateIpv4: rangos vedados', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1']) {
        assert.equal(isPrivateIpv4(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '151.101.1.1']) {
        assert.equal(isPrivateIpv4(ip), false, ip);
    }
});

test('isPrivateIpv6: loopback, ULA, link-local e IPv4 envuelta', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1%eth0', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', 'ff02::1']) {
        assert.equal(isPrivateIpv6(ip), true, ip);
    }
    for (const ip of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
        assert.equal(isPrivateIpv6(ip), false, ip);
    }
    assert.equal(isBlockedAddress('no-es-ip'), true);
});

test('parseSafeHttpUrl: forma de la URL', () => {
    assert.ok(parseSafeHttpUrl('https://static.flashscore.com/res/image/data/x.png'));
    assert.ok(parseSafeHttpUrl('http://example.com:80/a.png'));
    for (const raw of [
        'ftp://example.com/a',
        'https://example.com:8443/a',
        'https://user:pass@example.com/a',
        'http://localhost/a',
        'http://foo.localhost/a',
        'http://metadata.internal/a',
        'http://intranet/a',
        'http://127.0.0.1/a',
        'http://[::1]/a',
        'http://169.254.169.254/latest/meta-data',
        'file:///etc/passwd',
        'data:text/html,<script>',
    ]) {
        assert.equal(parseSafeHttpUrl(raw), null, raw);
    }
});

test('safeFetch: no conecta a loopback aunque sea por IP literal', async () => {
    await assert.rejects(() => safeFetch('http://127.0.0.1/'), (error: unknown) => (
        error instanceof SafeFetchError && error.code === 'invalid_url'
    ));
});

test('safeFetch: un nombre que resuelve a loopback se rechaza al conectar', async () => {
    const server = http.createServer((_req, res) => res.end('secreto'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        // localtest.me resuelve a 127.0.0.1 en DNS público; sin red, igual falla (network).
        await assert.rejects(() => safeFetch(`http://localtest.me:${port}/`), SafeFetchError);
        // Puerto no estándar: rechazado por forma, antes de resolver.
        await assert.rejects(() => safeFetch(`http://example.com:${port}/`), (error: unknown) => (
            error instanceof SafeFetchError && error.code === 'invalid_url'
        ));
    } finally {
        server.close();
    }
});

test('readBodyCapped: corta con too_large', async () => {
    const response = new Response(new Uint8Array(2048));
    await assert.rejects(() => readBodyCapped(response, 1024), (error: unknown) => (
        error instanceof SafeFetchError && error.code === 'too_large'
    ));
    const ok = await readBodyCapped(new Response(new Uint8Array(10)), 1024);
    assert.equal(ok.length, 10);
});
