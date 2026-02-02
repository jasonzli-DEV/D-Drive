-- Add theme column to User table
ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'auto';
