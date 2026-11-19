# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/Vudinhdat02/appManageStaff/releases/tag/v1.0.0
