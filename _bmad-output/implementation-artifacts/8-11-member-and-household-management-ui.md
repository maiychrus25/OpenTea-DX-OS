# Story 8.11: Member, Household & Invitation Management UI

Status: ready-for-dev
Epic: 8 — FE Prototype Reconstruction
Phase: FE prototype

## Story

As a Manager or Officer, I want member and household list/detail screens with invitations and production history, so that the farm setup wizard is not the only entry point for household data.

## Acceptance Criteria

1. Manager sees member list, role/status filters and invitation CTA; Officer sees household list, profile, parcel count and production history.
2. Add/edit/delete and invite flows include confirmation, validation, pending/active/locked states and explicit permission messages.
3. Household detail links to its parcels, journal history and disease history without exposing another HTX.
4. Mobile list/detail and empty/loading/error/retry states follow DESIGN.md.
5. This story uses mock fixtures only and does not claim persistence or authorization completion.

Dependencies: 0.1, 3.1, 8.5.
Follow-up: member/invitation and household API integration story required.
