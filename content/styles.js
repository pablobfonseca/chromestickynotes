// `var`, not `const`: addNoteToTab may inject these scripts into a page twice, and a redeclared `const` throws.
var NOTE_CSS = `
  :host {
    all: initial !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    z-index: 2147483647 !important;
  }

  .note {
    --ease: cubic-bezier(0.32, 0.72, 0, 1);
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    width: 240px;
    border-radius: 2px 2px 16px 2px / 2px 2px 4px 2px;
    background: linear-gradient(var(--paper-edge), var(--paper) 36px);
    box-shadow:
      0 1px 1px rgb(58 49 34 / 0.1),
      0 6px 12px -3px rgb(58 49 34 / 0.16),
      0 18px 28px -14px rgb(58 49 34 / 0.22);
    font: 15px / 1.45 ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    rotate: var(--tilt);
    transition: rotate 300ms var(--ease), scale 300ms var(--ease), box-shadow 300ms var(--ease);
    animation: stick 320ms var(--ease) backwards;
  }
  .note:focus-within,
  .note.dragging { z-index: 1; rotate: 0deg; }
  .note.dragging {
    scale: 1.03;
    box-shadow:
      0 2px 2px rgb(58 49 34 / 0.08),
      0 16px 28px -6px rgb(58 49 34 / 0.22),
      0 36px 48px -18px rgb(58 49 34 / 0.28);
  }

  @keyframes stick {
    from { opacity: 0; scale: 1.1; }
  }

  .bar {
    display: flex;
    align-items: center;
    height: 34px;
    padding: 0 6px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .note.dragging .bar { cursor: grabbing; }

  .swatches { display: flex; margin-right: auto; }
  .swatches,
  .delete { opacity: 0; transition: opacity 200ms var(--ease), background-color 200ms var(--ease); }
  .note:hover :is(.swatches, .delete),
  .note:focus-within :is(.swatches, .delete),
  .delete[data-armed] { opacity: 1; }

  .swatch {
    display: grid;
    place-items: center;
    width: 22px;
    height: 24px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .swatch::before {
    content: "";
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--paper-edge);
    box-shadow: inset 0 0 0 1px rgb(58 49 34 / 0.3);
    transition: scale 200ms var(--ease);
  }
  .swatch:hover::before { scale: 1.2; }
  .swatch[aria-pressed="true"]::before,
  .swatch:focus-visible::before { outline: 1.5px solid var(--ink); outline-offset: 1.5px; }
  .swatch:focus-visible { outline: none; }

  textarea {
    field-sizing: content;
    box-sizing: border-box;
    width: 100%;
    min-height: 92px;
    max-height: min(60vh, 420px);
    margin: 0;
    padding: 2px 14px 16px;
    border: 0;
    outline: 0;
    resize: none;
    overflow-y: auto;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  textarea::placeholder { color: rgb(58 49 34 / 0.55); }

  @media (prefers-reduced-motion: reduce) {
    .note { animation: none; transition: none; }
  }
`;
