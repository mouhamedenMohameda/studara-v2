import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api/client';
import LoginPage      from './pages/LoginPage';
import DashboardPage  from './pages/DashboardPage';
import ResourcesPage  from './pages/ResourcesPage';
import UsersPage      from './pages/UsersPage';
import RemindersPage  from './pages/RemindersPage';
import BadgesPage     from './pages/BadgesPage';
import JobsPage       from './pages/JobsPage';
import CurriculumPage from './pages/CurriculumPage';
import HousingPage       from './pages/HousingPage';
import DailyChallengeAdminPage from './pages/DailyChallengeAdminPage';
import PasswordResetsPage from './pages/PasswordResetsPage';
import FacultyChangesPage from './pages/FacultyChangesPage';
import DriveImportPage from './pages/DriveImportPage';
import AcademicStructurePage from './pages/AcademicStructurePage';
import PremiumRequestsPage   from './pages/PremiumRequestsPage';
import AIChatUsagePage       from './pages/AIChatUsagePage';
import SubscriptionsPage     from './pages/SubscriptionsPage';
import FeatureFlagsPage      from './pages/FeatureFlagsPage';
import Layout         from './components/Layout';

function RequireAuth({ children }: { children: React.ReactNode }) {
  return getToken() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout><DashboardPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/resources"
          element={
            <RequireAuth>
              <Layout><ResourcesPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/users"
          element={
            <RequireAuth>
              <Layout><UsersPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/reminders"
          element={
            <RequireAuth>
              <Layout><RemindersPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/badges"
          element={
            <RequireAuth>
              <Layout><BadgesPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/jobs"
          element={
            <RequireAuth>
              <Layout><JobsPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/curriculum"
          element={
            <RequireAuth>
              <Layout><CurriculumPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/housing"
          element={
            <RequireAuth>
              <Layout><HousingPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/daily-challenge"
          element={
            <RequireAuth>
              <Layout><DailyChallengeAdminPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/password-resets"
          element={
            <RequireAuth>
              <Layout><PasswordResetsPage /></Layout>
            </RequireAuth>
          }
        />
        <Route
          path="/faculty-changes"
          element={
            <RequireAuth>
              <Layout><FacultyChangesPage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/drive-import"
          element={
            <RequireAuth>
              <Layout><DriveImportPage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/academic-structure"
          element={
            <RequireAuth>
              <Layout><AcademicStructurePage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/premium-requests"
          element={
            <RequireAuth>
              <Layout><PremiumRequestsPage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/ai-usage"
          element={
            <RequireAuth>
              <Layout><AIChatUsagePage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/subscriptions"
          element={
            <RequireAuth>
              <Layout><SubscriptionsPage /></Layout>
            </RequireAuth>
          }
        />

        <Route
          path="/feature-flags"
          element={
            <RequireAuth>
              <Layout><FeatureFlagsPage /></Layout>
            </RequireAuth>
          }
        />

        {/* Catch-all → dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
