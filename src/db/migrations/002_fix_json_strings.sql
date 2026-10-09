-- JSON values written through postgres.js with a `::jsonb` parameter cast were double-encoded
-- (stored as a JSON string holding the object). Unwrap them in place.
UPDATE alerts SET payload = (payload #>> '{}')::jsonb WHERE jsonb_typeof(payload) = 'string';
UPDATE worker_state SET value = (value #>> '{}')::jsonb WHERE jsonb_typeof(value) = 'string';
UPDATE settings SET value = (value #>> '{}')::jsonb WHERE jsonb_typeof(value) = 'string';
