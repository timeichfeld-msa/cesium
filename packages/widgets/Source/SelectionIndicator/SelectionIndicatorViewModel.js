import {
  Cartesian2,
  Cartesian3,
  defined,
  DeveloperError,
  EasingFunction,
  SceneTransforms,
} from "@cesium/engine";
import knockout from "../ThirdParty/knockout.js";

const screenSpacePos = new Cartesian2();
// SDi fork scratch objects for bounds-aware scaling of the glow variant.
const scratchEdgeWorld = new Cartesian3();
const scratchEdgeScreen = new Cartesian2();
const offScreen = "-1000px";

// SDi fork: glow SVG's base ring radius (see SelectionIndicator.js glow
// branch, `circle r="55"`). Screen-space radius divided by this yields the
// bounds-aware scale factor.
const GLOW_BASE_RADIUS = 55;
const GLOW_MIN_SCALE = 0.5;
// Cap the ring at 128 px screen-space radius. Beyond that the SVG's
// gradient stops start to visibly interpolate and the ring reads as blurry
// on very large entities / low-zoom camera positions.
const GLOW_MAX_PIXEL_RADIUS = 128;
const GLOW_MAX_SCALE = GLOW_MAX_PIXEL_RADIUS / GLOW_BASE_RADIUS;

/**
 * The view model for {@link SelectionIndicator}.
 * @alias SelectionIndicatorViewModel
 * @constructor
 *
 * @param {Scene} scene The scene instance to use for screen-space coordinate conversion.
 * @param {Element} selectionIndicatorElement The element containing all elements that make up the selection indicator.
 * @param {Element} container The DOM element that contains the widget.
 * @param {object} [options] Optional view model configuration.
 * @param {("brackets"|"glow")} [options.style="brackets"] SDi fork addition.
 *   When "glow", <code>update()</code> computes a bounds-aware scale from
 *   <code>boundingSphereRadius</code> so the ring hugs the selected entity's
 *   on-screen footprint.
 */
function SelectionIndicatorViewModel(
  scene,
  selectionIndicatorElement,
  container,
  options,
) {
  //>>includeStart('debug', pragmas.debug);
  if (!defined(scene)) {
    throw new DeveloperError("scene is required.");
  }

  if (!defined(selectionIndicatorElement)) {
    throw new DeveloperError("selectionIndicatorElement is required.");
  }

  if (!defined(container)) {
    throw new DeveloperError("container is required.");
  }
  //>>includeEnd('debug');

  this._scene = scene;
  this._screenPositionX = offScreen;
  this._screenPositionY = offScreen;
  this._tweens = scene.tweens;
  this._container = container ?? document.body;
  this._selectionIndicatorElement = selectionIndicatorElement;
  this._scale = 1;

  // SDi fork: style + bounds-aware scaling state for the glow variant.
  options = options ?? {};
  this._style = options.style ?? "brackets";
  this._boundsScale = 1;

  /**
   * Gets or sets the world-space bounding sphere radius of the selected
   * entity. Set each tick by {@link Viewer._onTick} from the same
   * <code>getBoundingSphere</code> result that drives the InfoBox anchor.
   * Consumed only when the widget's style is "glow" -- <code>update()</code>
   * projects an offset by this radius to compute the on-screen ring size.
   * @type {number|undefined}
   */
  this.boundingSphereRadius = undefined;

  /**
   * Gets or sets the world position of the object for which to display the selection indicator.
   * @type {Cartesian3}
   */
  this.position = undefined;

  /**
   * Gets or sets the visibility of the selection indicator.
   * @type {boolean}
   */
  this.showSelection = false;

  knockout.track(this, [
    "position",
    "_screenPositionX",
    "_screenPositionY",
    "_scale",
    "_boundsScale",
    "showSelection",
  ]);

  /**
   * Gets the visibility of the position indicator.  This can be false even if an
   * object is selected, when the selected object has no position.
   * @type {boolean}
   */
  this.isVisible = undefined;
  knockout.defineProperty(this, "isVisible", {
    get: function () {
      return this.showSelection && defined(this.position);
    },
  });

  knockout.defineProperty(this, "_transform", {
    get: function () {
      // SDi fork: multiply the animation scale by the bounds-aware scale so
      // glow-style ring sizes to the entity's on-screen footprint AND the
      // pulse-in animation (animateAppear) still functions on top. For
      // "brackets" style, _boundsScale stays at 1 and behavior is unchanged.
      return `scale(${this._scale * this._boundsScale})`;
    },
  });

  /**
   * Gets or sets the function for converting the world position of the object to the screen space position.
   *
   * @member
   * @type {SelectionIndicatorViewModel.ComputeScreenSpacePosition}
   * @default SceneTransforms.worldToWindowCoordinates
   *
   * @example
   * selectionIndicatorViewModel.computeScreenSpacePosition = function(position, result) {
   *     return Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, result);
   * };
   */
  this.computeScreenSpacePosition = function (position, result) {
    return SceneTransforms.worldToWindowCoordinates(scene, position, result);
  };
}

