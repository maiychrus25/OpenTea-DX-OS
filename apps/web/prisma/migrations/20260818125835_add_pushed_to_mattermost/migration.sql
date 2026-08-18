-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "pushed_to_mattermost" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "notifications_pushed_to_mattermost_type_idx" ON "notifications"("pushed_to_mattermost", "type");
