package app.goaldy.budget

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase Cloud Messaging service for handling push notifications.
 * 
 * This service:
 * - Receives FCM messages when app is in foreground
 * - Handles new token generation and refresh
 * - Creates notification channel for Android 8.0+
 * - Displays notifications with proper styling
 */
class GoaldyFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "GoaldyFCM"
        const val CHANNEL_ID = "goaldy_notifications"
        const val CHANNEL_NAME = "Goaldy Notifications"
        
        // Shared preferences key for storing the FCM token
        const val PREFS_NAME = "goaldy_fcm_prefs"
        const val TOKEN_KEY = "fcm_token"
        const val TOKEN_SENT_KEY = "fcm_token_sent"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    /**
     * Called when a new FCM token is generated.
     * This happens on first app start and when token is refreshed.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token received")
        
        // Store token locally for the WebView to retrieve
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(TOKEN_KEY, token)
            .putBoolean(TOKEN_SENT_KEY, false)
            .apply()
    }

    /**
     * Called when a message is received while app is in foreground.
     * Background messages are handled automatically by FCM.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "Message received from: ${remoteMessage.from}")

        // Check if message contains a notification payload
        remoteMessage.notification?.let { notification ->
            val title = notification.title ?: "Goaldy"
            val body = notification.body ?: ""
            showNotification(title, body, remoteMessage.data)
        }

        // Handle data-only messages
        if (remoteMessage.data.isNotEmpty() && remoteMessage.notification == null) {
            val title = remoteMessage.data["title"] ?: "Goaldy"
            val body = remoteMessage.data["body"] ?: ""
            showNotification(title, body, remoteMessage.data)
        }
    }

    /**
     * Create the notification channel required for Android 8.0+
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications for savings goals, check-ins, and motivation"
                enableLights(true)
                enableVibration(true)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Display a notification to the user.
     */
    private fun showNotification(title: String, body: String, data: Map<String, String>) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // Create intent to open app when notification is tapped
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            // Pass notification data to the activity for deep linking
            data.forEach { (key, value) ->
                putExtra(key, value)
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info) // TODO: Use app icon
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
