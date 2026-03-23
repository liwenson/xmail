/**
 * JWT 工具模块
 */
import { JWTPayload, Env } from '../types';
import { getCurrentTimestamp } from '../utils';

const ALGORITHM = 'HS256';
const DEFAULT_EXPIRY_DAYS = 7;
const FIXED_JWT_SECRET = 'e4f9b7c1a8d34e5f92c6b1a7d3e8f4c9b6a1d2e7f3c8b4a9d5e2f7c1b8a3d6e';

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
 * 将 Uint8Array 转换为 Base64URL 编码字符串
 */
function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * 创建 HMAC 签名 (使用 Web Crypto API)
 */
async function createHMACSignature(input: string, secret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return new Uint8Array(signature);
}

/**
 * 创建 JWT Token
 */
export async function createJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInDays: number = DEFAULT_EXPIRY_DAYS): Promise<string> {
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
  const signatureBytes = await createHMACSignature(signatureInput, secret);
  const signatureEncoded = uint8ArrayToBase64Url(signatureBytes);
  
  return `${headerEncoded}.${payloadEncoded}.${signatureEncoded}`;
}

/**
 * 将 Base64URL 字符串转换为 Uint8Array
 */
function base64UrlToUint8Array(data: string): Uint8Array {
  // 先转换为标准 base64
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  // 添加 padding
  while (base64.length % 4) {
    base64 += '=';
  }
  // 解码为二进制字符串
  const binary = atob(base64);
  // 转换为 Uint8Array
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 比较两个 Uint8Array 是否相等
 */
function uint8ArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 验证 JWT Token
 */
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    
    // 解析 payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadEncoded));
    
    // 验证签名
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignatureBytes = await createHMACSignature(signatureInput, secret);
    const actualSignatureBytes = base64UrlToUint8Array(signatureEncoded);
    
    if (!uint8ArrayEqual(expectedSignatureBytes, actualSignatureBytes)) {
      return null;
    }
    
    // 验证过期时间
    const now = getCurrentTimestamp();
    if (payload.exp < now) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('JWT 验证失败');
    return null;
  }
}

/**
 * 获取 JWT Secret
 */
export function getJWTSecret(_env: Env): string {
  return FIXED_JWT_SECRET;
}
