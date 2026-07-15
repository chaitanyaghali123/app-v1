# Qwen ExecuTorch Vulkan export

This exporter creates a Qwen2.5-0.5B-Instruct `.pte` for the Vulkan backend
used by `react-native-executorch` 0.9.x.

Build the isolated exporter:

```powershell
docker build -t aryabhata-executorch-export:1.2.0 tools/executorch-vulkan
```

Export while preserving downloaded and converted weights between runs:

```powershell
docker run --rm `
  -v "${PWD}/.model-cache/executorch:/model-cache" `
  -v "${PWD}/server/mobile-models:/output" `
  aryabhata-executorch-export:1.2.0
```

The output is `server/mobile-models/qwen2_5_0_5b_instruct_vulkan_8w.pte`
plus the matching tokenizer files.

## Llama 3.2 1B Vulkan

Llama 3.2 is a gated model. Set `HF_TOKEN` in the shell without writing it to
the repository, and make sure that account has accepted Meta's Llama terms.

```powershell
docker build -f tools/executorch-vulkan/Dockerfile.llama `
  -t aryabhata-llama-vulkan-export:1.1.0 tools/executorch-vulkan

docker run --rm `
  -e HF_TOKEN=$env:HF_TOKEN `
  -v "${PWD}/.model-cache/executorch:/model-cache" `
  -v "${PWD}/server/mobile-models:/output" `
  aryabhata-llama-vulkan-export:1.1.0
```

The output is `llama3_2_1b_instruct_vulkan_8w_fp16_et11.pte` with uniquely named
Llama tokenizer files. The model uses Vulkan weight quantization, fp16 GPU
execution, KV cache, and a 2048-token context.
