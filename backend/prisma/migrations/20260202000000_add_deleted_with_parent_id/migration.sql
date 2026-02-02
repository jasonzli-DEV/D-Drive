-- AlterTable
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "deletedWithParentId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "File_deletedWithParentId_idx" ON "File"("deletedWithParentId");
