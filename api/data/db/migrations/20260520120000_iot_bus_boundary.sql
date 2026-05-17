ALTER TABLE public.iot_messages
  ADD COLUMN IF NOT EXISTS provider varchar(32),
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0 NOT NULL;
