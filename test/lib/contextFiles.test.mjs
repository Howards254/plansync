import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { generateForUser, BUILT_IN_TEMPLATES } = require('../../src/lib/contextFiles');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testRoot = path.resolve(__dirname, '..', '..');

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plansync-test-'));
  fs.mkdirSync(path.join(dir, '.plansync', 'templates'), { recursive: true });
  return dir;
}

function cleanDir(dir) {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

const plan = {
  title: 'Test Project',
  description: 'A test project',
  tasks: [
    { id: 'T001', title: 'Auth Module', description: 'Build authentication', scope: ['src/auth/**'], dependencies: [], acceptanceCriteria: ['User can log in', 'Tokens are valid'], assignedTo: 'alice', status: 'ready' },
    { id: 'T002', title: 'Payment Module', description: 'Build payments', scope: ['src/payments/**'], dependencies: ['T001'], acceptanceCriteria: ['Can process payment'], assignedTo: 'bob', status: 'ready' },
  ],
};

describe('contextFiles', () => {
  describe('generateForUser', () => {
    it('generates context files for a user with assigned tasks', () => {
      const dir = tempDir();
      try {
        const files = generateForUser(dir, plan, 'alice');
        expect(Object.keys(files).length).toBeGreaterThanOrEqual(7);
        const agentsPath = result => result;
        // Check content in AGENTS.md
        const agentsContent = fs.readFileSync(files['AGENTS.md'], 'utf-8');
        expect(agentsContent).toContain('alice');
        expect(agentsContent).toContain('Auth Module');
        expect(agentsContent).toContain('src/auth/**');
        expect(agentsContent).toContain('User can log in');
        // Should NOT contain other user's tasks
        expect(agentsContent).not.toContain('Payment Module');
      } finally {
        cleanDir(dir);
      }
    });

    it('returns empty object for user with no assigned tasks', () => {
      const dir = tempDir();
      try {
        const files = generateForUser(dir, plan, 'charlie');
        expect(files).toEqual({});
      } finally {
        cleanDir(dir);
      }
    });

    it('creates files in .plansync/context/<username>/', () => {
      const dir = tempDir();
      try {
        const files = generateForUser(dir, plan, 'bob');
        for (const filepath of Object.values(files)) {
          expect(filepath).toContain('.plansync/context/bob/');
          expect(fs.existsSync(filepath)).toBe(true);
        }
      } finally {
        cleanDir(dir);
      }
    });

    it('wraps content in plansync markers', () => {
      const dir = tempDir();
      try {
        const files = generateForUser(dir, plan, 'alice');
        const content = fs.readFileSync(files['AGENTS.md'], 'utf-8');
        expect(content).toContain('<!-- plansync -->');
        expect(content).toContain('<!-- end-plansync -->');
      } finally {
        cleanDir(dir);
      }
    });

    it('handles user with multiple tasks', () => {
      const multiPlan = {
        title: 'Multi Test',
        description: 'Multiple tasks for one user',
        tasks: [
          { id: 'T001', title: 'Task One', description: 'First task', scope: ['src/one/**'], dependencies: [], acceptanceCriteria: ['Done 1'], assignedTo: 'alice', status: 'ready' },
          { id: 'T002', title: 'Task Two', description: 'Second task', scope: ['src/two/**'], dependencies: ['T001'], acceptanceCriteria: ['Done 2'], assignedTo: 'alice', status: 'ready' },
          { id: 'T003', title: 'Task Three', description: 'Third task', scope: ['src/three/**'], dependencies: [], acceptanceCriteria: ['Done 3'], assignedTo: 'bob', status: 'ready' },
        ],
      };
      const dir = tempDir();
      try {
        const files = generateForUser(dir, multiPlan, 'alice');
        const content = fs.readFileSync(files['AGENTS.md'], 'utf-8');
        expect(content).toContain('Task One');
        expect(content).toContain('Task Two');
        expect(content).not.toContain('Task Three');
        expect(content).toContain('2 total');
      } finally {
        cleanDir(dir);
      }
    });

    it('generates all built-in template files', () => {
      const dir = tempDir();
      try {
        const files = generateForUser(dir, plan, 'alice');
        const expected = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md', '.windsurfrules', 'GEMINI.md', '.continue/rules/00-plansync.md'];
        expect(Object.keys(files).sort()).toEqual(expected.sort());
      } finally {
        cleanDir(dir);
      }
    });
  });
});
