from __future__ import annotations

from importlib import import_module


def load_optional_attribute(module_path: str, attribute_name: str):
    try:
        module = import_module(module_path)
    except ModuleNotFoundError:
        return None
    return getattr(module, attribute_name, None)

