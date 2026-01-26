// Supabase Edge Function for sending monthly check-in reminders
// This function runs on a schedule and sends reminders to users who need to check in

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendPushNotification } from '../_shared/fcm.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPreference {
  user_id: string
  monthly_checkin_enabled: boolean
  monthly_checkin_day: number
  monthly_checkin_time: string
  timezone: string
}

interface PushToken {
  token: string
  platform: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current UTC time
    const now = new Date()
    const currentHour = now.getUTCHours()

    console.log(`Running check-in reminder job at ${now.toISOString()}`)

    // Fetch users with check-in reminders enabled
    const { data: preferences, error: prefError } = await supabase
      .from('notification_preferences')
      .select('user_id, monthly_checkin_enabled, monthly_checkin_day, monthly_checkin_time, timezone')
      .eq('notifications_enabled', true)
      .eq('monthly_checkin_enabled', true)

    if (prefError) {
      throw new Error(`Failed to fetch preferences: ${prefError.message}`)
    }

    if (!preferences || preferences.length === 0) {
      console.log('No users with check-in reminders enabled')
      return new Response(
        JSON.stringify({ success: true, notified: 0, message: 'No users to notify' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Filter users whose local time matches their check-in time and day
    const usersToNotify: NotificationPreference[] = []

    for (const pref of preferences as NotificationPreference[]) {
      try {
        // Get the user's local time based on their timezone
        const userTimezone = pref.timezone || 'Europe/Berlin'
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        })

        const parts = formatter.formatToParts(now)
        const userDay = parseInt(parts.find(p => p.type === 'day')?.value || '0')
        const userHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')

        // Parse the user's preferred check-in time
        const [targetHour] = pref.monthly_checkin_time.split(':').map(Number)

        // Check if today is the check-in day and it's the right hour
        if (userDay === pref.monthly_checkin_day && userHour === targetHour) {
          usersToNotify.push(pref)
        }
      } catch (tzError) {
        console.error(`Failed to process timezone for user ${pref.user_id}:`, tzError)
      }
    }

    console.log(`Found ${usersToNotify.length} users to notify`)

    // For each user, check if they have goals needing check-in
    let notifiedCount = 0

    for (const pref of usersToNotify) {
      try {
        // Get previous month
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`

        // Check for savings goals without contributions for the previous month
        const { data: goals, error: goalsError } = await supabase
          .from('savings_goals')
          .select('id, name')
          .eq('user_id', pref.user_id)
          .is('deleted_at', null)

        if (goalsError) {
          console.error(`Failed to fetch goals for user ${pref.user_id}:`, goalsError)
          continue
        }

        if (!goals || goals.length === 0) {
          console.log(`User ${pref.user_id} has no savings goals`)
          continue
        }

        // Check for existing contributions for the previous month
        const { data: contributions, error: contribError } = await supabase
          .from('savings_contributions')
          .select('goal_id')
          .eq('user_id', pref.user_id)
          .eq('month', prevMonthStr)
          .is('deleted_at', null)

        if (contribError) {
          console.error(`Failed to fetch contributions for user ${pref.user_id}:`, contribError)
          continue
        }

        const contributedGoalIds = new Set(contributions?.map(c => c.goal_id) || [])
        const goalsNeedingCheckIn = goals.filter(g => !contributedGoalIds.has(g.id))

        if (goalsNeedingCheckIn.length === 0) {
          console.log(`User ${pref.user_id} has already checked in for all goals`)
          continue
        }

        // Get user's push tokens
        const { data: pushTokens, error: tokensError } = await supabase
          .from('push_tokens')
          .select('token, platform')
          .eq('user_id', pref.user_id)

        if (tokensError) {
          console.error(`Failed to fetch push tokens for user ${pref.user_id}:`, tokensError)
          continue
        }

        if (!pushTokens || pushTokens.length === 0) {
          console.log(`User ${pref.user_id} has no push tokens registered`)
          continue
        }

        // Build notification message
        const goalCount = goalsNeedingCheckIn.length
        const title = 'Monthly Savings Check-in'
        const body = goalCount === 1
          ? `Time to record your savings for "${goalsNeedingCheckIn[0].name}"! How did you do last month?`
          : `Time to check in on ${goalCount} savings goals! How did you do last month?`

        // Send push notification to all user's devices
        for (const pushToken of pushTokens as PushToken[]) {
          const result = await sendPushNotification(pushToken.token, {
            title,
            body,
            data: {
              type: 'monthly_checkin',
              goal_count: String(goalCount),
            },
          })

          if (result.success) {
            console.log(`Sent push notification to user ${pref.user_id} (${pushToken.platform})`)
            notifiedCount++
          } else {
            console.error(`Failed to send push to user ${pref.user_id}:`, result.error)
          }
        }
      } catch (userError) {
        console.error(`Failed to process user ${pref.user_id}:`, userError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notified: notifiedCount,
        totalChecked: usersToNotify.length,
        message: `Processed ${usersToNotify.length} users, notified ${notifiedCount}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
