# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Credential loading: one malformed file skips only its own cooperative and never logs values."""
import logging

from dxos_agent.client import load_all_agent_credentials

GOOD_ENV = "DXOS_AGENT_HTX=TC01\nDXOS_AGENT_CLIENT_ID=agent-tc01\nDXOS_AGENT_CLIENT_SECRET=good-secret\n"


def test_malformed_credential_file_is_skipped_and_only_its_name_is_logged(tmp_path, caplog):
    (tmp_path / "a_good.env").write_text(GOOD_ENV, encoding="utf-8")
    (tmp_path / "b_broken.env").write_text(
        "DXOS_AGENT_HTX=TC02\nDXOS_AGENT_CLIENT_SECRET=leaky-value\n", encoding="utf-8"
    )
    (tmp_path / "c_binary.env").write_bytes(b"\xff\xfe\x00leaky-binary")
    (tmp_path / "d_good.env").write_text(
        GOOD_ENV.replace("TC01", "TC03").replace("agent-tc01", "agent-tc03"), encoding="utf-8"
    )

    with caplog.at_level(logging.WARNING, logger="dxos_agent"):
        creds = load_all_agent_credentials(tmp_path)

    assert [c.htx_code for c in creds] == ["TC01", "TC03"]
    assert "b_broken.env" in caplog.text
    assert "c_binary.env" in caplog.text
    assert "leaky" not in caplog.text
    assert "good-secret" not in caplog.text
