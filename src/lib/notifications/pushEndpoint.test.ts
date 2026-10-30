import assert from 'node:assert/strict';
import test from 'node:test';

import { isAllowedPushEndpoint } from './pushEndpoint.ts';

test('isAllowedPushEndpoint: acepta los push services de los navegadores', () => {
    for (const endpoint of [
        'https://fcm.googleapis.com/fcm/send/abc:def',
        'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
        'https://web.push.apple.com/QF1234',
        'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
        assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
    }
});

test('isAllowedPushEndpoint: rechaza destinos internos, http y hosts parecidos', () => {
    for (const endpoint of [
        'http://fcm.googleapis.com/fcm/send/abc',
        'https://fcm.googleapis.com:8443/fcm/send/abc',
        'https://169.254.169.254/latest/meta-data',
        'https://localhost/push',
        'https://storage.googleapis.com/bucket/obj',
        'https://evilpush.apple.com.attacker.example/x',
        'https://push.apple.com.evil.example/x',
        'https://notify.windows.com/x',
        'https://user:pass@fcm.googleapis.com/fcm/send/abc',
        'no es una url',
        '',
    ]) {
        assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
    }
});
