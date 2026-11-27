-- Plucking pruning (Đốn chè). Alone in its own migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "ActivityType" ADD VALUE 'PRUNING';
