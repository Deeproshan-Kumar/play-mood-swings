/*
  Warnings:

  - You are about to drop the `YouTubeConnection` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "YouTubeConnection" DROP CONSTRAINT "YouTubeConnection_connectedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "YouTubeConnection" DROP CONSTRAINT "YouTubeConnection_coupleId_fkey";

-- AlterTable
ALTER TABLE "Couple" ADD COLUMN     "playlistLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "playlistSyncError" TEXT,
ADD COLUMN     "playlistSyncStatus" "SyncStatus" NOT NULL DEFAULT 'IDLE';

-- DropTable
DROP TABLE "YouTubeConnection";
