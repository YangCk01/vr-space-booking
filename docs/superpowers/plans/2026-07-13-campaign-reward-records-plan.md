# Campaign Reward Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified campaign reward record workflow for coupon, experience coupon, and points rewards, with an activity-scoped modal and a global filterable page.

**Architecture:** `CampaignExecutionLog` remains the source of truth. A small server domain module normalizes filters and maps Prisma rows into a stable API contract; the controller exposes a global `/campaigns/reward-records` endpoint and the existing activity log endpoint reuses the same shape. The app uses a focused API client, reusable reward record table/modal components, and a dedicated route for global records.

**Tech Stack:** TypeScript, Express 5, Prisma 6, Node test runner, React 19, React Router 7, TanStack Query 5, Tailwind CSS.

## Global Constraints

- Do not show user avatars or the acquisition-method field.
- Keep all campaign reward types in one global page and allow filtering by campaign.
- Remove the duplicate advanced-settings block from the edit modal.
- Keep only All, Running, Paused, and Ended campaign status filters.
- Reuse `CampaignExecutionLog`; do not add a duplicate reward-ledger table.

---

### Task 1: Reward Record Query Contract

**Files:**
- Create: `server/src/domain/campaignRewardRecords.ts`
- Create: `server/src/domain/campaignRewardRecords.test.ts`
- Modify: `server/src/controllers/campaignController.ts`
- Modify: `server/src/routes/campaign.ts`

**Interfaces:**
- Produces: `parseRewardRecordFilters(query): RewardRecordFilters`
- Produces: `mapCampaignRewardRecord(row): CampaignRewardRecordDto`
- Produces: `GET /api/campaigns/reward-records?page&pageSize&campaignId&rewardType&status&userKeyword&startDate&endDate`

- [ ] **Step 1: Write failing domain tests**

Test filter normalization (`page >= 1`, `pageSize <= 100`, upper-case enums, inclusive end date) and DTO mapping for `POINTS`, `COUPON`, and `EXPERIENCE_COUPON`. Assert that the DTO contains campaign/user names, reward content, issued/used timestamps and no avatar or acquisition-method property.

- [ ] **Step 2: Run the domain test and verify RED**

Run: `npm run test:unit -- --test-name-pattern="campaign reward records"`

Expected: TypeScript compilation fails because `campaignRewardRecords.ts` does not exist.

- [ ] **Step 3: Implement the domain contract**

Add exact DTO fields: `id`, `campaignId`, `campaignName`, `userId`, `userName`, `userPhone`, `rewardType`, `rewardName`, `rewardValue`, `pointsAmount`, `validDays`, `applicableGameNames`, `status`, `reason`, `issuedAt`, `usedAt`, `usedOrderId`, `usedAmount`, `description`.

- [ ] **Step 4: Add global controller and route**

Build a Prisma `where` object from parsed filters, include `campaign.rewards`, `user`, and applicable game names, paginate by `createdAt desc`, map rows through `mapCampaignRewardRecord`, and register the static route before `/:id` routes so `reward-records` is not treated as a campaign ID.

- [ ] **Step 5: Reuse mapping in activity logs**

Update `executionLogs` to return the same DTO contract while preserving its fixed `campaignId` and pagination.

- [ ] **Step 6: Run tests and server build**

Run: `npm run test:unit`

Run: `npm run build`

Expected: both pass.

### Task 2: Frontend API and Reusable Record UI

**Files:**
- Modify: `app/src/api/campaign.ts`
- Create: `app/src/components/campaigns/CampaignRewardRecordTable.tsx`
- Create: `app/src/components/campaigns/CampaignRewardRecordsModal.tsx`

**Interfaces:**
- Consumes: global and activity-scoped reward record endpoints from Task 1.
- Produces: `CampaignRewardRecord`, `CampaignRewardRecordFilters`, `getCampaignRewardRecords(filters)`, and a modal callback `onViewAll(campaignId)`.

- [ ] **Step 1: Add frontend contract types and API functions**

