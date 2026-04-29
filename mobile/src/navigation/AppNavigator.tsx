import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { SubscriptionProvider } from '../context/SubscriptionContext';
import { RootStackParamList } from '../types';
import { Colors } from '../theme';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import PremiumRequestScreen   from '../screens/Premium/PremiumRequestScreen';
import SpendingScreen        from '../screens/Premium/SpendingScreen';
import UploadResourceScreen   from '../screens/Resources/UploadResourceScreen';
import PomodoroScreen        from '../screens/Study/PomodoroScreen';
import DailyChallengeScreen  from '../screens/Home/DailyChallengeScreen';
import VoiceNoteScreen       from '../screens/VoiceNotes/VoiceNoteScreen';
import VoiceNoteDetailScreen from '../screens/VoiceNotes/VoiceNoteDetailScreen';
import AskZadScreen         from '../screens/Home/AskZadScreen';
import PaywallScreen        from '../screens/Paywall/PaywallScreen';
import MyPlanScreen         from '../screens/Profile/MyPlanScreen';
import BillingHubScreen     from '../screens/Billing/BillingHubScreen';
import ForumScreen          from '../screens/Forum/ForumScreen';
import ForumPostScreen      from '../screens/Forum/ForumPostScreen';
import { requestNotificationPermissions, scheduleRageQuitNotification } from '../utils/notifications';
import ExploreModalNavigator from './ExploreModalNavigator';
import * as Notifications from 'expo-notifications';
import PasswordResetApprovalScreen from '../screens/Security/PasswordResetApprovalScreen';
import PasswordResetSetNewPasswordScreen from '../screens/Security/PasswordResetSetNewPasswordScreen';
import AISummaryImportScreen from '../screens/AISummaries/AISummaryImportScreen';
import AISummaryOptionsScreen from '../screens/AISummaries/AISummaryOptionsScreen';
import AISummaryResultScreen from '../screens/AISummaries/AISummaryResultScreen';
import AISummaryHistoryScreen from '../screens/AISummaries/AISummaryHistoryScreen';
import AIExerciseImportScreen from '../screens/AIExerciseCorrection/AIExerciseImportScreen';
import AIExerciseOptionsScreen from '../screens/AIExerciseCorrection/AIExerciseOptionsScreen';
import AIExerciseResultScreen from '../screens/AIExerciseCorrection/AIExerciseResultScreen';
import AIExerciseHistoryScreen from '../screens/AIExerciseCorrection/AIExerciseHistoryScreen';
import { apiRequest } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_RESET_INTENT_KEY } from '../constants/security';
import { Alert } from 'react-native';
import { openWhatsAppSupport } from '../constants/support';

const Stack = createStackNavigator<RootStackParamList>();

