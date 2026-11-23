import { describe, expect, it, vi } from 'vitest';
import { drawRegionImage, postalCodesOf, regionImageChange, regionImageKey } from './regionImage';

const picture = new File(['x'], 'region.webp', { type: 'image/webp' });

describe('picture of the region (#304)', () => {
  it('is the same for the same region and place, in any order of the codes', () => {
    const key = regionImageKey({ region: { DE: ['89', '7322'] }, venueCode: '89231' });
    expect(regionImageKey({ region: { DE: ['7322', '89'] }, venueCode: ' 89231 ' })).toBe(key);
    expect(regionImageKey({ region: { DE: ['89'] }, venueCode: '89231' })).not.toBe(key);
    expect(regionImageKey({ region: { DE: ['89', '7322'] }, venueCode: '89073' })).not.toBe(key);
    expect(
      regionImageKey({ region: { DE: ['89', '7322'] }, venueCode: '89231', venueCountry: 'AT' })
    ).not.toBe(key);
  });

  it('reads the stored codes of a bazaar', () => {
    expect(postalCodesOf({ allowedPostalCodes: { AT: ['69'] } })).toEqual({ AT: ['69'] });
    expect(postalCodesOf(undefined)).toEqual({});
  });

  it('is drawn and uploaded for a new or changed region', async () => {
    const upload = vi.fn(async () => 'file1');
    const draw = vi.fn(async () => picture);
    const next = { region: { DE: ['89'] }, venueCode: '89231', venueCountry: 'DE' };
    expect(await regionImageChange(next, undefined, upload, draw)).toEqual({
      regionMapImage: 'file1',
    });
    expect(upload).toHaveBeenCalledWith(picture);
    const stored = { region: { DE: ['88'] }, venueCode: '89231', image: 'old' };
    expect(await regionImageChange(next, stored, upload, draw)).toEqual({
      regionMapImage: 'file1',
    });
  });

  it('stays while region and place stay, also when the stored bazaar has none yet', async () => {
    const upload = vi.fn(async () => 'file1');
    const draw = vi.fn(async () => picture);
    const next = { region: { DE: ['89'] }, venueCode: '89231', venueCountry: 'DE' };
    const stored = { region: { DE: ['89'] }, venueCode: '89231', venueCountry: null };
    expect(await regionImageChange(next, { ...stored, image: 'old' }, upload, draw)).toEqual({});
    expect(draw).not.toHaveBeenCalled();
    // Saved before there were pictures: it gets one now
    expect(await regionImageChange(next, stored, upload, draw)).toEqual({
      regionMapImage: 'file1',
    });
  });

  it('goes with the region, and when a new one cannot be drawn', async () => {
    const upload = vi.fn(async () => 'file1');
    const stored = { region: { DE: ['89'] }, venueCode: '89231', image: 'old' };
    expect(await regionImageChange({ region: {} }, stored, upload)).toEqual({
      clearRegionMapImage: true,
    });
    expect(await regionImageChange({ region: {} }, undefined, upload)).toEqual({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('no canvas');
    });
    const next = { region: { DE: ['88'] }, venueCode: '89231' };
    expect(await regionImageChange(next, stored, upload, failing)).toEqual({
      clearRegionMapImage: true,
    });
    expect(await regionImageChange(next, undefined, upload, failing)).toEqual({});
    expect(upload).not.toHaveBeenCalled();
  });

  it('is not drawn where the browser has no canvas', async () => {
    expect(await drawRegionImage({ region: { DE: ['89'] } })).toBeUndefined();
  });
});
