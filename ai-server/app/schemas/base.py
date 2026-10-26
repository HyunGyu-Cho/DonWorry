from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


# Spring · 화면과 주고받는 JSON은 camelCase (Java · TypeScript 필드 이름 그대로)
class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
