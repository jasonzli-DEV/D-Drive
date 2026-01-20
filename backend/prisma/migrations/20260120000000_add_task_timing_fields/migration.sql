-- AlterTable: Add timing fields to Task table
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastStarted" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "lastRuntime" INTEGER;
