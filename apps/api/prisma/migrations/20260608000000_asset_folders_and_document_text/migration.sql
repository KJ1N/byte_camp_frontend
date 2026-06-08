-- CreateTable
CREATE TABLE "asset_folders" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_folders_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "asset_folders_authorId_kind_idx" ON "asset_folders"("authorId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "asset_folders_authorId_kind_name_key" ON "asset_folders"("authorId", "kind", "name");

-- CreateIndex
CREATE INDEX "assets_folderId_idx" ON "assets"("folderId");

-- AddForeignKey
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "asset_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
