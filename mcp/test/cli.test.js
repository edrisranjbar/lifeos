import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const execFileAsync = promisify(execFile);
const indexPath = fileURLToPath(new URL('../src/index.js', import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('--version and -v print version from package.json and exit 0 without environment variables', async () => {
  for (const flag of ['--version', '-v']) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [indexPath, flag], {
      env: {}
    });
    assert.equal(stdout.trim(), packageJson.version);
    assert.equal(stderr, '');
  }
});

test('--help and -h print usage with environment variables and exit 0 without environment variables', async () => {
  for (const flag of ['--help', '-h']) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [indexPath, flag], {
      env: {}
    });
    assert.match(stdout, /Usage:/);
    assert.match(stdout, /--version/);
    assert.match(stdout, /--help/);
    assert.match(stdout, /LIFEOS_BASE_URL/);
    assert.match(stdout, /LIFEOS_API_TOKEN/);
    assert.match(stdout, /LIFEOS_MCP_TIMEOUT_MS/);
    assert.equal(stderr, '');
  }
});
