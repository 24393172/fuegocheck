import * as FileSystem from 'expo-file-system/legacy';
import { EMAIL_CONFIG } from '../constants/config';

export interface AppSettings {
  technicianName: string;
  recipientEmail: string;
}

const SETTINGS_PATH = `${FileSystem.documentDirectory}settings.json`;

// recipientEmail defaults to the company address in config.ts; settings.json
// saved before this field existed simply falls back to the default on load.
const DEFAULT_SETTINGS: AppSettings = {
  technicianName: '',
  recipientEmail: EMAIL_CONFIG.recipientEmail,
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
