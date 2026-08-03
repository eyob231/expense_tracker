module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(postprocessing|@react-native|react-native|@react-navigation|@react-native-async-storage)/)',
  ],
};
