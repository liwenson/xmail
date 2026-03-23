/**
 * API 路由整合
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppEnv, JWTPayload } from './types';
import { 
  createMailbox, 
  getMailbox, 
  getMailboxById,
  deleteMailbox, 
  getEmails, 
  getEmail, 
  getEmailById,
  deleteEmail,
  getAttachments,
  getAttachment,
  getUserMailboxCount,
  getUserMailboxes,
  getUserById,
  getAllApiTokens,
  getUserApiTokens,
  revokeApiToken,
  revokeApiTokenById,
} from './database';
import { generateRandomAddress } from './utils';
import { authMiddleware, getCurrentUser } from './auth';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';

// 普通用户最大邮箱数量
const MAX_MAILBOXES_PER_USER = 5;

// 创建 Hono 应用
const app = new Hono<AppEnv>();

function canAccessMailbox(user: JWTPayload, mailboxUserId?: string): boolean {
  return user.role === 'admin' || mailboxUserId === user.sub;
}

async function requireMailboxAccess(c: import('hono').Context<AppEnv>, mailboxId: string): Promise<Response | null> {
  const user = getCurrentUser(c);
  if (!user) {
    return c.json({ success: false, error: '未登录' }, 401);
  }

  const mailbox = await getMailboxById(c.env.DB, mailboxId);
  if (!mailbox) {
    return c.json({ success: false, error: '邮箱不存在' }, 404);
  }

  if (!canAccessMailbox(user, mailbox.userId)) {
    return c.json({ success: false, error: '无权访问此邮箱' }, 403);
  }

  return null;
}

async function requireEmailAccess(c: import('hono').Context<AppEnv>, emailId: string): Promise<Response | null> {
  const email = await getEmailById(c.env.DB, emailId);
  if (!email) {
    return c.json({ success: false, error: '邮件不存在' }, 404);
  }

  return requireMailboxAccess(c, email.mailboxId);
}

async function requireAttachmentAccess(c: import('hono').Context<AppEnv>, attachmentId: string): Promise<Response | null> {
  const attachment = await getAttachment(c.env.DB, attachmentId);
  if (!attachment) {
    return c.json({ success: false, error: '附件不存在' }, 404);
  }

  return requireEmailAccess(c, attachment.emailId);
}

// 添加 CORS 中间件
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// 挂载认证路由（需要认证的路由单独处理）
app.route('/api/auth', authRoutes);

// 对需要认证的 auth 路由应用中间件
const authProtected = new Hono<AppEnv>();

authProtected.use('/*', authMiddleware);
authProtected.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ success: false, error: '未登录' }, 401);
  }
  const fullUser = await getUserById(c.env.DB, user.sub);
  if (!fullUser) {
    return c.json({ success: false, error: '用户不存在' }, 404);
  }
  return c.json({
    success: true,
    user: {
      id: fullUser.id,
      username: fullUser.username,
      role: fullUser.role,
    }
  });
});

// 创建 API Token（明文 token 仅返回一次）
authProtected.post('/tokens', async (c) => {
  return c.json({ success: false, error: '已禁用通过 API 创建 Token' }, 403);
});

// 获取当前用户 API Token 列表
authProtected.get('/tokens', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: '未登录' }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const isAdmin = user.role === 'admin';
    const tokens = isAdmin
      ? await getAllApiTokens(c.env.DB)
      : await getUserApiTokens(c.env.DB, user.sub);

    // 防御性校验：普通用户绝不返回非本人 Token
    const visibleTokens = isAdmin
      ? tokens
      : tokens.filter((token) => token.userId === user.sub);

    return c.json({
      success: true,
      tokens: visibleTokens.map((token) => ({
        id: token.id,
        creatorUserId: token.userId,
        creatorUsername: 'creatorUsername' in token ? token.creatorUsername : user.username,
        name: token.name,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        lastUsedAt: token.lastUsedAt,
        revokedAt: token.revokedAt,
        isActive: token.revokedAt === null && (token.expiresAt === null || token.expiresAt > now),
      })),
    });
  } catch (error) {
    console.error('获取 API Token 列表失败:', error);
    return c.json({ success: false, error: '获取 API Token 列表失败' }, 500);
  }
});

// 吊销 API Token
authProtected.delete('/tokens/:id', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: '未登录' }, 401);
    }

    const tokenId = c.req.param('id');
    if (!tokenId) {
      return c.json({ success: false, error: 'Token ID 不能为空' }, 400);
    }

    const revoked = user.role === 'admin'
      ? await revokeApiTokenById(c.env.DB, tokenId)
      : await revokeApiToken(c.env.DB, tokenId, user.sub);
    if (!revoked) {
      return c.json({ success: false, error: 'Token 不存在或已吊销' }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('吊销 API Token 失败:', error);
    return c.json({ success: false, error: '吊销 API Token 失败' }, 500);
  }
});
app.route('/api/auth/protected', authProtected);

// 健康检查端点
app.get('/', (c) => {
  return c.json({ status: 'ok', message: 'XMAIL 临时邮箱系统 API 正常运行' });
});

// 获取系统配置（公开）
app.get('/api/config', (c) => {
  try {
    const emailDomains = c.env.VITE_EMAIL_DOMAIN || '';
    const domains = emailDomains.split(',').map((domain: string) => domain.trim()).filter((domain: string) => domain);
    
    return c.json({ 
      success: true, 
      config: {
        emailDomains: domains
      }
    });
  } catch (error) {
    console.error('获取配置失败:', error);
    return c.json({ 
      success: false, 
      error: '获取配置失败',
    }, 500);
  }
});

// 需要认证的路由组
const protectedRoutes = new Hono<AppEnv>();

// 添加认证中间件
protectedRoutes.use('/*', authMiddleware);

// 获取当前用户的邮箱列表
protectedRoutes.get('/api/mailboxes', async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return c.json({ success: false, error: '未登录' }, 401);
    }
    
    const mailboxes = await getUserMailboxes(c.env.DB, user.sub);
    
    return c.json({ success: true, mailboxes });
  } catch (error) {
    console.error('获取邮箱列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮箱列表失败',
    }, 500);
  }
});

// 创建邮箱
protectedRoutes.post('/api/mailboxes', async (c) => {
  try {
    const user = getCurrentUser(c);
    if (!user) {
      return c.json({ success: false, error: '未登录' }, 401);
    }
    
    const body = await c.req.json();
    
    // 验证参数
    if (body.address && typeof body.address !== 'string') {
      return c.json({ success: false, error: '无效的邮箱地址' }, 400);
    }
    
    // 普通用户检查邮箱数量限制
    if (user.role !== 'admin') {
      const currentCount = await getUserMailboxCount(c.env.DB, user.sub);
      if (currentCount >= MAX_MAILBOXES_PER_USER) {
        return c.json({ 
          success: false, 
          error: `普通用户最多只能创建 ${MAX_MAILBOXES_PER_USER} 个邮箱` 
        }, 400);
      }
    }
    
    const expiresInHours = 24; // 固定24小时有效期
    
    // 获取客户端IP
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    
    // 生成或使用提供的地址
    const address = body.address || generateRandomAddress();
    
    // 检查邮箱是否已存在
    const existingMailbox = await getMailbox(c.env.DB, address);
    if (existingMailbox) {
      return c.json({ success: false, error: '邮箱地址已存在' }, 400);
    }
    
    // 创建邮箱，关联用户
    const mailbox = await createMailbox(c.env.DB, {
      address,
      expiresInHours,
      ipAddress: ip,
      userId: user.sub,
    });
    
    return c.json({ success: true, mailbox });
  } catch (error) {
    console.error('创建邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '创建邮箱失败',
    }, 400);
  }
});

// 获取邮箱信息
protectedRoutes.get('/api/mailboxes/:address', async (c) => {
  try {
    const user = getCurrentUser(c);
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    
    // 普通用户只能访问自己的邮箱
    if (user && user.role !== 'admin' && mailbox.userId !== user.sub) {
      return c.json({ success: false, error: '无权访问此邮箱' }, 403);
    }
    
    return c.json({ success: true, mailbox });
  } catch (error) {
    console.error('获取邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮箱失败',
    }, 500);
  }
});

// 删除邮箱
protectedRoutes.delete('/api/mailboxes/:address', async (c) => {
  try {
    const user = getCurrentUser(c);
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    
    // 普通用户只能删除自己的邮箱
    if (user && user.role !== 'admin' && mailbox.userId !== user.sub) {
      return c.json({ success: false, error: '无权删除此邮箱' }, 403);
    }
    
    await deleteMailbox(c.env.DB, address);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮箱失败:', error);
    return c.json({ 
      success: false, 
      error: '删除邮箱失败',
    }, 500);
  }
});

// 获取邮件列表
protectedRoutes.get('/api/mailboxes/:address/emails', async (c) => {
  try {
    const user = getCurrentUser(c);
    const address = c.req.param('address');
    const mailbox = await getMailbox(c.env.DB, address);
    
    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }
    
    // 普通用户只能访问自己的邮箱
    if (user && user.role !== 'admin' && mailbox.userId !== user.sub) {
      return c.json({ success: false, error: '无权访问此邮箱' }, 403);
    }
    
    const emails = await getEmails(c.env.DB, mailbox.id);
    
    return c.json({ success: true, emails });
  } catch (error) {
    console.error('获取邮件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮件列表失败',
    }, 500);
  }
});

// 通过邮箱地址和邮件ID获取邮件内容（便于 API 直接读取正文）
protectedRoutes.get('/api/mailboxes/:address/emails/:id/content', async (c) => {
  try {
    const user = getCurrentUser(c);
    const address = c.req.param('address');
    const id = c.req.param('id');
    const mailbox = await getMailbox(c.env.DB, address);

    if (!mailbox) {
      return c.json({ success: false, error: '邮箱不存在' }, 404);
    }

    if (user && user.role !== 'admin' && mailbox.userId !== user.sub) {
      return c.json({ success: false, error: '无权访问此邮箱' }, 403);
    }

    const email = await getEmailById(c.env.DB, id);
    if (!email) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }

    if (email.mailboxId !== mailbox.id) {
      return c.json({ success: false, error: '邮件不属于该邮箱' }, 400);
    }

    return c.json({
      success: true,
      email: {
        id: email.id,
        mailboxId: email.mailboxId,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddress: email.toAddress,
        subject: email.subject,
        textContent: email.textContent || '',
        htmlContent: email.htmlContent || '',
        receivedAt: email.receivedAt,
        hasAttachments: email.hasAttachments,
        isRead: email.isRead,
      },
    });
  } catch (error) {
    console.error('获取邮件内容失败:', error);
    return c.json({
      success: false,
      error: '获取邮件内容失败',
    }, 500);
  }
});

// 获取邮件详情
protectedRoutes.get('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const accessDeniedResponse = await requireEmailAccess(c, id);
    if (accessDeniedResponse) {
      return accessDeniedResponse;
    }

    const email = await getEmail(c.env.DB, id);
    
    if (!email) {
      return c.json({ success: false, error: '邮件不存在' }, 404);
    }
    
    return c.json({ success: true, email });
  } catch (error) {
    console.error('获取邮件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '获取邮件详情失败',
      message: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// 获取邮件的附件列表
protectedRoutes.get('/api/emails/:id/attachments', async (c) => {
  try {
    const id = c.req.param('id');
    const accessDeniedResponse = await requireEmailAccess(c, id);
    if (accessDeniedResponse) {
      return accessDeniedResponse;
    }

    // 获取附件列表
    const attachments = await getAttachments(c.env.DB, id);
    
    return c.json({ success: true, attachments });
  } catch (error) {
    console.error('获取附件列表失败:', error);
    return c.json({ 
      success: false, 
      error: '获取附件列表失败',
    }, 500);
  }
});

// 获取附件详情
protectedRoutes.get('/api/attachments/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const accessDeniedResponse = await requireAttachmentAccess(c, id);
    if (accessDeniedResponse) {
      return accessDeniedResponse;
    }

    const attachment = await getAttachment(c.env.DB, id);
    
    if (!attachment) {
      return c.json({ success: false, error: '附件不存在' }, 404);
    }
    
    // 检查是否需要直接返回附件内容
    const download = c.req.query('download') === 'true';
    
    if (download) {
      // 将Base64内容转换为二进制
      const binaryContent = atob(attachment.content);
      const bytes = new Uint8Array(binaryContent.length);
      for (let i = 0; i < binaryContent.length; i++) {
        bytes[i] = binaryContent.charCodeAt(i);
      }
      
      // 设置响应头
      c.header('Content-Type', attachment.mimeType);
      c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.filename)}"`);
      
      return c.body(bytes);
    }
    
    // 返回附件信息（不包含内容，避免响应过大）
    return c.json({ 
      success: true, 
      attachment: {
        id: attachment.id,
        emailId: attachment.emailId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: attachment.createdAt,
        isLarge: attachment.isLarge,
        chunksCount: attachment.chunksCount
      }
    });
  } catch (error) {
    console.error('获取附件详情失败:', error);
    return c.json({ 
      success: false, 
      error: '获取附件详情失败',
    }, 500);
  }
});

// 删除邮件
protectedRoutes.delete('/api/emails/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const accessDeniedResponse = await requireEmailAccess(c, id);
    if (accessDeniedResponse) {
      return accessDeniedResponse;
    }

    await deleteEmail(c.env.DB, id);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('删除邮件失败:', error);
    return c.json({ 
      success: false, 
      error: '删除邮件失败',
    }, 500);
  }
});

// 挂载受保护的路由
app.route('/', protectedRoutes);

// 挂载管理路由（需要管理员权限）
const adminApp = new Hono<AppEnv>();
adminApp.use('/*', authMiddleware);
adminApp.route('/', adminRoutes);
app.route('/api/admin', adminApp);

export default app;