Define the DTO exactly as Task 1 and a paginated response type. Extend `getCampaignLogs` and add `getCampaignRewardRecords` with optional `campaignId`, `rewardType`, `status`, `userKeyword`, `startDate`, and `endDate` filters.

- [ ] **Step 2: Create the reusable record table**

Render columns for record ID, activity, user, reward type, reward content, issued time, use information, and status. For points, show signed points and description; for coupons and experience coupons, show valid days and used time/order. Do not render avatar or acquisition method.

- [ ] **Step 3: Create the activity-scoped modal**

Fetch by campaign ID, include loading/error/empty states and pagination, show the activity name in the title, and add a `查看全部记录` command that calls `onViewAll(campaignId)`.

- [ ] **Step 4: Run app build**

Run: `npm run build`

Expected: TypeScript and Vite build pass.

### Task 3: Global Reward Records Page

**Files:**
- Create: `app/src/pages/CampaignRewardRecords.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `getCampaignRewardRecords`, `getCampaigns`, and `CampaignRewardRecordTable`.
- Produces: route `/campaign-reward-records`; accepts optional query string `campaignId`.

- [ ] **Step 1: Build the global records page**

Add filters for campaign, reward type (`优惠券`, `体验券`, `积分`), user keyword, status (`全部`, `已发放`, `已使用`, `失败/跳过`), and date range. Initialize campaign from `searchParams`, reset page to 1 on filter changes, and display paginated results.

- [ ] **Step 2: Register route and navigation**

Lazy-load the page in `App.tsx`, add `/campaign-reward-records`, and add `奖励记录` under `会员与营销` with permission `marketing:campaign`.

- [ ] **Step 3: Run app build**

Run: `npm run build`

Expected: build passes.

### Task 4: Campaign List Cleanup and Integration

**Files:**
- Modify: `app/src/pages/Campaigns.tsx`

**Interfaces:**
- Consumes: `CampaignRewardRecordsModal` from Task 2 and `/campaign-reward-records?campaignId=...` from Task 3.

- [ ] **Step 1: Remove duplicate edit settings**

Delete the lower `高级设置` UI block from `EditCampaignModal` and remove edit-only state/submission fields that are no longer exposed, while leaving existing campaign values unchanged when updating unrelated fields.

- [ ] **Step 2: Wire claim records action**

Replace the non-interactive `领取记录` text with a button that opens `CampaignRewardRecordsModal`; route `查看全部记录` to the global page with the selected campaign ID.

- [ ] **Step 3: Simplify status filters**

Remove `DRAFT` from the visible tabs and counts. Keep `全部`, `进行中`, `已暂停`, and `已结束` mapped to real backend statuses.

- [ ] **Step 4: Run app build and diff checks**

Run: `npm run build`

Run: `git diff --check -- app/src server/src`

Expected: build passes; diff check has no whitespace errors.

### Task 5: End-to-End Verification

**Files:**
- Artifacts: `app/output/playwright/campaign-reward-records-modal.png`
- Artifacts: `app/output/playwright/campaign-reward-records-page.png`

**Interfaces:**
- Consumes: completed backend and app implementation.

- [ ] **Step 1: Verify live services**

Probe `http://localhost:4001/api/settings/member-public` and `http://localhost:5175`; start the existing dev command only if needed.

- [ ] **Step 2: Verify activity modal**

Open `/campaigns`, click `领取记录`, confirm no avatar column, verify pagination/empty state, and capture `campaign-reward-records-modal.png`.

- [ ] **Step 3: Verify global page**

Open the global page from the modal, confirm the activity filter is preselected, exercise reward type/status filters, and capture `campaign-reward-records-page.png`.

- [ ] **Step 4: Verify edit and status cleanup**

Open edit and confirm the duplicate advanced settings are absent. Confirm visible status tabs are exactly All, Running, Paused, and Ended.

- [ ] **Step 5: Final regression commands**

Run server unit tests/build and app build again. Review browser console; report unrelated pre-existing errors separately.
