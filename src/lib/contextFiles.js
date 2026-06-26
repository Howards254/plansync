const path = require('path');
const fs = require('fs');

const TEMPLATES = {
  'CLAUDE.md': path.join(__dirname, '..', 'templates', 'context', 'CLAUDE.md.tmpl'),
  '.cursorrules': path.join(__dirname, '..', 'templates', 'context', 'cursorrules.tmpl'),
  'copilot-instructions.md': path.join(__dirname, '..', 'templates', 'context', 'copilot-instructions.md.tmpl'),
  'AGENTS.md': path.join(__dirname, '..', 'templates', 'context', 'AGENTS.md.tmpl'),
};

function render(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(placeholder, value);
  }
  return result;
}

function formatList(items, prefix = '  - ') {
  if (!items || items.length === 0) return `${prefix}(none)`;
  return items.map(i => `${prefix}${i}`).join('\n');
}

function resolveDependencyNames(task, tasks) {
  if (!task.dependencies || task.dependencies.length === 0) return [];
  return task.dependencies.map(depId => {
    const dep = tasks.find(t => t.id === depId);
    return dep ? `${dep.id}: ${dep.title}` : depId;
  });
}

function generateContextFile(templatePath, plan, task) {
  const templateText = fs.readFileSync(templatePath, 'utf-8');
  const dependencyNames = resolveDependencyNames(task, plan.tasks);

  const vars = {
    projectTitle: plan.title,
    projectDescription: plan.description,
    taskId: task.id,
    taskTitle: task.title,
    taskDescription: task.description,
    scopeList: formatList(task.scope),
    acceptanceList: formatList(task.acceptanceCriteria),
    dependencyList: dependencyNames.length > 0
      ? formatList(dependencyNames)
      : '  (none — this task has no dependencies)',
  };

  return render(templateText, vars);
}

function generateAll(plan, task) {
  const files = {};
  for (const [filename, templatePath] of Object.entries(TEMPLATES)) {
    files[filename] = generateContextFile(templatePath, plan, task);
  }
  return files;
}

function writeAll(root, plan, task) {
  const files = generateAll(plan, task);
  const written = [];
  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(root, filename);
    fs.writeFileSync(filePath, content);
    written.push(filePath);
  }
  return written;
}

module.exports = { generateAll, writeAll, generateContextFile, TEMPLATES };
