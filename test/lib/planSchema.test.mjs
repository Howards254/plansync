import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validate } = require('../../src/lib/planSchema');

const validPlan = {
  title: 'My Project',
  description: 'A description',
  tasks: [
    { id: 'T001', title: 'Setup', description: 'Initial setup', scope: ['src/**/*.js'], dependencies: [], acceptanceCriteria: ['Everything compiles'], status: 'ready' },
    { id: 'T002', title: 'Feature', description: 'Main feature', scope: ['src/feature/**'], dependencies: ['T001'], acceptanceCriteria: ['Works'], status: 'ready' },
  ],
};

describe('planSchema', () => {
  it('accepts a valid plan', () => {
    const result = validate(validPlan);
    expect(result.title).toBe('My Project');
    expect(result.tasks).toHaveLength(2);
  });

  it('rejects a plan with no title', () => {
    expect(() => validate({ ...validPlan, title: '' })).toThrow('Plan validation failed');
  });

  it('rejects a plan with no tasks', () => {
    expect(() => validate({ ...validPlan, tasks: [] })).toThrow('Plan validation failed');
  });

  it('rejects a task with invalid ID format', () => {
    expect(() => validate({ ...validPlan, tasks: [{ ...validPlan.tasks[0], id: 'invalid' }] })).toThrow();
  });

  it('rejects a task with empty scope', () => {
    expect(() => validate({ ...validPlan, tasks: [{ ...validPlan.tasks[0], scope: [] }] })).toThrow();
  });

  it('rejects broken dependency reference', () => {
    expect(() => validate({ ...validPlan, tasks: [{ ...validPlan.tasks[0], dependencies: ['T999'] }] })).toThrow('depends on T999');
  });

  it('sets default status to ready', () => {
    const plan = JSON.parse(JSON.stringify(validPlan));
    delete plan.tasks[0].status;
    const result = validate(plan);
    expect(result.tasks[0].status).toBe('ready');
  });
});
