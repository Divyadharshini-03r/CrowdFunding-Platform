ALTER TABLE public.projects
  ADD COLUMN refund_deadline timestamptz;

-- Backfill: refund window = project deadline + 14 days
UPDATE public.projects
SET refund_deadline = deadline + interval '14 days'
WHERE refund_deadline IS NULL;