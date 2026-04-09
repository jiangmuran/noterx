"""
视频口播转写（Speech-to-Text）：从音轨提取 WAV 后调用 **OpenAI 兼容** 的 `/v1/audio/transcriptions`。

说明：用户口语中的「TTS」常混用；此处为 **ASR（语音→文字）**，不是文字转语音。

兼容：
- OpenAI 官方：`OPENAI_WHISPER_BASE_URL=https://api.openai.com/v1`，`WHISPER_MODEL=whisper-1`
- 硅基流动 ASR：`OPENAI_WHISPER_BASE_URL=https://api.siliconflow.cn/v1`，`WHISPER_MODEL` 如 `TeleAI/TeleSpeechASR`、`FunAudioLLM/SenseVoiceSmall`（走「创建语音转文本」/audio/transcriptions，非 TTS 的 upload-voice）

依赖：
- 系统 PATH 中可用 `ffmpeg`（提取音轨）
- 配置 `OPENAI_WHISPER_API_KEY` + `OPENAI_WHISPER_BASE_URL`（勿用 MiMo 对话 Key 冒充第三方 ASR）
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger("noterx.video_stt")


def _stt_enabled() -> bool:
    # 默认开启：只要具备可用 ASR 配置就执行；可通过 VIDEO_STT_ENABLED=0 显式关闭
    v = os.getenv("VIDEO_STT_ENABLED", "1").strip().lower()
    return v in ("1", "true", "yes", "on")


def _resolve_whisper_client_config() -> tuple[Optional[str], Optional[str]]:
    """
    @returns (api_key, base_url) 若不可用则 (None, None)
    """
    whisper_key = (os.getenv("OPENAI_WHISPER_API_KEY") or "").strip()
    explicit = (os.getenv("OPENAI_WHISPER_BASE_URL") or "").strip().rstrip("/")

    if explicit:
        # 任意第三方 / 官方 ASR 基址：必须用专用 Key，禁止回退到 MiMo 的 OPENAI_API_KEY
        if not whisper_key:
            logger.info(
                "VIDEO_STT: 已设置 OPENAI_WHISPER_BASE_URL，请在 .env 填写 OPENAI_WHISPER_API_KEY",
            )
            return None, None
        return whisper_key, explicit

    key = whisper_key or (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return None, None

    main = (os.getenv("OPENAI_BASE_URL") or "").strip().lower()
    if "xiaomimimo" in main or "mimo-v2.com" in main:
        logger.info(
            "VIDEO_STT: 已配置 MiMo 为 OPENAI_BASE_URL；请设置 OPENAI_WHISPER_BASE_URL 与 OPENAI_WHISPER_API_KEY，"
            "例如官方 https://api.openai.com/v1 或硅基流动 https://api.siliconflow.cn/v1",
        )
        return None, None

    base = (os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1").strip().rstrip("/")
    return key, base


def _probe_video_duration_seconds(video_path: str) -> Optional[float]:
    """用 ffprobe 获取视频时长（秒）。"""
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            capture_output=True,
            timeout=20,
            check=False,
        )
        if proc.returncode != 0:
            return None
        raw = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
        if not raw:
            return None
        dur = float(raw)
        if dur <= 0:
            return None
        return dur
    except Exception:
        return None


def _extract_wav_segment(video_path: str, *, start_sec: float, clip_sec: float) -> bytes:
    """
    从视频中提取一个音频片段为 16kHz 单声道 WAV。
    @returns 空 bytes 表示失败
    """
    fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-ss",
            f"{max(start_sec, 0):.3f}",
            "-i",
            video_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-t",
            f"{max(clip_sec, 1.0):.3f}",
            wav_path,
        ]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=max(120, int(clip_sec * 1.5)),
            check=False,
        )
        if proc.returncode != 0:
            err = (proc.stderr or b"").decode("utf-8", errors="replace")[:400]
            logger.warning("VIDEO_STT: ffmpeg 片段提取失败 rc=%s %s", proc.returncode, err)
            return b""
        with open(wav_path, "rb") as wf:
            out = wf.read()
        return out
    except FileNotFoundError:
        logger.warning("VIDEO_STT: 未找到 ffmpeg，请安装后加入 PATH")
        return b""
    except subprocess.TimeoutExpired:
        logger.warning("VIDEO_STT: ffmpeg 片段提取超时")
        return b""
    except Exception as e:
        logger.warning("VIDEO_STT: 片段提取异常 %s", e)
        return b""
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except OSError:
                pass


def _extract_wav_chunks_from_video_bytes(video_bytes: bytes, container_suffix: str) -> list[bytes]:
    """
    用 ffmpeg 将视频音轨切分为多个 16kHz 单声道 WAV 片段（Whisper 友好）。
    默认按分段转写，避免单文件过大导致接口拒收。
    @returns WAV 片段列表；空列表表示失败（无 ffmpeg / 无音轨）
    """
    suffix = container_suffix if container_suffix.startswith(".") else f".{container_suffix}"
    max_total_sec = int(os.getenv("VIDEO_STT_MAX_AUDIO_SECONDS", "3600"))
    max_total_sec = max(60, min(max_total_sec, 14400))
    seg_sec = int(os.getenv("VIDEO_STT_SEGMENT_SECONDS", "480"))
    seg_sec = max(30, min(seg_sec, 1200))

    video_path = ""
    chunks: list[bytes] = []
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as vf:
            vf.write(video_bytes)
            video_path = vf.name

        duration = _probe_video_duration_seconds(video_path)
        if duration is None:
            # 无法探测时按上限兜底，至少尝试一次
            duration = float(max_total_sec)
        target_total = min(duration, float(max_total_sec))
        if duration > max_total_sec:
            logger.info(
                "VIDEO_STT: 视频时长 %.1fs 超过上限 %ss，超出部分不转写",
                duration,
                max_total_sec,
            )

        seg_count = max(1, int((target_total + seg_sec - 1) // seg_sec))
        for idx in range(seg_count):
            start_sec = idx * seg_sec
            remain = target_total - start_sec
            if remain <= 0:
                break
            clip_sec = min(seg_sec, remain)
            wav = _extract_wav_segment(video_path, start_sec=start_sec, clip_sec=clip_sec)
            if not wav:
                continue
            if len(wav) > 24 * 1024 * 1024:
                logger.warning(
                    "VIDEO_STT: 片段 %s WAV 超过 24MB，建议调小 VIDEO_STT_SEGMENT_SECONDS",
                    idx + 1,
                )
            chunks.append(wav)
        return chunks
    except Exception as e:
        logger.warning("VIDEO_STT: 提取音轨异常 %s", e)
        return []
    finally:
        if video_path and os.path.exists(video_path):
            try:
                os.remove(video_path)
            except OSError:
                pass


def _join_transcript_parts(parts: list[str]) -> str:
    """拼接多段转写，做轻量去重。"""
    out: list[str] = []
    for part in parts:
        text = (part or "").strip()
        if not text:
            continue
        if not out:
            out.append(text)
            continue
        prev = out[-1]
        if text in prev:
            continue
        if prev in text:
            out[-1] = text
            continue
        out.append(text)
    return "\n".join(out).strip()


async def _transcribe_single_wav(
    client,
    *,
    model: str,
    wav: bytes,
    timeout_sec: float,
    language: Optional[str],
) -> str:
    """
    转写单个 wav 片段。优先尝试 verbose_json（可拿更完整分段），不支持则自动回退。
    """
    base_kwargs: dict = {
        "model": model,
        "timeout": timeout_sec,
    }
    if language:
        base_kwargs["language"] = language

    prefer_verbose = os.getenv("VIDEO_STT_PREFER_VERBOSE_JSON", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )

    if prefer_verbose:
        try:
            buf = io.BytesIO(wav)
            buf.name = "audio.wav"
            resp = await client.audio.transcriptions.create(
                **base_kwargs,
                file=buf,
                response_format="verbose_json",
            )
            text = _transcription_text_from_response(resp)
            if text:
                return text
        except Exception as e:
            logger.info("VIDEO_STT: verbose_json 不可用，回退默认格式: %s", e)

    buf = io.BytesIO(wav)
    buf.name = "audio.wav"
    resp = await client.audio.transcriptions.create(**base_kwargs, file=buf)
    return _transcription_text_from_response(resp)


async def transcribe_video_with_whisper(video_bytes: bytes, container_suffix: str) -> str:
    """
    异步：线程池提取 WAV + AsyncOpenAI Whisper 转写。
    @returns 转写文本，失败或未开启时为空字符串
    """
    if not _stt_enabled():
        return ""

    key, base = _resolve_whisper_client_config()
    if not key or not base:
        return ""

    model = (os.getenv("WHISPER_MODEL") or "whisper-1").strip()

    chunks = await asyncio.to_thread(_extract_wav_chunks_from_video_bytes, video_bytes, container_suffix)
    if not chunks:
        logger.warning(
            "VIDEO_STT: WAV 片段为空，未调用转写 API（检查 ffmpeg、视频是否含音轨、上方 stderr 日志）",
        )
        return ""

    import httpx
    from openai import AsyncOpenAI

    _stt_http_timeout = float(os.getenv("VIDEO_STT_TIMEOUT_SEC", "240"))
    _stt_http_timeout = max(60.0, min(_stt_http_timeout, 600.0))
    http_client = httpx.AsyncClient(
        proxy=None,
        trust_env=False,
        timeout=httpx.Timeout(_stt_http_timeout, connect=60.0),
    )
    try:
        client = AsyncOpenAI(api_key=key, base_url=base, http_client=http_client)
        # 未设置环境变量时默认 zh；显式设为空字符串则不传 language（部分硅基模型可能拒参）
        _lr = os.getenv("VIDEO_STT_LANGUAGE")
        if _lr is None:
            lang = "zh"
        else:
            lang = _lr.strip() or None
        texts: list[str] = []
        total = len(chunks)
        for idx, wav in enumerate(chunks, start=1):
            try:
                text = await _transcribe_single_wav(
                    client,
                    model=model,
                    wav=wav,
                    timeout_sec=_stt_http_timeout,
                    language=lang,
                )
            except Exception as e:
                logger.warning("VIDEO_STT: 片段转写失败 chunk=%s/%s err=%s", idx, total, e)
                text = ""
            if text:
                texts.append(text)
                logger.info("VIDEO_STT: 片段转写成功 chunk=%s/%s len=%s", idx, total, len(text))
            else:
                logger.warning("VIDEO_STT: 片段转写为空 chunk=%s/%s", idx, total)

        merged = _join_transcript_parts(texts)
        if merged:
            logger.info("VIDEO_STT: 全片转写成功 chunks=%s total_len=%s model=%s", total, len(merged), model)
        else:
            logger.warning("VIDEO_STT: 全片转写为空，请核对 ASR 模型与音频内容")
        return merged
    except Exception as e:
        logger.warning("VIDEO_STT: 转写 API 失败 %s", e)
        return ""
    finally:
        await http_client.aclose()


def _transcription_text_from_response(resp: object) -> str:
    """
    从 OpenAI SDK / 硅基 JSON 转写响应中取出纯文本。
    @param resp - Transcription 对象或兼容结构
    @returns 去首尾空白的转写文本
    """
    if resp is None:
        return ""
    segments = getattr(resp, "segments", None)
    if isinstance(segments, list):
        lines = [
            str((seg or {}).get("text", "")).strip()
            for seg in segments
            if isinstance(seg, dict) and str((seg or {}).get("text", "")).strip()
        ]
        if lines:
            return "\n".join(lines).strip()
    t = getattr(resp, "text", None)
    if isinstance(t, str) and t.strip():
        return t.strip()
    dump = getattr(resp, "model_dump", None)
    if callable(dump):
        try:
            d = dump()
            if isinstance(d, dict):
                segs = d.get("segments")
                if isinstance(segs, list):
                    lines = [
                        str((seg or {}).get("text", "")).strip()
                        for seg in segs
                        if isinstance(seg, dict) and str((seg or {}).get("text", "")).strip()
                    ]
                    if lines:
                        return "\n".join(lines).strip()
                tx = d.get("text")
                if isinstance(tx, str) and tx.strip():
                    return tx.strip()
        except Exception:
            pass
    if isinstance(resp, dict):
        segs = resp.get("segments")
        if isinstance(segs, list):
            lines = [
                str((seg or {}).get("text", "")).strip()
                for seg in segs
                if isinstance(seg, dict) and str((seg or {}).get("text", "")).strip()
            ]
            if lines:
                return "\n".join(lines).strip()
        tx = resp.get("text")
        if isinstance(tx, str) and tx.strip():
            return tx.strip()
    return ""
