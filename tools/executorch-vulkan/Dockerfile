FROM python:3.11-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        git \
        glslc \
        ninja-build \
    && rm -rf /var/lib/apt/lists/*

# React Native ExecuTorch 0.9.x bundles the ExecuTorch 1.2 runtime.
# Install CPU PyTorch first so pip does not pull CUDA libraries into the
# exporter image. Export runs on the PC CPU; the produced .pte targets Android.
RUN python -m pip install --upgrade pip \
    && python -m pip install --index-url https://download.pytorch.org/whl/cpu \
        "torch>=2.11.0" \
    && python -m pip install \
        "executorch==1.2.0" \
        "huggingface-hub>=0.30,<2" \
        "safetensors>=0.5,<1" \
        "torchtune>=0.6,<1"

WORKDIR /workspace

COPY export_qwen_vulkan.py /opt/export_qwen_vulkan.py
COPY qwen2_5_0_5b_instruct_vulkan.yaml /opt/qwen2_5_0_5b_instruct_vulkan.yaml

ENTRYPOINT ["python", "/opt/export_qwen_vulkan.py"]
