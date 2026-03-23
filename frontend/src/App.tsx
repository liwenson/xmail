import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { MailboxProvider } from './contexts/MailboxContext';
import { useAuth } from './hooks/use-auth';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import AdminPage from './pages/AdminPage';
import TokensPage from './pages/TokensPage';

// 需要管理员权限的路由组件
const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// 检查是否需要初始化的组件
const CheckSetup: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { needsSetup, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!needsSetup && !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (needsSetup) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
};

// 路由配置
const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* 登录页 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 初始设置页 */}
      <Route path="/setup" element={<SetupPage />} />

      {/* 需要认证的主应用 */}
      <Route
        path="/"
        element={
          <CheckSetup>
            <MailboxProvider>
              <Layout />
            </MailboxProvider>
          </CheckSetup>
        }
      >
        <Route index element={<HomePage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
        <Route path="tokens" element={<TokensPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* 其他未匹配路由 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-background">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
};

export default App;
