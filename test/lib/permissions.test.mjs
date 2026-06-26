import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const path = require('path');
const fs = require('fs');
const os = require('os');
const { applyScope, clearScope } = require('../../src/lib/permissions');

const testPlan = {
  title: 'Test',
  description: 'Test',
  tasks: [
    { id: 'T001', title: 'Auth', description: 'Auth module', scope: ['src/auth/**'], dependencies: [], acceptanceCriteria: ['Works'], status: 'ready', assignedTo: 'dev1' },
    { id: 'T002', title: 'Pay', description: 'Payment module', scope: ['src/payments/**'], dependencies: [], acceptanceCriteria: ['Works'], status: 'ready', assignedTo: 'dev2' },
  ],
};

describe('permissions', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plansync-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src', 'auth'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'payments'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.js'), '// login');
    fs.writeFileSync(path.join(tmpDir, 'src', 'payments', 'charge.js'), '// charge');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# readme');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies writable to files in scope', () => {
    applyScope(tmpDir, 'dev1', testPlan);
    const mode = fs.statSync(path.join(tmpDir, 'src', 'auth', 'login.js')).mode;
    expect(mode & 0o200).toBeTruthy();
  });

  it('applies read-only to files out of scope', () => {
    applyScope(tmpDir, 'dev1', testPlan);
    const mode = fs.statSync(path.join(tmpDir, 'src', 'payments', 'charge.js')).mode;
    expect(mode & 0o200).toBeFalsy();
  });

  it('root files are read-only if not in scope', () => {
    applyScope(tmpDir, 'dev2', testPlan);
    const mode = fs.statSync(path.join(tmpDir, 'README.md')).mode;
    expect(mode & 0o200).toBeFalsy();
  });

  it('clearScope resets all files to writable', () => {
    applyScope(tmpDir, 'dev1', testPlan);
    clearScope(tmpDir);
    for (const f of ['src/auth/login.js', 'src/payments/charge.js', 'README.md']) {
      const mode = fs.statSync(path.join(tmpDir, f)).mode;
      expect(mode & 0o200).toBeTruthy();
    }
  });

  it('returns correct counts from applyScope', () => {
    const result = applyScope(tmpDir, 'dev1', testPlan);
    expect(result.writable).toBe(1);
    expect(result.readonly).toBe(2);
    expect(result.total).toBe(3);
  });
});
