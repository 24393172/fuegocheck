import * as FileSystem from 'expo-file-system/legacy';

export interface AppSettings {
  technicianName: string;
}

const SETTINGS_PATH = `${FileSystem.documentDirectory}settings.json`;

const DEFAULT_SETTINGS: AppSettings = {
  technicianName: '',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return { ...DEFAULT_SETTINGS };

    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
  } catch (error) {
    console.error('[settings] Failed to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(settings));
  } catch (error) {
    console.error('[settings] Failed to save settings:', error);
    throw error;
  }
}
