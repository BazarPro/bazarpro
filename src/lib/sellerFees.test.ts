import { describe, expect, it } from 'vitest';
import type { Id } from './api/types';
import {
  describeFeeGroups,
  formGroupAdvantages,
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
  feesFromForm,
} from './sellerFees';

describe('describeSellerFees', () => {
  it('explains commission and intake fee with a neutral example without a kind', () => {
    const { lines, example } = describeSellerFees({
      commission: 10,
      features: { intakeFee: 0.5 },
    });
    expect(lines).toEqual([
      '10 % Provision auf jeden verkauften Artikel',
      '0,50 € Annahmegebühr pro angenommenem Artikel, verkauft oder nicht',
    ]);
    expect(example).toEqual({
      text:
        'Gibst du 5 Artikel ab und verkaufst davon 3 Artikel für je 20,00 €, bekommst du ' +
        '51,50 € (60,00 € − 6,00 € Provision − 2,50 € Annahmegebühr).',
      total: 51.5,
      groups: [],
    });
  });

  it('fits the example to the kind of bazaar (#303)', () => {
    const bike = (features = {}) =>
      describeSellerFees({ commission: 10, features: { eventType: 'bikeExchange', ...features } })
        .example?.text;
    // Without an intake fee, what is not sold costs nothing: only the sale counts
    expect(bike()).toBe(
      'Verkaufst du ein Rad für 150,00 €, bekommst du 135,00 € (150,00 € − 15,00 € Provision).'
    );
    expect(bike({ intakeFee: 3 })).toBe(
      'Gibst du 2 Räder ab und verkaufst davon ein Rad für 150,00 €, bekommst du 129,00 € ' +
        '(150,00 € − 15,00 € Provision − 6,00 € Annahmegebühr).'
    );
    expect(
      describeSellerFees({ commission: 15, features: { eventType: 'kidsBazaar' } }).example?.text
    ).toBe('Verkaufst du 6 Teile für je 5,00 €, bekommst du 25,50 € (30,00 € − 4,50 € Provision).');
    // A kind that no longer exists: neutral
    expect(
      describeSellerFees({ commission: 10, features: { eventType: 'gone' } }).example?.text
    ).toMatch(/^Verkaufst du 3 Artikel für je 20,00 €/);
  });

  it('names the fee cap and takes it into the example', () => {
    const { lines, example } = describeSellerFees({
      commission: 10,
      features: { intakeFee: 3, maxFeesPerSeller: 20, eventType: 'kidsBazaar' },
    });
    expect(lines.at(-1)).toBe('Höchstens 20,00 € Gebühren insgesamt');
    // 3 € commission + 30 € intake fee, capped at 20 €
    expect(example?.text).toBe(
      'Gibst du 10 Teile ab und verkaufst davon 6 Teile für je 5,00 €, bekommst du 10,00 € ' +
        '(30,00 € − 20,00 € Gebühren, gedeckelt).'
    );
    // Below the cap the fees are listed one by one
    const below = describeSellerFees({
      commission: 10,
      features: { intakeFee: 0.5, maxFeesPerSeller: 20 },
    });
    expect(below.example?.text).toMatch(/− 6,00 € Provision − 2,50 € Annahmegebühr\)\.$/);
  });

  it('says what the seller pays when the fees are higher than the sales', () => {
    const { example } = describeSellerFees({
      commission: 0,
      features: { intakeFee: 4, eventType: 'kidsBazaar' },
    });
    expect(example?.total).toBe(-10);
    expect(example?.text).toMatch(/, zahlst du 10,00 € \(30,00 € − 40,00 € Annahmegebühr\)\.$/);
  });

  it('adds the payout of fee groups that pay less (#302)', () => {
    const { example } = describeSellerFees({
      commission: 10,
      features: {
        eventType: 'bikeExchange',
        feeGroups: [
          { id: 'm', label: 'Vereinsmitglieder', commission: 5, assignment: 'selfDeclared' },
          // Same fees, more items: nothing to add
          {
            id: 'h',
            label: 'Helfer',
            commission: 10,
            maxItemsPerSeller: 9,
            assignment: 'helpers',
          },
        ],
      },
    });
    expect(example?.groups).toEqual(['Für Vereinsmitglieder: 142,50 €.']);
  });

  it('has nothing to explain without fees', () => {
    expect(describeSellerFees({ commission: 0 })).toEqual({ lines: [], example: null });
    expect(describeSellerFees({ commission: 7.5 }).lines[0]).toMatch(/^7,5 % Provision/);
  });

  it('reads the event form the same way, where empty numbers are NaN', () => {
    const event = feesFromForm({
      commission: 10,
      features: {
        intakeFee: NaN,
        maxFeesPerSeller: NaN,
        eventType: 'bikeExchange',
        feeGroups: [
          {
            id: 'm',
            label: 'Mitglieder',
            commission: NaN,
            intakeFee: NaN,
            maxFeesPerSeller: NaN,
            maxItemsPerSeller: NaN,
            assignment: 'selfDeclared',
          },
        ],
      },
    });
    const { example } = describeSellerFees(event);
    expect(example?.text).toMatch(/^Verkaufst du ein Rad für 150,00 €, bekommst du 135,00 €/);
    expect(example?.groups).toEqual(['Für Mitglieder: 150,00 €.']);
  });
});

