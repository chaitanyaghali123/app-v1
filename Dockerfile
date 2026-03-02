# Use Debian-based Python image for full build support
FROM python:3.10-bullseye

# Set working directory
WORKDIR /app

# Install system dependencies for PostgreSQL and native builds
RUN apt-get update && \
    apt-get install -y build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip and install dependencies using wheel cache + PyPI fallback
COPY wheels/ /wheels/
COPY requirements.txt ./
RUN pip install --upgrade pip && \
    pip install --find-links=/wheels -r requirements.txt

# Copy all project files
COPY . .

# Expose Gradio default port (if used)
EXPOSE 7860

# Run the assistant or ingestion script
CMD ["python", "ingest_hybrid.py"]
