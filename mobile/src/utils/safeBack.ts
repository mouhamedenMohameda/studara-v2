type AnyNav = {
  canGoBack?: () => boolean;
  goBack?: () => void;
  navigate?: (...args: any[]) => void;
};

/**
 * Some screens can be opened as the first screen (deep link, push notification,
 * or direct navigation). In that case, `goBack()` is a no-op.
 * This helper guarantees we always leave the screen.
 */
export function safeBack(navigation: AnyNav, fallback?: { name: string; params?: any }) {
  try {
    if (navigation?.canGoBack?.()) {
      navigation.goBack?.();
      return;
    }
  } catch {
    // ignore and fallback
  }

  if (fallback?.name && navigation?.navigate) {
    navigation.navigate(fallback.name, fallback.params);
    return;
  }

  // Default fallback: go to Home tab.
  navigation?.navigate?.('Home');
}

