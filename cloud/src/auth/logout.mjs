import { parseCookies, deleteSession, clearCookie, errorResponse, jsonResponse } from '../lib/utils.mjs';

export async function handler(event) {
  try {
    const cookies = parseCookies(event.headers?.cookie);
    const sessionToken = cookies['wmac-session'];
    
    if (!sessionToken) {
      return jsonResponse(200, { message: 'No active session' });
    }
    
    await deleteSession(sessionToken);
    
    const clearSessionCookie = clearCookie('wmac-session');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearSessionCookie
      },
      body: JSON.stringify({ message: 'Logged out successfully' })
    };
    
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse(500, 'Internal server error');
  }
}
