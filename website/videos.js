// Demo video gallery: opens a tile's YouTube video in a centred player.
// Without JavaScript (or without <dialog> support) each tile stays a normal
// link to the video on YouTube. The player iframe is created only when a
// video is chosen and removed on close, so nothing from YouTube's player
// loads until then and playback always stops when the dialog closes.
(function () {
  "use strict";

  var dialog = document.getElementById("video-dialog");

  if (!dialog || typeof dialog.showModal !== "function") {
    return;
  }

  var frame = dialog.querySelector("[data-video-frame]");
  var heading = document.getElementById("video-dialog-title");
  var youtubeLink = dialog.querySelector("[data-video-link]");
  var opener = null;

  function openVideo(tile) {
    var id = tile.getAttribute("data-video-id");

    if (!id || !/^[\w-]{11}$/.test(id)) {
      return false;
    }

    var title = tile.getAttribute("data-video-title") || "Demo video";
    var iframe = document.createElement("iframe");

    iframe.src = "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&playsinline=1";
    iframe.title = title;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    heading.textContent = title;
    youtubeLink.href = "https://youtu.be/" + id;
    frame.replaceChildren(iframe);
    opener = tile;
    dialog.showModal();
    return true;
  }

  document.addEventListener("click", function (event) {
    var tile = event.target.closest("[data-video-id]");

    // Let modified clicks (new tab, new window) behave as normal links.
    if (
      !tile ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (openVideo(tile)) {
      event.preventDefault();
    }
  });

  dialog.addEventListener("click", function (event) {
    // A click on the dimmed backdrop lands on the dialog element itself.
    if (event.target === dialog || event.target.closest("[data-close-video]")) {
      dialog.close();
    }
  });

  dialog.addEventListener("close", function () {
    frame.replaceChildren();

    if (opener) {
      opener.focus();
      opener = null;
    }
  });
})();
