# Neural Lab

An interactive, browser-based neural network laboratory for exploring handwritten digit recognition, forward propagation, activations, and model predictions.

Neural Lab turns a drawn or supplied MNIST digit into a 28 × 28 input tensor, runs a real multilayer perceptron in the browser, and exposes the intermediate computation. It is intended for learners and instructors who want to inspect the mechanics of an inference pass rather than treat a prediction as a black box.

## What to explore

- Draw a digit or load one genuine MNIST sample for each class.
- Run the browser-side forward pass explicitly.
- Inspect the `784 → 128 → 64 → 10` dense network, ReLU activations, and output probabilities.
- View the stored forward trace used by the network visualization.
- Use occlusion sensitivity to see how masking input regions changes the predicted-class probability. This is an output-sensitivity method, not proof that the model understands a human-defined feature.

## Model

The model is a dense multilayer perceptron:

```text
784 inputs (28 × 28 grayscale)
  → 128 hidden units, ReLU
  → 64 hidden units, ReLU
  → 10 outputs, softmax
```

The exported JSON contains 109,386 parameters. The browser uses a custom `Float32Array` forward pass; no backend or hosted inference service is required. The distributed artifact was trained with PyTorch on the official MNIST train/test files using a deterministic 55,000/5,000 train/validation split and the untouched 10,000-image test set. Its recorded test accuracy is **97.46%** (`0.9746`) on that test split. This is an evaluation result for this exported checkpoint, not a guarantee for user drawings.

## Run locally

Requirements:

- Node.js 20 or newer
- pnpm 10 or newer

Install dependencies and start Vite:

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Vite.

## Verify and build

```powershell
pnpm typecheck
pnpm test:regression
pnpm build
pnpm preview
```

The regression tests validate the exported artifact schema, parameter count, real sample coverage, Python reference parity fixtures, softmax stability, and occlusion-window behavior. The production build includes the browser model and sample JSON under `model/`.

## Deploy to GitHub Pages

The Vite configuration uses `/neural-lab/` as the project-site base path. If the GitHub repository is given a different name, update `base` in `vite.config.ts` before publishing.

The workflow in `.github/workflows/deploy-pages.yml` installs from the committed pnpm lockfile, runs the production build, and deploys `dist/` through GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Pushes to `main` then deploy automatically.

## Repository layout

```text
src/                         React, TypeScript, inference, preprocessing, and visualizations
public/model/                Runtime copies of the browser model and MNIST samples
model/exported/              Canonical JSON export and parity fixtures
model/training/              Offline training and export scripts (no datasets or checkpoints)
tests/                       Node regression tests for the model contract
```

The raw MNIST files, Python virtual environment, training checkpoint, training log, private agent/editor configuration, internal research notes, and generated build output are intentionally excluded from the public repository.

## Technologies

React, TypeScript, Vite, CSS, the browser Canvas API, and PyTorch for offline model training/export.

## Licensing and data provenance

The application source is original project code. A license should be added for that code after confirming the intended scope. The MNIST dataset, React/Vite/TypeScript dependencies, fonts, and model artifact are third-party or derived materials with their own provenance and distribution considerations; this repository does not claim ownership of them.
