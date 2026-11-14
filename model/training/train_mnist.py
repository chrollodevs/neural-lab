"""Train and export Neural Lab's approved MNIST MLP.

The script deliberately owns the complete offline contract: deterministic
splitting, evaluation, JSON export, real sample export, and parity fixtures.
"""

from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "model" / "training" / "data"
EXPORT_DIR = ROOT / "model" / "exported"
CHECKPOINT_DIR = ROOT / "model" / "training" / "checkpoints"
SEED = 42


class MnistMLP(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(784, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 10),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x.view(x.shape[0], -1))


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


def evaluate(
    model: MnistMLP,
    loader: DataLoader,
    loss_fn: nn.Module,
) -> tuple[float, float]:
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0
    with torch.inference_mode():
        for images, labels in loader:
            logits = model(images)
            loss = loss_fn(logits, labels)
            total_loss += float(loss.item()) * labels.size(0)
            correct += int((logits.argmax(dim=1) == labels).sum().item())
            total += labels.size(0)
    return total_loss / total, correct / total


def validate_finite(model: MnistMLP) -> None:
    for name, tensor in model.state_dict().items():
        if not torch.isfinite(tensor).all():
            raise RuntimeError(f"Non-finite values found in tensor {name}.")


def parameter_count(model: MnistMLP) -> int:
    return sum(parameter.numel() for parameter in model.parameters())


def tensor_to_nested(tensor: torch.Tensor) -> list:
    return tensor.detach().cpu().tolist()


def export_artifact(
    model: MnistMLP,
    history: list[dict[str, float | int]],
    test_loss: float,
    test_accuracy: float,
    epochs: int,
) -> dict:
    layers = [
        {"name": "hidden_1", "units": 128, "activation": "relu"},
        {"name": "hidden_2", "units": 64, "activation": "relu"},
        {"name": "output", "units": 10, "activation": "softmax"},
    ]
    state = model.state_dict()
    exported_layers = []
    for index, name in enumerate(("0", "2", "4")):
        weight = state[f"net.{name}.weight"]
        bias = state[f"net.{name}.bias"]
        if weight.ndim != 2 or bias.ndim != 1:
            raise RuntimeError(f"Unexpected tensor rank in layer {name}.")
        if not torch.isfinite(weight).all() or not torch.isfinite(bias).all():
            raise RuntimeError(f"Non-finite tensor in layer {name}.")
        exported_layers.append(
            {
                "name": layers[index]["name"],
                "weights": tensor_to_nested(weight),
                "biases": tensor_to_nested(bias),
            }
        )

    return {
        "architecture": {
            "layers": [
                {"name": "input", "units": 784, "activation": "none"},
                *layers,
            ]
        },
        "layers": exported_layers,
        "metadata": {
            "dataset": "MNIST official train/test files",
            "datasetSplit": "55,000 train / 5,000 validation / 10,000 test",
            "input": "28x28 row-major grayscale white-on-black values in [0,1]",
            "framework": "PyTorch",
            "device": "cpu",
            "seed": SEED,
            "optimizer": "Adam",
            "learningRate": 0.001,
            "batchSize": 128,
            "epochs": epochs,
            "loss": "CrossEntropyLoss",
            "history": history,
            "testLoss": test_loss,
            "accuracy": test_accuracy,
            "parameterCount": parameter_count(model),
            "exportedAt": datetime.now(timezone.utc).isoformat(),
        },
    }


def forward_reference(model: MnistMLP, image: torch.Tensor) -> dict:
    x = image.reshape(-1)
    z1 = model.net[0](x)
    a1 = torch.relu(z1)
    z2 = model.net[2](a1)
    a2 = torch.relu(z2)
    logits = model.net[4](a2)
    probabilities = torch.softmax(logits, dim=0)
    return {
        "input": tensor_to_nested(x),
        "firstPreActivations": tensor_to_nested(z1),
        "firstActivations": tensor_to_nested(a1),
        "secondPreActivations": tensor_to_nested(z2),
        "secondActivations": tensor_to_nested(a2),
        "logits": tensor_to_nested(logits),
        "probabilities": tensor_to_nested(probabilities),
        "predictedClass": int(probabilities.argmax().item()),
    }


