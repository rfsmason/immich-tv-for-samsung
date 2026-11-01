// Feedback pop-up: opens the Microsoft Forms feedback form in a centred
// dialog. Without JavaScript (or without <dialog> support) the button stays a
// normal link that opens the form in a new tab. The form's iframe is created
// on the first open only, so nothing from Microsoft loads until then, and it
// is kept when the dialog closes, so answers in progress survive.
(function () {
  "use strict";

  var dialog = document.getElementById("feedback-dialog");
  var button = document.querySelector("[data-feedback-open]");

  if (!dialog || !button || typeof dialog.showModal !== "function") {
    return;
  }

  var frame = dialog.querySelector("[data-feedback-frame]");
  var loading = dialog.querySelector("[data-feedback-loading]");

  button.setAttribute("aria-haspopup", "dialog");

  function loadForm() {
    if (frame.querySelector("iframe")) {
      return;
    }

    var iframe = document.createElement("iframe");

    iframe.title = "Immich TV for Samsung feedback and interest form";
    iframe.addEventListener("load", function () {
      loading.hidden = true;
      frame.removeAttribute("aria-busy");
    });
    frame.setAttribute("aria-busy", "true");
    iframe.src = frame.getAttribute("data-form-src");
    frame.appendChild(iframe);
  }

  button.addEventListener("click", function (event) {
    // Let modified clicks (new tab, new window) behave as normal links.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    loadForm();
    // showModal moves focus into the dialog, onto its close button.
    dialog.showModal();
  });

  dialog.addEventListener("click", function (event) {
    // A click on the dimmed backdrop lands on the dialog element itself.
    if (event.target === dialog || event.target.closest("[data-close-feedback]")) {
      dialog.close();
    }
  });

  // Escape closes the dialog natively; every way of closing returns focus.
  dialog.addEventListener("close", function () {
    button.focus();
  });
})();
