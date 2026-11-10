# TeamForge Milestone 1: Backend Foundation — Technical Learnings & System Design Guide

This document captures the architectural decisions, design patterns, computer science fundamentals, and system design concepts implemented during **Milestone 1 (Backend Foundation)** of TeamForge. It is structured for rapid technical review and engineering interview discussions.

---

## 1. Architecture & Folder Structure

TeamForge follows a decoupled, modular service layout designed for horizontal growth:

```text
TeamForge/
├── .gitignore                                # Excludes node_modules, secrets, logs, coverage
├── README.md                                 # Developer onboarding, setup, and API contracts
├── LEARNINGS.md                              # Technical guide & system design notes
└── server/
    ├── .env                                  # Local development runtime variables (git-ignored)
    ├── .env.example                          # Canonical environment configuration template
    ├── package.json                          # ES module definition, scripts & dependencies
    ├── package-lock.json                     # Dependency lockfile
    ├── src/
    │   ├── app.js                            # Express app configuration & middleware assembly
    │   ├── server.js                         # Application entry point, HTTP listener & signal handlers
    │   ├── config/
    │   │   └── env.js                        # Environment variable parsing, type casting & defaults
    │   ├── controllers/
    │   │   └── health.controller.js          # Health check endpoint logic
    │   ├── middleware/
    │   │   ├── errorHandler.js               # Centralized 4-argument error handler
    │   │   └── notFoundHandler.js            # Catch-all 404 handler for unmatched routes
    │   └── routes/
    │       ├── index.js                      # Root router mounting modular namespaces (/api)
    │       └── health.routes.js              # Route definition for /health
    └── tests/
        ├── health.test.js                    # Vitest + Supertest suite for GET /api/health
        └── notFound.test.js                  # Vitest + Supertest suite for 404 responses
```

### File Registry & Exact Paths

| Component | Path | Core Responsibility |
| :--- | :--- | :--- |
| **App Assembly** | [server/src/app.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/app.js) | Configures Express instance, middleware chain, route hierarchy, and error sinks. |
| **Server Listener** | [server/src/server.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/server.js) | Binds HTTP server to port, logs startup, and handles OS termination signals. |
| **Configuration** | [server/src/config/env.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/config/env.js) | Loads `.env` via `dotenv`, validates types, and exports single-source-of-truth config. |
| **Controller** | [server/src/controllers/health.controller.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/controllers/health.controller.js) | Pure handler computing service uptime, timestamp, and health status. |
| **Routing** | [server/src/routes/index.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/routes/index.js) | Aggregator router mounting `/api` sub-routers. |
| **404 Handler** | [server/src/middleware/notFoundHandler.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/middleware/notFoundHandler.js) | Intercepts unhandled routes and returns uniform JSON responses. |
| **Error Middleware** | [server/src/middleware/errorHandler.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/middleware/errorHandler.js) | Formats operational and internal errors; sanitizes stack traces in production. |
| **Integration Tests** | [server/tests/health.test.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/tests/health.test.js) | Verifies status code, content-type, and payload schema of the health route. |
| **404 Tests** | [server/tests/notFound.test.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/tests/notFound.test.js) | Verifies fallback behavior on non-existent endpoints. |

---

## 2. Key Architectural Patterns & CS Fundamentals

### A. Separation of Concerns: `app.js` vs. `server.js`

* **The Problem:** In simple Express tutorials, `const app = express()` and `app.listen(PORT)` often live in the same file. When writing integration tests against such a server, importing that file binds a physical TCP socket, causing port collisions, slow tests, and dangling background listeners during parallel execution.
* **The Solution:**
  1. [server/src/app.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/app.js) defines and exports the Express application object (synchronous configuration).
  2. [server/src/server.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/server.js) imports `app` and handles the runtime concerns (network interface binding, environment inspection, OS signal handling).
* **CS Concept — Ephemeral Ports & Sockets:** Supertest passes the imported `app` to Node’s low-level HTTP stream parser without binding a real OS port, eliminating socket exhaustion during fast test suites.

### B. Process Lifecycle & Graceful Shutdown