/** Inner navigator — has access to SubscriptionContext */
const RootNavigator = () => {
  const { isLoading, isAuthenticated, isOnboarded, token } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      // Ask permission and then register Expo push token for security approvals (best-effort).
      requestNotificationPermissions()
        .then(async (granted) => {
          if (!granted || !token) return;
          try {
            const expoPushToken = (await Notifications.getExpoPushTokenAsync()).data;
            if (!expoPushToken) return;
            await apiRequest('/auth/devices/register', {
              method: 'POST',
              token,
              body: {
                expoPushToken,
                platform: Platform.OS === 'ios' ? 'ios' : 'android',
              },
            });
          } catch {
            // non-blocking
          }
        })
        .catch(() => {});
      // Reset the "3-day inactivity" reminder on every app open
      scheduleRageQuitNotification().catch(() => {});
    }
  }, [isAuthenticated, token]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // Determine which root screen to show

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
      {!isOnboarded ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : !isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        <Stack.Screen name="Main" component={MainNavigator} />
      )}

      {/* Security flows (authenticated) */}
      {isAuthenticated && (
        <Stack.Screen
          name="PasswordResetApproval"
          component={PasswordResetApprovalScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="PasswordResetSetNew"
          component={PasswordResetSetNewPasswordScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}

      {isAuthenticated && (
        <Stack.Screen
          name="ExploreModal"
          component={ExploreModalNavigator}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AISummaryImport"
          component={AISummaryImportScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AISummaryOptions"
          component={AISummaryOptionsScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AISummaryResult"
          component={AISummaryResultScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AISummaryHistory"
          component={AISummaryHistoryScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AIExerciseImport"
          component={AIExerciseImportScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AIExerciseOptions"
          component={AIExerciseOptionsScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AIExerciseResult"
          component={AIExerciseResultScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AIExerciseHistory"
          component={AIExerciseHistoryScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {/* Upload resources — accessible from any authenticated screen */}
      {isAuthenticated && (
        <Stack.Screen name="UploadResource" component={UploadResourceScreen} />
      )}
      {/* Premium feature subscription (manual bank transfer) */}
      {isAuthenticated && (
        <Stack.Screen
          name="PremiumRequest"
          component={PremiumRequestScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="Paywall"
          component={PaywallScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="MyPlan"
          component={MyPlanScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {/* Spending history — accessible from Profile and PremiumRequest */}
      {isAuthenticated && (
        <Stack.Screen
          name="Spending"
          component={SpendingScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {/* Billing hub — subscription + PAYG wallet */}
      {isAuthenticated && (
        <Stack.Screen
          name="BillingHub"
          component={BillingHubScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {/* Pomodoro focus timer — accessible from any screen */}
      {isAuthenticated && (
        <Stack.Screen
          name="Pomodoro"
          component={PomodoroScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      )}
      {/* Daily Challenge — accessible from Home */}
      {isAuthenticated && (
        <Stack.Screen
          name="DailyChallenge"
          component={DailyChallengeScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {/* Whisper Studio — enregistrements vocaux + transcription IA */}
      {isAuthenticated && (
        <Stack.Screen
          name="VoiceNotes"
          component={VoiceNoteScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="VoiceNoteDetail"
          component={VoiceNoteDetailScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="AskZad"
          component={AskZadScreen}
          options={{ animation: 'slide_from_bottom' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="Forum"
          component={ForumScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
      {isAuthenticated && (
        <Stack.Screen
          name="ForumPost"
          component={ForumPostScreen}
          options={{ animation: 'slide_from_right' }}
        />
      )}
    </Stack.Navigator>
  );
};

const linking = {
  prefixes: ['studara://', 'https://radar-mr.com'],
  config: {
    screens: {
      Main: {
        screens: {
          Explore: {
            screens: {
              Resources: {
                screens: {
                  ResourceDetail: 'resources/:id',
                },
              },
              Flashcards: {
                screens: {
                  StudySession: 'decks/:deckId',
                },
              },
            },
          },
        },
      },
    },
  },
};

const AppNavigator = () => {
  const navRef = useNavigationContainerRef<RootStackParamList>();
  const { isAuthenticated } = useAuth();
  const [navReady, setNavReady] = useState(false);

  useEffect(() => {
    const extractIntentId = (resp: Notifications.NotificationResponse | null) => {
      const data: any = resp?.notification?.request?.content?.data;
      const intentId =
        typeof data?.intentId === 'string' ? data.intentId
        : typeof data?.intent_id === 'string' ? data.intent_id
        : null;
      const type = typeof data?.type === 'string' ? data.type : null;
      if (!intentId) return null;
      if (type !== 'password-reset' && type !== 'security') return null;
      return intentId;
    };

    const handleIntent = async (intentId: string) => {
      // If user is logged out, they cannot approve (approval requires an existing session).
      // Guide them to open a device where they're already logged in, or contact support.
      if (!isAuthenticated) {
        Alert.alert(
          'Password reset',
          "Pour approuver, ouvrez Studara sur un appareil où vous êtes déjà connecté. Si vous n'avez plus accès, contactez le support.",
          [
            { text: 'WhatsApp', onPress: () => openWhatsAppSupport('Bonjour, je n’ai plus accès à mon compte Studara et je veux réinitialiser mon mot de passe.') },
            { text: 'OK', style: 'cancel' },
          ],
        );
        return;
      }
      // If auth/nav isn't ready yet (common on cold start), store and replay later.
      if (!navReady || !navRef.isReady()) {
        await AsyncStorage.setItem(PENDING_RESET_INTENT_KEY, intentId);
        return;
      }
      navRef.navigate('PasswordResetApproval', { intentId });
    };

    // Cold start: handle last tapped notification.
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        const intentId = extractIntentId(resp);
        if (intentId) handleIntent(intentId);
      })
      .catch(() => {});

    // Warm start: handle taps while app running/backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const intentId = extractIntentId(resp);
      if (intentId) handleIntent(intentId);
    });

    return () => sub.remove();
  }, [isAuthenticated, navReady, navRef]);

  // Replay stored intent once auth + nav are ready.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!navReady || !navRef.isReady()) return;
    (async () => {
      const intentId = await AsyncStorage.getItem(PENDING_RESET_INTENT_KEY);
      if (!intentId) return;
      await AsyncStorage.removeItem(PENDING_RESET_INTENT_KEY);
      navRef.navigate('PasswordResetApproval', { intentId });
    })().catch(() => {});
  }, [isAuthenticated, navReady, navRef]);

  return (
    <NavigationContainer linking={linking} ref={navRef} onReady={() => setNavReady(true)}>
      <SubscriptionProvider>
        <RootNavigator />
      </SubscriptionProvider>
    </NavigationContainer>
  );
};

export default AppNavigator;
