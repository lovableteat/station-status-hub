# AutoCheck 比對伺服器 — build from the repository root so the engine files are included:
#   docker build -f server/Dockerfile -t autocheck-api .
#   docker run -p 8000:8000 -e AUTOCHECK_API_TOKEN=change-me autocheck-api
FROM python:3.12-slim
WORKDIR /app/server
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY public/comparison /app/public/comparison
COPY server/autocheck_api ./autocheck_api
ENV AUTOCHECK_ENGINE_DIR=/app/public/comparison PYTHONIOENCODING=utf-8 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "-m", "autocheck_api", "--host", "0.0.0.0", "--port", "8000"]
