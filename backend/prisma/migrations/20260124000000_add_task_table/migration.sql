-- CreateEnum
CREATE TYPE "CompressFormat" AS ENUM ('NONE', 'ZIP', 'TAR_GZ');

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cron" TEXT NOT NULL,
    "sftpHost" TEXT NOT NULL,
    "sftpPort" INTEGER NOT NULL DEFAULT 22,
    "sftpUser" TEXT NOT NULL,
    "sftpPath" TEXT NOT NULL,
    "sftpPrivateKey" TEXT,
    "sftpPassword" TEXT,
    "authPassword" BOOLEAN NOT NULL DEFAULT false,
    "authPrivateKey" BOOLEAN NOT NULL DEFAULT true,
    "destinationId" TEXT,
    "destinationPath" TEXT,
    "compress" "CompressFormat" NOT NULL DEFAULT 'NONE',
    "compressFiles" BOOLEAN NOT NULL DEFAULT true,
    "timestampNames" BOOLEAN NOT NULL DEFAULT true,
    "maxFiles" INTEGER NOT NULL DEFAULT 0,
    "encrypt" BOOLEAN NOT NULL DEFAULT false,
    "skipPrescan" BOOLEAN NOT NULL DEFAULT false,
    "excludePaths" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRun" TIMESTAMP(3),
    "lastStarted" TIMESTAMP(3),
    "lastRuntime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_userId_idx" ON "Task"("userId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
