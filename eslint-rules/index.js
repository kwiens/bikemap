/**
 * Custom ESLint plugin for project-specific rules
 */

const noConfigEnvInSentryEdge = require('./no-config-env-in-sentry-edge');

module.exports = {
  rules: {
    'no-config-env-in-sentry-edge': noConfigEnvInSentryEdge,
  },
  configs: {
    recommended: {
      plugins: ['bikemap'],
      rules: {
        'bikemap/no-config-env-in-sentry-edge': 'error',
      },
    },
  },
};
