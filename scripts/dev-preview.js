(function () {
  var originalFetch = window.fetch;
  var focusable = Array.prototype.slice.call(document.querySelectorAll(".focusable"));

  window.__immichTvPreviewDebug = true;
  window.__immichTvPreviewProxyInstalled = true;

  function headersToObject(headers) {
    var output = {};
    var normalizedHeaders = new Headers(headers || {});

    normalizedHeaders.forEach(function (value, key) {
      output[key] = value;
    });

    return output;
  }

  window.fetch = function (input, init) {
    var requestUrl = typeof input === "string" ? input : input.url;
    var targetUrl = new URL(requestUrl, window.location.href);

    if (targetUrl.origin === window.location.origin) {
      return originalFetch(input, init);
    }

    return originalFetch("/__immich-proxy", {
      body: JSON.stringify({
        body: init && init.body ? init.body : null,
        headers: headersToObject(init && init.headers),
        method: init && init.method ? init.method : "GET",
        url: targetUrl.href
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  };

  focusable.forEach(function (element) {
    element.addEventListener("click", function (event) {
      event.preventDefault();
      element.focus();

      if (element.tagName === "INPUT") {
        return;
      }

      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter"
        })
      );
    });
  });
})();
