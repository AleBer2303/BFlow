/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'BFlowWidgets',
  displayName: 'BFlow',
  bundleIdentifier: '.widgets',
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': ['group.com.bflow.app'],
  },
  colors: {
    widgetAccent: '#0A84FF',
    widgetSuccess: '#30D158',
    widgetWarning: '#FF9F0A',
    widgetDanger: '#FF453A',
  },
};
