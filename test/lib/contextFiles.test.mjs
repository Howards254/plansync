import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { generateAll, generateContextFile, BUILT_IN_TEMPLATES } = require('../../src/lib/contextFiles');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testRoot = path.resolve(__dirname, '..', '..');

const plan = {
  title: 'Test Project',
  description: 'A test project',
  tasks: [
    { id: 'T001', title: 'Auth Module', description: 'Build authentication', scope: ['src/auth/**'], dependencies: [], acceptanceCriteria: ['User can log in', 'Tokens are valid'] },
    { id: 'T002', title: 'Payment Module', description: 'Build payments', scope: ['src/payments/**'], dependencies: ['T001'], acceptanceCriteria: ['Can process payment'] },
  ],
};

describe('contextFiles', () => {
  describe('generateAll', () => {
    it('generates all built-in context files', () => {
      const files = generateAll(testRoot, plan, plan.tasks[0]);
      const expected = ['AGENTS.md', 'CLAUDE.md', '.cursorrules', '.github/copilot-instructions.md', '.windsurfrules', 'GEMINI.md', '.continue/rules/00-plansync.md'];
      expect(Object.keys(files).sort()).toEqual(expected.sort());
    });

    it('includes task title in each file', () => {
      const files = generateAll(testRoot, plan, plan.tasks[0]);
      for (const content of Object.values(files)) {
        expect(content).toContain('Auth Module');
      }
    });

    it('includes scope globs', () => {
      const files = generateAll(testRoot, plan, plan.tasks[0]);
      for (const content of Object.values(files)) {
        expect(content).toContain('src/auth/**');
      }
    });

    it('renders dependencies for dependent tasks', () => {
      const files = generateAll(testRoot, plan, plan.tasks[1]);
      for (const content of Object.values(files)) {
        expect(content).toContain('T001: Auth Module');
      }
    });
  });
});
