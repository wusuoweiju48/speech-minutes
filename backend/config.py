from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    zhipuai_api_key: str = ""
    whisper_model_size: str = "base"
    simulation_mode: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
