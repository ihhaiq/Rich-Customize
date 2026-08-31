"""Deprecated compatibility imports. New code must use :mod:`app.lang`."""

from app.lang import PROFILES, SUPPORTED_LANGUAGES
from app.lang import TRANSLATIONS as _TRANSLATIONS

# Preserve the historical app.locales contract while internal code migrates.
TRANSLATIONS = {code: values for code, values in _TRANSLATIONS.items() if code != "ar"}

__all__ = ["PROFILES", "SUPPORTED_LANGUAGES", "TRANSLATIONS"]
