-- Copyright (c) 2026 OpenTea Developers
-- Licensed under the MIT License. See LICENSE file in the project root for full license information.

-- docker/postgres-init.sql
CREATE DATABASE keycloak;

-- Keycloak requires its own db and user
CREATE USER keycloak WITH PASSWORD 'keycloak';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;

\connect keycloak
GRANT USAGE, CREATE ON SCHEMA public TO keycloak;

\connect postgres

-- agrimarket db and user
-- The default user from POSTGRES_USER will have access to agrimarket, 
-- but we can explicitly create it if needed.
-- Since docker-compose sets POSTGRES_USER=agrimarket, it already exists.
GRANT ALL PRIVILEGES ON DATABASE agrimarket TO agrimarket;
