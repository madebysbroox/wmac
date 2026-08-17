// Gym contact settings with defaults
// These can be customized without changing code in multiple places

export const DEFAULT_SETTINGS = {
  frontOfficePhone: "(540) 347-7266",
  dailyStatusEmail: "world_martial_art_ct@msn.com",
  collectionsAgencyEmail: "placements@fcsbpo.com"
};

let _settings = { ...DEFAULT_SETTINGS };

export function getSettings() {
  return { ..._settings };
}

export function updateSettings(newSettings) {
  _settings = { ...DEFAULT_SETTINGS, ...newSettings };
}

export function resetSettings() {
  _settings = { ...DEFAULT_SETTINGS };
}

// Convenience getters for common settings
export function getFrontOfficePhone() {
  return _settings.frontOfficePhone;
}

export function getDailyStatusEmail() {
  return _settings.dailyStatusEmail;
}

export function getCollectionsAgencyEmail() {
  return _settings.collectionsAgencyEmail;
}
