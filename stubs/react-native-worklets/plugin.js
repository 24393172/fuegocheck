// Stub Babel plugin — does nothing.
// react-native-css-interop/babel.js adds "react-native-worklets/plugin" as a
// string plugin unconditionally. This stub satisfies the require() so Metro
// can bundle the app without the real worklets runtime being installed.
module.exports = function () {
  return { visitor: {} };
};
