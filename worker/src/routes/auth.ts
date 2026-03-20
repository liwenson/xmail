/**
 * 认证 API 路由
 */
import { Hono } from 'hono';
import { Env } from '../types';
import { 
  hasAdmin, 
  createUser, 
  getUserByUsername, 
  createSession,
  deleteSession,
  getUserById 
} from '../database';
import { hashPassword, verifyPassword, createJWT, getJWTSecret } from '../auth';

const auth = new Hono<{ Bindings: Env }>();

// 检查是否需要初始化
auth.get('/setup', async (c) => {
  try {
    const adminExists = await hasAdmin(c.env.DB);
    return c.json({
      success: true,
      needsSetup: !adminExists
    });
  } catch (error) {
    console.error('检查初始化状态失败:', error);
    return c.json({ 
      success: false, 
      error: '检查初始化状态失败' 
    }, 500);
  }
});

// 初始化管理员
auth.post('/setup', async (c) => {
  try {
    // 检查是否已存在管理员
    const adminExists = await hasAdmin(c.env.DB);
    if (adminExists) {
      return c.json({ 
        success: false, 
        error: '管理员已存在，无法重复创建' 
      }, 400);
    }
    
    const body = await c.req.json();
    const { username, password } = body;
    
    // 验证参数
    if (!username || !password) {
      return c.json({ 
        success: false, 
        error: '用户名和密码不能为空' 
      }, 400);
    }
    
    if (username.length < 3 || username.length > 20) {
      return c.json({ 
        success: false, 
        error: '用户名长度必须在 3-20 个字符之间' 
      }, 400);
    }
    
    if (password.length < 6) {
      return c.json({ 
        success: false, 
        error: '密码长度至少 6 个字符' 
      }, 400);
    }
    
    // 检查用户名是否已存在
    const existingUser = await getUserByUsername(c.env.DB, username);
    if (existingUser) {
      return c.json({ 
        success: false, 
        error: '用户名已存在' 
      }, 400);
    }
    
    // 创建管理员
    const passwordHash = await hashPassword(password);
    const user = await createUser(c.env.DB, username, passwordHash, 'admin');
    
    // 创建会话
    const session = await createSession(c.env.DB, user.id);
    
    // 生成 JWT
    const secret = getJWTSecret(c.env);
    const token = createJWT({
      sub: user.id,
      username: user.username,
      role: user.role,
    }, secret);
    
    // 设置 Cookie
    c.header('Set-Cookie', `auth_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`);
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      }
    });
  } catch (error) {
    console.error('创建管理员失败:', error);
    return c.json({ 
      success: false, 
      error: '创建管理员失败' 
    }, 500);
  }
});

// 用户登录
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = body;
    
    // 验证参数
    if (!username || !password) {
      return c.json({ 
        success: false, 
        error: '用户名和密码不能为空' 
      }, 400);
    }
    
    // 查找用户
    const user = await getUserByUsername(c.env.DB, username);
    if (!user) {
      return c.json({ 
        success: false, 
        error: '用户名或密码错误' 
      }, 401);
    }
    
    // 验证密码
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return c.json({ 
        success: false, 
        error: '用户名或密码错误' 
      }, 401);
    }
    
    // 创建会话
    const session = await createSession(c.env.DB, user.id);
    
    // 生成 JWT
    const secret = getJWTSecret(c.env);
    const token = createJWT({
      sub: user.id,
      username: user.username,
      role: user.role,
    }, secret);
    
    // 设置 Cookie
    c.header('Set-Cookie', `auth_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`);
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      }
    });
  } catch (error) {
    console.error('登录失败:', error);
    return c.json({ 
      success: false, 
      error: '登录失败' 
    }, 500);
  }
});

// 用户登出
auth.post('/logout', async (c) => {
  try {
    // 清除 Cookie
    c.header('Set-Cookie', 'auth_token=; HttpOnly; Path=/; Max-Age=0');
    
    return c.json({ success: true });
  } catch (error) {
    console.error('登出失败:', error);
    return c.json({ 
      success: false, 
      error: '登出失败' 
    }, 500);
  }
});

// 获取当前用户信息
auth.get('/me', async (c) => {
  try {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ 
        success: false, 
        error: '未登录' 
      }, 401);
    }
    
    // 从数据库获取完整用户信息
    const fullUser = await getUserById(c.env.DB, user.sub);
    
    if (!fullUser) {
      return c.json({ 
        success: false, 
        error: '用户不存在' 
      }, 404);
    }
    
    return c.json({
      success: true,
      user: {
        id: fullUser.id,
        username: fullUser.username,
        role: fullUser.role,
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return c.json({ 
      success: false, 
      error: '获取用户信息失败' 
    }, 500);
  }
});

export default auth;
