from __future__ import annotations

import aiohttp

from .config import settings


class BackendClient:
    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
    ):
        self._base_url = base_url or settings.api_base_url
        self._api_key = api_key or settings.api_secret_key
        self._session: aiohttp.ClientSession | None = None

    @property
    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self._api_key, "Content-Type": "application/json"}

    async def ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self._headers)
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, path: str, params: dict | None = None) -> dict:
        session = await self.ensure_session()
        async with session.get(f"{self._base_url}{path}", params=params) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def _post(self, path: str, json: dict | None = None) -> dict:
        session = await self.ensure_session()
        async with session.post(f"{self._base_url}{path}", json=json) as resp:
            resp.raise_for_status()
            return await resp.json()

    async def get_blocks(self, lang: str = "ru") -> list[dict]:
        result = await self._get("/internal/blocks", params={"lang": lang})
        return result["data"]

    async def get_random_questions(
        self, block_id: str, limit: int = 5, lang: str = "ru",
    ) -> list[dict]:
        result = await self._get(
            "/internal/questions/random",
            params={"blockId": block_id, "limit": str(limit), "lang": lang},
        )
        return result["data"]

    async def get_user_progress(self, user_id: str) -> dict:
        result = await self._get("/internal/progress", params={"userId": user_id})
        return result["data"]

    async def save_progress(
        self, user_id: str, session_id: str, block_id: str,
        quiz_id: int | None, score: int, total: int,
    ) -> dict:
        result = await self._post(
            "/internal/progress",
            json={
                "userId": user_id, "sessionId": session_id,
                "blockId": block_id, "quizId": quiz_id,
                "score": score, "total": total,
            },
        )
        return result["data"]

    async def get_user_activity(self, user_id: str) -> str | None:
        result = await self._get("/internal/user-activity", params={"userId": user_id})
        return result["data"].get("lastSeenAt")

    async def get_telegram_users(self) -> list[dict]:
        result = await self._get("/internal/users/telegram")
        return result["data"]
