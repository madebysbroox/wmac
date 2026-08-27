import { getSecret, checkRateLimit, generateSecureToken, errorResponse, jsonResponse } from '../lib/utils.mjs';
import { dynamoDb } from '../lib/utils.mjs';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const MAGIC_LINK_EXPIRY = 900; // 15 minutes

export async function handler(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { email } = body;
    
    if (!email || !email.includes('@')) {
      return errorResponse(400, 'Valid email address is required');
    }
    
    const clientIp = event.requestContext?.http?.sourceIp || 'unknown';
    const rateLimitId = `login:${clientIp}`;
    const rateLimit = await checkRateLimit(rateLimitId, 5, 3600);
    
    if (!rateLimit.allowed) {
      return errorResponse(429, 'Too many login attempts. Please try again later.', {
        retryAfter: rateLimit.retryAfter
      });
    }
    
    const allowlistSecret = await getSecret(process.env.ADMIN_ALLOWLIST_SECRET);
    const allowedEmails = allowlistSecret?.allowedAdmins || [];
    
    const isAllowed = allowedEmails.some(
      allowed => allowed.toLowerCase() === email.toLowerCase()
    );
    
    if (!isAllowed) {
      console.log(`Login attempt from non-allowlisted email: ${email}`);
      return jsonResponse(200, {
        message: 'If your email is registered, you will receive a login link shortly.'
      });
    }
    
    const magicToken = generateSecureToken(32);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + MAGIC_LINK_EXPIRY;
    
    await dynamoDb.send(new PutCommand({
      TableName: process.env.SESSION_TABLE,
      Item: {
        sessionToken: `magic:${magicToken}`,
        adminEmail: email,
        createdAt: now,
        expiresAt,
        ipAddress: clientIp,
        type: 'magic-link',
        createdAtIso: new Date().toISOString()
      }
    }));
    
    console.log(`Magic link created for ${email}, expires in ${MAGIC_LINK_EXPIRY}s`);
    
    // TODO: Send email with magic link
    // For now, log the magic link (DEV ONLY - remove in production)
    if (process.env.ENVIRONMENT === 'development') {
      console.log(`Magic link for ${email}: /auth/verify?token=${magicToken}`);
    }
    
    return jsonResponse(200, {
      message: 'If your email is registered, you will receive a login link shortly.',
      // DEV ONLY: include token in response for testing
      ...(process.env.ENVIRONMENT === 'development' && { _devToken: magicToken })
    });
    
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(500, 'Internal server error');
  }
}
