import { getSession, parseCookies } from '../lib/utils.mjs';

export async function handler(event) {
  try {
    const cookies = parseCookies(event.headers?.cookie);
    const sessionToken = cookies['wmac-session'];
    
    if (!sessionToken) {
      return {
        isAuthorized: false
      };
    }
    
    const session = await getSession(sessionToken);
    
    if (!session) {
      return {
        isAuthorized: false
      };
    }
    
    return {
      isAuthorized: true,
      context: {
        adminEmail: session.adminEmail,
        sessionToken: session.sessionToken
      }
    };
  } catch (error) {
    console.error('Authorizer error:', error);
    return {
      isAuthorized: false
    };
  }
}
