# Contributing

## Development setup

```sh
git clone <repo>
cd plansync
npm install
```

## Running tests

```sh
npm test           # run all tests
npm run test:watch # watch mode
```

## Project structure

```
bin/plansync.js        # CLI entrypoint
src/commands/          # command implementations (init, plan, delegate, sync, status)
src/lib/               # shared libraries (scopeCheck, contextFiles, permissions, etc.)
src/templates/         # context file templates, workflow templates, git hook template
test/                  # vitest test files
docs/                  # documentation
website/               # public website (plain HTML + CSS)
```

## Adding a new context-file format

1. Create a template in `src/templates/context/`
2. Add the filename and path to the `TEMPLATES` map in `src/lib/contextFiles.js`
3. Add a generation function if the format needs special logic

## Coding conventions

- CommonJS (`require`/`module.exports`) — the project runs on Node.js without a build step
- No semicolons (project convention)
- Async/await for asynchronous operations
- Tests use vitest with `.mjs` extension for ESM compatibility

## PR workflow

1. Create a feature branch
2. Write or update tests
3. Run `npm test` — all tests must pass
4. Open a PR with a clear description of the change

## Releasing

Releases are automated via GitHub Actions. Push a `v*` tag to trigger `release.yml`.
