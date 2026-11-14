import json
import sys
import unittest
from pathlib import Path

import torch
from torchvision import datasets, transforms

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "model" / "training"))
from preprocess import preprocess_alpha_raster  # noqa: E402


class PipelineRegressionTests(unittest.TestCase):
    def test_empty_raster_is_zero_tensor(self):
        tensor = preprocess_alpha_raster([0] * 64, 8, 8)
        self.assertEqual(len(tensor), 784)
        self.assertTrue(all(value == 0 for value in tensor))

    def test_off_center_shape_is_centered(self):
        left = [0] * (40 * 40)
        right = [0] * (40 * 40)
        for y in range(10, 30):
            for x in range(4, 14):
                left[y * 40 + x] = 255
            for x in range(26, 36):
                right[y * 40 + x] = 255
        self.assertEqual(preprocess_alpha_raster(left, 40, 40), preprocess_alpha_raster(right, 40, 40))

    def test_center_of_mass_is_near_target(self):
        raster = [0] * (40 * 40)
        for y in range(4, 14):
            for x in range(20, 30):
                raster[y * 40 + x] = 255
        tensor = preprocess_alpha_raster(raster, 40, 40)
        mass = sum(tensor)
        center_x = sum((index % 28) * value for index, value in enumerate(tensor)) / mass
        center_y = sum((index // 28) * value for index, value in enumerate(tensor)) / mass
        self.assertLessEqual(abs(center_x - 13.5), 0.5)
        self.assertLessEqual(abs(center_y - 13.5), 0.5)

    def test_small_and_large_strokes_have_valid_shape_and_range(self):
        for size in (2, 10, 40):
            raster = [0] * (60 * 60)
            start = (60 - size) // 2
            for y in range(start, start + size):
                for x in range(start, start + size):
                    raster[y * 60 + x] = 255
            tensor = preprocess_alpha_raster(raster, 60, 60)
            self.assertEqual(len(tensor), 784)
            self.assertGreater(max(tensor), 0)
            self.assertGreaterEqual(min(tensor), 0)
            self.assertLessEqual(max(tensor), 1)

    def test_exported_samples_are_real_model_inputs(self):
        samples = json.loads((ROOT / "model" / "exported" / "samples.json").read_text())
        self.assertEqual([sample["label"] for sample in samples], list(range(10)))
        self.assertTrue(all(len(sample["tensor"]) == 784 for sample in samples))
        self.assertTrue(all(0 <= value <= 1 for sample in samples for value in sample["tensor"]))

    def test_export_metadata_accepts_non_default_epoch_configuration(self):
        sys.path.insert(0, str(ROOT / "model" / "training"))
        from train_mnist import MnistMLP, export_artifact

        model = MnistMLP()
        artifact = export_artifact(model, [], 0.0, 0.0, epochs=3)
        self.assertEqual(artifact["metadata"]["epochs"], 3)

    def test_checkpoint_matches_reported_test_metrics(self):
        checkpoint = torch.load(
            ROOT / "model" / "training" / "checkpoints" / "mnist-mlp.pt",
            map_location="cpu",
            weights_only=False,
        )
        class CheckpointModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.net = torch.nn.Sequential(
                    torch.nn.Linear(784, 128),
                    torch.nn.ReLU(),
                    torch.nn.Linear(128, 64),
                    torch.nn.ReLU(),
                    torch.nn.Linear(64, 10),
                )

            def forward(self, images):
                return self.net(images.view(images.shape[0], -1))

        model = CheckpointModel()
        model.load_state_dict(checkpoint["model"])
        model.eval()
        dataset = datasets.MNIST(
            ROOT / "model" / "training" / "data",
            train=False,
            download=False,
            transform=transforms.ToTensor(),
        )
        loader = torch.utils.data.DataLoader(dataset, batch_size=128, shuffle=False)
        loss_fn = torch.nn.CrossEntropyLoss()
        loss_total = 0.0
        correct = 0
        with torch.inference_mode():
            for images, labels in loader:
                logits = model(images)
                loss_total += loss_fn(logits, labels).item() * labels.size(0)
                correct += int((logits.argmax(1) == labels).sum())
        self.assertAlmostEqual(loss_total / len(dataset), 0.08965039884769357, places=10)
        self.assertAlmostEqual(correct / len(dataset), 0.9746, places=10)


if __name__ == "__main__":
    unittest.main()
