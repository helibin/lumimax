ALTER TABLE public.meal_items
  ADD COLUMN IF NOT EXISTS food_id varchar(36),
  ADD COLUMN IF NOT EXISTS query_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS recognition_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS result_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS raw_candidates jsonb,
  ADD COLUMN IF NOT EXISTS selected_candidate jsonb;

CREATE INDEX IF NOT EXISTS idx_meal_items_food_id ON public.meal_items USING btree (food_id);
