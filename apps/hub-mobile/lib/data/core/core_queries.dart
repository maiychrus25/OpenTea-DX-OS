// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// GraphQL documents for the core ("Lõi") read model of the staff screens.
//
// Every root field and column below exists in `platform/hasura/metadata/databases/default/tables/*.yaml`
// (public_<table>.yaml) and in `apps/web/prisma/schema.prisma`, and is selectable by the roles
// farmer, manager and officer (`select_permissions`, columns '*'). The web app reads the same fields
// in `apps/web/src/infrastructure/core/gateway-*-reader.ts`.
//
// What Hasura already filters for the caller (row permissions, the real guard):
//   htx_profiles   manager/officer: htx_code = X-Hasura-Htx-Code; farmer: profile of own household
//   households     manager/officer: HTX of the token; farmer: keycloak_user_id = X-Hasura-User-Id
//   parcels, journal_entries, parcel_crop_cycles: through household -> same rules
//   lots           manager/officer: HTX of the token; farmer: lots that contain an own parcel
//   notifications  recipient_id = X-Hasura-User-Id for all three roles (HTX broadcasts with
//                  recipient_id null are therefore not visible through Hasura)
// No write permission exists for these roles, so there is no mutation here.

/// Page size of the lists. The phone shows recent rows; paging is not built yet.
const coreListLimit = 200;

const htxProfileQuery = r'''
query HtxProfile {
  htx_profiles(limit: 1) {
    id htx_code name address contact_phone contact_email crop_types season_label total_area_ha
  }
}''';

const householdsQuery = r'''
query Households($limit: Int!) {
  households(order_by: { created_at: desc }, limit: $limit) {
    id name phone address keycloak_user_id created_at
  }
}''';

const parcelsQuery = r'''
query Parcels($where: parcels_bool_exp!, $limit: Int!) {
  parcels(where: $where, order_by: { created_at: desc }, limit: $limit) {
    id parcel_code household_id area_ha crop_type status estimated_yield_per_ha
    household { id name address }
    crop_cycles(order_by: { created_at: desc }, limit: 1) {
      season sowed_at harvested_at estimated_harvest_date
    }
  }
}''';

const journalQuery = r'''
query JournalEntries($where: journal_entries_bool_exp!, $limit: Int!) {
  journal_entries(where: $where, order_by: { entry_date: desc }, limit: $limit) {
    id parcel_id entry_date activity_type performed_by status notes created_at
    activities(order_by: { created_at: asc }) {
      id activity_detail product_name dosage withdrawal_days safe_harvest_date
    }
    parcel { id parcel_code crop_type household_id }
  }
}''';

const lotsQuery = r'''
query Lots($limit: Int!) {
  lots(order_by: { created_at: desc }, limit: $limit) {
    id lot_code commodity quality_grade harvest_date estimated_weight_kg actual_weight_kg
    total_weight_kg packaging_type destination buyer_name status
    lot_parcels { id parcel { parcel_code } }
  }
}''';

const notificationsQuery = r'''
query Notifications($limit: Int!) {
  notifications(order_by: { created_at: desc }, limit: $limit) {
    id type title body is_read created_at household_id
  }
}''';
