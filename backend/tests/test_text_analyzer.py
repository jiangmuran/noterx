"""
文本分析模块测试
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.analysis.text_analyzer import TextAnalyzer


analyzer = TextAnalyzer()


def test_title_length():
    """标题分析应返回正确字数"""
    result = analyzer.analyze_title("手把手教你做日式溏心蛋！零失败！")
    assert result["length"] == len("手把手教你做日式溏心蛋！零失败！")
    assert "keywords" in result
    assert "score" in result


def test_title_hooks():
    """含数字的标题应检测到 hook"""
    result = analyzer.analyze_title("5分钟搞定的3种早餐！")
    assert result["has_numbers"] is True
    assert result["hook_count"] >= 1


def test_empty_content():
    """空正文应返回零值"""
    result = analyzer.analyze_content("")
    assert result["length"] == 0
    assert result["paragraph_count"] == 0


def test_content_paragraphs():
    """正文段落统计应正确"""
    text = "第一段内容\n\n第二段内容\n\n第三段内容"
    result = analyzer.analyze_content(text)
    assert result["paragraph_count"] == 3


def test_emotion_detection():
    """标题中的情绪词应被检测"""
    result = analyzer.analyze_title("这个宝藏店铺绝了！必须推荐")
    emotions = [e["word"] for e in result["emotion_words"]]
    assert "绝了" in emotions or "宝藏" in emotions or "推荐" in emotions
