/**
 * 认证状态管理
 */
import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { API_BASE_URL } from '../config';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  needsSetup: boolean;
  checkNeedsSetup: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => ({ success: false }),
  logout: async () => {},
  checkAuth: async () => {},
  needsSetup: false,
  checkNeedsSetup: async () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  // 检查是否需要初始化
  const checkNeedsSetup = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/setup`);
      const data = await response.json();
      if (data.success) {
        setNeedsSetup(data.needsSetup);
      }
    } catch (error) {
      console.error('检查初始化状态失败:', error);
    }
  }, []);

  // 检查认证状态
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`);
      const data = await response.json();
      
      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('检查认证状态失败:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success && data.user) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error || '登录失败' };
      }
    } catch (error) {
      console.error('登录失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  }, []);

  // 登出
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('登出失败:', error);
    } finally {
      setUser(null);
    }
  }, []);

  // 初始化
  useEffect(() => {
    const init = async () => {
      await checkNeedsSetup();
      await checkAuth();
    };
    init();
  }, [checkNeedsSetup, checkAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
        needsSetup,
        checkNeedsSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
