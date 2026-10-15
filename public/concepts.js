// Highlights the section you are currently reading in the contents list.
var links = Array.prototype.slice.call(document.querySelectorAll('.index a[href^="#"]'));
var targets = links
  .map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
  .filter(Boolean);

if ('IntersectionObserver' in window && targets.length) {
  var seen = new Set();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) seen.add(entry.target.id);
      else seen.delete(entry.target.id);
    });
    // The topmost visible heading wins, so the marker does not jump around.
    var current = targets.filter(function (t) { return seen.has(t.id); })[0];
    links.forEach(function (a) {
      a.classList.toggle('here', !!current && a.getAttribute('href') === '#' + current.id);
    });
  }, { rootMargin: '0px 0px -70% 0px' });
  targets.forEach(function (t) { observer.observe(t); });
}
