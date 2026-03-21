# Use the same NVIDIA base
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

# Install only the bare minimum for Python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Point to the official PRE-BUILT wheels for CUDA 12.4
# This avoids the "Building wheel" error entirely.
RUN pip3 install llama-cpp-python[server] \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124

WORKDIR /app
EXPOSE 8080
VOLUME ["/models"]

CMD ["python3", "-m", "llama_cpp.server", "--host", "0.0.0.0", "--port", "8080"]