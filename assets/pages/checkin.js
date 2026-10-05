(function () {
      const target = new URL('./index.html', window.location.href);
      const current = new URL(window.location.href);
      target.search = current.search;
      target.hash = current.hash;
      window.location.replace(target.toString());
    })();