describe('describeSellerRules', () => {
  it('names the region first (#304)', () => {
    const { duties } = describeSellerRules({
      commission: 0,
      features: { allowedPostalCodes: { AT: ['4'], DE: ['88'] }, photosOptional: true },
    });
    expect(duties[0].text).toBe('Nur für Verkäufer aus PLZ 88… (Deutschland), 4… (Österreich)');
    expect(duties[0].details).toBeUndefined();
  });

  it('names only the region where its map shows the codes (#304)', () => {
    const { duties } = describeSellerRules({
      commission: 0,
      features: { allowedPostalCodes: { DE: ['88', '89'] }, photosOptional: true },
      regionMapImage: 'map' as Id<'_storage'>,
    });
    expect(duties[0]).toMatchObject({
      text: 'Nur für Verkäufer aus der Region',
      regionCodes: 'Nur für Verkäufer aus PLZ 88…, 89… (Deutschland)',
    });
  });

  it('splits what sellers must do from what they can do', () => {
    const { duties, options } = describeSellerRules({
      commission: 0,
      features: {
        maxItemsPerSeller: 40,
        photosOptional: true,
        fixedSellerData: true,
        privateSellersOnly: true,
        discounts: true,
        maxDiscountPercent: 30,
        // 15:00 in Berlin (summer time)
        discountStartsAt: Date.UTC(2026, 9, 17, 13),
        priceOffers: true,
        minimumPrice: true,
        questions: true,
      },
    });
    expect(duties.map((rule) => rule.text)).toEqual([
      'Bis zu 40 Artikel pro Verkäufer',
      'Ausweis mitbringen: Name und Anschrift werden vor Ort geprüft',
      'Nur für Privatleute, nicht gewerblich',
    ]);
    expect(duties[1].details).toMatch(/^Ab deinem ersten angenommenen Artikel/);
    expect(options.map((rule) => rule.text)).toEqual([
      'Rabatte bis 30 % während des Basars, ab 15:00 Uhr',
      'Käufer können dir online Preise vorschlagen, du entscheidest',
      'Verhandeln an der Kasse bis zu deinem Mindestpreis',
      'Käufer können online Fragen zu deinen Artikeln stellen',
    ]);
    expect([...duties, ...options].every((rule) => rule.allowed)).toBe(true);
  });

  it('tells how many places of the whole market are left', () => {
    const rules = (itemPlacesLeft?: number) =>
      describeSellerRules({
        commission: 0,
        features: { maxItemsTotal: 200, photosOptional: true },
        itemPlacesLeft,
      }).duties[0];
    expect(rules().text).toBe('Höchstens 200 Artikel auf dem ganzen Basar');
    expect(rules(23).text).toBe('Höchstens 200 Artikel auf dem ganzen Basar, noch 23 Plätze frei');
    expect(rules(0)).toMatchObject({
      text: 'Der Basar ist voll: Alle 200 Plätze für Artikel sind vergeben',
      allowed: false,
    });
  });

  it('leaves out what the bazaar does not offer (#303)', () => {
    const { duties, options } = describeSellerRules({
      commission: 0,
      features: { discounts: false, priceOffers: false, minimumPrice: false },
    });
    expect(duties.map((rule) => rule.text)).toEqual(['Mindestens ein Foto pro Artikel']);
    expect(options).toEqual([]);
  });
});

