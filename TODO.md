# TODO

## Phase 1: Remove Qwen + ExecuTorch
- [x] Delete mobile Qwen modules (`mobile/localQwen.ts`, `mobile/localQwenExecutorch.ts`)
- [x] Delete mobile ExecuTorch modules (`mobile/localLlamaExecutorch.ts`)

- [ ] Remove ExecuTorch/Qwen imports/usages from frontend and mobile wiring
- [ ] Remove ExecuTorch dependencies from root `package.json` (and any other package manifests)

## Phase 2: Add Llama 3.2 1B local (phone) Vulkan via llama.cpp
- [ ] Add/replace on-device inference code to use llama.cpp Vulkan (no ExecuTorch)
- [ ] Ensure model/tokenizer assets and download flow for `Llama 3.2 1B` (GGUF suitable for llama.cpp)
- [ ] Wire UI to call the new local inference path

## Phase 3: Verification
- [ ] Run build (Android + iOS if applicable)
- [ ] Run local inference smoke test
- [ ] Confirm Qwen and ExecuTorch artifacts are fully removed

