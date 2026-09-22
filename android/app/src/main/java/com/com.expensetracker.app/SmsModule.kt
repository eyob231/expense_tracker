package com.expensetracker.app

import android.content.ContentResolver
import android.content.Context
import android.content.SharedPreferences
import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

class SmsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        currentReactContext = reactContext
    }

    override fun getName(): String = "SmsModule"

    // Required by NativeEventEmitter on the JS side
    @ReactMethod
    fun addListener(eventName: String) {
        // No-op: React Native requires this method to exist
    }

    // Required by NativeEventEmitter on the JS side
    @ReactMethod
    fun removeListeners(count: Int) {
        // No-op: React Native requires this method to exist
    }

    @ReactMethod
    fun getSmsList(options: ReadableMap, promise: Promise) {
        try {
            val resolver: ContentResolver = reactContext.contentResolver
            val limit = if (options.hasKey("limit")) options.getInt("limit") else 200
            val minDate = if (options.hasKey("minDate")) options.getDouble("minDate").toLong() else 0L

            val cursor: Cursor? = resolver.query(
                Uri.parse("content://sms/inbox"),
                arrayOf("_id", "address", "body", "date"),
                null,
                null,
                "date DESC"
            )

            val resultList = Arguments.createArray()

            if (cursor != null && cursor.moveToFirst()) {
                val addressIndex = cursor.getColumnIndex("address")
                val bodyIndex = cursor.getColumnIndex("body")
                val dateIndex = cursor.getColumnIndex("date")

                var count = 0
                do {
                    val date = cursor.getLong(dateIndex)

                    // Stop if we reach messages older than minDate (since query is ordered by date DESC)
                    if (minDate > 0 && date < minDate) {
                        break
                    }

                    val address = cursor.getString(addressIndex) ?: ""
                    val body = cursor.getString(bodyIndex) ?: ""

                    val smsMap = Arguments.createMap().apply {
                        putString("address", address)
                        putString("body", body)
                        putDouble("date", date.toDouble())
                    }
                    resultList.pushMap(smsMap)
                    count++
                } while (cursor.moveToNext() && count < limit)
                cursor.close()
            }

            promise.resolve(resultList)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", "Failed to read SMS messages: ${e.message}", e)
        }
    }

    /**
     * Messages saved by the broadcast receiver while JS wasn't running.
     * JS drains these on launch / manual sync (duplicates are skipped by id).
     */
    @ReactMethod
    fun getPendingSms(promise: Promise) {
        try {
            val raw = prefs(reactContext).getString(PENDING_KEY, null)
            val result = Arguments.createArray()
            if (!raw.isNullOrEmpty()) {
                val json = JSONArray(raw)
                for (i in 0 until json.length()) {
                    val obj = json.optJSONObject(i) ?: continue
                    result.pushMap(Arguments.createMap().apply {
                        putString("address", obj.optString("address", ""))
                        putString("body", obj.optString("body", ""))
                        putDouble("date", obj.optDouble("date", 0.0))
                    })
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("SMS_QUEUE_READ_ERROR", "Failed to read queued messages: ${e.message}", e)
        }
    }

    @ReactMethod
    fun clearPendingSms(promise: Promise) {
        try {
            prefs(reactContext).edit().remove(PENDING_KEY).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SMS_QUEUE_CLEAR_ERROR", "Failed to clear queued messages: ${e.message}", e)
        }
    }

    companion object {
        private const val PREFS_NAME = "expense_tracker_sms"
        private const val PENDING_KEY = "pending_sms"
        private const val MAX_PENDING = 200

        @Volatile
        var currentReactContext: ReactApplicationContext? = null

        @Volatile
        private var instance: SmsModule? = null

        fun getInstance(context: ReactApplicationContext): SmsModule {
            return instance ?: synchronized(this) {
                instance ?: SmsModule(context).also { instance = it }
            }
        }

        private fun prefs(context: Context): SharedPreferences =
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        /** True when a JS instance is attached and can receive events right now. */
        fun isJsActive(): Boolean {
            val ctx = currentReactContext ?: return false
            return try {
                ctx.hasActiveReactInstance()
            } catch (e: Exception) {
                false
            }
        }

        fun sendEvent(reactContext: ReactApplicationContext, eventName: String, params: WritableMap?) {
            try {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, params)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        /**
         * Persist a received message. Always called by the receiver so a message is
         * never lost when the app process is dead; JS de-duplicates on import.
         * Keeps the newest [MAX_PENDING] entries.
         */
        fun enqueuePending(context: Context, address: String, body: String, date: Long) {
            try {
                val store = prefs(context)
                val raw = store.getString(PENDING_KEY, null)
                val json = if (raw.isNullOrEmpty()) JSONArray() else JSONArray(raw)

                val obj = JSONObject().apply {
                    put("address", address)
                    put("body", body)
                    put("date", date)
                }

                val next = JSONArray()
                val startIndex = if (json.length() >= MAX_PENDING) json.length() - MAX_PENDING + 1 else 0
                for (i in startIndex until json.length()) {
                    val existing = json.optJSONObject(i) ?: continue
                    next.put(existing)
                }
                next.put(obj)

                store.edit().putString(PENDING_KEY, next.toString()).apply()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
