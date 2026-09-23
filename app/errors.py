from __future__ import annotations


class AppError(Exception):
    """القاعدة المشتركة لكل أخطاء منطق التطبيق المتوقعة."""


__all__ = ["AppError"]
