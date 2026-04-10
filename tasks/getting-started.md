# CityCatalyst — Agent Tasks

## Fix cron HIAP auth bypass with empty bearer token

- **type**: bugfix
- **repo**: CityCatalyst
- **description**: In `app/src/app/api/v1/cron/check-hiap-jobs/route.ts`, when the Authorization header is `Bearer ` (with an empty token), `token.length > 0` is false, so the invalid-key check is skipped and the handler continues without authentication. Fix the validation to reject empty tokens.
- **files**: app/src/app/api/v1/cron/check-hiap-jobs/route.ts

### Acceptance criteria

- Empty bearer tokens are rejected with 401
- Missing Authorization header is still handled correctly
- Valid API keys continue to work

## Remove console.log from TooltipCard

- **type**: cleanup
- **description**: The `TooltipCard.tsx` component in the emissions forecast section has a `console.log` that fires on every tooltip render, spamming the browser console during chart interactions. Remove it.
- **files**: app/src/app/[lng]/[inventory]/InventoryResultTab/EmissionsForecast/TooltipCard.tsx

### Acceptance criteria

- No console.log in the component
- Tooltip still renders correctly

## Add await to startBothActionRankingJobs background job

- **type**: bugfix
- **description**: In `app/src/backend/hiap/HiapService.ts`, `startBothActionRankingJobs` fires `startActionRankingJob` for the opposite type without `await` or `.catch()`. If it fails, this causes an unhandled promise rejection that can crash the process. Add `.catch()` to handle errors gracefully and log them.
- **files**: app/src/backend/hiap/HiapService.ts

### Acceptance criteria

- The background job failure is caught and logged
- The primary job still runs and returns normally
- No unhandled promise rejections
