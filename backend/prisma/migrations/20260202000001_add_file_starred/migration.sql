-- Add starred column to File table
ALTER TABLE "File" ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;

-- Add index for starred files
CREATE INDEX "File_starred_idx" ON "File"("starred");
