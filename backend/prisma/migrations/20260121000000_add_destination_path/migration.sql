-- AlterTable: Add destinationPath to Task to remember original path when folder is deleted
ALTER TABLE "Task" ADD COLUMN "destinationPath" TEXT;
