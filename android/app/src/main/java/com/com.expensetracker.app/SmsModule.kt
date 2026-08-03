package com.expensetracker.app

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

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

    companion object {
        @Volatile
        var currentReactContext: ReactApplicationContext? = null

        @Volatile
        private var instance: SmsModule? = null

        fun getInstance(context: ReactApplicationContext): SmsModule {
            return instance ?: synchronized(this) {
                instance ?: SmsModule(context).also { instance = it }
            }
        }

        fun sendEvent(reactContext: ReactApplicationContext, eventName: String, params: WritableMap?) {
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, params)
            }
        }
    }
}
