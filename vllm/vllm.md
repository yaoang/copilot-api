# requirement

使用 vllm 的 Python 程序，在 Mac Mini 4（M4, 32GB）上加载 `Qwen2.5-7B-Instruct` 模型，并提供简单示例。

## 一、项目背景

本仓库为 `copilot-api` 项目，主要是 Node.js + 前端方式访问 Copilot API；本章节是单独演示 vllm 推理过程。

## 二、环境准备

- 设备：Mac Mini 4，Apple M4 芯片，32GB 统一内存
- Python 版本：推荐 3.11
- 系统：macOS（Apple Silicon 原生，无需 CUDA）
- 注意：vLLM 在 Apple Silicon 上通过 CPU 后端运行，不使用 Metal/MPS

## 三、依赖安装

```bash
python -m pip install --upgrade pip
# Apple Silicon 需安装 CPU-only 版本的 vllm
pip install vllm transformers einops accelerate
```

> 注意：截至 2025 年，vLLM 在 macOS 上仅支持 CPU 推理，不支持 MPS（Metal）后端。如需 GPU 加速，可考虑使用 `mlx-lm`（Apple MLX 框架）作为替代。

## 四、模型准备（Qwen2.5-7B-Instruct）

- 如果你有本地模型：直接指定本地路径。
- 也可以从 Hugging Face 拉取：

```bash
# 如果要从 HF 拉取，先 login
huggingface-cli login

# 下载模型到本地目录
git lfs install
git clone https://huggingface.co/Qwen/Qwen2.5-7B-Instruct qwen2.5-7b
```

> 32GB 统一内存可运行 7B 模型（float16 约占 14GB），也可尝试 `Qwen2.5-14B-Instruct`（约 28GB）。

## 五、示例 Python 程序

创建 `vllm/qwen35_demo.py`：

```python
from vllm import LLM, SamplingParams

# 如果是远程 HF 权限模型，需要 HF_TOKEN 环境变量
# export HF_TOKEN="your_token"

llm = LLM(model="Qwen/Qwen2.5-7B-Instruct",  # 或本地路径 "./qwen2.5-7b"
          dtype="float16",
          max_model_len=2048,
          device="cpu")                         # Apple Silicon 上使用 CPU 后端

sampling_params = SamplingParams(temperature=0.2, top_p=0.95, max_tokens=256)

prompt = "请用中文简要介绍 vllm 是什么。"

outputs = llm.generate([prompt], sampling_params)

# 仅一条输出
print(outputs[0].outputs[0].text)
```

## 六、运行命令

```bash
cd /Volumes/FanxiangS790E/codes/copilot-api/vllm
python qwen35_demo.py
```

## 七、扩展：将结果写到文件

```python
with open('vllm_output.txt', 'w', encoding='utf-8') as f:
    f.write(outputs[0].outputs[0].text)
```

## 八、替代方案：使用 mlx-lm（推荐 Apple Silicon）

`mlx-lm` 是专为 Apple Silicon 优化的推理框架，能充分利用 M4 的 Neural Engine 和统一内存，速度远快于 vLLM CPU 模式：

```bash
pip install mlx-lm
```

```python
from mlx_lm import load, generate

model, tokenizer = load("Qwen/Qwen2.5-7B-Instruct")
response = generate(model, tokenizer, prompt="请用中文简要介绍 vllm 是什么。", max_tokens=256)
print(response)
```

## 九、注意事项

- Mac Mini 4 M4 上 vLLM 使用 CPU 推理，速度较慢，建议优先考虑 `mlx-lm`。
- 32GB 统一内存可运行 7B（float16 ~14GB）或 14B（float16 ~28GB）模型。
- 如果出现内存不足，可降低 `max_model_len` 或改用量化模型（如 `Qwen2.5-7B-Instruct-MLX-4bit`）。
- 不要设置 `CUDA_VISIBLE_DEVICES`，Apple Silicon 无 CUDA 支持。
