# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-20

### Added
- Leave evidence: take a photo or pick an image/PDF; photos are rotated upright, scaled to 1600 px and sent as JPEG. Required for sick leave of two days or more.
- The task and leave tabs refresh quietly every 30 seconds and announce new tasks and leave decisions.
- A banner shows when the app runs on offline demo data, so nothing is mistaken for being sent to the owner.

### Changed
- R8 keeps the API models and serializers explicitly.

## [1.0.0] - 2026-11-16

### Added
- Jetpack Compose app (MVVM) for cooperative staff: tasks, attendance, leave, payslips and profile.
- Task workflow: accept, reject with a reason, start, report progress and complete.
- One-tap check-in/check-out with live clock and monthly attendance summary.
- Leave requests with date pickers, remaining annual leave and cancellation of pending requests.
- Payslip list with full salary breakdown.
- HTTP client for the Tea Staff Manager staff API and an offline demo mode with sample data.
- Robolectric UI walkthrough test that also produces the README screenshots, and an API contract test against a running desktop server.

[1.1.0]: https://github.com/Vudinhdat02/appReceiveWork/releases/tag/v1.1.0
[1.0.0]: https://github.com/Vudinhdat02/appReceiveWork/releases/tag/v1.0.0
