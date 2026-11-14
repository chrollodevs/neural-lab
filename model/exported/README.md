# Exported weights

`mnist-mlp.json` is the browser-loadable artifact produced by
`model/training/train_mnist.py`. `samples.json` contains one genuine MNIST
sample for each class, and `parity-fixtures.json` stores Python reference
traces for cross-runtime verification.

The UI must treat a missing or malformed export as a hard failure, never as a
source of fabricated inference.
