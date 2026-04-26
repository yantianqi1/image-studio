from pydantic import BaseModel, Field


class SettingsUpdateRequest(BaseModel):
    site_title: str = Field(min_length=1, max_length=255)
    allow_public_signup: bool
    allow_anonymous_image: bool
    uploads_enabled: bool
