import { el, setTitle } from "../lib/dom.js";

export default {
  mount(root) {
    setTitle("Page not found");
    root.append(el("div", { class: "container view" },
      el("header", { class: "view-head" },
        el("p", { class: "eyebrow", text: "404" }),
        el("h1", { text: "Off the track" }),
        el("p", { class: "lede" }, "There's no page at this address. ", el("a", { href: "/", text: "Go to the start" }), " or press / to find a driver."))));
    return null;
  },
};
