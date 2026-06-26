import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateAll, generateContextFile, TEMPLATES } = require('../../src/lib/contextFiles');

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
    it('generates all 4 context files', () => {
      const files = generateAll(plan, plan.tasks[0]);
      expect(Object.keys(files)).toEqual(['CLAUDE.md', '.cursorrules', 'copilot-instructions.md', 'AGENTS.md']);
    });

    it('includes task title in each file', () => {
      const files = generateAll(plan, plan.tasks[0]);
      for (const content of Object.values(files)) {
        expect(content).toContain('Auth Module');
      }
    });

    it('includes scope globs', () => {
      const files = generateAll(plan, plan.tasks[0]);
      for (const content of Object.values(files)) {
        expect(content).toContain('src/auth/**');
      }
    });

    it('renders dependencies for dependent tasks', () => {
      const files = generateAll(plan, plan.tasks[1]);
      for (const content of Object.values(files)) {
        expect(content).toContain('T001: Auth Module');
      }
    });
  });
});
