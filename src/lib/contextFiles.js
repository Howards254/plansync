const path = require('path');
const fs = require('fs');

const BUILT_IN_TEMPLATES = {
  'AGENTS.md': path.join(__dirname, '..', 'templates', 'context', 'AGENTS.md.tmpl'),
  'CLAUDE.md': path.join(__dirname, '..', 'templates', 'context', 'CLAUDE.md.tmpl'),
  '.cursorrules': path.join(__dirname, '..', 'templates', 'context', 'cursorrules.tmpl'),
  '.github/copilot-instructions.md': path.join(__dirname, '..', 'templates', 'context', 'copilot-instructions.md.tmpl'),
  '.windsurfrules': path.join(__dirname, '..', 'templates', 'context', 'windsurfrules.tmpl'),
  'GEMINI.md': path.join(__dirname, '..', 'templates', 'context', 'GEMINI.md.tmpl'),
  '.continue/rules/00-plansync.md': path.join(__dirname, '..', 'templates', 'context', 'continue-rules.md.tmpl'),
};

function discoverUserTemplates(root) {
  const userDir = path.join(root, '.plansync', 'templates');
  if (!fs.existsSync(userDir)) return {};
  const files = fs.readdirSync(userDir).filter(f => f.endsWith('.tmpl'));
  const templates = {};
  for (const f of files) {
    const outputName = f.replace(/\.tmpl$/, '');
    templates[outputName] = path.join(userDir, f);
  }
  return templates;
}

function getAllTemplates(root) {
  return { ...BUILT_IN_TEMPLATES, ...discoverUserTemplates(root) };
}

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

function buildUserTaskList(plan, username) {
  const userTasks = plan.tasks.filter(t => t.assignedTo === username);
  if (userTasks.length === 0) return '  (no tasks assigned)';

  return userTasks.map(task => {
    const depNames = resolveDependencyNames(task, plan.tasks);
    const depStr = depNames.length > 0
      ? formatList(depNames)
      : '  (none — this task has no dependencies)';

    return [
      `### ${task.id}: ${task.title}`,
      `${task.description}`,
      '',
      `**Scope:** ${(task.scope || []).join(', ')}`,
      '',
      '**Acceptance Criteria:**',
      `${formatList(task.acceptanceCriteria)}`,
      '',
      '**Dependencies:**',
      `${depStr}`,
      '',
      '**Status:** ' + (task.status || 'ready'),
    ].join('\n');
  }).join('\n\n');
}

function generateForUser(root, plan, username) {
  const userTasks = plan.tasks.filter(t => t.assignedTo === username);
  if (userTasks.length === 0) return {};

  const files = {};
  const contextDir = path.join(root, '.plansync', 'context', username);
  if (!fs.existsSync(contextDir)) {
    fs.mkdirSync(contextDir, { recursive: true });
  }

  for (const [filename, templatePath] of Object.entries(getAllTemplates(root))) {
    const templateText = fs.readFileSync(templatePath, 'utf-8');

    const allScopeGlobs = [...new Set(userTasks.flatMap(t => t.scope || []))];
    const allAcceptance = userTasks.flatMap(t => t.acceptanceCriteria || []);

    const vars = {
      username,
      userTaskCount: String(userTasks.length),
      taskList: buildUserTaskList(plan, username),
      projectTitle: plan.title,
      projectDescription: plan.description,
      scopeGlobs: allScopeGlobs.join(', '),
      scopeList: formatList(allScopeGlobs),
      acceptanceList: formatList(allAcceptance),
      taskId: userTasks.map(t => t.id).join(', '),
      taskTitle: userTasks.map(t => t.title).join(', '),
    };

    const filePath = path.join(contextDir, filename);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    const rendered = mergeOrWrite(filePath, render(templateText, vars));
    fs.writeFileSync(filePath, rendered);
    files[filename] = filePath;
  }

  return files;
}

function mergeOrWrite(filePath, content, tag = 'plansync') {
  const startMarker = `<!-- ${tag} -->`;
  const endMarker = `<!-- end-${tag} -->`;
  const taggedContent = `${startMarker}\n${content.trimEnd()}\n${endMarker}`;

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8');
    const startIdx = existing.indexOf(startMarker);
    const endIdx = existing.indexOf(endMarker);

    if (startIdx !== -1 && endIdx !== -1) {
      return existing.slice(0, startIdx) + taggedContent + existing.slice(endIdx + endMarker.length);
    } else {
      return existing.trimEnd() + '\n\n' + taggedContent + '\n';
    }
  }

  return taggedContent + '\n';
}

function renderAdminContext(owner, repo) {
  return `# PlanSync — Project Planning

This project uses **PlanSync** to structure and delegate work across collaborators.

## Your Role
You are the admin's coding agent. When the admin asks you to plan a project, help them design a structured plan and save it to \`.plansync/plan.json\`.

## Plan Format
The plan file follows this JSON schema:

\`\`\`json
{
  "title": "Project name",
  "description": "Describe what this project does",
  "tasks": [
    {
      "id": "T001",
      "title": "Short task name",
      "description": "What needs to be built",
      "scope": ["src/path/to/files/**"],
      "dependencies": [],
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "assignedTo": "",
      "status": "ready"
    }
  ]
}
\`\`\`

- \`id\`: Must be \`T001\`, \`T002\`, etc.
- \`scope\`: Glob patterns defining which files this task can modify
- \`dependencies\`: IDs of tasks this task depends on (optional)
- \`status\`: One of \`ready\`, \`in_progress\`, \`blocked\`, \`done\`

## After Writing the Plan
Tell the admin to run \`plansync delegate\` to push the plan to GitHub, create Issues, assign tasks, and generate per-agent context files.

---

*PlanSync initialized for ${owner}/${repo}*`;
}

module.exports = { generateForUser, BUILT_IN_TEMPLATES, getAllTemplates, renderAdminContext, mergeOrWrite };
