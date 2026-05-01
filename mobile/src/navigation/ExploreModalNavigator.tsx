import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import {
  ExploreStackParamList,
  ResourcesStackParamList,
  CoursesStackParamList,
  FlashcardsStackParamList,
  JobsStackParamList,
  OpportunitiesStackParamList,
  HousingStackParamList,
} from '../types';

// Screens
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
import { useModernStackOptions } from './modernNavigator';

// ─── Module stacks (same as Explore tab, but pushed as a root stack screen) ────

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

const HousingStack = createStackNavigator<HousingStackParamList>();
const HousingNavigator = () => {
  const opts = useModernStackOptions();
  return (
    <HousingStack.Navigator screenOptions={opts}>
      <HousingStack.Screen name="HousingList" component={HousingScreen} />
    </HousingStack.Navigator>
  );
};

// ─── Modal Explore stack ───────────────────────────────────────────────────────

const ExploreModalStack = createStackNavigator<ExploreStackParamList>();

export default function ExploreModalNavigator() {
  const opts = useModernStackOptions();
  return (
    <ExploreModalStack.Navigator screenOptions={opts}>
      <ExploreModalStack.Screen name="Resources"     component={ResourcesNavigator} />
      <ExploreModalStack.Screen name="Timetable"     component={TimetableScreen} />
      <ExploreModalStack.Screen name="Courses"       component={CoursesNavigator} />
      <ExploreModalStack.Screen name="Flashcards"    component={FlashcardsNavigator} />
      <ExploreModalStack.Screen name="Jobs"          component={JobsNavigator} />
      <ExploreModalStack.Screen name="Opportunities" component={OpportunitiesNavigator} />
      <ExploreModalStack.Screen name="Reminders"     component={RemindersScreen} />
      <ExploreModalStack.Screen name="Housing"       component={HousingNavigator} />
    </ExploreModalStack.Navigator>
  );
}
