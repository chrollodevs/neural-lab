# Neural Lab

An interactive, browser-based neural network laboratory for exploring handwritten digit recognition, forward propagation, activations, and model predictions.

Neural Lab turns a drawn or supplied MNIST digit into a 28 × 28 grayscale tensor, runs a real multilayer perceptron (`784 → 128 → 64 → 10`) directly in the browser, and visualizes the resulting activations, weighted connections, and class probabilities. It is designed as an educational instrument for inspecting what happens inside a trained neural network rather than treating predictions as a black box.

## Educational Purpose

Neural Lab was built as a third-year Computer Science undergraduate project (Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj) to make forward propagation, ReLU activations, softmax probabilities, and input sensitivity tangible through direct visual inspection.

## Key Features

- **Interactive Network Visualization:** Canvas 2D rendering of the `784 → 128 → 64 → 10` network with cubic Bézier bundle routing, layer-tinted signal streaks, and hover/click inspection showing real pre-activation ($z$), activation ($a$), and probability values.
- **Digit Input & Preprocessing:** Draw a digit on a 280 × 280 canvas (automatically cropped, scaled to 20 × 20, and centered by center of mass into 28 × 28) or select one of 10 real MNIST test samples (`0–9`).
- **Explicit Forward Pass:** Inference runs locally in the browser on demand via `Run Inference` without any backend server.
- **Six Workspace Views:**
  - **Overview:** Model architecture, dataset summary, parameter count (`109,386`), and current experiment state.
  - **Network:** Layer breakdown and pinned node selection readout.
  - **Activations:** Full numeric activation vectors per layer and softmax probability distribution.
  - **Explain:** An interactive 3D neural network introduction (`<model-viewer>`), followed by a step-by-step breakdown of the current forward pass and 169-window **occlusion sensitivity** analysis.
  - **Input:** Drawing pad and real MNIST sample selector.
  - **About:** Academic context, project team, and intro sequence replay.

## Screenshots

<!-- Add screenshots of the Network tab, Explain tab 3D viewer, and Occlusion map before publishing -->
- *[Placeholder: Main Network visualization after inference]*
- *[Placeholder: Explain tab — 3D neural network introduction & occlusion sensitivity map]*

## How It Works

1. **Model Loading:** On startup, the browser fetches `public/model/mnist-mlp.json`, validates the layer shapes and weights, and loads them into `Float32Array` typed arrays.
2. **Preprocessing:** Drawings are thresholded, cropped to their bounding box, aspect-scaled into a 20 × 20 box using bilinear sampling, and shifted by center of mass into a 28 × 28 `[0, 1]` tensor.
3. **Inference (`784 → 128 → 64 → 10`):**
   - Hidden 1: `784 → 128` linear transform ($z = Wx + b$) + `ReLU`
   - Hidden 2: `128 → 64` linear transform + `ReLU`
   - Output: `64 → 10` logits + numerically stable `Softmax`
4. **Visualization & Occlusion:** The frozen `ForwardTrace` drives the Canvas 2D visualization, numeric activation tables, and a 4 × 4 stride-2 occlusion pass (`169` windows) in the Explain tab.

## Neural Network & Training Provenance

- **Architecture:** Dense MLP (`784 → 128 → 64 → 10`), **109,386 trainable parameters**.
- **Training (Offline):** Trained with PyTorch (`model/training/train_mnist.py`) on the official MNIST dataset using a deterministic `55,000` train / `5,000` validation / `10,000` test split (`Adam`, `lr = 0.001`, `CrossEntropyLoss`, `10` epochs, seed `42`).
- **Browser Inference:** Custom `Float32Array` matrix-vector multiplication in `src/model/forward.ts` (no backend, no TensorFlow.js, no ONNX Runtime).

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, CSS3
- **2D Network Visualization:** HTML5 Canvas 2D
- **3D Introduction Viewer:** Google `<model-viewer>` (`v3.5.0`, loaded on demand from CDN for `public/neural-network.glb`)
- **Offline Model Training & Export:** Python, PyTorch, NumPy
- **Deployment:** GitHub Actions → GitHub Pages (`.github/workflows/deploy-pages.yml`)

## Run Locally

### Requirements

- Node.js 20 or newer
- pnpm 10 or newer

### Setup and Development

```bash
git clone <your-repository-url>
cd neural-lab
pnpm install
pnpm dev
```

Open the local URL printed by Vite (by default `http://localhost:5173`, or pass `--port 3000`).

### Verification & Production Build

```bash
pnpm typecheck
pnpm test:regression
pnpm build
pnpm preview
```

`pnpm test:regression` runs Node's built-in test runner against `tests/regression.test.mjs`, verifying the exported model schema, parameter count (`109,386`), sample coverage, PyTorch parity fixtures, softmax numerical stability, and 169-window occlusion behavior.

## Deployment (GitHub Pages)

The repository includes `.github/workflows/deploy-pages.yml`, which builds `dist/` with `VITE_BASE_PATH=/neural-lab/` and deploys to GitHub Pages on pushes to `main`.

- If you rename the repository, update `VITE_BASE_PATH` in `.github/workflows/deploy-pages.yml` to match `/<repo-name>/`.
- In GitHub repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Repository Structure

```text
src/
  animation/        Forward-pass propagation timing
  components/       Header, TabNav, RunControl, NetworkCanvas, NetworkViewer, Intro
  explain/          169-window occlusion sensitivity analysis
  features/         Overview, Network, Activations, Explain, Input, About tabs
  model/            JSON artifact loader and Float32Array forward pass
  preprocess/       Drawing raster cropping, scaling, and centering
  state/            React Context application state
  styles/           Design tokens and global styles
  visualizations/   Canvas 2D layout, hit-testing, and renderer
public/
  model/            Runtime model JSON, sample inputs, and parity fixtures
  neural-network.glb
model/
  exported/         Canonical exported JSON artifacts and parity fixtures
  training/         Offline PyTorch training and preprocessing scripts
  tests/            Python pipeline unit tests
tests/              Node regression tests
```

## Limitations

- **Single-digit MNIST scope:** Trained only on centered 28 × 28 white-on-black digits (`0–9`). Performance on freehand drawings depends on centering and stroke clarity.
- **MLP vs. CNN:** Flattening pixels into a 784-element vector makes the model less shift- and rotation-invariant than a convolutional network.
- **Sampled connections:** For legibility, the Canvas 2D view renders a deterministic subset (~620 sampled connections per layer transition) rather than all 109,248 dense edges simultaneously.
- **Occlusion sensitivity:** Masking 4 × 4 regions measures local probability sensitivity; it does not prove semantic stroke understanding.
- **Session-only state:** Drawn inputs and traces live in memory and reset on reload.

## Attribution & Licensing

- **Project Code:** Original educational source code by Mihoub Islam, Guissous Mahfoud, and Anis Benyahiya. Add a `LICENSE` file (e.g., MIT) before publishing if you intend to open-source the code.
- **UI Inspirations:** Button and capsule/popover surface treatments include adapted MIT-licensed CSS references from Uiverse.io (`dexter-st` and `uiverse-astronaut`, credited in the corresponding CSS files).
- **Third-Party Materials:** React, Vite, TypeScript, PyTorch, Google `<model-viewer>`, Google Fonts (`Inter`, `IBM Plex Mono`), the MNIST dataset, and the 3D `.glb` asset remain subject to their respective licenses and provenance.
