# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Pins the Keycloak identity policy in the agrimarket realm import file."""
import json
import unittest
from pathlib import Path

REALM_PATH = Path(__file__).resolve().parents[2] / "docker/keycloak/realm-agrimarket.json"
REALM = json.loads(REALM_PATH.read_text(encoding="utf-8"))


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

    def test_staff_require_totp(self):
        for name in ("manager1", "officer1"):
            user = by_key(REALM["users"], "username", name)
            self.assertIn("CONFIGURE_TOTP", user.get("requiredActions", []), name)
            self.assertEqual(user.get("attributes", {}).get("htx_code"), ["MD2"], name)
        farmer = by_key(REALM["users"], "username", "farmer1")
        self.assertNotIn("CONFIGURE_TOTP", farmer.get("requiredActions", []))

    def test_otp_policy(self):
        self.assertEqual(REALM.get("otpPolicyType"), "totp")
        self.assertEqual(REALM.get("otpPolicyDigits"), 6)
        self.assertEqual(REALM.get("otpPolicyPeriod"), 30)


if __name__ == "__main__":
    unittest.main()
