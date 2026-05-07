from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "CuttingHelper"
    data_dir: Path = Path(__file__).parent.parent / "data"
    database_url: str = ""

    # social-auto-upload
    sau_base_dir: Path = Path(__file__).parent.parent / "social-auto-upload"

    # Gemini vision
    gemini_api_key: str = "AIzaSyC_J_HrWfkN-zZZm6m06NmzlV53GVlfyBA"
    gemini_model: str = "gemini-2.5-flash-lite"

    # Kling AI video generation
    kling_access_key: str = "AeYTGhTYNDbEkMpKgERb3MgPpNNbPEBn"
    kling_secret_key: str = "p4gga3G8GFhaG3GKyTPanrgKEhAMhANb"
    kling_model: str = "kling-v1-6"

    class Config:
        env_prefix = "CUTTING_HELPER_"

    def model_post_init(self, _):
        if not self.database_url:
            self.database_url = f"sqlite+aiosqlite:///{self.data_dir / 'cutting_helper.db'}"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        (self.data_dir / "frames").mkdir(exist_ok=True)
        (self.data_dir / "transitions").mkdir(exist_ok=True)
        (self.data_dir / "exports").mkdir(exist_ok=True)
        (self.data_dir / "thumbnails").mkdir(exist_ok=True)


settings = Settings()
