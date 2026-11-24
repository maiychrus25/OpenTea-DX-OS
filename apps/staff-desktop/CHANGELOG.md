# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-11-24

### Added
- **Automation** page and engine (runs every minute): recurring templates become the day's tasks, cover for rejected work and approved leave, forgotten check-outs closed at 17:00, one warning per overdue task, draft payslips on days 1–3 of the month, optional approval of one-day annual leave. Every action is logged; owner decisions are one-click suggestions.
- Explainable ranking of who fits a task (similar finished work, on-time rate, overlapping work, team, place, past rejections, leave, today's attendance), shown in the task form (**Gợi ý**) and behind every suggestion.
- `POST /api/iot/alerts` for Tea IoT Station: sensor alerts become task suggestions with the evidence (`Iot.DeviceKey` in `config.json`).
- Tea Work accepts the staff member's OpenTea DX-OS (Keycloak) account and links it to the employee profile (`MobileApi.AllowCoreAccounts`).
- Demo data: two weeks of finished work, a rejected task and four recurring templates.
- PostgreSQL script `003_automation.sql`; databases from older versions gain the new tables on start-up.

### Fixed
- The PostgreSQL scripts are now tracked in the core repository.

## [1.2.0] - 2026-11-20

### Added
- Charts on every page where they help: dashboard (task status, 14-day work days and completed tasks), employees (staff by team and contract type, base salary fund), attendance (daily work days, absences and overtime in the month), leave (approved days by type and per month, share of sick leave with evidence) and payroll (composition of gross pay, net pay per employee).
- Demo data includes approved leave history.

### Fixed
- Bar value labels no longer overlap the chart title.

## [1.1.0] - 2026-11-20

### Added
- **Reports** page with KPI tiles and native WPF charts (task status, priority share, daily task and attendance trends, payroll fund, completed work per team) and lists of items that need the owner.
- **Kanban board** for task assignment, alongside the existing list view.
- **Leave evidence**: photo or PDF attached from the phone or the desktop (max 5 MB, type checked by content); mandatory for sick leave of two days or more; opened from the leave list. API: `attachment` on `POST /api/leaves` and `GET /api/leaves/{id}/attachment`.
- **Live activity**: toasts, sound, taskbar flash and red counters when staff act on their phones.
- Settings: phone connection self-test, one-click firewall rule for the API port, and a DX-OS core connection check (Keycloak discovery and the `app_staff_work` schema).
- `TEASTAFF_DATA` environment variable to choose the data folder.

### Changed
- Databases created by 1.0.0 gain the new leave columns on start-up (`database/postgres/002_leave_attachments.sql` for PostgreSQL).
- Leave dates in the API are parsed strictly as `yyyy-MM-dd`.

## [1.0.0] - 2026-11-16

### Added
- WPF desktop app (MVVM) for cooperative owners: dashboard, employees, teams, task assignment, attendance timesheet, leave approval, payroll and settings.
- Payroll engine: prorated monthly salary or daily wage, overtime, allowance, bonus, compulsory insurance, deductions and advances; Draft → Approved → Paid workflow.
- Built-in REST API for the Tea Work Android app (login, tasks, check-in/out, leave, payslips) with live refresh of the desktop screens.
- Persistence adapters for SQLite (offline) and PostgreSQL schema `app_staff_work` (OpenTea DX-OS core); generated DDL in `database/postgres/001_init.sql`.
- Sign-in with a local owner account or the shared OpenTea DX-OS Keycloak account.
- CSV export (UTF-8 with BOM) for employees, tasks, timesheets and payroll.
- Command-line modes `--serve`, `--screenshots` and `--postgres-script`.
- Demo cooperative seeded on first run; xUnit tests for payroll and the task state machine.

[1.3.0]: https://github.com/Vudinhdat02/appManageStaff/releases/tag/v1.3.0
[1.2.0]: https://github.com/Vudinhdat02/appManageStaff/releases/tag/v1.2.0
[1.1.0]: https://github.com/Vudinhdat02/appManageStaff/releases/tag/v1.1.0
[1.0.0]: https://github.com/Vudinhdat02/appManageStaff/releases/tag/v1.0.0
