package com.expensetracker.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsMessage
import com.facebook.react.bridge.Arguments

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.provider.Telephony.SMS_RECEIVED") return

        val bundle = intent.extras ?: return
        try {
            @Suppress("UNCHECKED_CAST")
            val pdus = bundle.get("pdus") as? Array<*> ?: return
            val format = bundle.getString("format")

            var fullMessage = ""
            var senderAddress = ""
            var date = 0L

            for (i in pdus.indices) {
                val smsMessage = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    SmsMessage.createFromPdu(pdus[i] as ByteArray, format)
                } else {
                    @Suppress("DEPRECATION")
                    SmsMessage.createFromPdu(pdus[i] as ByteArray)
                }

                if (senderAddress.isEmpty()) {
                    senderAddress = smsMessage.originatingAddress ?: ""
                    date = smsMessage.timestampMillis
                }
                fullMessage += smsMessage.messageBody ?: ""
            }

            if (senderAddress.isNotEmpty() && fullMessage.isNotEmpty()) {
                // Always queue the message first: if the app process is dead or the
                // JS runtime is detached, nothing else would keep this message.
                SmsModule.enqueuePending(context, senderAddress, fullMessage, date)

                val reactContext = SmsModule.currentReactContext
                if (reactContext != null && SmsModule.isJsActive()) {
                    val params = Arguments.createMap().apply {
                        putString("address", senderAddress)
                        putString("body", fullMessage)
                        putDouble("date", date.toDouble())
                    }
                    SmsModule.sendEvent(reactContext, "onSmsReceived", params)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
