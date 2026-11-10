from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query parameters that only track where a click came from. Dropping them means the same
# posting opened from an email, a search page or a share link still counts as one job.
TRACKING_PARAMS = {"trk", "trackingid", "refid", "from", "fbclid", "gclid", "ref", "src"}


def normalize_url(url: str | None) -> str | None:
    """Canonical form of a job URL used for de-duplication. Returns None for blank input."""
    if url is None:
        return None
    url = url.strip()
    if not url:
        return None
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return url  # not a full URL; store as given
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=False)
        if k.lower() not in TRACKING_PARAMS and not k.lower().startswith("utm_")
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), path, urlencode(sorted(query)), "")
    )
