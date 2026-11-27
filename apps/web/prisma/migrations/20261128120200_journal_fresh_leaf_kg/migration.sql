-- Fresh tea leaf harvested, in kg; set only on HARVEST activities.
ALTER TABLE "journal_activities" ADD COLUMN "fresh_leaf_kg" DOUBLE PRECISION;
