"""Reference implementation of the browser drawing adapter.

This module intentionally has no image-library dependency. Its arithmetic
matches src/preprocess/drawing.ts so deterministic raster fixtures can be
checked offline.
"""

from __future__ import annotations

import math

TARGET_SIZE = 28
INK_THRESHOLD = 8
TARGET_INK_SIZE = 20


def _js_round(value: float) -> int:
    return math.floor(value + 0.5)


def _sample_bilinear(
    source: list[int], width: int, height: int, x: float, y: float
) -> float:
    left = math.floor(x)
    top = math.floor(y)
    right = min(width - 1, left + 1)
    bottom = min(height - 1, top + 1)
    x_weight = x - left
    y_weight = y - top
    top_left = source[top * width + left]
    top_right = source[top * width + right]
    bottom_left = source[bottom * width + left]
    bottom_right = source[bottom * width + right]
    top_value = top_left + (top_right - top_left) * x_weight
    bottom_value = bottom_left + (bottom_right - bottom_left) * x_weight
    return top_value + (bottom_value - top_value) * y_weight


def _center_by_mass(tensor: list[float]) -> list[float]:
    mass = sum(tensor)
    if mass == 0:
        return tensor
    weighted_x = sum((index % TARGET_SIZE) * value for index, value in enumerate(tensor))
    weighted_y = sum((index // TARGET_SIZE) * value for index, value in enumerate(tensor))
    shift_x = math.floor(13.5 - weighted_x / mass + 0.5)
    shift_y = math.floor(13.5 - weighted_y / mass + 0.5)
    if shift_x == 0 and shift_y == 0:
        return tensor

    centered = [0.0] * len(tensor)
    for y in range(TARGET_SIZE):
        for x in range(TARGET_SIZE):
            destination_x = x + shift_x
            destination_y = y + shift_y
            if 0 <= destination_x < TARGET_SIZE and 0 <= destination_y < TARGET_SIZE:
                centered[destination_y * TARGET_SIZE + destination_x] = tensor[
                    y * TARGET_SIZE + x
                ]
    return centered


def preprocess_alpha_raster(alpha: list[int], width: int, height: int) -> list[float]:
    if len(alpha) != width * height or width <= 0 or height <= 0:
        raise ValueError("Alpha raster dimensions do not match its pixel data.")

    foreground = [
        (x, y)
        for y in range(height)
        for x in range(width)
        if alpha[y * width + x] > INK_THRESHOLD
    ]
    if not foreground:
        return [0.0] * (TARGET_SIZE * TARGET_SIZE)

    min_x = min(point[0] for point in foreground)
    max_x = max(point[0] for point in foreground)
    min_y = min(point[1] for point in foreground)
    max_y = max(point[1] for point in foreground)
    source_width = max_x - min_x + 1
    source_height = max_y - min_y + 1
    scale = TARGET_INK_SIZE / max(source_width, source_height)
    scaled_width = max(1, _js_round(source_width * scale))
    scaled_height = max(1, _js_round(source_height * scale))
    cropped = [
        alpha[(min_y + y) * width + min_x + x]
        for y in range(source_height)
        for x in range(source_width)
    ]
    offset_x = math.floor((TARGET_SIZE - scaled_width) / 2)
    offset_y = math.floor((TARGET_SIZE - scaled_height) / 2)
    tensor = [0.0] * (TARGET_SIZE * TARGET_SIZE)

    for y in range(scaled_height):
        for x in range(scaled_width):
            destination_x = x + offset_x
            destination_y = y + offset_y
            source_x = (x + 0.5) * source_width / scaled_width - 0.5
            source_y = (y + 0.5) * source_height / scaled_height - 0.5
            source_x = max(0, min(source_width - 1, source_x))
            source_y = max(0, min(source_height - 1, source_y))
            tensor[destination_y * TARGET_SIZE + destination_x] = (
                _sample_bilinear(cropped, source_width, source_height, source_x, source_y)
                / 255
            )
    return _center_by_mass(tensor)
