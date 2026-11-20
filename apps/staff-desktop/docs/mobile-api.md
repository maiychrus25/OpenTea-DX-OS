# Staff API contract (v1)

Served by Tea Staff Manager on `http://<pc-address>:5080` (port configurable in Settings, or headless with `--serve`). JSON uses camelCase; enums are strings. Errors return `{"message": "<Vietnamese text>"}` with status 400 (rule violation) or 401 (missing/expired token).

All endpoints except `/api/health` and `/api/auth/login` need `Authorization: Bearer <token>`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | – | `{status, htxCode, htxName, version}` |
| POST | `/api/auth/login` | `{username, password}` | `{token, profile}` |
| POST | `/api/auth/logout` | – | 204 |
| GET | `/api/me` | – | `Profile` |
| POST | `/api/me/password` | `{currentPassword, newPassword}` | 204 |
| GET | `/api/tasks` | – | `Task[]` assigned to the caller (cancelled tasks hidden) |
| GET | `/api/tasks/{id}` | – | `Task` |
| POST | `/api/tasks/{id}/status` | `{status, progress?, note?}` | updated `Task` |
| GET | `/api/attendance?month=yyyy-MM` | – | `{month, workDays, leaveDays, absentDays, overtimeHours, records[]}` |
| GET | `/api/attendance/today` | – | `AttendanceRecord` or `null` |
| POST | `/api/attendance/check-in` | – | `AttendanceRecord` |
| POST | `/api/attendance/check-out` | – | `AttendanceRecord` |
| GET | `/api/leaves` | – | `{remainingAnnualDays, items: Leave[]}` |
| POST | `/api/leaves` | `{fromDate, toDate, type, reason, attachment?: {fileName, dataBase64}}` (dates `yyyy-MM-dd`; evidence JPG/PNG/WEBP/PDF ≤ 5 MB, required for sick leave ≥ 2 days) | `Leave` (with `hasAttachment`, `attachmentName`) |
| GET | `/api/leaves/{id}/attachment` | – | the evidence file of the caller's own request |
| POST | `/api/leaves/{id}/cancel` | – | 204 (pending requests only) |
| GET | `/api/payslips` | – | `Payslip[]` (approved and paid only) |

## Main shapes

```jsonc
// Task
{ "id": 2, "title": "Hái chè đồi B1", "description": "...", "location": "Đồi B1",
  "priority": "Normal", "priorityLabel": "Bình thường",
  "status": "Assigned", "statusLabel": "Mới giao", "progress": 0,
  "startDate": "2026-11-16T07:00", "dueDate": "2026-11-16T17:00", "overdue": false,
  "reportNote": null, "assignedBy": "Chủ nhiệm HTX", "completedAt": null,
  "nextStatuses": ["Accepted", "Rejected"] }

// AttendanceRecord
{ "workDate": "2026-11-16", "checkIn": "06:45", "checkOut": null,
  "status": "Present", "statusLabel": "Có mặt", "overtimeHours": 0, "note": null }
```

Enum values: task status `Assigned | Accepted | InProgress | Completed | Rejected | Cancelled`; priority `Low | Normal | High | Urgent`; attendance `Present | HalfDay | Absent | PaidLeave | UnpaidLeave`; leave type `Annual | Sick | Unpaid | Personal`; leave status `Pending | Approved | Rejected | Cancelled`; payslip status `Draft | Approved | Paid`.

## Mapping to OpenTea DX-OS

When the API is packaged as a DX-OS mini-app (`id: staff-work`), the same paths sit under `/apps/staff-work/api/...` behind the APISIX gateway, the bearer token becomes the user's Keycloak access token, and the employee is resolved from the token's `sub` (`employees.core_user_id`) instead of the local session table. The Android client only needs a different base URL and token source.
