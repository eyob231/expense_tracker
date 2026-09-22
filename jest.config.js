module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(postprocessing|@react-native|react-native|react-native-vector-icons|react-native-chart-kit|react-native-svg|@react-navigation|@react-native-async-storage)/)',
  ],
};
