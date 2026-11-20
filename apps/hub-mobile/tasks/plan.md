# HTX-owned tours and assigned guides

Owner decisions in the task supersede the earlier company model. Work stays inside hub-mobile; no commit, push, checkout, reset or stash.

1. Identity and tour contract: rename role/routes/demo to guide, manager/officer priority first. Add GuideStaff, tour guideIds and validated manager mutations. Scope bookings by HTX and assigned tour. Test role priority, assignments, cross-HTX denial, guide check-in and payment denial.
2. Manager tour flow: reuse booking detail/list/payment widgets, scoped to HTX; add tour editor and guide picker/add/remove. Officers see read-only pages. Verify create/edit/assign/remove end to end.
3. Guide flow: assigned departures grouped upcoming/past; HTX attribution, guest list, contact and confirmed-group check-in only. Keep StaffShell/Reels/account/chat; remove company-only pages and APIs. Verify direct navigation cannot expose unassigned tours.
4. Migration coverage: update existing tests to relocated manager behavior, remove only tests for explicitly retired company features, add replacement guide coverage and every pushed route to back audit. Update README and system documentation in allowed scope.
5. Verification: pub get before format (120 columns), analyze, full test suite, two desktop/mobile stress rounds at 320px and 130% text, inspect actual diff and forbidden-name grep. Report exact outputs and platform limitations.

No new dependencies. Reuse LoadView, DetailScaffold, StaffColors, staff components and existing booking state transitions. Preserve product-order and customer payment behavior. Mock tour authorization mirrors future server rules; HTTP still delegates storefront data to Mock.
