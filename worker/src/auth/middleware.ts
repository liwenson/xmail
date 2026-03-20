/**
 * 认证中间件
 */
import { Context, Next } from 'hono';
import { verifyJWT, getJWTSecret } from './jwt';
import { Env, JWTPayload } from '../types';

export interface AuthContext {
  user: JWTPayload | null;
}

// 公开路径（不需要认证）
const PUBLIC_PATHS = [
  '/',
  '/api/auth/setup',
  '/api/auth/login',
];

// 管理路径（需要管理员权限）
const ADMIN_PATHS = [
  '/api/admin',
];

// 提取 token 的函数
function extractToken(request: Request): string | null {
  // 从 Authorization Header 获取 (优先)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // 从 Cookie 中获取 (备选)
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      })
    );
    if (cookies['auth_token']) {
      return cookies['auth_token'];
    }
  }
  
  return null;
}

// 认证中间件
export async function authMiddleware(c: Context, next: Next) {
  const env = c.env as Env;
  const path = new URL(c.req.url).pathname;
  
  console.log('authMiddleware called for path:', path);
  
  // 公开路径直接通过
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    console.log('Public path, skipping auth');
    return next();
  }
  
  // 提取 token
  const token = extractToken(c.req.raw);
  console.log('Extracted token:', token ? 'exists' : 'null');
  
  if (!token) {
    console.log('No token found');
    return c.json({ success: false, error: '未登录，请先登录' }, 401);
  }
  
  // 验证 token
  const secret = getJWTSecret(env);
  console.log('Secret:', secret);
  const payload = await verifyJWT(token, secret);
  console.log('JWT payload:', payload);
  
  if (!payload) {
    console.log('Token verification failed');
    return c.json({ success: false, error: 'Token 已过期，请重新登录' }, 401);
  }
  
  // 将用户信息存储在 context 中
  c.set('user', payload);
  
  return next();
}

// 管理员权限中间件
export async function adminMiddleware(c: Context, next: Next) {
  const user = c.get('user');
  
  if (!user) {
    return c.json({ success: false, error: '未登录' }, 401);
  }
  
  if (user.role !== 'admin') {
    return c.json({ success: false, error: '权限不足，需要管理员权限' }, 403);
  }
  
  return next();
}

// 获取当前用户
export function getCurrentUser(c: Context): JWTPayload | null {
  return c.get('user') || null;
}
