-- Remember each account's CSV column mapping so repeat imports are one click.

ALTER TABLE accounts ADD COLUMN import_mapping JSONB;
