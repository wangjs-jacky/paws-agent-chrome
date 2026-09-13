import { resolve } from 'node:path';
import { startE2eFixtureServer } from '../test/e2eFixtureServer.mjs';
const fixture = await startE2eFixtureServer(resolve('dist'), { syntheticLinkedAccount: true });
process.stdout.write(`SIMULATED local runtime (not installed MV3): ${fixture.origin}\n`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await fixture.close(); process.exit(0); });
