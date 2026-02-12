"""
Training script for flood vs attenuation binary classification.
Run: python train_flood_model.py
Requirements: tensorflow, matplotlib, numpy
"""

import os
import sys
from typing import Tuple

import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, optimizers

# --------- Config ---------
# Update DATASET_DIR to point to the root folder containing the two class folders.
DATASET_DIR = os.environ.get("FLOOD_DATASET_DIR", "./FloodIMG")
IMG_SIZE: Tuple[int, int] = (128, 128)
BATCH_SIZE = 32
EPOCHS = 10
MODEL_PATH = "flood_classifier.h5"
PLOT_PATH = "training_history.png"
VAL_SPLIT = 0.2
SEED = 42


def validate_dataset_path(path: str) -> None:
    if not os.path.isdir(path):
        raise FileNotFoundError(
            f"Dataset directory not found: {path}. Set FLOOD_DATASET_DIR or edit DATASET_DIR."
        )
    flood_dir = os.path.join(path, "flood")
    attenuation_dir = os.path.join(path, "attenuation")
    if not os.path.isdir(flood_dir) or not os.path.isdir(attenuation_dir):
        raise FileNotFoundError(
            "Dataset must contain 'flood/' and 'attenuation/' subfolders with images."
        )


def load_datasets():
    validate_dataset_path(DATASET_DIR)
    train_ds = tf.keras.preprocessing.image_dataset_from_directory(
        DATASET_DIR,
        validation_split=VAL_SPLIT,
        subset="training",
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
    )
    val_ds = tf.keras.preprocessing.image_dataset_from_directory(
        DATASET_DIR,
        validation_split=VAL_SPLIT,
        subset="validation",
        seed=SEED,
        image_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
    )
    # Cache and prefetch for performance.
    train_ds = train_ds.cache().shuffle(1000).prefetch(buffer_size=tf.data.AUTOTUNE)
    val_ds = val_ds.cache().prefetch(buffer_size=tf.data.AUTOTUNE)
    return train_ds, val_ds


def build_model(input_shape=(128, 128, 3)):
    model = models.Sequential([
        layers.Rescaling(1.0 / 255, input_shape=input_shape),
        layers.Conv2D(32, (3, 3), activation="relu", padding="same"),
        layers.MaxPooling2D(),
        layers.Conv2D(64, (3, 3), activation="relu", padding="same"),
        layers.MaxPooling2D(),
        layers.Conv2D(128, (3, 3), activation="relu", padding="same"),
        layers.MaxPooling2D(),
        layers.Flatten(),
        layers.Dense(128, activation="relu"),
        layers.Dense(2, activation="softmax"),
    ])
    model.compile(
        optimizer=optimizers.Adam(),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def plot_history(history: tf.keras.callbacks.History, path: str) -> None:
    acc = history.history.get("accuracy", [])
    val_acc = history.history.get("val_accuracy", [])
    epochs_range = range(1, len(acc) + 1)

    plt.figure(figsize=(6, 4))
    plt.plot(epochs_range, acc, label="Train Accuracy")
    plt.plot(epochs_range, val_acc, label="Val Accuracy")
    plt.xlabel("Epoch")
    plt.ylabel("Accuracy")
    plt.title("Training vs Validation Accuracy")
    plt.legend()
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()


def main():
    try:
        train_ds, val_ds = load_datasets()
    except FileNotFoundError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)

    model = build_model(input_shape=(IMG_SIZE[0], IMG_SIZE[1], 3))
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        verbose=1,
    )

    model.save(MODEL_PATH)
    plot_history(history, PLOT_PATH)

    print(f"Model saved to {MODEL_PATH}")
    print(f"Training plot saved to {PLOT_PATH}")


if __name__ == "__main__":
    main()
