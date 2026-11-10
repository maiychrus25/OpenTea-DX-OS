-- SPDX-License-Identifier: MIT
-- SPDX-FileCopyrightText: 2026 OpenTea Developers
-- Two HTXs (TC, LB) for row-level permission tests. Re-runnable: removes its own rows first.
-- TC and LB may also hold the demo seed (npm run seed): the profiles are shared and kept, the rows below are the fixture's own.
delete from households where id='hh_none_1';
delete from htx_profiles where id='htx_none';
delete from lot_parcels where id in ('lp_tc_1','lp_lb_1');
delete from lots where id in ('lot_tc_1','lot_lb_1');
delete from parcels where id in ('pc_tc_1','pc_tc_2','pc_lb_1');
delete from households where id in ('hh_tc_1','hh_tc_2','hh_lb_1');

insert into htx_profiles (id, name, address, crop_types, htx_code, updated_at) values
  ('htx_tc', 'HTX Tan Cuong', 'Thai Nguyen', '{}', 'TC', now()),
  ('htx_lb', 'HTX La Bang', 'Thai Nguyen', '{}', 'LB', now())
  on conflict (htx_code) do nothing;
insert into households (id, name, phone, htx_profile_id, updated_at) values
  ('hh_tc_1', 'Household TC 1', '0900000001', (select id from htx_profiles where htx_code = 'TC'), now()),
  ('hh_tc_2', 'Household TC 2', '0900000002', (select id from htx_profiles where htx_code = 'TC'), now()),
  ('hh_lb_1', 'Household LB 1', '0900000003', (select id from htx_profiles where htx_code = 'LB'), now());
insert into parcels (id, parcel_code, household_id, crop_type, area_ha, updated_at) values
  ('pc_tc_1', 'P-TC-001', 'hh_tc_1', 'Chè Trung du', 0.5, now()),
  ('pc_tc_2', 'P-TC-002', 'hh_tc_2', 'Chè Trung du', 0.5, now()),
  ('pc_lb_1', 'P-LB-001', 'hh_lb_1', 'Chè Trung du', 0.5, now());
insert into lots (id, lot_code, commodity, harvest_date, htx_profile_id, updated_at) values
  ('lot_tc_1', 'TC-LOT-001', 'Chè', now(), (select id from htx_profiles where htx_code = 'TC'), now()),
  ('lot_lb_1', 'LB-LOT-001', 'Chè', now(), (select id from htx_profiles where htx_code = 'LB'), now());
insert into lot_parcels (id, lot_id, parcel_id) values
  ('lp_tc_1', 'lot_tc_1', 'pc_tc_1'),
  ('lp_lb_1', 'lot_lb_1', 'pc_lb_1');
-- Empty-code HTX: must never match a manager whose token has no htx_code.
insert into htx_profiles (id, name, address, crop_types, htx_code, updated_at) values ('htx_none', 'HTX No Code', 'Nowhere', '{}', '', now());
insert into households (id, name, phone, htx_profile_id, updated_at) values ('hh_none_1', 'Household None 1', '0900000004', 'htx_none', now());
