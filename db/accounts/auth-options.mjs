import { admin } from 'better-auth/plugins/admin';
import { username } from 'better-auth/plugins/username';

export function authOptions(config) {
  return {
    appName: 'Portfolio Local Accounts',
    baseURL: config.origin,
    secret: config.secret,
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 86400, updateAge: 3600, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, window: 60, max: 60, customRules: { '/sign-in/username': { window: 60, max: 10 } } },
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: config.isTest ? 'portfolio-local-test' : 'portfolio-local',
      useSecureCookies: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: [] },
    },
    user: { additionalFields: { provisioningId: { type: 'string', required: false, input: false, returned: false } } },
    plugins: [username({ minUsernameLength: 3, maxUsernameLength: 30, usernameNormalization: value => value.toLowerCase(), usernameValidator: value => /^[a-z][a-z0-9_-]{2,29}$/i.test(value) }), admin({ defaultRole: 'user' })],
    logger: { disabled: true },
  };
}
