import { Route, Routes } from 'react-router-dom';
import Layout from './layout/Layout';
import OverviewPage from './pages/OverviewPage';
import LiveFeedPage from './pages/LiveFeedPage';
import VelocityAnalyticsPage from './pages/VelocityAnalyticsPage';
import AlertsPage from './pages/AlertsPage';
import DatasetsPage from './pages/DatasetsPage';
import ModelPage from './pages/ModelPage';
import AuthPage from './pages/AuthPage';
import NotificationsPage from './pages/NotificationsPage';
import SitesPage from './pages/SitesPage';

const App = () => {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/live" element={<LiveFeedPage />} />
        <Route path="/velocity" element={<VelocityAnalyticsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/model" element={<ModelPage />} />
        <Route path="/sites" element={<SitesPage />} />
      </Route>
    </Routes>
  );
};

export default App;
