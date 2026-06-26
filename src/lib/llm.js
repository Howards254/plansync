const Anthropic = require('@anthropic-ai/sdk');

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return key;
}

function getModel() {
  return process.env.PLANSYNC_CLAUDE_MODEL || DEFAULT_MODEL;
}

const SYSTEM_PROMPT = `You are a project planning assistant. Given a project description, you must produce a JSON project plan with the following schema:

{
  "title": "Project title",
  "description": "Brief project description",
  "tasks": [
    {
      "id": "T001",
      "title": "Task title",
      "description": "Detailed description of what this task involves",
      "scope": ["src/**/*.js", "tests/**/*.js"],
      "dependencies": [],
      "acceptanceCriteria": [
        "Criterion 1 that can be verified",
        "Criterion 2 that can be verified"
      ]
    }
  ]
}

Rules:
- Each task ID must be unique and sequential (T001, T002, T003, ...)
- Dependencies must reference existing task IDs (e.g., "T002" depends on "T001")
- Scope must be specific file/folder glob patterns relative to the project root
- Acceptance criteria must be concrete, testable, and verifiable
- The plan should be comprehensive but focused on the MVP
- Break the project into logical, independently-assignable tasks
- Output ONLY the raw JSON object — no markdown formatting, no code fences, no surrounding text
- Do not include trailing commas in the JSON`;

function createClient() {
  return new Anthropic({ apiKey: getApiKey() });
}

async function generatePlan(description) {
  const client = createClient();
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: description },
    ],
  });

  return extractJson(response);
}

async function revisePlan(description, previousPlan, feedback) {
  const client = createClient();
  const response = await client.messages.create({
    model: getModel(),
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: description },
      {
        role: 'assistant',
        content: JSON.stringify(previousPlan, null, 2),
      },
      {
        role: 'user',
        content: `Based on my feedback below, revise the plan. Keep what works, change what doesn't.\n\nFeedback: ${feedback}`,
      },
    ],
  });

  return extractJson(response);
}

function extractJson(response) {
  const text = response.content[0].text;

  // Try to find JSON object in the response, handling code fences
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) return JSON.parse(jsonMatch[1]);

  // Try raw JSON object
  const rawMatch = text.match(/\{[\s\S]*\}/);
  if (rawMatch) return JSON.parse(rawMatch[0]);

  throw new Error('LLM response did not contain valid JSON');
}

module.exports = { generatePlan, revisePlan, getApiKey, SYSTEM_PROMPT };
