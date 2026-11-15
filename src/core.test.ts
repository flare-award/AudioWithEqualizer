import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, FREQUENCIES, processingParameters, type Settings } from './audio';
import { deleteProfile, loadProfiles, persistProfiles, PROFILE_KEY, resetSettings, saveProfile, type UserProfile } from './profiles';
import { encodeWav } from './wav';

const profile: UserProfile = { name: 'Studio', settings: { ...DEFAULT_SETTINGS, preamp: 3, bands: [1,2,3,4,5,6,7,8,9,10], mono: true, balance: -.25 } };

describe('profiles and settings', () => {
  it('stores, loads and deletes custom profiles without changing stored settings', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const saved = saveProfile([], profile); persistProfiles(saved, storage);
    expect(loadProfiles(storage)).toEqual(saved);
    expect(deleteProfile(saved, 'Studio')).toEqual([]);
    expect(data.has(PROFILE_KEY)).toBe(true);
  });
  it('requires names and confirms a same-name save by replacing rather than duplicating', () => {
    expect(() => saveProfile([], { ...profile, name: '  ' })).toThrow();
    const changed = { ...profile, settings: { ...profile.settings, preamp: 7 } };
    const saved = saveProfile([profile], changed);
    expect(saved).toHaveLength(1); expect(saved[0].settings.preamp).toBe(7);
    expect(() => saveProfile([], { ...profile, name: 'Flat' })).toThrow();
    expect(saveProfile([], { ...profile, name: 'toString' })).toHaveLength(1);
  });
  it('resets all settings including balance and mono, with independent band storage', () => {
    const reset = resetSettings(); reset.bands[0] = 17;
    expect(DEFAULT_SETTINGS.bands[0]).toBe(0);
    expect(resetSettings()).toEqual({ enabled: true, preamp: 0, bands: Array(10).fill(0), mono: false, balance: 0 });
  });
});

describe('processing parameter mapping', () => {
  it('maps ten bands to the documented frequencies and converts preamp dB to linear gain', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, preamp: 6, bands: Array(10).fill(0).map((_, i) => i - 5), balance: .4, mono: true };
    const params = processingParameters(settings);
    expect(params.filters.map((f) => f.frequency)).toEqual([...FREQUENCIES]);
    expect(params.filters.map((f) => f.gain)).toEqual([-5,-4,-3,-2,-1,0,1,2,3,4]);
    expect(params.preampGain).toBeCloseTo(1.9953, 3);
    expect(params.balance).toBe(.4); expect(params.mono).toBe(true);
  });
  it('clamps dB and balance to supported ranges', () => {
    const params = processingParameters({ ...DEFAULT_SETTINGS, preamp: 40, bands: [-50, ...Array(9).fill(0)], balance: -4 });
    expect(params.preampGain).toBe(10); expect(params.filters[0].gain).toBe(-20); expect(params.balance).toBe(-1);
  });
});

describe('WAV PCM encoder', () => {
  it('writes a valid little-endian 16-bit PCM WAV header and clamps samples', async () => {
    const fake = { numberOfChannels: 1, length: 3, sampleRate: 8000, getChannelData: () => new Float32Array([-1, 0, 1.2]) } as unknown as AudioBuffer;
    const blob = encodeWav(fake); const bytes = await blob.arrayBuffer(); const view = new DataView(bytes);
    expect(blob.type).toBe('audio/wav'); expect(bytes.byteLength).toBe(50);
    expect(String.fromCharCode(...new Uint8Array(bytes, 0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...new Uint8Array(bytes, 8, 4))).toBe('WAVE');
    expect(view.getUint16(20, true)).toBe(1); expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000); expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(-32768); expect(view.getInt16(46, true)).toBe(0); expect(view.getInt16(48, true)).toBe(32767);
  });
});
