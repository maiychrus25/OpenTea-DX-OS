# Story 1.5f: Keycloak Realm Configuration & Auto-Import

Status: ready-for-dev

## Story

As a developer setting up the development environment,
I want a pre-configured Keycloak realm JSON that auto-imports on `docker compose up`,
so that all roles, test users, and auth flows are available without manual Keycloak admin configuration.

## Acceptance Criteria

1. Realm `agrimarket` auto-imports via Keycloak `--import-realm` flag on `docker compose up`
2. Realm has 3 realm roles: `manager`, `officer`, `farmer`
3. Client `nextjs-web` configured: `client_id`, redirect URIs `http://localhost:3000/api/auth/callback/keycloak`, confidential
4. 3 test users created: `manager1` (role: manager), `officer1` (role: officer), `farmer1` (role: farmer) with password `Test1234!`
5. WebAuthn (Passkeys) authentication flow enabled as primary
6. PIN fallback flow enabled (6-digit browser PIN)
7. Realm JSON committed to `docker/keycloak/agrimarket-realm.json`

## Tasks / Subtasks

- [ ] Create `docker/keycloak/agrimarket-realm.json` (AC: 1, 2, 3, 4, 5, 6, 7)
  - [ ] Export from a running Keycloak or write JSON manually
  - [ ] Include realm settings: `displayName`, `enabled: true`, `sslRequired: external`
  - [ ] Include client `nextjs-web` with correct secret and redirect URIs
  - [ ] Include roles: manager, officer, farmer
  - [ ] Include 3 test users with role mappings
  - [ ] Include WebAuthn authenticator config
- [ ] Verify `docker-compose.yml` Keycloak command includes `--import-realm` (AC: 1)
  - [ ] Check if `--import-realm` flag is present in Keycloak service command
  - [ ] Check volume mount: `/opt/keycloak/data/import` mapped to `./keycloak/`
- [ ] Add test user credentials to `.env.example` as comments (AC: 4)

## Dev Notes

### Keycloak Auto-Import Setup
```yaml
# In docker-compose.yml, Keycloak service should have:
command: start-dev --import-realm
volumes:
  - ./keycloak:/opt/keycloak/data/import
```

### Realm JSON Minimal Structure
```json
{
  "realm": "agrimarket",
  "enabled": true,
  "clients": [{
    "clientId": "nextjs-web",
    "secret": "${KEYCLOAK_CLIENT_SECRET}",
    "redirectUris": ["http://localhost:3000/api/auth/callback/keycloak"],
    "webOrigins": ["http://localhost:3000"]
  }],
  "roles": { "realm": [
    {"name": "manager"}, {"name": "officer"}, {"name": "farmer"}
  ]},
  "users": [...]
}
```

### Security Note
- Client secret in realm JSON should use placeholder `${KEYCLOAK_CLIENT_SECRET}` to match env var
- Test user passwords are for development only — document this clearly

### Project Structure Notes
- Realm JSON goes in `docker/keycloak/` (next to `docker-compose.yml`)
- Do NOT hardcode admin credentials in realm JSON — only user accounts

### References
- [Source: docker/docker-compose.yml — Keycloak service configuration]
- [Source: .env.example — Environment variables]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

### Completion Notes List

### File List
- `docker/keycloak/agrimarket-realm.json` (NEW)
- `docker/docker-compose.yml` (VERIFY/MODIFY if --import-realm missing)
- `.env.example` (MODIFY — add test user comment)
