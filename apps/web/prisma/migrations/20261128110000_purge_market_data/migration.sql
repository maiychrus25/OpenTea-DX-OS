-- Remove market_data rows written by the five deleted fake or off-domain workflows,
-- and COMTRADE rows that are not tea. Matches only the exact source and commodity values below.
-- Irreversible by design: the rows are simulated or outside the tea domain.

DELETE FROM "market_data" WHERE "source" IN (
  'Mô phỏng (Toàn quốc)', -- vietnam_market_sync.json (random simulated prices)
  'WorldBank',            -- worldbank_sync.json (cereal yield and production)
  'FAOSTAT',              -- faostat_sync.json (crop and food production indices)
  'NASA',                 -- nasa_power_sync.json (hard-coded temperature)
  'WTO'                   -- wto_tariffs.json (MFN import tariff)
);

-- comtrade_export_sync.json now fetches HS 0902 (tea) only; commodity is stored as 'Tea'.
DELETE FROM "market_data" WHERE "source" = 'COMTRADE' AND "commodity" <> 'Tea';
