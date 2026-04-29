import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './src/utils/queryClient';
import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/context/LanguageContext';
import { AccessibilityProvider } from './src/context/AccessibilityContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { IconContext } from 'phosphor-react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { appFontSources } from './src/theme/fonts';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Icon fonts:
// - iOS: registered via Info.plist at build time (handled by Expo prebuild +
//   @expo/vector-icons). Works out of the box.
// - Android: registered natively at Application.onCreate via ReactFontManager
//   in MainApplication.kt, using the TTF at
//   android/app/src/main/assets/fonts/ionicons.ttf. This bypasses the
//   JS-side loader which is unreliable on new-arch release builds.
// No JS-side font loading is needed.

export default function App() {
  const [fontsLoaded, fontError] = useFonts(appFontSources);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#080d14' }} />
    );
  }
  if (fontError) {
    console.warn('[fonts]', fontError);
  }

  return (
    <IconContext.Provider value={{ weight: 'regular' }}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <LanguageProvider>
              <ThemeProvider>
                <AccessibilityProvider>
                  <AuthProvider>
                    <AppNavigator />
                    <StatusBar style="light" backgroundColor="#0A0714" translucent={false} />
                  </AuthProvider>
                </AccessibilityProvider>
              </ThemeProvider>
            </LanguageProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </IconContext.Provider>
  );
}
