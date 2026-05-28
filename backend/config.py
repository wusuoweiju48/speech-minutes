from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    zhipuai_api_key: str = ""
    whisper_model_size: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    simulation_mode: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
