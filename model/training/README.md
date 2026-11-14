# Training (offline)

`train_mnist.py` trains the approved `784 → 128 → 64 → 10` CPU MLP with
PyTorch 3.11-compatible dependencies. It downloads the official MNIST files
into the ignored `model/training/data/` directory, uses a deterministic
55,000/5,000 train/validation split, evaluates the untouched 10,000-image test
set after training, and writes the checkpoint, artifact, real samples, and
parity fixtures.

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe model\training\train_mnist.py
```

The script prints one JSON record per epoch and a final evaluation record. It
fails if tensors or losses contain non-finite values or if the calculated
parameter count is not 109,386.
