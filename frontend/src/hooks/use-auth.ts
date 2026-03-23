/**
 * 认证 Hook
 */
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { login as apiLogin, logout as apiLogout, setupAdmin as apiSetupAdmin } from '../utils/api';

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  const login = async (username: string, password: string) => {
    const result = await apiLogin(username, password);
    if (result.success) {
      await context.checkAuth();
    }
    return result;
  };

  const logout = async () => {
    await apiLogout();
    context.checkAuth();
  };

  const setupAdmin = async (username: string, password: string) => {
    const result = await apiSetupAdmin(username, password);
    if (result.success) {
      await context.checkAuth();
    }
    return result;
  };

  return {
    ...context,
    login,
    logout,
    setupAdmin,
  };
};
