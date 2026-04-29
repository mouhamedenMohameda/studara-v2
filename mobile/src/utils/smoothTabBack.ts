type AnyNav = {
  getParent?: () => any;
  navigate?: (...args: any[]) => void;
  getState?: () => any;
};

/**
 * Switching tabs is instant and can feel "brusque".
 * This helper adds a tiny delay so the press feedback can complete,
 * making the transition feel more stable.
 */
export function smoothGoHomeTab(navigation: AnyNav, delayMs: number = 90) {
  const go = () => {
    // Robust navigation across nested stacks + root modal stacks.
    // We walk up parents and navigate to:
    // - Bottom tabs route: 'Home' (Tab navigator in MainNavigator)
    // - Or root stack route: 'Main' with nested screen 'Home'
    let nav: any = navigation;

    for (let i = 0; i < 8 && nav; i++) {
      const state = nav.getState?.();
      const routeNames: string[] | undefined = state?.routeNames;

      if (Array.isArray(routeNames) && routeNames.includes('Home') && typeof nav.navigate === 'function') {
        nav.navigate('Home');
        return;
      }
      if (Array.isArray(routeNames) && routeNames.includes('Main') && typeof nav.navigate === 'function') {
        nav.navigate('Main', { screen: 'Home' });
        return;
      }

      nav = nav.getParent?.();
    }

    // Fallback: best effort
    navigation?.navigate?.('Home');
  };

  if (!delayMs) { go(); return; }
  setTimeout(go, delayMs);
}

