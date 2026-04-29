/**
 * biometricAuth.ts
 *
 * Helpers for Face ID / Touch ID quick login.
 * Credentials are stored in expo-secure-store (OS encrypted keychain).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const EMAIL_KEY = '@studara/bio_email';
const PASS_KEY  = '@studara/bio_pass';
const ENABLED_KEY = '@studara/bio_enabled';

// ── Availability ──────────────────────────────────────────────────────────────

/** True if the device supports fingerprint, face, or iris biometrics. */
export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

/** Return the best label for the available biometric type. */
export async function biometricLabel(lang: 'ar' | 'fr' | 'en' = 'ar'): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const hasFace = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);

  if (lang === 'fr')  return hasFace ? 'Face ID' : 'Empreinte digitale';
  if (lang === 'en')  return hasFace ? 'Face ID' : 'Fingerprint';
  return hasFace ? 'بصمة الوجه' : 'البصمة';
}

// ── Credentials storage ───────────────────────────────────────────────────────

export async function saveBiometricCredentials(email: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(EMAIL_KEY, email);
  await SecureStore.setItemAsync(PASS_KEY, password);
  await SecureStore.setItemAsync(ENABLED_KEY, 'true');
}

export async function getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
  const enabled = await SecureStore.getItemAsync(ENABLED_KEY);
  if (enabled !== 'true') return null;
  const email = await SecureStore.getItemAsync(EMAIL_KEY);
  const pass  = await SecureStore.getItemAsync(PASS_KEY);
  if (!email || !pass) return null;
  return { email, password: pass };
}

export async function clearBiometricCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(EMAIL_KEY);
  await SecureStore.deleteItemAsync(PASS_KEY);
  await SecureStore.deleteItemAsync(ENABLED_KEY);
}

export async function isBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(ENABLED_KEY);
  return v === 'true';
}

// ── Authentication prompt ─────────────────────────────────────────────────────

/**
 * Show the native biometric prompt.
 * Returns true if the user authenticated successfully.
 */
export async function authenticateWithBiometrics(promptMsg?: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: promptMsg ?? 'تسجيل الدخول إلى Studara',
    cancelLabel: 'إلغاء',
    disableDeviceFallback: false,
  });
  return result.success;
}
