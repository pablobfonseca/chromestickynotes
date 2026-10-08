// `var`, not `const`: addNoteToTab may inject these scripts into a page twice, and a redeclared `const` throws.
var NOTE_CSS = `
  :host {
    all: initial !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 2147483647 !important;
  }

  iframe {
    --ease: cubic-bezier(0.32, 0.72, 0, 1);
    position: fixed;
    top: 0;
    left: 0;
    display: block;
    width: 240px;
    height: 126px;
    border: 0;
    border-radius: 2px 2px 16px 2px / 2px 2px 4px 2px;
    background: transparent;
    color-scheme: light;
    box-shadow:
      0 1px 1px rgb(58 49 34 / 0.1),
      0 6px 12px -3px rgb(58 49 34 / 0.16),
      0 18px 28px -14px rgb(58 49 34 / 0.22);
    rotate: var(--tilt);
    transition: rotate 300ms var(--ease), scale 300ms var(--ease), box-shadow 300ms var(--ease);
    animation: stick 320ms var(--ease) backwards;
  }
  iframe:focus,
  iframe.dragging { z-index: 1; rotate: 0deg; }
  iframe.dragging {
    scale: 1.03;
    box-shadow:
      0 2px 2px rgb(58 49 34 / 0.08),
      0 16px 28px -6px rgb(58 49 34 / 0.22),
      0 36px 48px -18px rgb(58 49 34 / 0.28);
  }

  .drag-overlay {
    position: fixed;
    inset: 0;
    z-index: 2;
    cursor: grabbing;
  }

  @keyframes stick {
    from { opacity: 0; scale: 1.1; }
  }

  @media (prefers-reduced-motion: reduce) {
    iframe { animation: none; transition: none; }
  }
`;
