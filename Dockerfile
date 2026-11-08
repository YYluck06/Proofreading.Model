# syntax=docker/dockerfile:1
# Dashboard image. The scoring engine and the configuration are copied in as-is,
# so the container runs exactly the code the tests cover.

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app/core \
    STREAMLIT_SERVER_HEADLESS=true \
    STREAMLIT_BROWSER_GATHER_USAGE_STATS=false

WORKDIR /app

COPY apps/dashboard/requirements.txt /app/apps/dashboard/requirements.txt
RUN pip install --no-cache-dir -r /app/apps/dashboard/requirements.txt

COPY config /app/config
COPY core /app/core
COPY apps/dashboard /app/apps/dashboard
COPY LICENSE /app/LICENSE

# Drop privileges: the dashboard never needs to write to the filesystem.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health', timeout=3).read()"

CMD ["streamlit", "run", "apps/dashboard/app.py", "--server.port=8501", "--server.address=0.0.0.0"]
