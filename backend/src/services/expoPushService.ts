import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPasswordResetPush(expoPushTokens: string[], intentId: string) {
  if (String(process.env.EXPO_PUSH_ENABLED || 'true').toLowerCase() === 'false') return;

  const messages = expoPushTokens
    .filter(t => Expo.isExpoPushToken(t))
    .map(t => ({
      to: t,
      sound: 'default' as const,
      title: '🔐 Password reset',
      body: 'Approve or deny the password reset request.',
      data: { type: 'password-reset', intentId },
    }));

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk);
    } catch {
      // Non-blocking: invalid tokens are expected over time.
    }
  }
}

