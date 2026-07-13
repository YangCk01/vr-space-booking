# Campaign Reward Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three explicit user scopes, eight combinable order eligibility conditions, searchable venue/game selectors, and absolute reward validity ranges to campaign creation, editing, and reward execution.

**Architecture:** Persist typed eligibility fields on `CampaignReward`, evaluate them through a pure domain policy fed by an order/booking snapshot, and keep the transaction service responsible for loading that snapshot and issuing rewards. New and edit dialogs share serialization helpers so both send the same API contract.

**Tech Stack:** React 19, TypeScript, Express, Prisma, PostgreSQL, Node test runner, Vitest.

## Global Constraints

- User scopes are `ALL`, `NORMAL`, and `PAID`; `NORMAL` excludes VIP and `PAID` requires VIP.
- Selected eligibility conditions use AND semantics.
- Order conditions are valid only for `ORDER_COMPLETED` campaigns.
- Coupon, experience-coupon, and points rewards use an absolute date-time issuance range.
- Venue and game eligibility values must come from searchable multi-select controls backed by active system records; free-form IDs are not allowed.
- New and edit flows must use the same serialization and validation rules.

---

### Task 1: Persist Eligibility and Absolute Validity

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260713123000_expand_campaign_reward_eligibility/migration.sql`
- Modify: `app/src/api/campaign.ts`

**Interfaces:**
- Produces `CampaignReward` fields `validFrom`, `validTo`, `minPeople`, `firstOrderOnly`, `minCompletedOrders`, `applicableStartTime`, and `applicableEndTime`.

- [ ] Add a schema-contract test that reads `schema.prisma` and asserts every new field exists with the expected nullable/default shape.
- [ ] Run the contract test and verify it fails before schema changes.
- [ ] Add nullable date-time, integer, boolean, and time-string fields plus a forward-only SQL migration using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- [ ] Extend admin API reward/action types with all existing and new eligibility fields.
- [ ] Run the contract test, `npx prisma validate`, and `npx prisma generate`.

### Task 2: Implement the Pure Eligibility Policy

**Files:**
- Create: `server/src/domain/campaignRewardEligibility.ts`
- Create: `server/src/domain/campaignRewardEligibility.test.ts`
- Modify: `server/tsconfig.test.json`

**Interfaces:**
- Consumes `RewardEligibilityRule` and `RewardEligibilityContext`.
- Produces `evaluateCampaignRewardEligibility(rule, context): { eligible: true } | { eligible: false; reason: string }`.

- [ ] Write failing table-driven tests for `ALL`, `NORMAL`, and `PAID` user scopes.
- [ ] Write failing tests for amount, venue, game, weekday, start-time range, person count, first order, and completed-order count.
- [ ] Write a failing test proving selected conditions use AND semantics and missing required order context rejects safely.
- [ ] Implement the minimal pure evaluator with stable reason codes: `USER_SCOPE_NOT_MET`, `MIN_ORDER_NOT_MET`, `VENUE_NOT_APPLICABLE`, `GAME_NOT_APPLICABLE`, `WEEKDAY_NOT_APPLICABLE`, `TIME_NOT_APPLICABLE`, `MIN_PEOPLE_NOT_MET`, `FIRST_ORDER_REQUIRED`, and `MIN_COMPLETED_ORDERS_NOT_MET`.
- [ ] Run the focused domain test through `npm run test:unit` and verify all cases pass.

### Task 3: Integrate Eligibility Into Reward Execution

**Files:**
- Modify: `server/src/services/campaignRewardService.ts`
- Modify: `server/src/controllers/orderController.ts`
- Modify: `server/src/jobs/bookingLifecycleJob.ts`
- Modify: `server/src/domain/campaignReward.test.ts`

**Interfaces:**
- Enriches `ORDER_COMPLETED` execution from `orderId` with amount, venue, game, booking date/weekday, start time, person count, VIP state, and completed-order count.
- Uses `evaluateCampaignRewardEligibility` before quantity mutation and reward issuance.

- [ ] Add failing service-facing tests for an eligible order and each rejected context boundary.
- [ ] Make both manual completion and lifecycle completion pass only `orderId`, `userId`, and amount consistently; load authoritative order/booking data inside the service transaction.
- [ ] Convert campaign target/exclude tags into `ALL`, `NORMAL`, or `PAID` and call the pure evaluator.
- [ ] Replace ad hoc amount/game checks with the shared evaluator and persist the returned reason in execution logs.
- [ ] Issue user coupons with `validFrom`/`validTo`; reject missing/invalid ranges for new coupon rewards instead of calling `addDays`.
- [ ] Run backend unit tests and build.

### Task 4: Save and Return the Expanded Reward Contract

**Files:**
- Modify: `server/src/controllers/campaignController.ts`
- Modify: `server/src/domain/campaignRewardRecords.ts`
- Modify: `server/src/domain/campaignRewardRecords.test.ts`

**Interfaces:**
- Accepts and returns all eligibility fields in campaign create/update/get/list payloads.
- Validates that order-only conditions are paired with `ORDER_COMPLETED`.

- [ ] Add failing controller/domain tests for parsing typed fields, rejecting invalid ranges, and rejecting order conditions on non-order triggers.
- [ ] Add one shared reward-input normalizer used by both `create` and `update`.
- [ ] Persist every eligibility field, clear fields explicitly when conditions are deselected, and select them in list/detail/record projections.
- [ ] Preserve legacy `couponValidDays` only for reading existing records; never write it for new or edited rewards.
- [ ] Run focused tests, full backend unit tests, and backend build.

### Task 5: Unify New and Edit Form Serialization

**Files:**
- Create: `app/src/domain/campaignRewardForm.ts`
- Create: `app/src/domain/campaignRewardForm.test.ts`
- Modify: `app/src/pages/Campaigns.tsx`

**Interfaces:**
- Produces `parseCampaignRewardForm(campaign)`, `validateCampaignRewardForm(form)`, and `serializeCampaignRewardForm(form)`.
- Uses `userScope: 'ALL' | 'NORMAL' | 'PAID'` and a set of selected condition keys.

- [ ] Write failing Vitest cases for all three user scopes, eight condition fields, absolute validity, edit round-trip, and condition clearing.
- [ ] Implement shared form parsing, validation, and serialization helpers.
- [ ] Replace duplicated new/edit payload construction with the shared serializer.
- [ ] Ensure old campaigns with relative validity load but require an absolute range before save.
- [ ] Run focused Vitest tests and the admin build.

### Task 6: Build the Shared Eligibility Controls

**Files:**
- Create: `app/src/components/campaigns/CampaignRewardEligibilityFields.tsx`
- Modify: `app/src/pages/Campaigns.tsx`

**Interfaces:**
- Controlled component receiving `form`, `venues`, `games`, and `onChange`.
- Renders user scope, condition selection, condition-specific inputs, and validity range.

- [ ] Add `ALL` to the user-scope radio group and update help text to state exact inclusion rules.
- [ ] Render “无门槛/有门槛”; when enabled, show eight checkbox options and only the inputs for selected conditions.
- [ ] Use multi-select controls for venues, games, and weekdays; time inputs for experience time; numeric inputs for amount, people, and completed orders; and a checkbox for first order.
- [ ] Remove the days/range mode and always render start/end date-time inputs for coupon and experience rewards.
- [ ] Reuse the component in both new and edit dialogs, preserving existing spacing and responsive modal scrolling.
- [ ] Run admin tests, lint affected files, and build.

### Task 7: Migration and End-to-End Verification

**Files:**
- Modify only files required by verification failures.

**Interfaces:**
- Confirms persisted configuration round-trips and runtime eligibility produces a success or specific skip log.

- [ ] Apply the migration to the development database with `npx prisma migrate deploy`.
- [ ] Create one `ORDER_COMPLETED` campaign combining amount, venue, weekday, and minimum people; verify a matching order issues a reward.
- [ ] Verify one non-matching order writes the expected skip reason and does not increment `issuedCount`.
- [ ] Verify `ALL`, `NORMAL`, and `PAID` against one VIP and one non-VIP user.
- [ ] Verify issued coupon `validFrom` and `validTo` exactly match the configured absolute range.
- [ ] Run Prisma validation, backend unit tests/build, admin Vitest/build, and `git diff --check`.

### Task 8: Replace Native Venue and Game Lists With Searchable Multi-Selects

**Files:**
- Create: `app/src/components/campaigns/CampaignRewardMultiSelect.tsx`
- Create: `app/src/components/campaigns/CampaignRewardMultiSelect.test.ts`
- Modify: `app/src/components/campaigns/CampaignRewardEligibilityFields.tsx`

**Interfaces:**
- Produces `CampaignRewardMultiSelect({ label, options, value, onChange, placeholder })` with `options: Array<{ value: string; label: string }>` and `value: string[]`.
- Produces pure helpers `filterRewardOptions(options, query)` and `toggleRewardOption(value, optionId)` for deterministic Vitest coverage.
- Emits only option IDs supplied through `options`; selected items render as removable labels.

- [ ] Write failing pure tests proving label search is case-insensitive, option IDs can be added/removed, unknown IDs are not produced from search text, and input arrays are not mutated.
- [ ] Run `npx vitest run src/components/campaigns/CampaignRewardMultiSelect.test.ts` and verify the helpers do not exist yet.
- [ ] Implement the controlled selector with the existing Popover, Command, Checkbox, and Lucide icon components.
- [ ] Replace both native `<select multiple>` controls in `CampaignRewardEligibilityFields` and map active venue/game data to `{ value, label }` options.
- [ ] Run the focused helper test, affected-file ESLint, admin build, and browser interaction verification on both venue and game selectors.

### Task 9: Apply Absolute Reward Validity to Every Reward Type

**Files:**
- Modify: `app/src/pages/Campaigns.tsx`
- Modify: `app/src/api/campaign.ts`
- Modify: `server/src/controllers/campaignController.ts`
- Modify: `server/src/services/campaignRewardService.ts`
- Modify: `server/src/domain/campaignRewardEligibility.ts`
- Modify: `server/src/domain/campaignRewardEligibility.test.ts`

**Interfaces:**
- `validFrom` and `validTo` are required for `POINTS`, `COUPON`, and `EXPERIENCE_COUPON` reward inputs.
- Reward execution returns `REWARD_NOT_STARTED` before `validFrom` and `REWARD_EXPIRED` after `validTo` without issuing or incrementing counts.

- [ ] Add failing domain tests for a time before, inside, and after the reward validity range.
- [ ] Run the focused server unit test and verify the new boundary cases fail.
- [ ] Extend reward validation so every reward type requires a valid absolute range and points rewards persist both fields instead of clearing them.
- [ ] Evaluate the issuance timestamp before other order conditions and log a stable skip reason outside the range.
- [ ] Always render the labeled “奖励生效时间” date-time pair in new and edit forms, including points, and include the values in all reward actions.
- [ ] Run backend unit tests/build and admin build.

### Task 10: Verify Every Configurable Option Reaches Runtime Execution

**Files:**
- Modify only tests or implementation files required by verification failures.

**Interfaces:**
- Confirms all three user scopes, eight eligibility conditions, three reward types, and two validity boundaries are persisted and executed.

- [ ] Run the table-driven domain suite and verify each configurable option has a success case and a stable rejection case.
- [ ] Verify create and edit payloads both retain venue IDs, game IDs, validity range, people, first-order, and completed-order fields.
- [ ] Verify a points reward inside the validity range is issued and an expired points reward writes `REWARD_EXPIRED` without changing points.
- [ ] Run `npm run test:unit` and `npm run build` in `server`.
- [ ] Run focused Vitest, affected component ESLint, and `npm run build` in `app`.
- [ ] Run `npx prisma validate`, query the development database for persisted reward fields, and run `git diff --check`.
