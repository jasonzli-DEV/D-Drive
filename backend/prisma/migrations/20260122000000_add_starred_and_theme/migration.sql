-- Add starred field to File
ALTER TABLE "File" ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;

-- Add theme preference to User
ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'auto';

-- Create index for starred files
CREATE INDEX "File_starred_idx" ON "File"("starred");
