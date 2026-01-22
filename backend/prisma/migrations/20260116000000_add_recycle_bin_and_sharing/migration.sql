-- Add recycle bin fields to File table
ALTER TABLE "File" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "File" ADD COLUMN "originalPath" TEXT;

-- Add user settings
ALTER TABLE "User" ADD COLUMN "recycleBinEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "allowSharedWithMe" BOOLEAN NOT NULL DEFAULT true;

-- Create SharePermission enum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'EDIT', 'ADMIN');

-- Create Share table
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX "File_deletedAt_idx" ON "File"("deletedAt");
CREATE INDEX "Share_ownerId_idx" ON "Share"("ownerId");
CREATE INDEX "Share_sharedWithId_idx" ON "Share"("sharedWithId");
CREATE INDEX "Share_fileId_idx" ON "Share"("fileId");
CREATE UNIQUE INDEX "Share_fileId_sharedWithId_key" ON "Share"("fileId", "sharedWithId");

-- Add foreign keys
ALTER TABLE "Share" ADD CONSTRAINT "Share_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Share" ADD CONSTRAINT "Share_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
