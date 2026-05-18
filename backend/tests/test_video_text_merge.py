"""
视频快识正文清洗/合并逻辑测试。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.api.screenshot_api import (
    _strip_video_scene_caption_lines,
    _merge_stt_into_video_result,
    _video_subtitle_payload_insufficient,
    _video_body_is_too_short_to_use,
)


def test_strip_scene_caption_lines_keeps_real_transcript():
    text = "视频帧显示一位女生在厨房做饭\n这就是我家餐桌上出现率最高的一道菜"
    cleaned = _strip_video_scene_caption_lines(text)
    assert "视频帧显示" not in cleaned
    assert "这就是我家餐桌上出现率最高的一道菜" in cleaned


def test_merge_stt_replaces_scene_caption_only_payload():
    result = {"content_text": "视频展示了一位博主并叠加字幕提示不要焯水"}
    _merge_stt_into_video_result(result, "切记不要焯水\n这样更脆更香")
    assert "视频展示了" not in result["content_text"]
    assert "切记不要焯水" in result["content_text"]


def test_video_payload_insufficient_when_only_scene_caption():
    result = {"content_text": "视频帧显示一位女士在厨房烹饪蘑菇，并叠加字幕提示不要焯水"}
    assert _video_subtitle_payload_insufficient(result) is True


def test_strip_player_overlay_noise_lines():
    text = "注意看\n00:00/00:52\n1080P"
    cleaned = _strip_video_scene_caption_lines(text)
    assert cleaned == "注意看"


def test_short_video_hook_body_not_usable():
    assert _video_body_is_too_short_to_use("注意看") is True
    assert _video_body_is_too_short_to_use("第一步先热锅\n再下油") is False
