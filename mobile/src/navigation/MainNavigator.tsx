import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/icons';
import { MainTabParamList, ResourcesStackParamList, CoursesStackParamList, FlashcardsStackParamList, HomeStackParamList, JobsStackParamList, OpportunitiesStackParamList, ProfileStackParamList, HousingStackParamList, ExploreStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useModernStackOptions } from './modernNavigator';

// Screens
import HomeScreen from '../screens/Home/HomeScreen';
import JobsScreen from '../screens/Jobs/JobsScreen';
import JobDetailScreen from '../screens/Jobs/JobDetailScreen';
import MyApplicationsScreen from '../screens/Jobs/MyApplicationsScreen';
import OpportunitiesScreen from '../screens/Opportunities/OpportunitiesScreen';
import OpportunityDetailScreen from '../screens/Opportunities/OpportunityDetailScreen';
import HousingScreen from '../screens/Housing/HousingScreen';
import ResourcesScreen from '../screens/Resources/ResourcesScreen';
import ResourceDetailScreen from '../screens/Resources/ResourceDetailScreen';
import ResourceViewerScreen from '../screens/Resources/ResourceViewerScreen';
import UploadResourceScreen from '../screens/Resources/UploadResourceScreen';
import MySubmissionsScreen from '../screens/Resources/MySubmissionsScreen';
import VideoCoursesScreen from '../screens/Resources/VideoCoursesScreen';
import CourseViewerScreen from '../screens/Resources/CourseViewerScreen';
import FlashcardsScreen from '../screens/Flashcards/FlashcardsScreen';
import CreateDeckScreen from '../screens/Flashcards/CreateDeckScreen';
import ScanCreateScreen from '../screens/Flashcards/ScanCreateScreen';
import StudySessionScreen from '../screens/Flashcards/StudySessionScreen';
import TimetableScreen from '../screens/Timetable/TimetableScreen';
import RemindersScreen from '../screens/Reminders/RemindersScreen';
import ProfileScreen from '../screens/Profile/ProfileScreen';
import BadgesScreen from '../screens/Profile/BadgesScreen';
import ExamCountdownScreen from '../screens/Profile/ExamCountdownScreen';
import WrappedScreen from '../screens/Profile/WrappedScreen';
import { FeatureGate } from '../components/FeatureGate';

// ─── Home Stack ───────────────────────────────────────────────────────────────

const HomeStack = createStackNavigator<HomeStackParamList>();
const HomeNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <HomeStack.Navigator screenOptions={opts}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
    </HomeStack.Navigator>
  );
};

// ─── Jobs Stack ────────────────────────────────────────────────────────────────

const JobsStack = createStackNavigator<JobsStackParamList>();
const JobsNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <JobsStack.Navigator screenOptions={opts}>
      <JobsStack.Screen name="JobsList"        component={JobsScreen} />
      <JobsStack.Screen name="JobDetail"       component={JobDetailScreen} />
      <JobsStack.Screen name="MyApplications" component={MyApplicationsScreen} />
    </JobsStack.Navigator>
  );
};

const OpportunitiesStack = createStackNavigator<OpportunitiesStackParamList>();
const OpportunitiesNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <OpportunitiesStack.Navigator screenOptions={opts}>
      <OpportunitiesStack.Screen name="OpportunitiesList" component={OpportunitiesScreen} />
      <OpportunitiesStack.Screen name="OpportunityDetail" component={OpportunityDetailScreen} />
    </OpportunitiesStack.Navigator>
  );
};

// ─── Resources Stack ──────────────────────────────────────────────────────────

const ResourcesStack = createStackNavigator<ResourcesStackParamList>();
const ResourcesNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <ResourcesStack.Navigator screenOptions={opts}>
      <ResourcesStack.Screen name="ResourcesList"   component={ResourcesScreen} />
      <ResourcesStack.Screen name="ResourceDetail"  component={ResourceDetailScreen} />
      <ResourcesStack.Screen name="ResourceViewer"  component={ResourceViewerScreen} />
      <ResourcesStack.Screen name="UploadResource"  component={UploadResourceScreen} />
      <ResourcesStack.Screen name="MySubmissions"   component={MySubmissionsScreen} />
      <ResourcesStack.Screen name="CourseViewer"    component={CourseViewerScreen} />
    </ResourcesStack.Navigator>
  );
};

// ─── Courses Stack ────────────────────────────────────────────────────────────

const CoursesStack = createStackNavigator<CoursesStackParamList>();
const CoursesNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <CoursesStack.Navigator screenOptions={opts}>
      <CoursesStack.Screen name="CoursesList" component={VideoCoursesScreen} />
      <CoursesStack.Screen name="CourseViewer" component={CourseViewerScreen} />
    </CoursesStack.Navigator>
  );
};

