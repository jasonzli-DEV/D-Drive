Thank you for your interest in contributing to D-Drive.

Getting started

- Fork the repository and create a feature branch from `main`.
- Follow the existing code style (TypeScript + Prettier + ESLint).
- Run the test suite and linters locally before opening a PR.

Local development

Install dependencies:

```bash
npm install
```

Run backend dev server:

```bash
cd backend
npm run dev
```

Run frontend dev server:

```bash
cd frontend
npm run dev
```

Testing

- Unit tests (backend): `cd backend && npm test`
- Frontend tests: `cd frontend && npm test`
- E2E tests: `npx playwright test`

Branching and commits

- Use descriptive branch names: `feat/xxx`, `fix/xxx`, `chore/xxx`.
- Use conventional commit messages (type(scope): subject).

Pull requests

- Open a PR against `main` with a clear description of changes and motivation.
- Include tests for new features or bug fixes.
- Maintain backward compatibility where possible.

Code review

- Address review comments promptly.
- Keep PRs small and focused to ease review.

Security

- Do not commit secrets or credentials.
- For security issues, contact the maintainers privately.

Thank you for contributing!