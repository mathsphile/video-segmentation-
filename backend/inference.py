"""
inference.py — Video Segmentation Inference Engine
Extracted from U-Net + DeepLabV3 notebook.

Loads DeepLabV3-ResNet50 once at startup and exposes:
  - segment_frame(frame_bgr) -> (seg_rgb, blend_bgr, detected_classes)
  - process_video(input_path, output_path, progress_cb) -> None
"""

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision.models.segmentation import deeplabv3_resnet50, DeepLabV3_ResNet50_Weights
import warnings
import logging
import os
import subprocess
import tempfile

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)

# ─── PASCAL VOC 21 Classes ───────────────────────────────────────────────────

VOC_CLASSES = [
    "background", "aeroplane", "bicycle", "bird", "boat",
    "bottle", "bus", "car", "cat", "chair",
    "cow", "diningtable", "dog", "horse", "motorbike",
    "person", "potted plant", "sheep", "sofa", "train",
    "tv/monitor",
]

# Vibrant perceptually distinct colours (RGB)
PALETTE = np.array([
    [  0,   0,   0],   # 0  background
    [135, 206, 235],   # 1  aeroplane
    [255, 165,   0],   # 2  bicycle
    [255, 215,   0],   # 3  bird
    [  0, 191, 255],   # 4  boat
    [148,   0, 211],   # 5  bottle
    [255,  20, 147],   # 6  bus
    [220,  20,  60],   # 7  car
    [255, 140,   0],   # 8  cat
    [139,  69,  19],   # 9  chair
    [255, 255,   0],   # 10 cow
    [210, 105,  30],   # 11 dining table
    [186,  85, 211],   # 12 dog
    [255, 105, 180],   # 13 horse
    [  0, 255, 127],   # 14 motorbike
    [255,  69,   0],   # 15 person
    [ 34, 139,  34],   # 16 potted plant
    [240, 230, 140],   # 17 sheep
    [  0, 206, 209],   # 18 sofa
    [  0,   0, 255],   # 19 train
    [127, 255, 212],   # 20 tv/monitor
], dtype=np.uint8)

# ─── Model Singleton ─────────────────────────────────────────────────────────

_model = None
_preprocess = None
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def get_ffmpeg() -> str:
    """Return path to ffmpeg — uses bundled imageio-ffmpeg if system ffmpeg not found."""
    import shutil
    sys_ffmpeg = shutil.which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise RuntimeError(
            "ffmpeg not found. Install it: brew install ffmpeg  "
            "or: pip install imageio-ffmpeg"
        )


def get_model():
    """Load and cache the model (called once at startup)."""
    global _model, _preprocess
    if _model is None:
        logger.info(f"Loading DeepLabV3-ResNet50 on {DEVICE}...")
        weights = DeepLabV3_ResNet50_Weights.DEFAULT
        _model = deeplabv3_resnet50(weights=weights).to(DEVICE)
        _model.eval()
        _preprocess = weights.transforms()
        logger.info("Model loaded successfully.")
    return _model, _preprocess


# ─── Core Inference Helpers ───────────────────────────────────────────────────

def decode_segmap(seg_mask: np.ndarray) -> np.ndarray:
    """Convert (H,W) class index map → (H,W,3) RGB colour image."""
    return PALETTE[seg_mask % len(PALETTE)]


