/*!
 * SkyVerdict "Protect this flight" embeddable widget.
 *
 *   <div data-skyverdict-widget
 *        data-ref="0xYourPayoutAddress"
 *        data-airline="AA" data-flight="100" data-from="JFK"
 *        data-dep="1791496135" data-arr="1791506935"></div>
 *   <script async src="https://sky-verdicts.vercel.app/widget.js"></script>
 *
 * Renders a button that deep-links to the buy flow with the flight pre-filled
 * and your address as the referrer: you earn 5% of the premium (taken from the
 * creator fee, never from underwriters) on every policy bought through it.
 * No tracking, no cookies, no third-party requests — just a link.
 */
(function () {
  var script = document.currentScript;
  var origin = (script && script.src ? new URL(script.src).origin : "https://sky-verdicts.vercel.app");

  function build(el) {
    var q = new URLSearchParams();
    var d = el.dataset;
    if (d.ref) q.set("ref", d.ref);
    if (d.airline) q.set("airline", d.airline);
    if (d.flight) q.set("flight", d.flight);
    if (d.from) q.set("from", d.from);
    if (d.dep) q.set("dep", d.dep);
    if (d.arr) q.set("arr", d.arr);
    return origin + "/?" + q.toString();
  }

  function render(el) {
    if (el.getAttribute("data-rendered")) return;
    el.setAttribute("data-rendered", "1");
    var label = (el.dataset.airline || "") + (el.dataset.flight || "");
    var a = document.createElement("a");
    a.href = build(el);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "✈ Protect " + (label || "this flight") + " against delay";
    a.style.cssText =
      "display:inline-block;padding:10px 16px;border:1px solid #ff6a1f;color:#ff6a1f;" +
      "background:#0b0b0c;font:600 13px/1.2 ui-monospace,Menlo,Consolas,monospace;" +
      "text-decoration:none;letter-spacing:.04em";
    var sub = document.createElement("div");
    sub.textContent = "Paid out automatically · verified by GenLayer validators";
    sub.style.cssText = "margin-top:6px;font:11px ui-monospace,Menlo,Consolas,monospace;color:#8a8a8f";
    el.appendChild(a);
    el.appendChild(sub);
  }

  function init() {
    var nodes = document.querySelectorAll("[data-skyverdict-widget]");
    for (var i = 0; i < nodes.length; i++) render(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
