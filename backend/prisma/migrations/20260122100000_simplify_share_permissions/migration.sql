-- Simplify share permissions to VIEW and EDIT only
-- Convert any ADMIN permissions to EDIT
UPDATE "Share" SET "permission" = 'EDIT' WHERE "permission" = 'ADMIN';

-- Remove ADMIN from enum (PostgreSQL requires recreating the enum)
-- First drop the default constraint
ALTER TABLE "Share" ALTER COLUMN "permission" DROP DEFAULT;

-- Create a new enum
CREATE TYPE "SharePermission_new" AS ENUM ('VIEW', 'EDIT');

-- Update the column to use the new enum
ALTER TABLE "Share" 
  ALTER COLUMN "permission" TYPE "SharePermission_new" 
  USING ("permission"::text::"SharePermission_new");

-- Drop the old enum
DROP TYPE "SharePermission";

-- Rename the new enum to the original name
ALTER TYPE "SharePermission_new" RENAME TO "SharePermission";

-- Re-add the default
ALTER TABLE "Share" ALTER COLUMN "permission" SET DEFAULT 'VIEW'::"SharePermission";
