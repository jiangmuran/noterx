"""
封面图像分析模块
使用 OpenCV 分析封面构图、色彩、人脸检测等特征。
"""
from __future__ import annotations

import io
import logging

import numpy as np

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

from PIL import Image

logger = logging.getLogger(__name__)


class ImageAnalyzer:
    """分析封面图片的视觉特征"""

    def analyze(self, image_bytes: bytes) -> dict:
        """
        分析图片，返回各项视觉指标。

        @param image_bytes - 原始图片字节数据
        @returns dict 包含 saturation, text_ratio, has_face, brightness, composition 等指标
        """
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img_pil)

        composition = self._analyze_composition(img_np)
        color_harmony = self._analyze_color_harmony(img_np)

        result = {
            "width": img_pil.width,
            "height": img_pil.height,
            "aspect_ratio": round(img_pil.width / max(img_pil.height, 1), 2),
            "saturation": self._calc_saturation(img_np),
            "brightness": self._calc_brightness(img_np),
            "contrast": self._calc_contrast(img_np),
            "has_face": self._detect_face(img_np),
            "face_position": self._detect_face_position(img_np),
            "text_ratio": self._estimate_text_ratio(img_np),
            "dominant_colors": self._get_dominant_colors(img_np),
            "color_harmony": color_harmony,
            "composition": composition,
            "visual_complexity": self._calc_visual_complexity(img_np),
            "narrative": self._build_narrative(img_pil, composition, color_harmony),
        }
        return result

    def _calc_contrast(self, img_np: np.ndarray) -> float:
        """计算亮度对比度 (标准差 / 255)"""
        gray = np.mean(img_np, axis=2)
        return round(float(np.std(gray) / 255.0), 3)

    def _detect_face_position(self, img_np: np.ndarray) -> str | None:
        """检测人脸在画面中的位置区域（九宫格描述）"""
        if not CV2_AVAILABLE:
            return None
        try:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            faces = face_cascade.detectMultiScale(gray, 1.3, 5)
            if len(faces) == 0:
                return None
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            cx, cy = x + w / 2, y + h / 2
            img_h, img_w = img_np.shape[:2]
            col = "左" if cx < img_w / 3 else ("右" if cx > img_w * 2 / 3 else "中")
            row = "上" if cy < img_h / 3 else ("下" if cy > img_h * 2 / 3 else "中")
            return f"{row}{col}"
        except Exception:
            return None

    def _analyze_composition(self, img_np: np.ndarray) -> dict:
        """
        分析构图特征：三分法权重分布、主体偏移、视觉重心。
        """
        h, w = img_np.shape[:2]
        gray = np.mean(img_np, axis=2)

        third_h, third_w = h // 3, w // 3
        grid_weights = []
        for r in range(3):
            row_weights = []
            for c in range(3):
                block = gray[r * third_h:(r + 1) * third_h, c * third_w:(c + 1) * third_w]
                energy = float(np.std(block))
                row_weights.append(round(energy, 1))
            grid_weights.append(row_weights)

        max_energy = 0.0
        focus_r, focus_c = 1, 1
        for r in range(3):
            for c in range(3):
                if grid_weights[r][c] > max_energy:
                    max_energy = grid_weights[r][c]
                    focus_r, focus_c = r, c

        row_labels = ["上", "中", "下"]
        col_labels = ["左", "中", "右"]
        focus_desc = f"{row_labels[focus_r]}{col_labels[focus_c]}"

        total_energy = sum(sum(row) for row in grid_weights)
        if total_energy > 0:
            center_energy = grid_weights[1][1]
            center_ratio = round(center_energy / total_energy, 2)
        else:
            center_ratio = 0.33

        is_centered = center_ratio > 0.15
        uses_rule_of_thirds = not is_centered and focus_desc != "中中"

        return {
            "grid_energy": grid_weights,
            "focus_region": focus_desc,
            "center_weight": center_ratio,
            "is_centered_composition": is_centered,
            "uses_rule_of_thirds": uses_rule_of_thirds,
            "layout": "居中构图" if is_centered else f"偏{focus_desc}构图",
        }

    def _analyze_color_harmony(self, img_np: np.ndarray) -> dict:
        """分析色彩和谐度：色相分布、暖冷调、饱和度方差"""
        if not CV2_AVAILABLE:
            r_mean = float(np.mean(img_np[:, :, 0]))
            b_mean = float(np.mean(img_np[:, :, 2]))
            tone = "暖色调" if r_mean > b_mean + 15 else ("冷色调" if b_mean > r_mean + 15 else "中性色调")
            return {"tone": tone, "saturation_variance": 0.0, "hue_spread": 0.0}

        hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)
        hue = hsv[:, :, 0].astype(float) * 2
        sat = hsv[:, :, 1].astype(float) / 255.0

        hue_std = float(np.std(hue))
        sat_var = round(float(np.var(sat)), 4)

        mean_hue = float(np.mean(hue))
        if 20 < mean_hue < 80:
            tone = "暖色调"
        elif 180 < mean_hue < 280:
            tone = "冷色调"
        else:
            tone = "中性色调"

        if hue_std < 30:
            harmony_level = "单色系（和谐度高）"
        elif hue_std < 60:
            harmony_level = "类似色（和谐度中等）"
        else:
            harmony_level = "多色系（色彩丰富）"

        return {
            "tone": tone,
            "harmony_level": harmony_level,
            "saturation_variance": round(sat_var, 4),
            "hue_spread": round(hue_std, 1),
        }

    def _calc_visual_complexity(self, img_np: np.ndarray) -> float:
        """
        计算视觉复杂度 (0-1)。
        高复杂度意味着图片内容丰富/杂乱；低复杂度意味着画面简洁。
        """
        if not CV2_AVAILABLE:
            gray = np.mean(img_np, axis=2).astype(np.uint8)
            dx = np.abs(np.diff(gray, axis=1)).mean()
            dy = np.abs(np.diff(gray, axis=0)).mean()
            return round(min((dx + dy) / 100.0, 1.0), 3)

        gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / (edges.shape[0] * edges.shape[1])
        return round(min(edge_density * 3, 1.0), 3)

    def _build_narrative(self, img_pil: Image.Image, composition: dict, color_harmony: dict) -> str:
        """生成封面视觉特征的自然语言叙述，供 Agent prompt 使用。"""
        w, h = img_pil.width, img_pil.height
        if w / h > 1.2:
            shape = "横版"
        elif h / w > 1.2:
            shape = "竖版（适合手机全屏浏览）"
        else:
            shape = "接近正方形"

        parts = [
            f"封面尺寸 {w}×{h}，{shape}。",
            f"构图为{composition.get('layout', '未知')}，视觉焦点在{composition.get('focus_region', '中心')}区域。",
            f"色彩整体为{color_harmony.get('tone', '中性色调')}",
        ]
        harmony = color_harmony.get("harmony_level")
        if harmony:
            parts.append(f"，{harmony}。")
        else:
            parts.append("。")

        return "".join(parts)

    def _calc_saturation(self, img_np: np.ndarray) -> float:
        """计算平均色彩饱和度 (0-1)"""
        if not CV2_AVAILABLE:
            r, g, b = img_np[:,:,0], img_np[:,:,1], img_np[:,:,2]
            max_c = np.maximum(np.maximum(r, g), b).astype(float)
            min_c = np.minimum(np.minimum(r, g), b).astype(float)
            diff = max_c - min_c
            sat = np.where(max_c > 0, diff / max_c, 0)
            return round(float(np.mean(sat)), 3)

        hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)
        return round(float(np.mean(hsv[:, :, 1]) / 255.0), 3)

    def _calc_brightness(self, img_np: np.ndarray) -> float:
        """计算平均亮度 (0-1)"""
        gray = np.mean(img_np, axis=2)
        return round(float(np.mean(gray) / 255.0), 3)

    def _detect_face(self, img_np: np.ndarray) -> bool:
        """检测图片中是否有人脸"""
        if not CV2_AVAILABLE:
            return False
        try:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            )
            faces = face_cascade.detectMultiScale(gray, 1.3, 5)
            return len(faces) > 0
        except Exception:
            return False

    def _estimate_text_ratio(self, img_np: np.ndarray) -> float:
        """
        估算封面上文字区域的占比。
        使用边缘检测 + 连通域分析来粗略估计文字区域。
        """
        if not CV2_AVAILABLE:
            return 0.15

        try:
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            dilated = cv2.dilate(edges, kernel, iterations=2)
            text_pixels = np.sum(dilated > 0)
            total_pixels = dilated.shape[0] * dilated.shape[1]
            return round(text_pixels / total_pixels, 3)
        except Exception:
            return 0.15

    def _get_dominant_colors(self, img_np: np.ndarray, k: int = 3) -> list[str]:
        """提取主色调（简化实现，取平均色块）"""
        h, w = img_np.shape[:2]
        block_h, block_w = h // 3, w // 3
        colors = []
        for i in range(3):
            row = i * block_h
            col = i * block_w
            block = img_np[row:row+block_h, col:col+block_w]
            avg_color = block.mean(axis=(0, 1)).astype(int)
            hex_color = "#{:02x}{:02x}{:02x}".format(*avg_color)
            colors.append(hex_color)
        return colors
