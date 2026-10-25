import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './lib/store';
import { Sidebar, HeaderBar, ThemeToggleButton } from './components/Layout';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import AdminPanelPage from './pages/AdminPanelPage';
import UserDetailPage from './pages/UserDetailPage';
import B2BPortalPage from './pages/B2BPortalPage';
import ApiDocsPage from './pages/ApiDocsPage';
import DemoClientPage from './pages/DemoClientPage';
import PricingPage from './pages/PricingPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAppStore();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAppStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { token } = useAppStore();

  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/demo"
            element={
              <div className="max-w-[1200px] mx-auto p-6 lg:p-8">
                <div className="flex justify-end mb-4"><ThemeToggleButton /></div>
                <DemoClientPage />
              </div>
            }
          />
          <Route
            path="/pricing"
            element={
              <div className="max-w-[1200px] mx-auto p-6 lg:p-8">
                <div className="flex justify-end mb-4"><ThemeToggleButton /></div>
                <PricingPage />
              </div>
            }
          />
          <Route
            path="/docs"
            element={
              <div className="max-w-[1200px] mx-auto p-6 lg:p-8">
                <div className="flex justify-end mb-4"><ThemeToggleButton /></div>
                <ApiDocsPage />
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="grid grid-cols-12 gap-6 p-4 sm:p-6 lg:gap-8 lg:p-8 max-w-[1600px] mx-auto">
        <Sidebar />
        <main className="col-span-12 min-h-screen lg:col-span-10 min-w-0">
          <HeaderBar />
          <Routes>
            <Route path="/" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
            <Route path="/users/:userId" element={<AdminRoute><UserDetailPage /></AdminRoute>} />
            <Route path="/admin/*" element={<AdminRoute><AdminPanelPage /></AdminRoute>} />
            <Route path="/portal/*" element={<ProtectedRoute><B2BPortalPage /></ProtectedRoute>} />
            <Route path="/docs" element={<ProtectedRoute><ApiDocsPage /></ProtectedRoute>} />
            <Route path="/demo" element={<ProtectedRoute><DemoClientPage /></ProtectedRoute>} />
            <Route path="/pricing" element={<ProtectedRoute><PricingPage /></ProtectedRoute>} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
