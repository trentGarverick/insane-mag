(function () {
  'use strict';

  var PAGES   = window.STORY_PAGES || 0;
  var current = 0;
  var track   = document.getElementById('track');
  var counter = document.getElementById('navCounter');
  var prevBtn = document.getElementById('btnPrev');
  var nextBtn = document.getElementById('btnNext');
  var dots    = [];

  function update() {
    if (track)   track.style.transform = 'translateX(' + (-current * 100) + 'vw)';
    if (counter) counter.textContent   = (current + 1) + ' / ' + PAGES;
    if (prevBtn) prevBtn.disabled      = current === 0;
    if (nextBtn) nextBtn.disabled      = current === PAGES - 1;
    dots.forEach(function (d, i) {
      d.classList.toggle('active', i === current);
    });
    try { history.replaceState(null, '', '#' + current); } catch(e) {}
    // Reset fold-in state when navigating away
    var area = document.getElementById('foldinArea');
    if (area) area.classList.remove('folded');
    var btn = document.getElementById('foldinBtn');
    if (btn) btn.textContent = '\uD83D\uDCF0 FOLD IT!';
  }

  window.goTo = function (n) {
    current = Math.max(0, Math.min(PAGES - 1, n));
    update();
  };

  window.prev = function () { window.goTo(current - 1); };
  window.next = function () { window.goTo(current + 1); };

  // Build dots
  var dotRow = document.getElementById('dotRow');
  if (dotRow) {
    for (var i = 0; i < PAGES; i++) {
      var d = document.createElement('button');
      d.className = 'dot';
      d.setAttribute('aria-label', 'Page ' + (i + 1));
      d.setAttribute('data-i', i);
      d.addEventListener('click', (function (idx) {
        return function () { window.goTo(idx); };
      })(i));
      dotRow.appendChild(d);
      dots.push(d);
    }
  }

  // Hash navigation
  var hash = parseInt(location.hash.replace('#', ''), 10);
  if (!isNaN(hash) && hash >= 0 && hash < PAGES) current = hash;

  // Touch swipe
  var startX = null;
  document.addEventListener('touchstart', function (e) {
    startX = e.touches[0].clientX;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { dx < 0 ? window.next() : window.prev(); }
    startX = null;
  }, { passive: true });

  // Keyboard
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') window.next();
    if (e.key === 'ArrowLeft')  window.prev();
  });

  // Share
  window.shareIssue = function () {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        var btn = document.querySelector('.nav-share');
        if (btn) {
          var orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(function () { btn.textContent = orig; }, 2000);
        }
      });
    }
  };

  // Fold-in toggle
  window.toggleFoldin = function () {
    var area = document.getElementById('foldinArea');
    var btn  = document.getElementById('foldinBtn');
    if (!area) return;
    var folded = area.classList.toggle('folded');
    if (btn) btn.textContent = folded ? '\uD83D\uDCF0 UNFOLD IT!' : '\uD83D\uDCF0 FOLD IT!';
  };

  update();
})();
