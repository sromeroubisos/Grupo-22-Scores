import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseSponsorAmount,
    selectPublicSponsors,
    summarizeSponsors,
    toPublicSponsor,
    validateSponsorInput,
    validateSponsorLogoDataUrl,
    validateSponsorLogoFile,
    type TournamentSponsor,
} from './sponsors.ts';

const sponsor = (over: Partial<TournamentSponsor>): TournamentSponsor => ({
    id: 'a',
    tournament_id: 't1',
    name: 'Marca',
    logo_url: null,
    amount: null,
    currency: 'ARS',
    status: 'active',
    tier: null,
    placement: null,
    website_url: null,
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
});

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('parseSponsorAmount acepta formatos locales y vacío', () => {
    assert.equal(parseSponsorAmount(''), null);
    assert.equal(parseSponsorAmount(null), null);
    assert.equal(parseSponsorAmount('1500'), 1500);
    assert.equal(parseSponsorAmount('1.500,50'), 1500.5);
    assert.equal(parseSponsorAmount('1,500.50'), 1500.5);
    assert.equal(parseSponsorAmount('1,5'), 1.5);
    assert.equal(parseSponsorAmount(12.345), 12.35);
    assert.equal(parseSponsorAmount('abc'), undefined);
    assert.equal(parseSponsorAmount({}), undefined);
});

test('validateSponsorInput exige nombre y no fija un monto por defecto', () => {
    const empty = validateSponsorInput({ name: '   ' });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.ok(empty.errors.name);

    const ok = validateSponsorInput({ name: ' Marca ', amount: '', status: undefined });
    assert.equal(ok.ok, true);
    if (ok.ok) {
        assert.equal(ok.value.name, 'Marca');
        assert.equal(ok.value.amount, null);
        assert.equal(ok.value.status, 'active');
    }

    const negative = validateSponsorInput({ name: 'M', amount: '-3' });
    assert.equal(negative.ok, false);

    const badStatus = validateSponsorInput({ name: 'M', status: 'paused' });
    assert.equal(badStatus.ok, false);

    const badLink = validateSponsorInput({ name: 'M', website_url: 'marca.com' });
    assert.equal(badLink.ok, false);

    const withLogo = validateSponsorInput({ name: 'M', logo_url: PNG_1PX, website_url: 'https://marca.com' });
    assert.equal(withLogo.ok, true);
});

test('el logo se valida por formato y tamaño', () => {
    assert.equal(validateSponsorLogoDataUrl(PNG_1PX), null);
    assert.ok(validateSponsorLogoDataUrl('data:text/plain;base64,aGVsbG8='));
    assert.ok(validateSponsorLogoDataUrl('data:image/bmp;base64,aGVsbG8='));
    assert.equal(validateSponsorLogoFile({ type: 'image/png', size: 1024 }), null);
    assert.ok(validateSponsorLogoFile({ type: 'image/png', size: 5 * 1024 * 1024 }));
    assert.ok(validateSponsorLogoFile({ type: 'application/pdf', size: 10 }));
    assert.equal(validateSponsorLogoFile({ type: '', size: 10, name: 'logo.svg' }), null);
});

test('el resumen suma solo los activos y avisa los que no tienen monto', () => {
    const summary = summarizeSponsors([
        sponsor({ id: 'a', amount: 1000 }),
        sponsor({ id: 'b', amount: 250.5 }),
        sponsor({ id: 'c', amount: null }),
        sponsor({ id: 'd', amount: 99999, status: 'inactive' }),
    ]);
    assert.equal(summary.total, 4);
    assert.equal(summary.active, 3);
    assert.equal(summary.inactive, 1);
    assert.equal(summary.activeAmount, 1250.5);
    assert.equal(summary.activeWithoutAmount, 1);
    assert.equal(summary.currency, 'ARS');
});

test('lo público nunca lleva el monto y excluye inactivos', () => {
    const publicList = selectPublicSponsors([
        sponsor({ id: 'b', name: 'Beta', amount: 500, sort_order: 1 }),
        sponsor({ id: 'a', name: 'Alfa', amount: 700, sort_order: 0 }),
        sponsor({ id: 'z', name: 'Zeta', amount: 900, status: 'inactive' }),
    ]);
    assert.deepEqual(publicList.map((s) => s.id), ['a', 'b']);
    for (const item of publicList) {
        assert.equal('amount' in item, false);
        assert.equal('currency' in item, false);
        assert.equal('status' in item, false);
    }
    const single = toPublicSponsor(sponsor({ amount: 123 }));
    assert.equal(Object.keys(single).includes('amount'), false);
});
