-- Remove stale override that was overriding the correct code default.
-- The code default (DEFAULT_TRANSLATIONS) now has 'წესები' for admin.tab_terms.
-- The DB row 'წ. და პ.' was overriding it on every request.
DELETE FROM localizations WHERE keyword = 'admin.tab_terms';
