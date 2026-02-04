-- CreateTable
CREATE TABLE "PublicLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicLink_slug_key" ON "PublicLink"("slug");

-- CreateIndex
CREATE INDEX "PublicLink_userId_idx" ON "PublicLink"("userId");

-- CreateIndex
CREATE INDEX "PublicLink_fileId_idx" ON "PublicLink"("fileId");

-- CreateIndex
CREATE INDEX "PublicLink_slug_idx" ON "PublicLink"("slug");

-- AddForeignKey
ALTER TABLE "PublicLink" ADD CONSTRAINT "PublicLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicLink" ADD CONSTRAINT "PublicLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
