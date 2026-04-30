FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8001

# scrubber has no host port mapping in docker-compose.yml
# This EXPOSE is documentation only; the container port is only reachable via loglens_net
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
