from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).parent / "flood_classifier.h5"))
ALLOWED_TYPES = {"video/mp4", "video/avi", "video/x-msvideo"}

app = FastAPI(title="Flood Monitoring AI", version="1.0.0")
classifier_model: Optional[tf.keras.Model] = None


class InputLayerShim(tf.keras.layers.InputLayer):
    """Accept legacy configs that pass batch_shape instead of batch_input_shape."""

    def __init__(self, *args, batch_shape=None, **kwargs):
        if batch_shape is not None and "batch_input_shape" not in kwargs:
            kwargs["batch_input_shape"] = tuple(batch_shape)
        super().__init__(*args, **kwargs)


@app.on_event("startup")
def load_model() -> None:
    """Load the TensorFlow classifier once at startup."""
    global classifier_model
    if not MODEL_PATH.exists():
        raise RuntimeError(f"Model file not found at {MODEL_PATH}")
    # compile=False + safe_mode=False to tolerate legacy configs (e.g., batch_shape in InputLayer)
    custom_objects = {"InputLayer": InputLayerShim}
    classifier_model = tf.keras.models.load_model(
        MODEL_PATH,
        compile=False,
        safe_mode=False,
        custom_objects=custom_objects,
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def predict_flood_probability(frame: np.ndarray) -> float:
    """Resize, normalize, and run the TensorFlow classifier."""
    if classifier_model is None:
        raise RuntimeError("Model not loaded")
    resized = cv2.resize(frame, (128, 128))
    normalized = resized.astype("float32") / 255.0
    batch = np.expand_dims(normalized, axis=0)
    prediction = classifier_model.predict(batch, verbose=0)
    return float(np.squeeze(prediction))


def optical_flow_velocity(prev_gray: np.ndarray, curr_gray: np.ndarray) -> Optional[float]:
    """Compute average motion magnitude using Lucas-Kanade optical flow."""
    features = cv2.goodFeaturesToTrack(prev_gray, maxCorners=200, qualityLevel=0.01, minDistance=7, blockSize=7)
    if features is None:
        return None
    next_points, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, curr_gray, features, None, winSize=(15, 15), maxLevel=2)
    if next_points is None or status is None:
        return None
    good_new = next_points[status.flatten() == 1]
    good_old = features[status.flatten() == 1]
    if good_new.size == 0:
        return None
    magnitudes = np.linalg.norm(good_new - good_old, axis=1)
    return float(np.mean(magnitudes))


def analyze_video_file(path: Path) -> dict:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Could not read video stream")

    flood_scores: list[float] = []
    velocities: list[float] = []
    prev_gray: Optional[np.ndarray] = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            flood_prob = predict_flood_probability(frame)
            flood_scores.append(flood_prob)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if flood_prob > 0.5 and prev_gray is not None:
                velocity = optical_flow_velocity(prev_gray, gray)
                if velocity is not None:
                    velocities.append(velocity)
            prev_gray = gray
    finally:
        cap.release()

    if not flood_scores:
        raise HTTPException(status_code=400, detail="No frames decoded from video")

    avg_flood_prob = float(np.mean(flood_scores))
    avg_velocity = float(np.mean(velocities)) if velocities else 0.0

    # Reject obviously non-flood scenes (e.g., roads/dry areas) early
    if avg_flood_prob < 0.2:
        raise HTTPException(status_code=400, detail="Scene appears non-water; please upload flood-prone footage")

    if avg_flood_prob < 0.5:
        risk_level = "LOW"
    elif avg_velocity < 2:
        risk_level = "MODERATE"
    else:
        risk_level = "HIGH"

    return {
        "flood_probability": avg_flood_prob,
        "average_velocity": avg_velocity,
        "risk_level": risk_level,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)) -> dict:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type; use mp4 or avi")

    temp_dir = Path(tempfile.mkdtemp(prefix="flood-analyze-"))
    temp_path = temp_dir / file.filename

    try:
        with temp_path.open("wb") as buffer:
            content = await file.read()
            buffer.write(content)
        return analyze_video_file(temp_path)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Processing failed: {exc}") from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)
