-- Extend project_status enum with 'failed' and 'refunded' if not present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'failed' AND enumtypid = 'project_status'::regtype) THEN
    ALTER TYPE project_status ADD VALUE 'failed';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'refunded' AND enumtypid = 'project_status'::regtype) THEN
    ALTER TYPE project_status ADD VALUE 'refunded';
  END IF;
END $$;

CREATE TABLE public.refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  backer_id uuid NOT NULL,
  approve boolean NOT NULL,
  refunded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, backer_id)
);

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Refund votes viewable by everyone"
  ON public.refund_requests FOR SELECT USING (true);

CREATE POLICY "Backers cast refund votes"
  ON public.refund_requests FOR INSERT
  WITH CHECK (auth.uid() = backer_id);

CREATE POLICY "Backers update own refund vote"
  ON public.refund_requests FOR UPDATE
  USING (auth.uid() = backer_id);

CREATE POLICY "Backers delete own refund vote"
  ON public.refund_requests FOR DELETE
  USING (auth.uid() = backer_id);
