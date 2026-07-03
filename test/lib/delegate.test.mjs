import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Extract reassignment parsing logic from delegate.js for unit testing
// We test the parseReassignment function's behavior in isolation

const plan = {
  title: 'Test',
  description: 'Test project',
  tasks: [
    { id: 'T001', title: 'Auth', description: 'Auth system', scope: ['src/auth/**'], dependencies: [], acceptanceCriteria: ['AC1'], assignedTo: '', status: 'ready' },
    { id: 'T002', title: 'Payments', description: 'Payment system', scope: ['src/payments/**'], dependencies: [], acceptanceCriteria: ['AC2'], assignedTo: '', status: 'ready' },
    { id: 'T003', title: 'UI', description: 'User interface', scope: ['src/ui/**'], dependencies: ['T001'], acceptanceCriteria: ['AC3'], assignedTo: '', status: 'ready' },
  ],
};

const collaborators = [
  { login: 'alice', permissions: { push: true } },
  { login: 'bob', permissions: { push: true } },
];

function parseReassignment(input, collabs, assignments) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';

  const singleMatch = input.match(/^(\d+)=([a-z])$/);
  if (singleMatch) {
    const taskIdx = parseInt(singleMatch[1]) - 1;
    const collabIdx = letters.indexOf(singleMatch[2]);
    if (taskIdx < 0 || taskIdx >= plan.tasks.length) return false;
    if (collabIdx < 0 || !collabs || collabIdx >= collabs.length) return false;
    assignments[plan.tasks[taskIdx].id] = collabs[collabIdx].login;
    return true;
  }

  const bulkMatch = input.match(/^(\d+(?:,\d+)*)=([a-z])$/);
  if (bulkMatch) {
    const taskNums = bulkMatch[1].split(',').map(n => parseInt(n.trim()) - 1);
    const collabIdx = letters.indexOf(bulkMatch[2]);
    if (taskNums.some(n => n < 0 || n >= plan.tasks.length)) return false;
    if (collabIdx < 0 || !collabs || collabIdx >= collabs.length) return false;
    for (const n of taskNums) {
      assignments[plan.tasks[n].id] = collabs[collabIdx].login;
    }
    return true;
  }

  const allMatch = input.match(/^all=([a-z])$/);
  if (allMatch) {
    const collabIdx = letters.indexOf(allMatch[1]);
    if (collabIdx < 0 || !collabs || collabIdx >= collabs.length) return false;
    for (const task of plan.tasks) {
      assignments[task.id] = collabs[collabIdx].login;
    }
    return true;
  }

  return false;
}

describe('delegate reassignment parsing', () => {
  it('parses single reassignment: "1=b"', () => {
    const a = {};
    const r = parseReassignment('1=b', collaborators, a);
    expect(r).toBe(true);
    expect(a.T001).toBe('bob');
    expect(a.T002).toBeUndefined();
  });

  it('parses bulk reassignment: "1,3=a"', () => {
    const a = {};
    const r = parseReassignment('1,3=a', collaborators, a);
    expect(r).toBe(true);
    expect(a.T001).toBe('alice');
    expect(a.T003).toBe('alice');
    expect(a.T002).toBeUndefined();
  });

  it('parses "all=b"', () => {
    const a = {};
    const r = parseReassignment('all=b', collaborators, a);
    expect(r).toBe(true);
    expect(a.T001).toBe('bob');
    expect(a.T002).toBe('bob');
    expect(a.T003).toBe('bob');
  });

  it('rejects invalid task number', () => {
    const a = {};
    const r = parseReassignment('5=a', collaborators, a);
    expect(r).toBe(false);
    expect(Object.keys(a).length).toBe(0);
  });

  it('rejects invalid collaborator letter', () => {
    const a = {};
    const r = parseReassignment('1=z', collaborators, a);
    expect(r).toBe(false);
    expect(Object.keys(a).length).toBe(0);
  });

  it('rejects malformed input', () => {
    const a = {};
    const r = parseReassignment('something random', collaborators, a);
    expect(r).toBe(false);
    expect(Object.keys(a).length).toBe(0);
  });

  it('rejects empty input', () => {
    const a = {};
    const r = parseReassignment('', collaborators, a);
    expect(r).toBe(false);
  });
});
