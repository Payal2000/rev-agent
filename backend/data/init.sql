-- Runs once when Postgres container starts (docker-compose init)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a read-only user for the Query Agent
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'revagent_readonly') THEN
        CREATE ROLE revagent_readonly WITH LOGIN PASSWORD 'readonly_pass';
    END IF;
END $$;

GRANT CONNECT ON DATABASE revagent TO revagent_readonly;
GRANT USAGE ON SCHEMA public TO revagent_readonly;
-- Grant SELECT only — Query Agent physically cannot write
GRANT SELECT ON ALL TABLES IN SCHEMA public TO revagent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO revagent_readonly;
