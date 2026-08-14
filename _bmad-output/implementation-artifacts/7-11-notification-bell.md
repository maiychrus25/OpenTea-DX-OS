# Story 7.11: NotificationBell Component & TopBar Integration

Status: backlog

> **Absorbs từ 2-7 T3 + T4:** Story này implement toàn bộ FE notification component.
> Story 2-7 chỉ làm BE (Domain + API). 7-11 depends on 2-7 T1+T2 hoàn thành trước.

## Story

As any authenticated user,
I want a notification bell in the TopBar that shows unread count and a dropdown list of notifications,
so that I can stay informed of pending approvals, announcements, and system events.

## Acceptance Criteria

1. `NotificationBell` component exists at `components/ui/NotificationBell/NotificationBell.tsx`
2. Bell icon renders with red badge when `unreadCount > 0`; badge hidden when `unreadCount === 0`
3. Clicking bell → dropdown panel `.notif-panel` appears (z-index 40)
4. Dropdown lists notifications with: colored dot (tone matching type), title, detail text, time, Volume2 button (TTS placeholder)
5. "Xem tất cả" link at bottom → `/[role]/notifications`
6. Click outside dropdown → panel closes
7. NotificationBell is integrated into `TopBar.tsx` (replacing bell placeholder from story 7-3)
8. Notifications fetched từ `/api/notifications?limit=5` via **SWR** (`refreshInterval: 60000`) — depends on 2-7 T1+T2
9. **Mark all as read:** Button "Đánh dấu đã đọc" → `PUT /api/notifications/read` → SWR mutate → badge disappears (absorbs 2-7 T4)
10. **Individual click:** Click notification → mark read + redirect to `link_url` nếu có (absorbs 2-7 T4)
11. **Phụ thuộc:** Story 7-3 (TopBar refactor) + Story 2-7 T1+T2 (BE Domain + API) phải done trước
12. `npm run build` passes

## Tasks / Subtasks

- [ ] Tạo `NotificationBell.tsx` + CSS + index (AC: 1–6)
  - `'use client'` directive
  - Props: `role: string` (cho "Xem tất cả" link)
  - Fetch `/api/notifications?limit=5` on mount
  - Click-outside handler
- [ ] Tạo `NotificationBell.module.css` (AC: 2, 3, 4)
- [ ] Cập nhật `TopBar.tsx` (AC: 7)
  - Replace `<button aria-label="Thông báo"><Bell /></button>` placeholder → `<NotificationBell role={role} />`
  - TopBar nhận thêm prop `role: string` từ AppShell
- [ ] Cập nhật `components/ui/index.ts` (AC: 1)

## Dev Notes

### Component Props

```typescript
interface NotificationBellProps {
  role: string // 'manager' | 'officer' | 'farmer'
}
```

### Notification Data Shape (từ API)

```typescript
interface Notification {
  id: string
  title: string
  detail: string
  tone: 'green' | 'amber' | 'blue' | 'neutral'
  created_at: string
  read: boolean
}
```

### API Route (nếu chưa có)

```typescript
// app/api/notifications/route.ts — nếu chưa có, tạo placeholder:
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notifications = await prisma.notification.findMany({
    where: { user_id: session.user.id, deleted_at: null },
    orderBy: { created_at: 'desc' },
    take: 5,
  })
  return NextResponse.json({ notifications })
}
```

### Click-outside Pattern

```typescript
'use client'
import { useEffect, useRef, useState } from 'react'

export function NotificationBell({ role }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={styles.wrap}>
      <button onClick={() => setOpen(o => !o)} aria-label="Thông báo" className={styles.bellBtn}>
        <Bell />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>
      {open && (
        <div className={styles.panel} data-testid="notif-panel">
          {/* ... notification list ... */}
          <a href={`/${role}/notifications`}>Xem tất cả</a>
        </div>
      )}
    </div>
  )
}
```

### CSS

```css
.wrap { position: relative; }
.bellBtn { position: relative; }
.badge { position: absolute; top: -4px; right: -4px; background: #cc4b36; color: #fff; border-radius: 999px; font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; }
.panel { position: absolute; right: 0; top: calc(100% + 8px); width: 320px; background: #fff; border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-modal); z-index: 40; }
.notifDot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
.toneGreen { background: #176c4b; }
.toneAmber { background: #c98a12; }
.toneBlue  { background: #285d7e; }
.toneNeutral { background: #66736c; }
```

### Files

- `apps/web/src/components/ui/NotificationBell/NotificationBell.tsx` (NEW)
- `apps/web/src/components/ui/NotificationBell/NotificationBell.module.css` (NEW)
- `apps/web/src/components/ui/NotificationBell/index.ts` (NEW)
- `apps/web/src/components/layout/TopBar/TopBar.tsx` (MODIFY)
- `apps/web/src/components/ui/index.ts` (MODIFY)
- `apps/web/src/app/api/notifications/route.ts` (NEW — nếu chưa có)

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_
