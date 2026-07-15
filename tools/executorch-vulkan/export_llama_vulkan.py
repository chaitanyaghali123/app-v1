from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

from huggingface_hub import snapshot_download


MODEL_ID = "meta-llama/Llama-3.2-1B-Instruct"
CACHE_ROOT = Path(os.environ.get("MODEL_CACHE", "/model-cache"))
OUTPUT_ROOT = Path(os.environ.get("MODEL_OUTPUT", "/output"))
OUTPUT_NAME = "llama3_2_1b_instruct_vulkan_8w_mixed_et11.pte"


def main() -> None:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    model_dir = CACHE_ROOT / "llama3.2-1b-instruct"
    print(f"Downloading {MODEL_ID} into {model_dir}...")
    snapshot_download(
        repo_id=MODEL_ID,
        local_dir=model_dir,
        token=os.environ.get("HF_TOKEN"),
        allow_patterns=[
            "original/consolidated.00.pth",
            "original/params.json",
            "original/tokenizer.model",
            "tokenizer.json",
            "tokenizer_config.json",
        ],
    )

    checkpoint = model_dir / "original" / "consolidated.00.pth"
    params = model_dir / "original" / "params.json"
    tokenizer_model = model_dir / "original" / "tokenizer.model"
    required = [checkpoint, params, tokenizer_model]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing required Llama files: {', '.join(missing)}")

    command = [
        sys.executable,
        "-m",
        "executorch.extension.llm.export.export_llm",
        "base.model_class=llama3_2",
        f"base.checkpoint={checkpoint}",
        f"base.params={params}",
        f"base.tokenizer_path={tokenizer_model}",
        (
            "base.metadata="
            "'{\"append_eos_to_prompt\":0,\"get_bos_id\":128000,"
            "\"get_eos_ids\":[128009,128001]}'"
        ),
        # Load the eager checkpoint in FP16 to stay within development-machine
        # memory. The exporter image upcasts the graph after int8 weight
        # quantization so Vulkan still selects its supported FP32 compute
        # shaders while force_fp16 keeps serialized storage compact.
        "model.dtype_override=fp16",
        "model.enable_dynamic_shape=False",
        "model.use_kv_cache=True",
        "model.use_sdpa_with_kv_cache=False",
        "export.max_seq_length=1024",
        "export.max_context_length=1024",
        f"export.output_dir={OUTPUT_ROOT}",
        f"export.output_name={OUTPUT_NAME}",
        "quantization.pt2e_quantize=vulkan_8w",
        "backend.vulkan.enabled=True",
        "backend.vulkan.force_fp16=True",
        "debug.verbose=False",
    ]
    print("Running ExecuTorch Llama 3.2 Vulkan export...")
    subprocess.run(command, check=True)

    output = OUTPUT_ROOT / OUTPUT_NAME
    cwd_output = Path.cwd() / OUTPUT_NAME
    if not output.exists() and cwd_output.exists():
        shutil.copy2(cwd_output, output)
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError(f"Exporter did not create {output} or {cwd_output}")

    tokenizer_files = {
        "tokenizer.json": "llama3_2_1b_tokenizer.json",
        "tokenizer_config.json": "llama3_2_1b_tokenizer_config.json",
    }
    for source_name, output_name in tokenizer_files.items():
        source = model_dir / source_name
        if not source.exists():
            raise RuntimeError(f"Missing required tokenizer file: {source}")
        shutil.copy2(source, OUTPUT_ROOT / output_name)

    print(f"Created {output} ({output.stat().st_size / 1024 / 1024:.1f} MiB)")


if __name__ == "__main__":
    main()
