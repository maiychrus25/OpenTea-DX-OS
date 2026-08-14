# Story 7.7: Manager Dashboard Refactor — Today View

Status: backlog

## Story

As a Manager (Trưởng HTX),
I want the dashboard page to display the "Today" view from the prototype,
so that I can immediately see key metrics, market snapshot, and operational status upon login.

## Acceptance Criteria

1. **Hero panel:** Greeting "Chào buổi sáng/chiều/tối, {userName}" (time-aware), Pill tone=green "Đang hoạt động", date display
2. **Metric grid (4 cards):** Vùng canh tác (ha), Sản lượng kỳ vọng (tấn), Lô sẵn sàng giao, Cần xử lý — data fetched từ existing APIs/DB
3. **Market snapshot section:** Hiển thị ≥1 giá nông sản từ `market_data` table. `<SourceBox />` MANDATORY. `<AiNote />` MANDATORY
4. **Operational progress section:** Timeline progress tuần hiện tại (placeholder nếu API chưa có)
5. **Onboarding CTA:** Nếu chưa có HTX profile → hiện CTA "Thiết lập ngay" (giữ logic hiện tại)
6. Page dùng `<MetricCard />` component từ story 7-5
7. Page dùng `<Pill />` component từ story 7-4
8. Không có inline styles, `npm run build` passes
9. **Phụ thuộc:** Stories 7-4, 7-5 phải done trước. **Story 7-0a (schema migration) phải done trước** để `Lot.htx_profile_id` khả dụng cho metric card "Lô sẵn sàng giao"

## Tasks / Subtasks

- [ ] Refactor `manager/dashboard/page.tsx` (AC: 1–5, 6, 7)
  - Thêm hero panel với time-aware greeting
  - Thêm metric grid — fetch aggregate data (count parcels, expected yield, lot counts)
  - Thêm market snapshot section với SourceBox + AiNote
  - Giữ nguyên onboarding CTA logic
- [ ] Refactor `manager/dashboard/Dashboard.module.css` (AC: 1–4)
  - Thêm `.hero`, `.metricGrid`, `.marketSnapshot`, `.progressSection`
  - Grid: `repeat(4, 1fr)` — responsive 2 cols tại ≤1100px, 1 col tại ≤430px

## Dev Notes

### Time-aware Greeting Logic

```tsx
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Chào buổi sáng'
  if (hour < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}
```

### Metric Data Sources

| Metric | Source |
|--------|--------|
| Vùng canh tác (ha) | `SELECT SUM(area_ha) FROM Parcel WHERE htx_id = ?` |
| Sản lượng kỳ vọng | `SELECT SUM(expected_yield_kg) FROM ParcelCropCycle WHERE status != 'harvested'` |
| Lô sẵn sàng giao | `SELECT COUNT(*) FROM Lot WHERE status = 'ready' AND htx_id = ?` |
| Cần xử lý | Pending journal approvals + pending lot reviews |

→ Tạo `GetManagerDashboardStatsUseCase` trong application layer nếu chưa có.
→ Nếu query phức tạp, fetch trực tiếp trong page với `prisma` (Server Component — OK per architecture).

### Market Snapshot — Data Source

Query `market_data` table (populated by n8n, story 1-7). Hiển thị 3 rows gần nhất.

```tsx
const prices = await prisma.marketData.findMany({
  orderBy: { recorded_at: 'desc' },
  take: 3,
})
```

SourceBox example:
```tsx
<SourceBox count={3} sources={['USDA', 'WTO', 'Chợ đầu mối TPHCM']} />
```

### Page Structure

```tsx
export default async function ManagerDashboard() {
  // ... auth check ...
  const stats = await getStats()
  const prices = await getPrices()

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div>
          <h1>{getGreeting()}, {session.user.name}</h1>
          <Pill tone="green">Đang hoạt động</Pill>
        </div>
        <span className={styles.date}>{formatDate(new Date())}</span>
      </section>

      {/* Metrics */}
      <div className={styles.metricGrid}>
        <MetricCard icon={<Sprout />} label="Vùng canh tác" value={`${stats.totalHa} ha`} tone="green" />
        <MetricCard icon={<Package />} label="Sản lượng kỳ vọng" value={`${stats.expectedYield} tấn`} tone="blue" />
        <MetricCard icon={<PackageCheck />} label="Lô sẵn sàng" value={stats.readyLots} tone="green" />
        <MetricCard icon={<AlertCircle />} label="Cần xử lý" value={stats.pendingCount} tone="amber" />
      </div>

      {/* Market Snapshot */}
      <section className={styles.marketSnapshot}>
        <span className={styles.eyebrow}>GIÁ THỊ TRƯỜNG HÔM NAY</span>
        {/* Price rows */}
        <AiNote />
        <SourceBox count={3} sources={['USDA', 'WTO', 'Sở NN&PTNT']} />
      </section>

      {/* Onboarding CTA — giữ nguyên từ code cũ */}
      {!hasProfile && <section>...</section>}
    </div>
  )
}
```

### Files

- `apps/web/src/app/manager/dashboard/page.tsx` (MODIFY)
- `apps/web/src/app/manager/dashboard/Dashboard.module.css` (MODIFY)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
