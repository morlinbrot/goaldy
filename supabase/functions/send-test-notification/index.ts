// Supabase Edge Function for sending test push notifications
// This function allows authenticated users to send a test notification to their devices

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushNotification } from '../_shared/fcm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with the user's JWT from Authorization header
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    // Log all headers for debugging
    console.log('All headers:', Object.fromEntries(req.headers.entries()))

    // Try multiple ways to get the authorization
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')

    // Use service role client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let userId: string | null = null

    if (authHeader) {
      // Extract JWT from Bearer token and verify
      const jwt = authHeader.replace('Bearer ', '')
      console.log('JWT present, verifying...')
      const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
      if (!userError && user) {
        userId = user.id
        console.log('User verified via JWT:', userId)
      } else {
        console.error('JWT verification failed:', userError?.message)
      }
    }

    // If no auth header, try to get user_id from request body
    if (!userId) {
      try {
        const body = await req.json()
        if (body.user_id) {
          // Validate that this user exists
          const { data: profile } = await supabase
            .from('push_tokens')
            .select('user_id')
            .eq('user_id', body.user_id)
            .limit(1)
            .single()

          if (profile) {
            userId = body.user_id
            console.log('User ID from request body:', userId)
          }
        }
      } catch {
        // No body or not JSON, that's fine
      }
    }

    if (!userId) {
      console.error('No user ID found - no auth header and no user_id in body')
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized - no user identification provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending test notification to user ${userId}`)

    // Get user's push tokens
    const { data: pushTokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    if (tokensError) {
      console.error('Failed to fetch push tokens:', tokensError)
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch push tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pushTokens || pushTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No push tokens registered for this device' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send test notification to all user's devices
    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    for (const pushToken of pushTokens) {
      const result = await sendPushNotification(pushToken.token, {
        title: 'Test Notification',
        body: 'Push notifications are working correctly!',
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
        },
      })

      if (result.success) {
        successCount++
        console.log(`Sent test notification to ${pushToken.platform} device`)
      } else {
        failCount++
        if (result.error) {
          errors.push(result.error)
        }
        console.error(`Failed to send to ${pushToken.platform}:`, result.error)
      }
    }

    if (successCount === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to send notification to any device',
          details: errors
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent to ${successCount} device(s)${failCount > 0 ? `, failed for ${failCount}` : ''}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
