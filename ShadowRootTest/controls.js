// Shared helpers for the shadow root test pages.

// Appends a textarea and a select with a few options to the given root.
function addControls(root) {
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Type here';

  const select = document.createElement('select');
  for (const label of ['Option 1', 'Option 2', 'Option 3']) {
    select.add(new Option(label, label));
  }

  root.append(textarea, document.createElement('br'), select);
}

// Attaches a shadow root of the given mode to the element with the given id.
function attachShadowTo(id, mode) {
  return document.getElementById(id).attachShadow({ mode });
}