// ─── Flashcards Stack ────────────────────────────────────────────────────────────

const FlashcardsStack = createStackNavigator<FlashcardsStackParamList>();
const FlashcardsNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <FlashcardsStack.Navigator screenOptions={opts}>
      <FlashcardsStack.Screen name="FlashcardsList" component={FlashcardsScreen} />
      <FlashcardsStack.Screen name="StudySession"   component={StudySessionScreen} />
      <FlashcardsStack.Screen name="CreateDeck"     component={CreateDeckScreen} />
      <FlashcardsStack.Screen name="ScanCreate"     component={ScanCreateScreen} options={{ animation: 'slide_from_bottom' }} />
    </FlashcardsStack.Navigator>
  );
};

// ─── Housing Stack ───────────────────────────────────────────────────────────

const HousingStack = createStackNavigator<HousingStackParamList>();
const HousingNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <HousingStack.Navigator screenOptions={opts}>
      <HousingStack.Screen name="HousingList" component={HousingScreen} />
    </HousingStack.Navigator>
  );
};

// ─── Profile Stack ────────────────────────────────────────────────────────────

const ProfileStack = createStackNavigator<ProfileStackParamList>();
const ProfileNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <ProfileStack.Navigator screenOptions={opts}>
      <ProfileStack.Screen name="ProfileMain"    component={ProfileScreen} />
      <ProfileStack.Screen name="Badges"         component={BadgesScreen} />
      <ProfileStack.Screen name="ExamCountdown"  component={ExamCountdownScreen} />
      <ProfileStack.Screen
        name="Wrapped"
        component={WrappedScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </ProfileStack.Navigator>
  );
};

// ─── Explore Stack (groups modules) ────────────────────────────────────────────

const ExploreStack = createStackNavigator<ExploreStackParamList>();
const ExploreNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <ExploreStack.Navigator screenOptions={opts}>
      <ExploreStack.Screen
        name="Resources"
        component={() => (
          <FeatureGate featureKey="resources" defaultEnabled={true}>
            <ResourcesNavigator />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Timetable"
        component={() => (
          <FeatureGate featureKey="timetable" defaultEnabled={true}>
            <TimetableScreen />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Courses"
        component={() => (
          <FeatureGate featureKey="courses" defaultEnabled={true}>
            <CoursesNavigator />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Flashcards"
        component={() => (
          <FeatureGate featureKey="flashcards" defaultEnabled={true}>
            <FlashcardsNavigator />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Jobs"
        component={() => (
          <FeatureGate featureKey="jobs" defaultEnabled={true}>
            <JobsNavigator />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Opportunities"
        component={() => (
          <FeatureGate featureKey="opportunities" defaultEnabled={true}>
            <OpportunitiesNavigator />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Reminders"
        component={() => (
          <FeatureGate featureKey="reminders" defaultEnabled={true}>
            <RemindersScreen />
          </FeatureGate>
        )}
      />
      <ExploreStack.Screen
        name="Housing"
        component={() => (
          <FeatureGate featureKey="housing" defaultEnabled={true}>
            <HousingNavigator />
          </FeatureGate>
        )}
      />
    </ExploreStack.Navigator>
  );
};

// ─── Tab Navigator (3 tabs) ────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainNavigator = () => {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  /** Barre inférieure type maquette « education » : bloc vert forêt flottant, Explorer au centre accentué. */
  const tabBarStyle = {
    position: 'absolute' as const,
    bottom: bottomPad - 6,
    left: 18,
    right: 18,
    height: 72,
    borderRadius: 31,
    backgroundColor: C.tabBackground,
    borderTopWidth: 0,
    paddingHorizontal: 6,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    shadowColor: '#052E16',
    shadowOpacity: 0.28,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
        tabBarActiveTintColor: C.tabActive,
        tabBarInactiveTintColor: C.tabInactive,
        tabBarStyle,
        tabBarIcon: ({ color, size, focused }) => {
          if (route.name === 'Home') {
            return <AppIcon name={focused ? 'home' : 'homeOutline'} size={24} color={color} />;
          }
          if (route.name === 'Explore') {
            return (
              <View
                style={{
                  width: 48,
                  height: 48,
                  marginTop: -10,
                  borderRadius: 24,
                  backgroundColor: focused ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon name={focused ? 'compass' : 'compassOutline'} size={size + 4} color={color} />
              </View>
            );
          }
          return <AppIcon name={focused ? 'personCircle' : 'personCircleOutline'} size={26} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"       component={HomeNavigator} />
      <Tab.Screen
        name="Explore"
        component={ExploreNavigator}
        options={{ title: 'Explorer' }}
      />
      <Tab.Screen name="Profile"    component={ProfileNavigator} />
    </Tab.Navigator>
  );
};

export default MainNavigator;
