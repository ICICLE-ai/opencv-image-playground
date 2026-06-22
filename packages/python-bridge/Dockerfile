FROM python:3.11-slim

WORKDIR /app

# Install uv for fast dependency installation
RUN pip install uv

# Copy dependency definition first — Docker layer caching means
# this layer only rebuilds when pyproject.toml changes
COPY pyproject.toml .

# Install dependencies into the system Python (not a venv)
# --no-cache keeps the image small
RUN uv pip install --system --no-cache -e .

# Copy application code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run with uvicorn — no --reload in production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]