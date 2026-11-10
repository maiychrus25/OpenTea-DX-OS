# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Pins the Keycloak identity policy in the agrimarket realm import file."""
import json
import unittest
from pathlib import Path

REALM_PATH = Path(__file__).resolve().parents[2] / "docker/keycloak/realm-agrimarket.json"
REALM = json.loads(REALM_PATH.read_text(encoding="utf-8"))
DEMO_USERS = {
    "manager_tc": ("manager", "TC"),
    "officer_tc": ("officer", "TC"),
    "farmer_tc": ("farmer", "TC"),
    "manager_lb": ("manager", "LB"),
    "officer_lb": ("officer", "LB"),
    "farmer_lb": ("farmer", "LB"),
}


def by_key(items, key, value):
    return next(item for item in items if item[key] == value)


class RealmPolicyTest(unittest.TestCase):
    def test_password_grant_disabled_for_web_client(self):
        client = by_key(REALM["clients"], "clientId", "nextjs-web")
        self.assertIs(client["directAccessGrantsEnabled"], False)

    def test_core_scope_has_audience_and_htx_code_mappers(self):
        scope = by_key(REALM.get("clientScopes", []), "name", "dx-os-core")
        self.assertEqual(scope["protocol"], "openid-connect")
        audience = by_key(scope["protocolMappers"], "name", "audience-dx-os-core")
        self.assertEqual(audience["protocolMapper"], "oidc-audience-mapper")
        self.assertEqual(audience["config"]["included.custom.audience"], "dx-os-core")
        self.assertEqual(audience["config"]["access.token.claim"], "true")
        self.assertEqual(audience["config"]["id.token.claim"], "false")
        htx = by_key(scope["protocolMappers"], "name", "htx-code")
        self.assertEqual(htx["protocolMapper"], "oidc-usermodel-attribute-mapper")
        self.assertEqual(htx["config"]["user.attribute"], "htx_code")
        self.assertEqual(htx["config"]["claim.name"], "htx_code")
        self.assertEqual(htx["config"]["jsonType.label"], "String")
        self.assertEqual(htx["config"]["access.token.claim"], "true")
        self.assertEqual(htx["config"]["id.token.claim"], "false")

    def test_web_client_uses_core_scope(self):
        client = by_key(REALM["clients"], "clientId", "nextjs-web")
        self.assertIn("dx-os-core", client.get("defaultClientScopes", []))

    def test_demo_users_belong_to_their_cooperative(self):
        for name, (role, code) in DEMO_USERS.items():
            user = by_key(REALM["users"], "username", name)
            self.assertEqual(user.get("realmRoles"), [role], name)
            self.assertEqual(user.get("attributes", {}).get("htx_code"), [code], name)

    def test_staff_require_totp(self):
        for name, (role, _) in DEMO_USERS.items():
            user = by_key(REALM["users"], "username", name)
            if role == "farmer":
                self.assertNotIn("CONFIGURE_TOTP", user.get("requiredActions", []), name)
            else:
                self.assertIn("CONFIGURE_TOTP", user.get("requiredActions", []), name)

    def test_rice_demo_users_removed(self):
        names = {user["username"] for user in REALM["users"]}
        self.assertFalse(names & {"manager1", "officer1", "farmer1"}, names)

    def test_no_realm_user_takes_a_smoke_name(self):
        # Smoke tests reset the password and required actions of the smoke_ users they own.
        names = [user["username"] for user in REALM["users"] if user["username"].startswith("smoke_")]
        self.assertEqual(names, [])

    def test_no_realm_role_maps_to_hasura_superuser(self):
        # Hasura treats the role name "admin" as superuser and takes allowed roles from realm_access.roles.
        names = {role["name"].lower() for role in REALM["roles"]["realm"]}
        self.assertFalse(names & {"admin", "hasura-admin"}, names)

    def test_sso_session_matches_app_session(self):
        self.assertEqual(REALM.get("ssoSessionIdleTimeout"), 28800)
        self.assertEqual(REALM.get("ssoSessionMaxLifespan"), 28800)

    def test_refresh_tokens_are_not_single_use(self):
        # Concurrent requests refresh with the same token; a rotated token would end the session of the loser.
        self.assertFalse(REALM.get("revokeRefreshToken", False))

    def test_otp_policy(self):
        self.assertEqual(REALM.get("otpPolicyType"), "totp")
        self.assertEqual(REALM.get("otpPolicyDigits"), 6)
        self.assertEqual(REALM.get("otpPolicyPeriod"), 30)

    def test_account_attributes_declared_admin_only(self):
        # Keycloak drops undeclared attributes on Admin API writes, and the web app writes these on every new account.
        components = REALM["components"]["org.keycloak.userprofile.UserProfileProvider"]
        profile = json.loads(components[0]["config"]["kc.user.profile.config"][0])
        for name in ("fullName", "htxId", "phone"):
            attr = by_key(profile["attributes"], "name", name)
            self.assertEqual(attr["permissions"], {"view": ["admin"], "edit": ["admin"]}, name)
            self.assertNotIn("required", attr, name)

    def test_htx_code_declared_admin_only(self):
        components = REALM["components"]["org.keycloak.userprofile.UserProfileProvider"]
        profile = json.loads(components[0]["config"]["kc.user.profile.config"][0])
        self.assertNotIn("unmanagedAttributePolicy", profile)
        names = [a["name"] for a in profile["attributes"]]
        for default in ("username", "email", "firstName", "lastName"):
            self.assertIn(default, names)
        attr = by_key(profile["attributes"], "name", "htx_code")
        self.assertEqual(attr["permissions"]["edit"], ["admin"])
        self.assertEqual(attr["permissions"]["view"], ["admin"])
        self.assertFalse(attr.get("multivalued", False))
        self.assertFalse(attr.get("required"))


if __name__ == "__main__":
    unittest.main()
