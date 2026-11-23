import { runBackend, seedBackend } from '../../src/tests/utils';

/** Fresh English demo data with photos, without the demo banner. */
export default async function setup() {
  runBackend('seed.removeAllData');
  console.log(seedBackend('--locale', 'en'));
  runBackend('featureFlags.set', { key: 'is_demo_mode', value: false });
  runBackend('featureFlags.set', { key: 'is_e2e_auth_skip_email', value: true });
}
