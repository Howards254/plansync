const { minimatch } = require('minimatch');

function matchesAny(file, globs) {
  return globs.some(glob => minimatch(file, glob, { dot: true, matchBase: false }));
}

function checkScope(changedFiles, scopeGlobs) {
  const inScope = [];
  const outOfScope = [];

  for (const file of changedFiles) {
    if (matchesAny(file, scopeGlobs)) {
      inScope.push(file);
    } else {
      outOfScope.push(file);
    }
  }

  return { inScope, outOfScope };
}

function taskMatchesFile(taskId, file, tasks) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return false;
  return matchesAny(file, task.scope);
}

function findOwningTasks(file, tasks) {
  return tasks.filter(t => matchesAny(file, t.scope)).map(t => t.id);
}

module.exports = { checkScope, taskMatchesFile, findOwningTasks };
