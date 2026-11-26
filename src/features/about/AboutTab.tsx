import { clearIntroFlag } from '../../components/Intro/Intro';
import './AboutTab.css';

interface AboutTabProps {
  onBack: () => void;
}

export function AboutTab({ onBack }: AboutTabProps) {
  return (
    <main className="about-page">
      <header className="about-page-header">
        <div className="about-wordmark">
          <strong>Neural Lab</strong>
          <span>Project Presentation</span>
        </div>
        <button type="button" className="about-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Return to lab
        </button>
      </header>

      <div className="about-page-body">
        <section className="about-hero">
          <span className="about-eyebrow">Academic Neural-Network Instrument</span>
          <h1>Look closely at a real neural network.</h1>
          <p>
            Neural Lab is an interactive educational application built around a
            real neural network trained to recognize handwritten digits using
            the MNIST dataset. Its purpose is to make neural-network
            computation more understandable through interactive visualization.
          </p>
        </section>

        <div className="about-page-grid">
          <section className="about-block about-academics">
            <span className="about-label">Academic context</span>
            <dl>
              <div><dt>University</dt><dd>Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj</dd></div>
              <div><dt>Faculty</dt><dd>Faculty of Mathematics and Computer Science</dd></div>
              <div><dt>Specialty</dt><dd>Computer Science</dd></div>
              <div><dt>Academic level</dt><dd>Third-year undergraduate — Licence</dd></div>
            </dl>
          </section>

          <section className="about-block">
            <span className="about-label">Project team</span>
            <ul className="about-team">
              <li>Mihoub Islam</li>
              <li>Guissous Mahfoud</li>
              <li>Anis Benyahiya</li>
            </ul>
          </section>

          <section className="about-block about-purpose">
            <span className="about-label">What the project demonstrates</span>
            <ul className="about-features">
              <li>Handwritten digit recognition.</li>
              <li>Neural-network architecture and forward propagation.</li>
              <li>Neuron activations and connections.</li>
              <li>Prediction probabilities.</li>
              <li>Model behavior and occlusion-based sensitivity analysis.</li>
              <li>Browser-based inference using exported model weights.</li>
            </ul>
          </section>

          <section className="about-block about-model">
            <span className="about-label">The instrument</span>
            <p>
              A 28 × 28 grayscale input is passed through a{' '}
              <strong>784 → 128 → 64 → 10</strong> multilayer perceptron.
              The browser stores the real forward-pass trace so the network,
              activations, probabilities, and sensitivity view remain connected
              to the computation.
            </p>
          </section>
        </div>
      </div>

      <footer className="about-page-footer">
        <span>MNIST · Browser Inference · Educational Project</span>
        <div className="about-footer-right">
          <button
            type="button"
            className="about-replay-btn"
            onClick={() => { clearIntroFlag(); window.location.reload(); }}
            title="Replay the opening intro sequence"
          >
            Replay intro
          </button>
          <span>Neural Lab</span>
        </div>
      </footer>
    </main>
  );
}
