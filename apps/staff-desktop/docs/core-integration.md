# Connecting to the OpenTea DX-OS core

Out of the box Tea Staff Manager runs offline (SQLite + a local owner account). This guide moves it onto the DX-OS core so the cooperative uses **one account** (Keycloak SSO) and **one database** (PostgreSQL) across all of its apps, following the core's mini-app rules (`docs/miniapps.md` in the core repository).

## 1. Database: schema `app_staff_work`

The core gives each app its own role and schema, and every table must have `htx_code text NOT NULL`. As a database administrator of the core (`agrimarket` database):

```sql
CREATE ROLE app_staff_work LOGIN PASSWORD '<strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 10;
CREATE SCHEMA app_staff_work AUTHORIZATION app_staff_work;
```

Then, connected as `app_staff_work`, run [`database/postgres/001_init.sql`](../database/postgres/001_init.sql) — or let the app create the tables on first start. Regenerate the script after model changes with:

```bash
TeaStaffManager.exe --postgres-script database/postgres/001_init.sql
```

If the app is installed through `./dxos install`, put the script in the app's `migrations/` folder; the CLI runs it with the app role and checks the `htx_code` rule.

## 2. Single sign-on: Keycloak client

In the Keycloak admin console, realm `agrimarket`:

1. **Clients → Create client**: Client ID `staff-desktop`, client authentication **off** (public desktop client).
2. Enable **Direct access grants** (the desktop uses the OAuth2 password grant).
3. Under **Client scopes → staff-desktop-dedicated → Add mapper**, make sure the access token carries the `htx_code` user attribute (the core realm already defines this mapper for its own clients — reuse it) and audience `dx-os-core` if you will call the gateway.
4. Owners must have the realm role `manager` and an `htx_code` attribute. Accounts with mandatory TOTP cannot use the password grant; give the desktop owner a separate account or sign in on the web first to finish setup.

## 3. Switch the app over

Open **Settings → Kết nối lõi OpenTea DX-OS**:

| Field | Value |
| --- | --- |
| Đăng nhập bằng | Tài khoản chung OpenTea DX-OS (Keycloak) |
| Địa chỉ Keycloak | `http://<core-host>:8080` |
| Realm / Client ID | `agrimarket` / `staff-desktop` |
| Cơ sở dữ liệu | PostgreSQL của DX-OS |
| Chuỗi kết nối | `Host=<core-host>;Port=5432;Database=agrimarket;Username=app_staff_work;Password=<password>;Search Path=app_staff_work` |

Set **Mã HTX** to the cooperative's `htx_code` (for example `TC`) and restart the app. The values are stored in `%LOCALAPPDATA%\TeaStaff\config.json`.

## 4. Linking employees to DX-OS accounts

`employees.core_user_id` holds the Keycloak `sub` of a staff member. Once filled, the mobile API can accept Keycloak tokens instead of its own sessions (see the mapping section of [mobile-api.md](mobile-api.md)), so staff sign in to Tea Work with the same account they use for the DX-OS web app.

## What is not done yet

- The staff API is not yet packaged as a DX-OS mini-app container; it runs inside the desktop app (or headless with `--serve`).
- Reading core data (households, parcels) through Hasura to pre-fill task locations is planned.
