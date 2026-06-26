const z = require('zod');

const TaskSchema = z.object({
  id: z.string().regex(/^T\d+$/, 'Task ID must match T001, T002, etc.'),
  title: z.string().min(1, 'Task title is required'),
  description: z.string().min(1, 'Task description is required'),
  scope: z.array(z.string()).min(1, 'At least one scope glob is required'),
  dependencies: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1, 'At least one acceptance criterion is required'),
  assignedTo: z.string().optional(),
  status: z.enum(['ready', 'in_progress', 'blocked', 'done']).default('ready'),
});

const PlanSchema = z.object({
  title: z.string().min(1, 'Project title is required'),
  description: z.string().min(1, 'Project description is required'),
  tasks: z.array(TaskSchema).min(1, 'At least one task is required'),
});

function validate(data) {
  const result = PlanSchema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map(i =>
      `${i.path.join('.')}: ${i.message}`
    );
    throw new Error(`Plan validation failed:\n  ${errors.join('\n  ')}`);
  }

  // Validate dependency references
  const taskIds = new Set(result.data.tasks.map(t => t.id));
  for (const task of result.data.tasks) {
    for (const dep of task.dependencies) {
      if (!taskIds.has(dep)) {
        throw new Error(`Task ${task.id} depends on ${dep} which does not exist`);
      }
    }
  }

  return result.data;
}

module.exports = { PlanSchema, TaskSchema, validate };
