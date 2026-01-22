-- Add priority field to Task table for task ordering
ALTER TABLE "Task" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Set existing tasks priority based on creation order (oldest = highest priority)
WITH ranked_tasks AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "createdAt" ASC) - 1 as rn
  FROM "Task"
)
UPDATE "Task" SET "priority" = ranked_tasks.rn
FROM ranked_tasks
WHERE "Task".id = ranked_tasks.id;
