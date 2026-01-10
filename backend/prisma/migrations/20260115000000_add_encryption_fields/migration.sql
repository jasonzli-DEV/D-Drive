-- AlterTable
ALTER TABLE "User" ADD COLUMN "encryptionKey" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
