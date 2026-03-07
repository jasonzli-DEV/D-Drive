-- AlterTable: add cacheScanSize and lastScanSize columns missing from Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "cacheScanSize" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastScanSize" BIGINT;
