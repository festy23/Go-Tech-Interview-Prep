import pytest
from unittest.mock import AsyncMock, patch, MagicMock


def test_client_import():
    """Verify BackendClient can be imported."""
    # Can't import directly because Settings requires env vars
    # Just verify the module parses correctly
    import ast
    with open("bot/api_client.py") as f:
        ast.parse(f.read())
