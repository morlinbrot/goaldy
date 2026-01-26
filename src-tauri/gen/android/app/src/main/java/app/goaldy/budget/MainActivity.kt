package app.goaldy.budget

import android.content.Context
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        // Add JavaScript interface for FCM communication
        webView.addJavascriptInterface(FCMBridge(this), "GoaldyFCM")
    }

    /**
     * JavaScript interface for Firebase Cloud Messaging.
     * Allows the WebView to interact with FCM for push notifications.
     */
    class FCMBridge(private val context: Context) {
        
        /**
         * Get the current FCM token.
         * Returns the token from SharedPreferences if available,
         * otherwise requests a new one from Firebase.
         */
        @JavascriptInterface
        fun getToken(): String {
            val prefs = context.getSharedPreferences(
                GoaldyFirebaseMessagingService.PREFS_NAME, 
                Context.MODE_PRIVATE
            )
            return prefs.getString(GoaldyFirebaseMessagingService.TOKEN_KEY, "") ?: ""
        }

        /**
         * Request a fresh FCM token from Firebase.
         * The result will be stored in SharedPreferences and can be retrieved with getToken().
         */
        @JavascriptInterface
        fun requestToken() {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    val token = task.result
                    val prefs = context.getSharedPreferences(
                        GoaldyFirebaseMessagingService.PREFS_NAME,
                        Context.MODE_PRIVATE
                    )
                    prefs.edit()
                        .putString(GoaldyFirebaseMessagingService.TOKEN_KEY, token)
                        .putBoolean(GoaldyFirebaseMessagingService.TOKEN_SENT_KEY, false)
                        .apply()
                }
            }
        }

        /**
         * Check if the token has been sent to the server.
         */
        @JavascriptInterface
        fun isTokenSent(): Boolean {
            val prefs = context.getSharedPreferences(
                GoaldyFirebaseMessagingService.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            return prefs.getBoolean(GoaldyFirebaseMessagingService.TOKEN_SENT_KEY, false)
        }

        /**
         * Mark the token as sent to the server.
         */
        @JavascriptInterface
        fun markTokenSent() {
            val prefs = context.getSharedPreferences(
                GoaldyFirebaseMessagingService.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            prefs.edit()
                .putBoolean(GoaldyFirebaseMessagingService.TOKEN_SENT_KEY, true)
                .apply()
        }
    }
}
