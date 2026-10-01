// `var`, not `const`: addNoteToTab may inject these scripts into a page twice, and a redeclared `const` throws.
var SHARED_CSS = `
  [data-color="yellow"] { --paper: #ffeb8a; --paper-edge: #fbdd5f; }
  [data-color="pink"] { --paper: #ffc9d6; --paper-edge: #ffb1c4; }
  [data-color="green"] { --paper: #cdefc2; --paper-edge: #b5e5a6; }
  [data-color="blue"] { --paper: #c5e3ff; --paper-edge: #a9d3fb; }
  [data-color="purple"] { --paper: #dfd0ff; --paper-edge: #cdb8fa; }

  .note {
    --ink: #3a3122;
    color: var(--ink);
  }

  .delete {
    position: relative;
    flex: none;
    min-width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 200ms cubic-bezier(0.32, 0.72, 0, 1);
  }
  .delete:hover { background: rgb(58 49 34 / 0.12); }
  .delete:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  .delete::before,
  .delete::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 11px;
    height: 1.5px;
    border-radius: 1px;
    background: currentColor;
    translate: -50% -50%;
    rotate: 45deg;
  }
  .delete::after { rotate: -45deg; }
  .delete .label { display: none; }
  .delete[data-armed] { padding: 0 9px; background: #a8231c; color: #fff; }
  .delete[data-armed]::before,
  .delete[data-armed]::after { display: none; }
  .delete[data-armed] .label { display: inline; }
`;

function adoptStyles(target, css) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
}

function h(tag, { dataset, ...props } = {}, ...children) {
  const element = Object.assign(document.createElement(tag), props);
  Object.assign(element.dataset, dataset);
  element.append(...children);
  return element;
}

function deleteButton(onDelete, needsConfirm) {
  const button = h(
    "button",
    { type: "button", className: "delete", ariaLabel: "Delete note" },
    h("span", { className: "label", textContent: "Delete?" }),
  );
  let disarm;
  button.addEventListener("click", () => {
    if (button.dataset.armed || !needsConfirm()) {
      clearTimeout(disarm);
      onDelete();
      return;
    }
    button.dataset.armed = "true";
    button.ariaLabel = "Confirm delete";
    disarm = setTimeout(() => {
      delete button.dataset.armed;
      button.ariaLabel = "Delete note";
    }, 3000);
  });
  return button;
}
