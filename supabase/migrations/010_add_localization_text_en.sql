-- Add English translation column to the localizations table.
-- localization_text     = Georgian (existing)
-- localization_text_en  = English (new, nullable — code defaults used when absent)
ALTER TABLE localizations ADD COLUMN IF NOT EXISTS localization_text_en TEXT;