describe('describeSellerSchedule', () => {
  it('lists hand-in and pickup with the note', () => {
    const schedule = describeSellerSchedule({
      commission: 0,
      sellerLogistics: {
        dropoffStart: Date.UTC(2026, 9, 16, 15),
        dropoffEnd: Date.UTC(2026, 9, 16, 17),
        note: '  Eingang über den Hof ',
      },
    });
    expect(schedule).toEqual({
      title: 'Abgabe & Abholung',
      rows: [{ label: 'Abgabe', value: 'Freitag, 16. Oktober 2026, 17:00–19:00 Uhr' }],
      note: 'Eingang über den Hof',
    });
  });

  it('speaks of setup and teardown at a direct sale (#299)', () => {
    const schedule = describeSellerSchedule({
      commission: 0,
      features: { directSale: true },
      sellerLogistics: {
        dropoffStart: Date.UTC(2026, 9, 17, 6),
        pickupStart: Date.UTC(2026, 9, 17, 14),
      },
    });
    expect(schedule.title).toBe('Aufbau & Abbau');
    expect(schedule.rows.map((row) => row.label)).toEqual(['Aufbau', 'Abbau']);
  });
});

describe('describeFeeGroups', () => {
  it('names only what a group changes and how to get in', () => {
    const groups = describeFeeGroups({
      commission: 10,
      features: {
        intakeFee: 1,
        maxItemsPerSeller: 20,
        maxFeesPerSeller: 20,
        feeGroups: [
          {
            id: 'members',
            label: 'Vereinsmitglieder',
            commission: 5,
            assignment: 'selfDeclared',
            proofHint: 'Mitgliedsausweis zeigen',
          },
          // Same commission: only the item limit and the intake fee count
          {
            id: 'helpers',
            label: 'Helfer',
            commission: 10,
            intakeFee: 0.5,
            maxItemsPerSeller: 40,
            assignment: 'helpers',
          },
          {
            id: 'kids',
            label: 'Schüler',
            commission: 10,
            intakeFee: 1,
            assignment: 'selfDeclared',
          },
          {
            id: 'cap',
            label: 'Profis',
            commission: 10,
            intakeFee: 1,
            maxFeesPerSeller: 10,
            assignment: 'manual',
          },
        ],
      },
    });
    expect(groups.map(({ fees, how }) => ({ fees, how }))).toEqual([
      {
        fees: '5 % Provision statt 10 % · keine Annahmegebühr',
        how: 'Nachweis bei der Abgabe: Mitgliedsausweis zeigen',
      },
      {
        fees: '0,50 € pro Artikel statt 1,00 € · bis zu 40 Artikel',
        how: 'Gilt für Helfer des Basars',
      },
      {
        fees: 'gleiche Gebühren wie alle',
        how: 'Gibst du bei der Anmeldung an, das Team prüft es bei der Abgabe',
      },
      {
        fees: 'höchstens 10,00 € Gebühren',
        how: 'Vergibt der Veranstalter',
      },
    ]);
  });

  it('reads the values of the event form, where empty numbers are NaN', () => {
    expect(
      formGroupAdvantages(
        { commission: 10, features: { intakeFee: NaN, maxItemsPerSeller: 20 } },
        {
          id: 'g',
          label: 'Helfer',
          commission: NaN,
          intakeFee: 2,
          maxItemsPerSeller: NaN,
          assignment: 'helpers',
        }
      )
    ).toBe('0 % Provision statt 10 % · 2,00 € pro Artikel');
  });
});