def export_samples(dataset: datasets.MNIST) -> None:
    by_label: dict[int, dict] = {}
    for image, label in dataset:
        label_int = int(label)
        if label_int not in by_label:
            tensor = image.squeeze(0)
            by_label[label_int] = {
                "label": label_int,
                "tensor": tensor_to_nested(tensor.reshape(-1)),
            }
        if len(by_label) == 10:
            break
    if len(by_label) != 10:
        raise RuntimeError("Could not find one real MNIST sample for every class.")
    (EXPORT_DIR / "samples.json").write_text(
        json.dumps([by_label[i] for i in range(10)], separators=(",", ":")),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()
    if args.epochs < 1:
        raise ValueError("--epochs must be positive.")

    seed_everything(SEED)
    transform = transforms.ToTensor()
    train_full = datasets.MNIST(DATA_DIR, train=True, download=True, transform=transform)
    test_dataset = datasets.MNIST(DATA_DIR, train=False, download=True, transform=transform)
    split_generator = torch.Generator().manual_seed(SEED)
    train_dataset, validation_dataset = random_split(
        train_full, [55_000, 5_000], generator=split_generator
    )
    train_loader = DataLoader(train_dataset, batch_size=128, shuffle=True, num_workers=0)
    validation_loader = DataLoader(validation_dataset, batch_size=128, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_dataset, batch_size=128, shuffle=False, num_workers=0)

    model = MnistMLP()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
    loss_fn = nn.CrossEntropyLoss()
    history: list[dict[str, float | int]] = []
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    log_path = CHECKPOINT_DIR / "training.log"
    log_path.write_text("", encoding="utf-8")

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        for images, labels in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = loss_fn(logits, labels)
            if not torch.isfinite(loss):
                raise RuntimeError(f"Non-finite training loss at epoch {epoch}.")
            loss.backward()
            optimizer.step()
            train_loss += float(loss.item()) * labels.size(0)
            train_correct += int((logits.argmax(dim=1) == labels).sum().item())
            train_total += labels.size(0)

        validation_loss, validation_accuracy = evaluate(model, validation_loader, loss_fn)
        record = {
            "epoch": epoch,
            "trainLoss": train_loss / train_total,
            "trainAccuracy": train_correct / train_total,
            "validationLoss": validation_loss,
            "validationAccuracy": validation_accuracy,
        }
        history.append(record)
        with log_path.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record) + "\n")
        print(json.dumps(record), flush=True)

    validate_finite(model)
    test_loss, test_accuracy = evaluate(model, test_loader, loss_fn)
    artifact = export_artifact(model, history, test_loss, test_accuracy, args.epochs)
    expected_count = 109_386
    if artifact["metadata"]["parameterCount"] != expected_count:
        raise RuntimeError("Calculated parameter count does not match the approved architecture.")

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(
        {"model": model.state_dict(), "configuration": artifact["metadata"]},
        CHECKPOINT_DIR / "mnist-mlp.pt",
    )
    (EXPORT_DIR / "mnist-mlp.json").write_text(
        json.dumps(artifact, separators=(",", ":")), encoding="utf-8"
    )
    export_samples(train_full)
    fixtures = [
        {"name": "mnist-sample-0", **forward_reference(model, train_full[0][0])},
        {
            "name": "synthetic-zero",
            **forward_reference(model, torch.zeros((1, 28, 28))),
        },
    ]
    (EXPORT_DIR / "parity-fixtures.json").write_text(
        json.dumps(fixtures, separators=(",", ":")), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "parameterCount": artifact["metadata"]["parameterCount"],
                "testLoss": test_loss,
                "testAccuracy": test_accuracy,
                "artifact": str(EXPORT_DIR / "mnist-mlp.json"),
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
