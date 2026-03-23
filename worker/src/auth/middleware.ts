/**
 * 认证中间件
 */
import { Context, Next } from 'hono';
import { verifyJWT, getJWTSecret } from './jwt';
import { AppEnv, Env, JWTPayload } from '../types';
import { getUserById, getValidApiTokenByValue, touchApiTokenLastUsed } from '../database';
import { getCurrentTimestamp } from '../utils';

export interface AuthContext {
  user: JWTPayload | null;
}

// 公开路径（不需要认证）
const PUBLIC_PATHS = [
  '/',
  '/api/auth/setup',
  '/api/auth/login',
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
export async function authMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const env = c.env as Env;
  const path = new URL(c.req.url).pathname;

  // 公开路径直接通过
  if (PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'))) {
    return next();
  }

  // 提取 token
  const token = extractToken(c.req.raw);

  if (!token) {
    return c.json({ success: false, error: '未登录，请先登录' }, 401);
  }

  // 验证 token
  const secret = getJWTSecret(env);
  const payload = await verifyJWT(token, secret);

  if (payload) {
    // 将用户信息存储在 context 中
    c.set('user', payload);
    return next();
  }

  // JWT 验证失败时，尝试按 API Token 验证
  const apiToken = await getValidApiTokenByValue(env.DB, token);
  if (!apiToken) {
    return c.json({ success: false, error: 'Token 无效或已过期，请重新登录' }, 401);
  }

  const user = await getUserById(env.DB, apiToken.userId);
  if (!user) {
    return c.json({ success: false, error: 'Token 关联用户不存在' }, 401);
  }

  await touchApiTokenLastUsed(env.DB, apiToken.id);

  const now = getCurrentTimestamp();
  const tokenPayload: JWTPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: now,
    exp: apiToken.expiresAt ?? (now + 7 * 24 * 60 * 60),
  };

  c.set('user', tokenPayload);
  return next();
}

// 管理员权限中间件
export async function adminMiddleware(c: Context<AppEnv>, next: Next): Promise<Response | void> {
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
export function getCurrentUser(c: Context<AppEnv>): JWTPayload | null {
  return c.get('user') || null;
}
