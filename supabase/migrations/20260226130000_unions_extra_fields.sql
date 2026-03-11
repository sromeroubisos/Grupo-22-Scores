-- Add missing columns to unions
ALTER TABLE "public"."unions"
ADD COLUMN IF NOT EXISTS "sport" text,
ADD COLUMN IF NOT EXISTS "union_level" text, -- e.g. 'Nacional', 'Regional'
ADD COLUMN IF NOT EXISTS "parent_union_id" text REFERENCES "public"."unions"("id");

-- Update RLS if needed, although it's probably standard
