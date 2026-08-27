import { getSession, createSession, deleteSession, createSecureCookie, errorResponse } from '../lib/utils.mjs';

export async function handler(event) {
  try {
    const { token } = event.queryStringParameters || {};
    
    if (!token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>Invalid or missing token</h1><p><a href="/">Return to login</a></p></body></html>'
      };
    }
    
    const magicToken = `magic:${token}`;
    const magicSession = await getSession(magicToken);
    
    if (!magicSession || magicSession.type !== 'magic-link') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>Invalid or expired login link</h1><p><a href="/">Return to login</a></p></body></html>'
      };
    }
    
    await deleteSession(magicToken);
    
    const clientIp = event.requestContext?.http?.sourceIp || 'unknown';
    const { sessionToken } = await createSession(magicSession.adminEmail, clientIp);
    
    const sessionCookie = createSecureCookie('wmac-session', sessionToken, 86400);
    
    return {
      statusCode: 302,
      headers: {
        'Location': '/admin',
        'Set-Cookie': sessionCookie
      },
      body: ''
    };
    
  } catch (error) {
    console.error('Verify error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: '<html><body><h1>Internal server error</h1><p><a href="/">Return to login</a></p></body></html>'
    };
  }
}
