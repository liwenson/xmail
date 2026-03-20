/**
 * JWT 工具模块
 */
import { JWTPayload, Env } from '../types';
import { getCurrentTimestamp } from '../utils';

const ALGORITHM = 'HS256';
const DEFAULT_EXPIRY_DAYS = 7;

/**
 * Base64URL 编码
 */
function base64UrlEncode(data: string): string {
  const encoded = btoa(data);
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL 解码
 */
function base64UrlDecode(data: string): string {
  let padded = data.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4) {
    padded += '=';
  }
  return atob(padded);
}

/**
 * 创建 JWT Token
 */
export function createJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInDays: number = DEFAULT_EXPIRY_DAYS): string {
  const now = getCurrentTimestamp();
  
  const header = {
    alg: ALGORITHM,
    typ: 'JWT',
  };
  
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + (expiresInDays * 24 * 60 * 60),
  };
  
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));
  
  // 创建签名
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = createHMACSignature(signatureInput, secret);
  const signatureEncoded = base64UrlEncode(signature);
  
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

/**
 * 验证 JWT Token
 */
export function verifyJWT(token: string, secret: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    
    // 验证签名
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = createHMACSignature(signatureInput, secret);
    const actualSignature = base64UrlDecode(signatureEncoded);
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    // 解析 payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadEncoded));
    
    // 验证过期时间
    const now = getCurrentTimestamp();
    if (payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch {
    return null;
  }
}

/**
 * 创建 HMAC 签名 (使用 Web Crypto API)
 */
async function createHMACSignature(input: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  const bytes = new Uint8Array(signature);
  
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  return binary;
}

/**
 * 获取 JWT Secret
 */
export function getJWTSecret(env: Env): string {
  return env.JWT_SECRET || 'xmail-default-secret-change-in-production';
}
