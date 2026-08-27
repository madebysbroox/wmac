import { jsonResponse } from '../lib/utils.mjs';

export async function handler(event) {
  try {
    const adminEmail = event.requestContext?.authorizer?.lambda?.adminEmail;
    
    return jsonResponse(200, {
      message: 'Welcome to WMAC Admin Portal',
      admin: adminEmail,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Home error:', error);
    return jsonResponse(500, { error: 'Internal server error' });
  }
}
