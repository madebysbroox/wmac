import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import crypto from "crypto";

const ddbClient = new DynamoDBClient({});
export const dynamoDb = DynamoDBDocumentClient.from(ddbClient);

const secretsClient = new SecretsManagerClient({});

let secretsCache = {};

export async function getSecret(secretName) {
  if (secretsCache[secretName]) {
    return secretsCache[secretName];
  }
  
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await secretsClient.send(command);
  const secret = response.SecretString ? JSON.parse(response.SecretString) : null;
  secretsCache[secretName] = secret;
  return secret;
}

export function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function createSessionToken() {
  return generateSecureToken(32); // 256 bits
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = rest.join('=');
    return cookies;
  }, {});
}

export function createSecureCookie(name, value, maxAge = 86400) {
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  return `${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}; Expires=${expires}`;
}

export function clearCookie(name) {
  return `${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function createSession(email, ipAddress) {
  const sessionToken = createSessionToken();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 86400; // 24 hours
  
  await dynamoDb.send(new PutCommand({
    TableName: process.env.SESSION_TABLE,
    Item: {
      sessionToken,
      adminEmail: email,
      createdAt: now,
      expiresAt,
      ipAddress,
      createdAtIso: new Date().toISOString()
    }
  }));
  
  return { sessionToken, expiresAt };
}

export async function getSession(sessionToken) {
  if (!sessionToken) return null;
  
  const result = await dynamoDb.send(new GetCommand({
    TableName: process.env.SESSION_TABLE,
    Key: { sessionToken }
  }));
  
  if (!result.Item) return null;
  
  const now = Math.floor(Date.now() / 1000);
  if (result.Item.expiresAt < now) {
    await deleteSession(sessionToken);
    return null;
  }
  
  return result.Item;
}

export async function deleteSession(sessionToken) {
  await dynamoDb.send(new DeleteCommand({
    TableName: process.env.SESSION_TABLE,
    Key: { sessionToken }
  }));
}

export async function checkRateLimit(identifier, maxAttempts = 5, windowSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const tableName = process.env.RATE_LIMIT_TABLE;
  
  const result = await dynamoDb.send(new GetCommand({
    TableName: tableName,
    Key: { identifier }
  }));
  
  if (!result.Item) {
    await dynamoDb.send(new PutCommand({
      TableName: tableName,
      Item: {
        identifier,
        attempts: 1,
        expiresAt: now + windowSeconds,
        firstAttemptAt: now
      }
    }));
    return { allowed: true, remaining: maxAttempts - 1 };
  }
  
  if (result.Item.expiresAt < now) {
    await dynamoDb.send(new PutCommand({
      TableName: tableName,
      Item: {
        identifier,
        attempts: 1,
        expiresAt: now + windowSeconds,
        firstAttemptAt: now
      }
    }));
    return { allowed: true, remaining: maxAttempts - 1 };
  }
  
  const attempts = result.Item.attempts || 0;
  if (attempts >= maxAttempts) {
    return { 
      allowed: false, 
      remaining: 0,
      retryAfter: result.Item.expiresAt - now
    };
  }
  
  await dynamoDb.send(new PutCommand({
    TableName: tableName,
    Item: {
      ...result.Item,
      attempts: attempts + 1
    }
  }));
  
  return { allowed: true, remaining: maxAttempts - attempts - 1 };
}

export function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  };
}

export function errorResponse(statusCode, message, details = null) {
  const body = { error: message };
  if (details) body.details = details;
  return jsonResponse(statusCode, body);
}
