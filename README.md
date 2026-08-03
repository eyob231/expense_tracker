# 💰 Expense Tracker — Smart SMS-Based Finance Manager

A **React Native** Android app that automatically tracks your income and expenses by reading SMS messages from Ethiopian banks (CBE Birr, Telebirr, and others). No manual data entry needed — just install, grant SMS permission, and your transactions appear automatically.

---

## ✨ Features

- 📩 **Automatic SMS Parsing** — Reads bank SMS notifications from CBE Birr, Telebirr, and other Ethiopian banks in both English and Amharic
- 📊 **Dashboard** — Visual summary of income vs. expenses with charts and balance overview
- 🗂️ **Transaction History** — Full list of all detected transactions with filtering and search
- 🏷️ **Auto-Categorization** — Automatically classifies transactions (Food & Dining, Transportation, Shopping, Salary, UPI Transfers, etc.)
- 🔁 **SMS Simulator** — Test SMS parsing without a real bank message
- 💾 **Local Storage** — All data stored securely on-device using AsyncStorage (no cloud, no account needed)
- 🎨 **Modern UI** — Clean dark-themed interface with charts powered by `react-native-chart-kit`

---

## 📱 Screenshots

> Dashboard · Transactions · Simulator

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.86 |
| Language | TypeScript |
| Navigation | React Navigation (Bottom Tabs + Native Stack) |
| Storage | AsyncStorage |
| Charts | react-native-chart-kit + react-native-svg |
| Icons | react-native-vector-icons |
| Native Module | Kotlin (SmsModule, SmsReceiver) |
| Testing | Jest |
| Min Android | API 24 (Android 7.0) |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.11.0
- [React Native environment](https://reactnative.dev/docs/set-up-your-environment) set up (Android SDK, JDK)
- Android device or emulator

### Installation

```sh
# 1. Clone the repository
git clone <your-repo-url>
cd expense_tracker

# 2. Install dependencies
npm install

# 3. Start Metro bundler
npm start

# 4. Run on Android (in a new terminal)
npm run android
```

### Running Tests

```sh
npm test
```

---

## 📦 Building a Release APK

To build a release APK for sharing:

```sh
cd android
.\gradlew assembleRelease
```

The APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

> **Note:** You need a release keystore configured in `android/app/build.gradle` to sign the APK.

---

## 🏛️ Project Structure

```
expense_tracker/
├── src/
│   ├── screens/
│   │   ├── DashboardScreen.tsx      # Home screen with charts & summary
│   │   ├── TransactionsScreen.tsx   # Full transaction list & filters
│   │   └── SimulatorScreen.tsx      # SMS simulator for testing
│   ├── parser/
│   │   └── index.ts                 # SMS parsing & auto-categorization logic
│   ├── deviceSms.ts                 # Native SMS reading bridge
│   ├── storage.ts                   # AsyncStorage CRUD operations
│   └── theme.ts                     # App color palette & design tokens
├── android/
│   └── app/src/main/java/.../
│       ├── SmsModule.kt             # Native module: reads device SMS
│       ├── SmsReceiver.kt           # BroadcastReceiver: listens for new SMS
│       └── SmsPackage.kt            # React Native package registration
├── __tests__/
│   └── SmsParser.test.ts            # Unit tests for SMS parsing logic
└── App.tsx                          # Root component & navigation setup
```

---

## 🔐 Permissions

The app requests the following Android permissions:

| Permission | Purpose |
|-----------|---------|
| `READ_SMS` | Read existing bank SMS messages on device |
| `RECEIVE_SMS` | Listen for incoming bank SMS notifications |
| `INTERNET` | (Reserved for future cloud sync features) |

> All data stays on your device. No data is sent to any server.

---

## 🧪 Supported Banks & SMS Formats

The SMS parser supports messages from:

- **CBE Birr** (Commercial Bank of Ethiopia)
- **Telebirr** (Ethio Telecom mobile money)
- Other Ethiopian banks with standard credit/debit SMS formats
- Amharic language SMS messages (ቀሪ ሂሳብ, ወደ, ከ, etc.)

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## 📄 License

This project is private and not licensed for public redistribution.
