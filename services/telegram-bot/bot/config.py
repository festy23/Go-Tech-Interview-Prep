from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    telegram_bot_token: str
    api_base_url: str = "https://golangtest-ten.vercel.app/api"
    api_secret_key: str
    redis_url: str = "redis://redis:6379"
    daily_question_hour: int = 10
    daily_question_minute: int = 0
    reminder_hour: int = 19
    reminder_minute: int = 0

    model_config = {"env_file": ".env"}


settings = Settings()
