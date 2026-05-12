ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS locale varchar(16),
  ADD COLUMN IF NOT EXISTS market varchar(8),
  ADD COLUMN IF NOT EXISTS country_code varchar(16);
