# 💰 Expense Tracker — Smart SMS-Based Finance Manager

A **React Native** Android app that automatically tracks your income and expenses by reading SMS messages from Ethiopian banks (CBE Birr, Telebirr, and others). No manual data entry needed — just install, grant SMS permission, and your transactions appear automatically.

---

## ✨ Features

- 📩 **Automatic SMS Parsing** — Reads bank SMS notifications from CBE Birr, Telebirr, and other Ethiopian banks in both English and Amharic. Numbers followed by a data/time unit (`1024 MB`, `2 GB`, `100 minutes`) are never mistaken for money, and amounts spelled out as words (`one hundred fifty Birr`) are understood
- 🔄 **No manual syncing** — New bank messages are imported the moment they arrive. Messages received while the app was closed are queued natively and imported on next launch / foreground, so the inbox sync is just a safety net.
- 📊 **Dashboard** — Spend-first summary with a 7-day trend, income and left-over, plus per-account balances. Each balance is read only from the latest message that carried a balance **for that same account**, so a newer message from another bank (or another CBE account) can never overwrite it
- 🏦 **Correct bank attribution** — a message is assigned to a bank by its sender ID, then by the bank branding in the message body. Telebirr is not guessable from short code `127` (that code is Telebirr's, not CBE's), and an unidentifiable alert shows no balance card rather than a balance belonging to someone else
- 🗂️ **Transaction History** — Full list of all detected transactions with filtering and search
- 🏷️ **Auto-Categorization** — Automatically classifies transactions (Food & Dining, Transportation, Shopping, Salary, UPI Transfers, etc.)
- ⭐ **Frequent Accounts** — Detects the accounts, phone numbers and payees you transact with most; one tap turns one into a rule that re-categorizes past and future transactions
- 🧩 **Smart Rules** — Rules match against the full SMS body *and* the parsed description, so rules for phone numbers and account numbers actually apply
- ✅ **Label sheet** — When the app opens and SMS import produced new transactions, a bottom sheet (75% of the screen, dashboard still visible behind it) asks about just the newest two so nothing sits uncategorized. The rest wait in the Ledger banner. Fixing one learns a rule for that account
- 🔁 **SMS Simulator** — Test SMS parsing (with your rules applied) without a real bank message
- 💾 **Local Storage** — All data stored securely on-device using AsyncStorage (no cloud, no account needed)
- 🎨 **Themes** — Light / Dark / Auto with six accent colours, persisted on device. Accents ship as three tokens each (bright for icons, deep for fills, soft for highlights) so white-on-accent text always clears WCAG AA
- 📊 **Charts** — Category, merchant and month-over-month visuals powered by `react-native-chart-kit` + `react-native-svg`

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
│   │   ├── DashboardScreen.tsx      # Home screen with spend summary & trend
│   │   ├── TransactionsScreen.tsx   # Full transaction list & filters
│   │   ├── InsightsScreen.tsx       # Category & month-over-month analytics
│   │   └── SimulatorScreen.tsx      # Settings: rules, frequent accounts, SMS simulator
│   ├── components/
│   │   ├── AddTransactionModal.tsx  # Manual entry (amount keypad → details)
│   │   ├── ReviewQueueModal.tsx     # Bottom sheet: one-tap confirm / fix for new SMS transactions
│   │   └── AmountKeypad.tsx         # Custom numeric keypad
│   ├── parser/
│   │   └── index.ts                 # SMS parsing, rule engine & frequent-account detection
│   ├── deviceSms.ts                 # Native SMS reading bridge, live listener & queue drain
│   ├── storage.ts                   # AsyncStorage CRUD operations
│   ├── theme.ts                     # Palettes, accents & design tokens (buildTheme)
│   └── themeContext.tsx             # ThemeProvider, useTheme, useThemedStyles (persisted)
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
