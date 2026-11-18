import { describe, expect, it } from 'vitest';
import {
  describeFeeGroups,
  formGroupAdvantages,
  describeSellerFees,
  describeSellerRules,
  describeSellerSchedule,
} from './sellerFees';

describe('describeSellerFees', () => {
  it('explains commission and intake fee with an example', () => {
    const { lines, example } = describeSellerFees({ commission: 10, intakeFee: 0.5 });
    expect(lines).toEqual([
      '10 % Provision vom Verkaufspreis jedes verkauften Artikels',
      '0,50 € Annahmegebühr pro angenommenem Artikel, auch wenn er nicht verkauft wird',
    ]);
    expect(example).toEqual({
      intro: 'Du gibst 10 Artikel ab, 6 davon werden für je 5,00 € verkauft.',
      rows: [
        { label: '6 × 5,00 € verkauft', amount: 30 },
        { label: '10 % Provision', amount: -3 },
        { label: 'Annahmegebühr 10 × 0,50 €', amount: -5 },
      ],
      total: 22,
    });
  });

  it('names the fee cap and gives back what is above it in the example', () => {
    const { lines, example } = describeSellerFees({
      commission: 10,
      intakeFee: 3,
      maxFeesPerSeller: 20,
    });
    expect(lines.at(-1)).toBe('Du zahlst höchstens 20,00 € Gebühren, alles zusammen');
    // 3 € commission + 30 € intake fee: 13 € come back
    expect(example?.rows.at(-1)).toEqual({
      label: 'Gebühren-Deckel 20,00 €',
      amount: 13,
      credit: true,
    });
    expect(example?.total).toBe(10);
    // Below the cap the example has nothing to give back
    const below = describeSellerFees({ commission: 10, intakeFee: 0.5, maxFeesPerSeller: 20 });
    expect(below.example?.rows).toHaveLength(3);
  });

  it('goes negative when the fee is higher than the sales', () => {
    expect(describeSellerFees({ commission: 0, intakeFee: 4 }).example?.total).toBe(-10);
  });

  it('has nothing to explain without fees', () => {
    expect(describeSellerFees({ commission: 0 })).toEqual({ lines: [], example: null });
    expect(describeSellerFees({ commission: 7.5 }).lines[0]).toMatch(/^7,5 % Provision/);
  });
});

describe('describeSellerRules', () => {
  it('names the item limit and every price feature', () => {
    const rules = describeSellerRules({
      commission: 0,
      features: {
        maxItemsPerSeller: 40,
        photosOptional: true,
        discounts: true,
        maxDiscountPercent: 30,
        // 15:00 in Berlin (summer time)
        discountStartsAt: Date.UTC(2026, 9, 17, 13),
        priceOffers: true,
        minimumPrice: true,
        questions: true,
      },
    });
    expect(rules.map((rule) => rule.text)).toEqual([
      'Bis zu 40 Artikel pro Verkäufer',
      'Fotos sind freiwillig',
      'Während des Basars ab 15:00 Uhr kannst du deine Preise um bis zu 30 % senken',
      'Käufer können dir online Preise vorschlagen, du entscheidest',
      'Verhandeln an der Kasse: Du legst einen Mindestpreis fest, bis zu dem die Kasse heruntergehen darf',
      'Käufer können öffentlich Fragen zu deinen Artikeln stellen',
    ]);
    expect(rules.every((rule) => rule.allowed)).toBe(true);
  });

  it('tells how many places of the whole market are left', () => {
    const rules = (itemPlacesLeft?: number) =>
      describeSellerRules({ commission: 0, features: { maxItemsTotal: 200 }, itemPlacesLeft })[1];
    expect(rules().text).toBe('Höchstens 200 Artikel auf dem ganzen Basar');
    expect(rules(23).text).toBe('Höchstens 200 Artikel auf dem ganzen Basar, noch 23 Plätze frei');
    expect(rules(0)).toEqual({
      text: 'Der Basar ist voll: Alle 200 Plätze für Artikel sind vergeben',
      allowed: false,
    });
  });

  it('says what is not offered', () => {
    const rules = describeSellerRules({
      commission: 0,
      features: { discounts: false, priceOffers: false, minimumPrice: false },
    });
    expect(rules[0].text).toBe('Beliebig viele Artikel pro Verkäufer');
    expect(rules[1].text).toBe('Jeder Artikel braucht mindestens ein Foto');
    expect(rules.filter((rule) => !rule.allowed).map((rule) => rule.text)).toEqual([
      'Keine Rabatte während des Basars',
      'Keine Preisvorschläge von Käufern',
      'Kein Verhandeln an der Kasse, es gilt dein Preis',
    ]);
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
            assignment: 'selfDeclared',
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
        how: 'Gibst du bei der Anmeldung an, das Team prüft es bei der Abgabe',
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
