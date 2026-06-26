import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { checkScope, taskMatchesFile, findOwningTasks } = require('../../src/lib/scopeCheck');

const tasks = [
  { id: 'T001', scope: ['src/auth/**', 'tests/auth/**'] },
  { id: 'T002', scope: ['src/payments/**', 'tests/payments/**'] },
  { id: 'T003', scope: ['src/**/*.js'], dependencies: ['T001'] },
];

describe('scopeCheck', () => {
  describe('checkScope', () => {
    it('returns in-scope and out-of-scope files', () => {
      const result = checkScope(
        ['src/auth/login.js', 'src/payments/charge.js', 'README.md'],
        ['src/auth/**']
      );
      expect(result.inScope).toEqual(['src/auth/login.js']);
      expect(result.outOfScope).toEqual(['src/payments/charge.js', 'README.md']);
    });

    it('handles multiple glob patterns', () => {
      const result = checkScope(
        ['src/auth/login.js', 'tests/auth/login.test.js'],
        ['src/auth/**', 'tests/auth/**']
      );
      expect(result.inScope).toHaveLength(2);
      expect(result.outOfScope).toHaveLength(0);
    });

    it('handles nested directories with ** glob', () => {
      const result = checkScope(['src/auth/deep/nested/file.js'], ['src/auth/**']);
      expect(result.inScope).toHaveLength(1);
    });

    it('handles empty changed files list', () => {
      const result = checkScope([], ['src/**']);
      expect(result.inScope).toEqual([]);
      expect(result.outOfScope).toEqual([]);
    });

    it('handles empty scope globs', () => {
      const result = checkScope(['src/auth/login.js'], []);
      expect(result.inScope).toEqual([]);
      expect(result.outOfScope).toEqual(['src/auth/login.js']);
    });
  });

  describe('taskMatchesFile', () => {
    it('returns true when file matches task scope', () => {
      expect(taskMatchesFile('T001', 'src/auth/login.js', tasks)).toBe(true);
    });

    it('returns false when file does not match task scope', () => {
      expect(taskMatchesFile('T001', 'src/payments/charge.js', tasks)).toBe(false);
    });

    it('returns false for unknown task ID', () => {
      expect(taskMatchesFile('T999', 'src/auth/login.js', tasks)).toBe(false);
    });
  });

  describe('findOwningTasks', () => {
    it('finds all tasks whose scope includes a file', () => {
      const owners = findOwningTasks('src/auth/login.js', tasks);
      expect(owners).toContain('T001');
      expect(owners).toContain('T003');
    });

    it('returns empty array for unmatched file', () => {
      const owners = findOwningTasks('README.md', tasks);
      expect(owners).toEqual([]);
    });
  });
});
