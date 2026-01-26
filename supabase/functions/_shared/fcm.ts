/**
 * Firebase Cloud Messaging (FCM) utilities for Supabase Edge Functions.
 *
 * Uses the FCM HTTP v1 API with service account authentication.
 *
 * Required environment variables:
 * - FCM_PROJECT_ID: Firebase project ID
 * - FCM_SERVICE_ACCOUNT_EMAIL: Service account email
 * - FCM_PRIVATE_KEY: Service account private key (PEM format)
 */

interface FCMMessage {
  title: string
  body: string
  data?: Record<string, string>
}

interface FCMResponse {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Create a JWT for FCM authentication.
 */
async function createJWT(
  serviceAccountEmail: string,
  privateKeyInput: string
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // 1 hour
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  // Encode header and payload
  const encoder = new TextEncoder()
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsignedToken = `${headerB64}.${payloadB64}`

  // Handle private key - it might be base64-encoded or raw PEM
  let privateKey = privateKeyInput

  // If it doesn't look like a PEM key, try to decode from base64
  if (!privateKey.includes('-----BEGIN')) {
    try {
      privateKey = atob(privateKey)
    } catch {
      // Not base64, use as-is
    }
  }

  // Replace literal \n with actual newlines (common when stored as env var)
  privateKey = privateKey.replace(/\\n/g, '\n')

  // Import the private key
  const pemContents = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  // Sign the token
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken)
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${unsignedToken}.${signatureB64}`
}

/**
 * Get an OAuth2 access token for FCM.
 */
async function getAccessToken(
  serviceAccountEmail: string,
  privateKey: string
): Promise<string> {
  const jwt = await createJWT(serviceAccountEmail, privateKey)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get access token: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Send a push notification via FCM.
 */
export async function sendPushNotification(
  token: string,
  message: FCMMessage
): Promise<FCMResponse> {
  const projectId = Deno.env.get('FCM_PROJECT_ID')
  const serviceAccountEmail = Deno.env.get('FCM_SERVICE_ACCOUNT_EMAIL')
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY')

  if (!projectId || !serviceAccountEmail || !privateKey) {
    return {
      success: false,
      error: 'Missing FCM configuration (FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_EMAIL, FCM_PRIVATE_KEY)',
    }
  }

  try {
    const accessToken = await getAccessToken(serviceAccountEmail, privateKey)

    const fcmPayload = {
      message: {
        token: token,
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data || {},
        android: {
          priority: 'high',
          notification: {
            channel_id: 'goaldy_notifications',
          },
        },
      },
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('FCM send failed:', error)
      return {
        success: false,
        error: `FCM send failed: ${response.status} ${error}`,
      }
    }

    const result = await response.json()
    return {
      success: true,
      messageId: result.name,
    }
  } catch (error) {
    console.error('FCM error:', error)
    return {
      success: false,
      error: `FCM error: ${error.message}`,
    }
  }
}

/**
 * Send push notifications to multiple tokens.
 * Returns the count of successful sends.
 */
export async function sendPushNotifications(
  tokens: string[],
  message: FCMMessage
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const results = await Promise.all(
    tokens.map(token => sendPushNotification(token, message))
  )

  const sent = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const errors = results.filter(r => !r.success && r.error).map(r => r.error!)

  return { sent, failed, errors }
}
