# TeamForge

TeamForge is a modern collaboration platform designed for small teams, built with React, Node.js, Express, and PostgreSQL.

## Architecture Overview

```text
TeamForge/
├── server/            # Node.js + Express backend (ES modules)
│   ├── src/           # Application source code (app, routes, controllers, middleware)
│   ├── tests/         # Vitest + Supertest integration tests
│   └── package.json
├── .gitignore
└── README.md
```

## Milestone 1: Backend Foundation

The initial milestone establishes the Express backend service with:
- **ES Modules** architecture (`"type": "module"`).
- **Separation of Concerns:** `src/app.js` configures Express (middleware, routes, error handlers) while `src/server.js` handles server lifecycle (`listen`).
- **Health-Check API:** `GET /api/health` providing service status, uptime, and timestamp.
- **Centralized Error & 404 Handling:** Predictable JSON responses for client errors, server errors, and unmatched routes.
- **Automated Testing:** Vitest and Supertest test suite.

## Getting Started

### Prerequisites
- Node.js (v20+ recommended, tested on v24)
- npm

### Backend Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Copy the example environment variables:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Run test suite:
   ```bash
   npm test
   ```

## API Endpoints

| Method | Endpoint      | Description                  | Response (200 OK) |
|--------|---------------|------------------------------|-------------------|
| `GET`  | `/api/health` | Health and status monitoring | JSON health info  |