/**
 * Updates the view of the selection indicator to match the position and content properties of the view model.
 * This function should be called as part of the render loop.
 */
SelectionIndicatorViewModel.prototype.update = function () {
  if (this.showSelection && defined(this.position)) {
    const screenPosition = this.computeScreenSpacePosition(
      this.position,
      screenSpacePos,
    );
    if (!defined(screenPosition)) {
      this._screenPositionX = offScreen;
      this._screenPositionY = offScreen;
    } else {
      const container = this._container;
      const containerWidth = container.parentNode.clientWidth;
      const containerHeight = container.parentNode.clientHeight;
      const indicatorSize = this._selectionIndicatorElement.clientWidth;
      const halfSize = indicatorSize * 0.5;

      screenPosition.x =
        Math.min(
          Math.max(screenPosition.x, -indicatorSize),
          containerWidth + indicatorSize,
        ) - halfSize;
      screenPosition.y =
        Math.min(
          Math.max(screenPosition.y, -indicatorSize),
          containerHeight + indicatorSize,
        ) - halfSize;

      this._screenPositionX = `${Math.floor(screenPosition.x + 0.25)}px`;
      this._screenPositionY = `${Math.floor(screenPosition.y + 0.25)}px`;

      // SDi fork: bounds-aware scaling for the glow variant.
      // Project a point offset from `this.position` by boundingSphereRadius
      // along the camera's right vector; the pixel distance between the
      // center and that offset gives the on-screen radius of the entity's
      // bounding sphere. Divide by the glow SVG's authored ring radius to
      // get a scale factor, clamped so tiny entities are still visible and
      // very large entities don't blow out the widget's 160px box.
      if (this._style === "glow" && defined(this.boundingSphereRadius)) {
        const camera = this._scene.camera;
        Cartesian3.multiplyByScalar(
          camera.right,
          this.boundingSphereRadius,
          scratchEdgeWorld,
        );
        Cartesian3.add(this.position, scratchEdgeWorld, scratchEdgeWorld);
        const edgeScreen = this.computeScreenSpacePosition(
          scratchEdgeWorld,
          scratchEdgeScreen,
        );
        if (defined(edgeScreen)) {
          const dx = edgeScreen.x - (screenPosition.x + halfSize);
          const dy = edgeScreen.y - (screenPosition.y + halfSize);
          const pixelRadius = Math.sqrt(dx * dx + dy * dy);
          const scale = pixelRadius / GLOW_BASE_RADIUS;
          this._boundsScale = Math.min(
            Math.max(scale, GLOW_MIN_SCALE),
            GLOW_MAX_SCALE,
          );
        } else {
          this._boundsScale = 1;
        }
      } else if (this._boundsScale !== 1) {
        // Reset if radius disappears or style is brackets.
        this._boundsScale = 1;
      }
    }
  }
};

/**
 * Animate the indicator to draw attention to the selection.
 */
SelectionIndicatorViewModel.prototype.animateAppear = function () {
  this._tweens.addProperty({
    object: this,
    property: "_scale",
    startValue: 2,
    stopValue: 1,
    duration: 0.8,
    easingFunction: EasingFunction.EXPONENTIAL_OUT,
  });
};

/**
 * Animate the indicator to release the selection.
 */
SelectionIndicatorViewModel.prototype.animateDepart = function () {
  this._tweens.addProperty({
    object: this,
    property: "_scale",
    startValue: this._scale,
    stopValue: 1.5,
    duration: 0.8,
    easingFunction: EasingFunction.EXPONENTIAL_OUT,
  });
};

Object.defineProperties(SelectionIndicatorViewModel.prototype, {
  /**
   * Gets the HTML element containing the selection indicator.
   * @memberof SelectionIndicatorViewModel.prototype
   *
   * @type {Element}
   */
  container: {
    get: function () {
      return this._container;
    },
  },

  /**
   * Gets the HTML element that holds the selection indicator.
   * @memberof SelectionIndicatorViewModel.prototype
   *
   * @type {Element}
   */
  selectionIndicatorElement: {
    get: function () {
      return this._selectionIndicatorElement;
    },
  },

  /**
   * Gets the scene being used.
   * @memberof SelectionIndicatorViewModel.prototype
   *
   * @type {Scene}
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },
});

/**
 * A function that converts the world position of an object to a screen space position.
 * @callback SelectionIndicatorViewModel.ComputeScreenSpacePosition
 * @param {Cartesian3} position The position in WGS84 (world) coordinates.
 * @param {Cartesian2} result An object to return the input position transformed to window coordinates.
 * @returns {Cartesian2} The modified result parameter.
 */
export default SelectionIndicatorViewModel;