* In containerized environments (Kubernetes, Docker) or cloud platforms (AWS ECS, Render), services undergo rolling updates. When a container is killed, the runtime sends an OS signal:
  * `SIGTERM` (Signal 15): Polite termination request.
  * `SIGINT` (Signal 2): Keyboard interrupt (`Ctrl+C`).
* In [server/src/server.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/server.js#L9-L18), we implement a graceful shutdown listener:
  ```javascript
  const handleShutdown = (signal) => {
    console.log(`\n[TeamForge Server] ${signal} signal received. Closing HTTP server gracefully...`);
    server.close(() => {
      console.log('[TeamForge Server] HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  ```
* **CS Concept — Connection Draining:** Calling `server.close()` stops accepting *new* TCP connections while allowing in-flight HTTP requests to complete, preventing client-side `ECONNRESET` drops during deployments.

---

### C. HTTP Request Lifecycle & Middleware Pipeline

Middleware in Express forms a **Chain of Responsibility** executed in strict FIFO order:

```text
Incoming HTTP Request
       │
       ▼
┌─────────────────────────────────┐
│ 1. cors()                       │ ➔ Validates Origin header, sets Access-Control-*
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 2. express.json()               │ ➔ Parses application/json body into req.body
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 3. express.urlencoded()         │ ➔ Parses form data (extended: true)
└─────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│ 4. Router (/api)                │ ➔ Matches registered routes (e.g., /api/health)
└─────────────────────────────────┘
       │
       ├─── [Match Found] ───────► Controller returns 200 JSON (Response sent)
       │
       ├─── [No Match] ──────────► Falls through to 404 Handler (notFoundHandler)
       │
       └─── [next(err) Thrown] ──► Skips directly to Error Middleware (errorHandler)
```

#### Why Order Matters:
1. **Security & Pre-parsing first:** CORS validation and body parsing must occur before routes inspect incoming payloads.
2. **Routes second:** Application routes define valid endpoints.
3. **404 Sink third:** Placed after all valid routes. If any preceding route handled the request, this is never reached.
4. **Error Handler last:** Catch-all sink for any unhandled exceptions or explicit `next(err)` invocations.

---

### D. Express Error Handling & JavaScript Arity

* **CS Concept — Function Arity:** In JavaScript, `Function.prototype.length` returns the number of declared parameters in a function signature.
* Express uses function arity to differentiate standard middleware from error-handling middleware:
  * Standard middleware: `(req, res, next)` ➔ `length === 3` (or 2 if `next` omitted).
  * Error middleware: `(err, req, res, next)` ➔ `length === 4`.
* If a middleware does not declare exactly 4 parameters, Express will **not** invoke it when `next(err)` is called.
* In [server/src/middleware/errorHandler.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/middleware/errorHandler.js#L1-L15):
  * **Operational Failures vs. Programmer Errors:** Status codes in the `4xx` range indicate client-side validation or routing failures (`status: 'fail'`). Codes in the `5xx` range indicate internal exceptions (`status: 'error'`).
  * **Information Leakage & Defense-in-Depth:** In production (`NODE_ENV === 'production'`), stack traces are stripped from JSON responses to prevent exposing internal directory paths, library versions, and database schemas.

---

### E. Configuration & The Twelve-Factor App (Factor III)

* **Principle:** Store configuration in the environment, not in code.
* In [server/src/config/env.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/config/env.js):
  * `dotenv.config()` loads key-value pairs from `.env`.
  * Explicit type parsing prevents subtle type bugs (e.g., `parseInt(process.env.PORT, 10)` avoids treating `'5000'` as a string).
  * Safe defaults allow the application to boot reliably in test and development environments without hard dependencies on local configuration.

---

### F. Health Monitoring & Distributed Systems Observability

* [server/src/controllers/health.controller.js](file:///c:/Users/LENOVO/Downloads/TeamForge/server/src/controllers/health.controller.js) exposes `GET /api/health`:
  ```json
  {
    "status": "ok",
    "message": "TeamForge API is healthy",
    "timestamp": "2026-11-10T13:00:00.000Z",
    "uptime": 120,
    "environment": "development"
  }
  ```
* **CS Concept — Liveness vs. Readiness:**
  * **Liveness:** Indicates if the Node.js event loop is spinning and responsive to HTTP traffic. (Implemented in Milestone 1).
  * **Readiness:** Indicates whether dependent downstream services (e.g., PostgreSQL, Redis, external APIs) are connected and ready to accept traffic. (Scheduled for future milestones).

---

### G. Testing Strategy: Vitest + Supertest

* **Modern Test Runner (Vitest):** Native ES module support removes the need for Babel/ts-jest transpilation, resulting in sub-second test execution (< 1s for the suite).
* **In-Memory Transport (Supertest):** Simulates real HTTP requests and assertions:
  * Validates HTTP response status (`expect(response.status).toBe(200)`).
  * Validates Content-Type header (`application/json`).
  * Verifies contract schema (presence and types of fields: `status`, `uptime`, `timestamp`).

---

## 3. Implemented vs. Future Roadmap

| Area | Milestone 1 (Implemented) | Future Milestones (Planned) |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js (v24), Express 4, ES Modules (`"type": "module"`) | TypeScript migration or strict JSDoc typing |
| **Server Architecture** | Decoupled `app.js` & `server.js` with graceful shutdown | Clustering / Worker threads for CPU-bound tasks |
| **Routing** | Modular router hierarchy under `/api` | Versioned namespaces (e.g. `/api/v1/auth`, `/api/v1/teams`) |
| **Database** | None (clean foundation) | PostgreSQL connection pool via `pg` / Kysely / Prisma |
| **Health Checks** | Shallow Liveness check (`process.uptime()`, timestamp) | Deep Readiness probe verifying DB connectivity (`SELECT 1`) |
| **Security** | Basic CORS with configurable origin | `helmet` (security headers), `express-rate-limit` (DDoS/brute-force defense) |
| **Logging** | Console logging for startup & shutdown | Structured JSON logger (`pino` / `winston`) with correlation IDs |
| **Error Handling** | Synchronous centralized error handler & 404 handler | `asyncHandler` wrapper or `express-async-errors` for async route errors |
| **Testing** | Vitest + Supertest for health & 404 endpoints | Unit tests for business logic, DB integration tests with test containers |

---

## 4. Interview-Ready Q&A Cheat Sheet

### Q1: Why separate `app.js` from `server.js`?
> "Separating app setup from HTTP listening adheres to the Single Responsibility Principle. `app.js` builds the Express request pipeline without binding to a physical network port. This allows testing frameworks like Supertest to execute integration tests against the app in memory without spinning up real TCP sockets, preventing port conflicts and teardown leaks during parallel CI runs. `server.js` acts purely as the operational entry point that handles socket binding, port configuration, and OS termination signals."

### Q2: How does Express know that a middleware is an error handler?
> "Express inspects the function's arity using JavaScript’s `fn.length` property. A standard middleware expects 2 or 3 parameters `(req, res, next)`. An error-handling middleware must declare exactly 4 parameters `(err, req, res, next)`. When an upstream route throws or invokes `next(err)`, Express iterates through its middleware stack and skips any handler whose `length !== 4`, routing execution directly to the error handler."

### Q3: What is connection draining and why is graceful shutdown essential in modern deployments?
> "In orchestrators like Kubernetes, a deployment creates new pods and terminates old ones by sending `SIGTERM`. If the process exits immediately with `process.exit(0)`, in-flight user requests are dropped abruptly, triggering `502 Bad Gateway` or `ECONNRESET` on the client. With graceful shutdown (`server.close()`), the server immediately rejects incoming handshakes but allows existing socket connections to finish processing before terminating the process cleanly."

### Q4: What is the difference between a shallow health check and a deep health check?
> "A shallow health check (Liveness) only verifies that the web server process is alive, the event loop isn't blocked, and it can return HTTP 200. A deep health check (Readiness) probes external dependencies—such as querying a connected database (`SELECT 1`) or verifying cache availability. Orchestrators use liveness to decide whether to restart a hung container, and readiness to decide whether to route live user traffic to the instance."
