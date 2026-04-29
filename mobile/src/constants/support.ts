import { Linking, Platform } from 'react-native';

// WhatsApp support number in E.164 without leading "+".
export const SUPPORT_WHATSAPP_E164 = '33656696974';

export function buildWhatsAppSupportUrl(message: string) {
  const encoded = encodeURIComponent(message);
  // wa.me works broadly and falls back to web if WhatsApp not installed.
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encoded}`;
}

export async function openWhatsAppSupport(message: string) {
  const url = buildWhatsAppSupportUrl(message);
  // iOS sometimes requires https; Android supports both but https is fine.
  const can = await Linking.canOpenURL(url).catch(() => false);
  if (can) return Linking.openURL(url);
  // Fallback: open WhatsApp app scheme (best-effort)
  const scheme = Platform.OS === 'ios'
    ? `whatsapp://send?phone=${SUPPORT_WHATSAPP_E164}&text=${encodeURIComponent(message)}`
    : `whatsapp://send?phone=${SUPPORT_WHATSAPP_E164}&text=${encodeURIComponent(message)}`;
  return Linking.openURL(scheme);
}

