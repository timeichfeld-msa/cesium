import {
  defined,
  destroyObject,
  DeveloperError,
  getElement,
} from "@cesium/engine";
import knockout from "../ThirdParty/knockout.js";
import SelectionIndicatorViewModel from "./SelectionIndicatorViewModel.js";

/**
 * A widget for displaying an indicator on a selected object.
 *
 * @alias SelectionIndicator
 * @constructor
 *
 * @param {Element|string} container The DOM element or ID that will contain the widget.
 * @param {Scene} scene The Scene instance to use.
 * @param {object} [options] Optional widget configuration.
 * @param {("brackets"|"glow")} [options.style="brackets"] SDi fork addition.
 *   Visual style for the indicator. "brackets" (default) draws Cesium's
 *   animated green L-corner brackets around the selected entity. "glow" draws
 *   a soft radial-gradient ring sized to the entity's bounding sphere;
 *   consumers can retint via the <code>--cesium-selection-glow-color</code>
 *   CSS custom property.
 *
 * @exception {DeveloperError} Element with id "container" does not exist in the document.
 */
function SelectionIndicator(container, scene, options) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(container)) {
    throw new DeveloperError("container is required.");
  }
  //>>includeEnd('debug');

  container = getElement(container);

  this._container = container;

  // SDi fork: style option threaded from Viewer for the glow variant.
  options = options ?? {};
  const style = options.style ?? "brackets";
  this._style = style;

  const el = document.createElement("div");
  el.className = "cesium-selection-wrapper";
  if (style === "glow") {
    // Marker class -- lets CSS (SelectionIndicator.css) neutralize the
    // brackets-mode fill/stroke since the glow uses gradient fill only.
    el.classList.add("cesium-selection-wrapper-glow");
  }
  el.setAttribute(
    "data-bind",
    '\
style: { "top" : _screenPositionY, "left" : _screenPositionX },\
css: { "cesium-selection-wrapper-visible" : isVisible }',
  );
  container.appendChild(el);
  this._element = el;

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg:svg");
  svg.setAttribute("width", 160);
  svg.setAttribute("height", 160);

  if (style === "glow") {
    // SDi fork: radial-gradient "glow" ring. Transparent core so the entity
    // stays visible through the middle of the ring; bright shell at ~78% of
    // the ring radius; fade to transparent at the outer edge. Color reads
    // from the --cesium-selection-glow-color CSS custom property so
    // consumers can retint without patching this file.
    // Ring is sized by SelectionIndicatorViewModel's bounds-aware scaling
    // (see boundingSphereRadius handling in that file) so the visual grows
    // and shrinks to fit the selected entity.
    svg.setAttribute("viewBox", "-80 -80 160 160");

    const defs = document.createElementNS(svgNS, "defs");
    const gradient = document.createElementNS(svgNS, "radialGradient");
    gradient.setAttribute("id", "cesium-selection-glow");
    gradient.setAttribute("cx", "0");
    gradient.setAttribute("cy", "0");
    gradient.setAttribute("r", "44");
    gradient.setAttribute("gradientUnits", "userSpaceOnUse");
    const stops = [
      { offset: "0%", opacity: 0 },
      { offset: "60%", opacity: 0 },
      { offset: "78%", opacity: 0.85 },
      { offset: "100%", opacity: 0 },
    ];
    for (let i = 0; i < stops.length; ++i) {
      const stop = document.createElementNS(svgNS, "stop");
      stop.setAttribute("offset", stops[i].offset);
      // CSS custom property with rgba fallback (soft cyan).
      stop.setAttribute(
        "stop-color",
        "var(--cesium-selection-glow-color, rgba(80, 200, 255, 1))",
      );
      stop.setAttribute("stop-opacity", stops[i].opacity.toString());
      gradient.appendChild(stop);
    }
    defs.appendChild(gradient);
    svg.appendChild(defs);

    const glow = document.createElementNS(svgNS, "circle");
    glow.setAttribute("cx", "0");
    glow.setAttribute("cy", "0");
    glow.setAttribute("r", "55");
    glow.setAttribute("fill", "url(#cesium-selection-glow)");
    // Reuse knockout's _transform binding -- SelectionIndicatorViewModel
    // combines the pulse-in animation scale with the bounds-aware scale.
    glow.setAttribute("data-bind", "attr: { transform: _transform }");
    svg.appendChild(glow);
  } else {
    // Default: Cesium's original bracket path -- unchanged from upstream.
    const path =
      "M -34 -34 L -34 -11.25 L -30 -15.25 L -30 -30 L -15.25 -30 L -11.25 -34 L -34 -34 z M 11.25 -34 L 15.25 -30 L 30 -30 L 30 -15.25 L 34 -11.25 L 34 -34 L 11.25 -34 z M -34 11.25 L -34 34 L -11.25 34 L -15.25 30 L -30 30 L -30 15.25 L -34 11.25 z M 34 11.25 L 30 15.25 L 30 30 L 15.25 30 L 11.25 34 L 34 34 L 34 11.25 z";

    svg.setAttribute("viewBox", "0 0 160 160");

    const group = document.createElementNS(svgNS, "g");
    group.setAttribute("transform", "translate(80,80)");
    svg.appendChild(group);

    const pathElement = document.createElementNS(svgNS, "path");
    pathElement.setAttribute("data-bind", "attr: { transform: _transform }");
    pathElement.setAttribute("d", path);
    group.appendChild(pathElement);
  }

  el.appendChild(svg);

  const viewModel = new SelectionIndicatorViewModel(
    scene,
    this._element,
    this._container,
    { style: style }, // SDi fork: viewmodel needs style for bounds-aware scaling gate
  );
  this._viewModel = viewModel;

  knockout.applyBindings(this._viewModel, this._element);
}

Object.defineProperties(SelectionIndicator.prototype, {
  /**
   * Gets the parent container.
   * @memberof SelectionIndicator.prototype
   *
   * @type {Element}
   */
  container: {
    get: function () {
      return this._container;
    },
  },

  /**
   * Gets the view model.
   * @memberof SelectionIndicator.prototype
   *
   * @type {SelectionIndicatorViewModel}
   */
  viewModel: {
    get: function () {
      return this._viewModel;
    },
  },
});

/**
 * @returns {boolean} true if the object has been destroyed, false otherwise.
 */
SelectionIndicator.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the widget.  Should be called if permanently
 * removing the widget from layout.
 */
SelectionIndicator.prototype.destroy = function () {
  const container = this._container;
  knockout.cleanNode(this._element);
  container.removeChild(this._element);
  return destroyObject(this);
};
export default SelectionIndicator;
