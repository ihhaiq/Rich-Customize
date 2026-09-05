from __future__ import annotations

from app.lang.ar.core import CORE_PHRASES
from app.lang.bundle_loader import LocaleBundle, build_bundle


_base = build_bundle("ar")
BUNDLE = LocaleBundle(
    code=_base.code,
    phrases={**_base.phrases, **CORE_PHRASES},
    translations=_base.translations,
    keyed=_base.keyed,
    catalog=_base.catalog,
    profile=_base.profile,
)
