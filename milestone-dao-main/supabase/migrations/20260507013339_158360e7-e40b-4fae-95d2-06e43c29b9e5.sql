ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS ipfs_image_status text,
ADD COLUMN IF NOT EXISTS ipfs_description_status text;