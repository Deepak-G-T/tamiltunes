// Owner check: sends ONE test error to Sentry so you can see it arrive.  SENTRY_DSN=... node scripts/monitoring-check.mjs
import * as Sentry from '@sentry/node';
import { initMonitoring, monitoringEnabled, reportError } from '../src/monitoring.js';

if (!process.env.SENTRY_DSN) {
  console.log('SENTRY_DSN is not set: nothing sent. Set it (the value is secret, do not paste it anywhere) and run this again.');
  process.exit(1);
}
initMonitoring();
console.log(`monitoring on: ${monitoringEnabled()}`);
reportError(new Error('TamilTunes monitoring test (backend). Safe to ignore: sent by monitoring-check.mjs'), { route: '/monitoring-check', method: 'CLI', status: '500' });
await Sentry.flush(5000);
console.log('sent. Look for "TamilTunes monitoring test (backend)" in Sentry within a minute.');
process.exit(0);