def segment_frame(frame_bgr: np.ndarray, alpha: float = 0.55):
    """
    Segment a single BGR frame.

    Returns:
        seg_rgb   : pure colour mask (H,W,3) uint8
        blend_bgr : original blended with mask (H,W,3) uint8
        detected  : set of detected class IDs (excluding background)
    """
    model, preprocess = get_model()
    h, w = frame_bgr.shape[:2]
    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(frame_rgb)

    inp = preprocess(pil_img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        out = model(inp)["out"]
        pred = out.argmax(dim=1).squeeze().cpu().numpy()

    pred_resized = cv2.resize(
        pred.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST
    )

    seg_rgb = decode_segmap(pred_resized)
    seg_bgr = cv2.cvtColor(seg_rgb, cv2.COLOR_RGB2BGR)
    blend_bgr = cv2.addWeighted(frame_bgr, 1 - alpha, seg_bgr, alpha, 0)
    detected = set(np.unique(pred_resized).tolist()) - {0}

    return seg_rgb, blend_bgr, detected


def make_legend_bar(class_ids: set, bar_w: int, bar_h: int = 40) -> np.ndarray:
    """Render a colour legend strip for detected classes."""
    bar = np.zeros((bar_h, bar_w, 3), dtype=np.uint8)
    classes = sorted(class_ids)
    if not classes:
        return bar
    sw = bar_w // max(len(classes), 1)
    for i, cid in enumerate(classes):
        x0, x1 = i * sw, min((i + 1) * sw, bar_w)
        color = PALETTE[cid % len(PALETTE)].tolist()
        bar[:, x0:x1] = color
        label = VOC_CLASSES[cid] if cid < len(VOC_CLASSES) else str(cid)
        cv2.putText(
            bar, label, (x0 + 3, bar_h - 8),
            cv2.FONT_HERSHEY_SIMPLEX, 0.38, (255, 255, 255), 1, cv2.LINE_AA,
        )
    return bar


# ─── Video Processing ─────────────────────────────────────────────────────────

def _reencode_h264(raw_path: str, final_path: str, fps: float):
    """
    Re-encode a raw opencv-written video to H.264 MP4 using ffmpeg.
    H.264 is required for browser <video> playback.
    """
    ffmpeg = get_ffmpeg()
    cmd = [
        ffmpeg, "-y",
        "-r", str(fps),          # Set input frame rate
        "-i", raw_path,
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",   # required for QuickTime / Safari
        "-preset", "medium",
        "-crf", "23",            # quality
        "-profile:v", "high",    # high compatibility profile
        "-level", "4.0",
        "-movflags", "+faststart",
        "-an",                   # no audio
        final_path,
    ]
    logger.info(f"Re-encoding to H.264: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error(f"ffmpeg error: {result.stderr[-500:]}")
        raise RuntimeError(f"ffmpeg re-encoding failed: {result.stderr[-300:]}")
    logger.info("H.264 re-encoding complete.")


def process_video(
    input_path: str,
    output_path: str,
    progress_callback=None,
    alpha: float = 0.55,
    max_dim: int = 640,
):
    """
    Process a video file frame-by-frame and write browser-compatible H.264 MP4.

    Args:
        input_path: path to input video
        output_path: path to write final H.264 MP4 (browser-playable)
        progress_callback: callable(pct: float, detected_names: list) or None
        alpha: blend alpha for overlay (0=original, 1=mask)
        max_dim: resize longest edge to this before inference (for speed)
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {input_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Resize to max_dim on longest edge (keeps aspect ratio)
    scale = min(max_dim / orig_w, max_dim / orig_h, 1.0)
    out_w = int(orig_w * scale)
    out_h = int(orig_h * scale)

    # H.264 requires even dimensions
    out_w = out_w if out_w % 2 == 0 else out_w - 1
    out_h = out_h if out_h % 2 == 0 else out_h - 1

    combined_w = out_w * 2
    combined_h = out_h + 44  # +44px for legend bar
    # also ensure combined dims are even
    combined_w = combined_w if combined_w % 2 == 0 else combined_w - 1
    combined_h = combined_h if combined_h % 2 == 0 else combined_h - 1

    # Write raw frames to a temp file first (mp4v is fastest for write)
    # then re-encode to H.264 for browser compatibility
    tmp_fd, tmp_path = tempfile.mkstemp(suffix="_raw.mp4")
    os.close(tmp_fd)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_path, fourcc, fps, (combined_w, combined_h))
    if not writer.isOpened():
        raise RuntimeError(f"Failed to open VideoWriter for {tmp_path}")

    frame_idx = 0
    all_detected = set()

    logger.info(f"Processing {total_frames} frames @ {fps:.1f} fps — output {combined_w}x{combined_h}")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Resize frame for inference
        if scale < 1.0 or frame.shape[1] != out_w or frame.shape[0] != out_h:
            frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)

        seg_rgb, blend_bgr, detected = segment_frame(frame, alpha=alpha)
        all_detected.update(detected)

        # Legend bar (colour + label per class)
        legend = make_legend_bar(all_detected, combined_w, bar_h=44)
        legend_bgr = cv2.cvtColor(legend, cv2.COLOR_RGB2BGR)

        # Side-by-side: original left | segmented overlay right
        side_by_side = np.hstack([frame, blend_bgr])
        combined = np.vstack([side_by_side, legend_bgr])

        writer.write(combined)
        frame_idx += 1

        if progress_callback and total_frames > 0:
            pct = round(frame_idx / total_frames * 100, 1)
            detected_names = [
                VOC_CLASSES[c] for c in sorted(all_detected) if c < len(VOC_CLASSES)
            ]
            progress_callback(pct, detected_names)

    cap.release()
    writer.release()
    logger.info(f"Raw frames written to temp: {tmp_path}")

    # Re-encode raw mp4v → H.264 for browser playback
    try:
        _reencode_h264(tmp_path, output_path, fps)
    finally:
        # Always clean up temp file
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    logger.info(f"Final H.264 output: {output_path}")
    return all_detected
