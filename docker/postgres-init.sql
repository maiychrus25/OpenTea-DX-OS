-- docker/postgres-init.sql
CREATE DATABASE keycloak;

-- Keycloak requires its own db and user
CREATE USER keycloak WITH PASSWORD 'keycloak';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;

-- agrimarket db and user
-- The default user from POSTGRES_USER will have access to agrimarket, 
-- but we can explicitly create it if needed.
-- Since docker-compose sets POSTGRES_USER=agrimarket, it already exists.
GRANT ALL PRIVILEGES ON DATABASE agrimarket TO agrimarket;
