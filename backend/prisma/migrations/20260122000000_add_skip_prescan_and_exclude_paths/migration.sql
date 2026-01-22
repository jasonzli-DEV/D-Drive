-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "skipPrescan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "excludePaths" TEXT[] DEFAULT ARRAY[]::TEXT[];
