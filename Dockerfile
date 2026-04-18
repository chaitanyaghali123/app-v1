FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install llama-cpp server (CPU only)
RUN pip install --no-cache-dir "llama-cpp-python[server]"

EXPOSE 8080

# ✅ CMD must be a single JSON array, no line breaks that confuse parser
CMD ["python3", "-m", "llama_cpp.server", \
     "--model", "/models/phi-3-mini-4k-instruct-q4.gguf", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--n_gpu_layers", "0", \
     "--use-mmap", \
     "--threads", "8"]
