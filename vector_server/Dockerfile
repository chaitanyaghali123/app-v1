# Base image
FROM python:3.10-bullseye

WORKDIR /app

ENV GOOGLE_APPLICATION_CREDENTIALS=""

# ✅ Install system dependencies
RUN apt-get update && \
    apt-get install -y wget build-essential cmake g++ libsqlite3-dev curl git && \
    wget https://www.sqlite.org/2023/sqlite-autoconf-3420000.tar.gz && \
    tar xzf sqlite-autoconf-3420000.tar.gz && \
    cd sqlite-autoconf-3420000 && \
    ./configure && make && make install && \
    ldconfig && \
    sqlite3 --version && \
    cd .. && rm -rf sqlite-autoconf-3420000* && \
    rm -rf /var/lib/apt/lists/*

# ✅ Reinstall Python bindings for SQLite
RUN pip install --force-reinstall --no-cache-dir pysqlite3-binary

# ✅ Install native dependencies

# ✅ Install CPU-only PyTorch (avoid CUDA which is massive)
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu torch>=2.1.0

# ✅ Copy dependency files first (cache layer)
COPY requirements.txt .
COPY wheels/ /wheels/

# ✅ Install Python dependencies (cached unless requirements/wheels change)
RUN pip install --find-links=/wheels -r requirements.txt

# ✅ Copy project files (doesn’t invalidate dependency layer)
COPY . .

# ✅ Expose port
EXPOSE 7860

# ✅ Launch FastAPI app
CMD ["uvicorn", "ingest_hybrid_api:app", "--host", "0.0.0.0", "--port", "7860"]
