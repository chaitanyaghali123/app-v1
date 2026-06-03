FROM python:3.10-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install llama.cpp Python server
RUN pip install --no-cache-dir "llama-cpp-python[server]"


# Expose API port
EXPOSE 8080

# Start llama.cpp OpenAI-compatible server.
# Keep these as env vars so docker-compose can switch models without editing the image.
ENV LLAMA_MODEL_PATH=/models/qwen2.5-0.5b-instruct-q4_k_m.gguf
ENV LLAMA_THREADS=8
ENV LLAMA_CTX_SIZE=1536

CMD python3 -m llama_cpp.server \
    --model "${LLAMA_MODEL_PATH}" \
    --host 0.0.0.0 \
    --port 8080 \
    --n_gpu_layers 0 \
    --use_mmap True \
    --n_threads "${LLAMA_THREADS}" \
    --n_ctx "${LLAMA_CTX_SIZE}"
