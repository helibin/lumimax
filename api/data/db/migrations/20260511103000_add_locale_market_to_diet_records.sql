ALTER TABLE public.meal_records
  ADD COLUMN IF NOT EXISTS locale varchar(16),
  ADD COLUMN IF NOT EXISTS market varchar(8);

ALTER TABLE public.meal_items
  ADD COLUMN IF NOT EXISTS locale varchar(16),
  ADD COLUMN IF NOT EXISTS market varchar(8);

ALTER TABLE public.recognition_logs
  ADD COLUMN IF NOT EXISTS locale varchar(16),
  ADD COLUMN IF NOT EXISTS market varchar(8);
