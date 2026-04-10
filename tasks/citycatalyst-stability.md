# CityCatalyst — Demo Tasks (easiest to hardest)

## Fix inverted shell condition in HIAP cron job

- **type**: bugfix
- **description**: In `k8s/cc-check-hiap-jobs.yml`, the shell script uses `if [ -n "$(CC_CRON_JOB_API_KEY)" ]` to check if the API key is missing, but `-n` tests if the string is NOT empty — so it exits with error when the key IS present (the opposite of the intent). Change `-n` to `-z` (test if empty). Also fix the variable reference to use `"$CC_CRON_JOB_API_KEY"` instead of `"$(CC_CRON_JOB_API_KEY)"` which would try to run it as a command.
- **files**: k8s/cc-check-hiap-jobs.yml

### Acceptance criteria

- The condition uses `-z` to test for empty/missing API key
- The variable is referenced as `"$CC_CRON_JOB_API_KEY"` not `"$(CC_CRON_JOB_API_KEY)"`
- The cron job proceeds normally when the key is set

## Add catch to unawaited HIAP background job

- **type**: bugfix
- **description**: In `app/src/backend/hiap/HiapService.ts`, the function `startBothActionRankingJobs` fires `startActionRankingJob` for the opposite action type without `await` or `.catch()`. If that background call fails, it causes an unhandled promise rejection that can crash the Node.js process. Add a `.catch()` that logs the error using the existing `logger` import.
- **files**: app/src/backend/hiap/HiapService.ts

### Acceptance criteria

- The background `startActionRankingJob` call has a `.catch()` handler
- Errors are logged with the existing logger
- The primary job still runs and returns normally
- No unhandled promise rejections

## Add liveness and readiness probes to test deployment

- **type**: bugfix
- **description**: The test environment Kubernetes deployment at `k8s/test/cc-test-web-deploy.yml` has no liveness or readiness probes, unlike the production deployment at `k8s/cc-web-deploy.yml`. This means pods in the test environment can receive traffic before they're ready, or stay unhealthy without being restarted. Add the same probe configuration that production uses. Look at `k8s/cc-web-deploy.yml` for the exact probe config (livenessProbe and readinessProbe using `/api/v0/check/liveness` and `/api/v0/check/health`), and add resource requests (not just limits) to match prod as well.
- **files**: k8s/test/cc-test-web-deploy.yml, k8s/cc-web-deploy.yml

### Acceptance criteria

- Test deploy has livenessProbe matching production
- Test deploy has readinessProbe matching production
- Test deploy has resource requests (not just limits)
- Existing configuration (image, env vars, ports) is unchanged

## Add periodic cleanup to in-memory rate limiter

- **type**: bugfix
- **description**: The `RateLimiter` class in `app/src/util/rate-limiter.ts` has a `cleanup()` method that removes expired entries from its internal `Map`, but it's never called anywhere. Under many distinct client IPs, the Map grows without bound (slow memory leak). Add a `setInterval` in the constructor that calls `cleanup()` periodically (e.g. every 60 seconds) to evict stale entries. Also store the interval reference and add a `destroy()` method to clear it for clean shutdown and testing.
- **files**: app/src/util/rate-limiter.ts

### Acceptance criteria

- Cleanup runs automatically on a periodic interval
- The interval can be cleared via a `destroy()` method
- Existing rate limiting behavior is unchanged
- No memory leak from growing Map of expired entries

## Remove debug console statements from UI components

- **type**: cleanup
- **description**: Multiple UI components have `console.log`, `console.warn`, or `console.error` statements left from development that pollute the browser console in production. Find and remove them from these specific files (do NOT touch backend/API files, test files, or `services/logger.ts`). Files to clean: `app/src/app/[lng]/[inventory]/InventoryResultTab/ByScopeViewSourceDrawer.tsx` (line ~36, console.error in useEffect), `app/src/app/[lng]/admin/organization/[id]/modules/page.tsx` (lines ~39-41, console.log in stub handler), `app/src/app/[lng]/[inventory]/data/manage-sectors/SectorTabs.tsx` (lines ~303 and ~323, console.log), `app/src/hooks/useChat.ts` (lines ~76 and ~98, console.warn and console.log). Only remove the console statements — do not change any other logic.
- **files**: app/src/app/[lng]/[inventory]/InventoryResultTab/ByScopeViewSourceDrawer.tsx, app/src/app/[lng]/admin/organization/[id]/modules/page.tsx, app/src/app/[lng]/[inventory]/data/manage-sectors/SectorTabs.tsx, app/src/hooks/useChat.ts

### Acceptance criteria

- No console.log/warn/error in the listed files
- No other logic changes
- Components still function correctly

## Add mutex to database initialization

- **type**: bugfix
- **description**: In `app/src/models/index.ts`, the `db.initialize()` function can be called concurrently by multiple requests during a cold start. Multiple requests can see `!db.initialized` at the same time and create duplicate Sequelize instances and connection pools. Add a simple mutex/promise guard so that only the first caller runs initialization and subsequent concurrent callers await the same promise. Use a module-level `let initPromise: Promise<void> | null = null` pattern.
- **files**: app/src/models/index.ts

### Acceptance criteria

- Only one Sequelize instance is created even under concurrent requests
- Subsequent callers await the same initialization promise
- The fix doesn't change the public API of db.initialize()
- Existing model initialization logic is preserved

## Add timeouts to external service fetch calls

- **type**: bugfix
- **description**: HTTP calls to external services (HIAP, Global API, CCRA) have no timeout configured. If any external service hangs, the request blocks indefinitely. Add `AbortSignal.timeout()` to fetch calls in these files: `app/src/backend/hiap/HiapApiService.ts` (all fetch calls — use 30 second timeout), `app/src/backend/GlobalAPIService.ts` (use 15 second timeout), `app/src/backend/ccra/CcraApiService.ts` (use 15 second timeout). Use the pattern `signal: AbortSignal.timeout(ms)` in the fetch options. Wrap existing error handling to also catch `AbortError` / timeout errors with a clear message.
- **files**: app/src/backend/hiap/HiapApiService.ts, app/src/backend/GlobalAPIService.ts, app/src/backend/ccra/CcraApiService.ts

### Acceptance criteria

- All external fetch calls have a timeout via AbortSignal
- HIAP calls use 30s timeout (longer due to processing)
- Global API and CCRA calls use 15s timeout
- Timeout errors are caught and logged with a clear message
- Existing error handling is preserved
