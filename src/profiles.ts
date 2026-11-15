import { DEFAULT_SETTINGS, type Settings } from './audio';
export const PRESETS: Record<string, Settings> = {
  Flat: { ...DEFAULT_SETTINGS, bands: Array(10).fill(0) },
  'Bass Boost': { ...DEFAULT_SETTINGS, preamp: -2, bands: [7, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
  'Treble Boost': { ...DEFAULT_SETTINGS, bands: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6] },
  Rock: { ...DEFAULT_SETTINGS, bands: [5, 4, 3, 1, -1, -1, 2, 4, 5, 5] },
  Pop: { ...DEFAULT_SETTINGS, bands: [-1, 1, 3, 4, 2, 0, -1, -1, 0, 1] },
  Classical: { ...DEFAULT_SETTINGS, bands: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4] },
  Vocal: { ...DEFAULT_SETTINGS, bands: [-3, -2, -1, 1, 4, 4, 2, 1, 0, -1] }
};
export type UserProfile = { name: string; settings: Settings };
export const isBuiltInPreset = (name: string) => Object.prototype.hasOwnProperty.call(PRESETS, name);
export const PROFILE_KEY = 'sonora-profiles-v1';
export function resetSettings(): Settings { return { ...DEFAULT_SETTINGS, bands: [...DEFAULT_SETTINGS.bands] }; }
export function saveProfile(profiles: UserProfile[], profile: UserProfile): UserProfile[] {
  const name = profile.name.trim(); if (!name) throw new Error('Введите название профиля.');
  if (isBuiltInPreset(name) || name === 'Custom') throw new Error('Это название зарезервировано для встроенного пресета.');
  return [...profiles.filter((item) => item.name !== name), { name, settings: { ...profile.settings, bands: [...profile.settings.bands] } }];
}
export function deleteProfile(profiles: UserProfile[], name: string): UserProfile[] { return profiles.filter((profile) => profile.name !== name); }
export function loadProfiles(storage: Pick<Storage, 'getItem'> = localStorage): UserProfile[] {
  try { const value = JSON.parse(storage.getItem(PROFILE_KEY) || '[]'); return Array.isArray(value) ? value.filter((p) => typeof p?.name === 'string' && Array.isArray(p?.settings?.bands)) : []; } catch { return []; }
}
export function persistProfiles(profiles: UserProfile[], storage: Pick<Storage, 'setItem'> = localStorage) { storage.setItem(PROFILE_KEY, JSON.stringify(profiles)); }
