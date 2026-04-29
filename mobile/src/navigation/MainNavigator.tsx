import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { AppIcon } from '@/icons';
import { MainTabParamList, ResourcesStackParamList, CoursesStackParamList, FlashcardsStackParamList, HomeStackParamList, JobsStackParamList, ProfileStackParamList, HousingStackParamList, ExploreStackParamList } from '../types';
import { Colors } from '../theme';

// Screens
import HomeScreen from '../screens/Home/HomeScreen';
import JobsScreen from '../screens/Jobs/JobsScreen';
import JobDetailScreen from '../screens/Jobs/JobDetailScreen';
import MyApplicationsScreen from '../screens/Jobs/MyApplicationsScreen';
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

// ─── Home Stack ───────────────────────────────────────────────────────────────

const HomeStack = createStackNavigator<HomeStackParamList>();
const HomeNavigator = () => (
  <HomeStack.Navigator screenOptions={{ headerShown: false }}>
    <HomeStack.Screen name="HomeMain" component={HomeScreen} />
  </HomeStack.Navigator>
);

// ─── Jobs Stack ────────────────────────────────────────────────────────────────

const JobsStack = createStackNavigator<JobsStackParamList>();
const JobsNavigator = () => (
  <JobsStack.Navigator screenOptions={{ headerShown: false }}>
    <JobsStack.Screen name="JobsList"        component={JobsScreen} />
    <JobsStack.Screen name="JobDetail"       component={JobDetailScreen} />
    <JobsStack.Screen name="MyApplications" component={MyApplicationsScreen} />
  </JobsStack.Navigator>
);

// ─── Resources Stack ──────────────────────────────────────────────────────────

const ResourcesStack = createStackNavigator<ResourcesStackParamList>();
const ResourcesNavigator = () => (
  <ResourcesStack.Navigator screenOptions={{ headerShown: false }}>
    <ResourcesStack.Screen name="ResourcesList"   component={ResourcesScreen} />
    <ResourcesStack.Screen name="ResourceDetail"  component={ResourceDetailScreen} />
    <ResourcesStack.Screen name="ResourceViewer"  component={ResourceViewerScreen} />
    <ResourcesStack.Screen name="UploadResource"  component={UploadResourceScreen} />
    <ResourcesStack.Screen name="MySubmissions"   component={MySubmissionsScreen} />
    <ResourcesStack.Screen name="CourseViewer"    component={CourseViewerScreen} />
  </ResourcesStack.Navigator>
);

// ─── Courses Stack ────────────────────────────────────────────────────────────

const CoursesStack = createStackNavigator<CoursesStackParamList>();
const CoursesNavigator = () => (
  <CoursesStack.Navigator screenOptions={{ headerShown: false }}>
    <CoursesStack.Screen name="CoursesList" component={VideoCoursesScreen} />
    <CoursesStack.Screen name="CourseViewer" component={CourseViewerScreen} />
  </CoursesStack.Navigator>
);

// ─── Flashcards Stack ────────────────────────────────────────────────────────────

const FlashcardsStack = createStackNavigator<FlashcardsStackParamList>();
const FlashcardsNavigator = () => (
  <FlashcardsStack.Navigator screenOptions={{ headerShown: false }}>
    <FlashcardsStack.Screen name="FlashcardsList" component={FlashcardsScreen} />
    <FlashcardsStack.Screen name="StudySession"   component={StudySessionScreen} />
    <FlashcardsStack.Screen name="CreateDeck"     component={CreateDeckScreen} />
    <FlashcardsStack.Screen name="ScanCreate"     component={ScanCreateScreen} options={{ animation: 'slide_from_bottom' }} />
  </FlashcardsStack.Navigator>
);

// ─── Housing Stack ───────────────────────────────────────────────────────────

const HousingStack = createStackNavigator<HousingStackParamList>();
const HousingNavigator = () => (
  <HousingStack.Navigator screenOptions={{ headerShown: false }}>
    <HousingStack.Screen name="HousingList" component={HousingScreen} />
  </HousingStack.Navigator>
);

// ─── Profile Stack ────────────────────────────────────────────────────────────

const ProfileStack = createStackNavigator<ProfileStackParamList>();
const ProfileNavigator = () => (
  <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
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

// ─── Explore Stack (groups modules) ────────────────────────────────────────────

const ExploreStack = createStackNavigator<ExploreStackParamList>();
const ExploreNavigator = () => (
  <ExploreStack.Navigator screenOptions={{ headerShown: false }}>
    <ExploreStack.Screen name="Resources"  component={ResourcesNavigator} />
    <ExploreStack.Screen name="Timetable"  component={TimetableScreen} />
    <ExploreStack.Screen name="Courses"    component={CoursesNavigator} />
    <ExploreStack.Screen name="Flashcards" component={FlashcardsNavigator} />
    <ExploreStack.Screen name="Jobs"       component={JobsNavigator} />
    <ExploreStack.Screen name="Reminders"  component={RemindersScreen} />
    <ExploreStack.Screen name="Housing"    component={HousingNavigator} />
  </ExploreStack.Navigator>
);

// ─── Tab Navigator (3 tabs) ────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: 'rgba(0,0,0,0.06)',
          borderTopWidth: 1,
          height: 82,
          paddingTop: 10,
          paddingBottom: 16,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color, size, focused }) => {
          if (route.name === 'Home') {
            return <AppIcon name={focused ? 'home' : 'homeOutline'} size={24} color={color} />;
          }
          if (route.name === 'Explore') {
            return <AppIcon name={focused ? 'compass' : 'compassOutline'} size={24} color={color} />;
          }
          // Profile
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
