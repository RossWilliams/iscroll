/*jslint devel: true, browser: true, nomen: true, debug: false, plusplus: true, forin: true, es5: true, maxerr: 50, indent: 4 */
/*global DocumentTouch: false */

/*!
 * Portions of this file based on iScroll v5.0.0 pre-alpha-use-it-and-kittens-die ~ Copyright (c) 2012 Matteo Spinelli, http://cubiq.org
 * Released under MIT license, http://cubiq.org/license
 */
 /*
	TODO LIST
	
	careful with accessing dom elements which might not exist.
	up/down arrows to increment steps, allow external like halo app.
	allow click on track.
	zooming doesn't consider pointer model, use advanced gestures.
	dispatch relevent events
	destroy function

	Check for conflicts in global scope with new objects
	
 */



(function (w, d, M) {
	//https://github.com/davidaurelio/css-beziers/commit/02adac1a3b7f7d07416697ec233c64ba7d144ccb
	/**
	 * @license
	 *
	 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
	 * Copyright (C) 2010 David Aurelio. All Rights Reserved.
	 * Copyright (C) 2010 uxebu Consulting Ltd. & Co. KG. All Rights Reserved.
	 *
	 * Redistribution and use in source and binary forms, with or without
	 * modification, are permitted provided that the following conditions
	 * are met:
	 * 1. Redistributions of source code must retain the above copyright
	 *    notice, this list of conditions and the following disclaimer.
	 * 2. Redistributions in binary form must reproduce the above copyright
	 *    notice, this list of conditions and the following disclaimer in the
	 *    documentation and/or other materials provided with the distribution.
	 *
	 * THIS SOFTWARE IS PROVIDED BY APPLE INC., DAVID AURELIO, AND UXEBU
	 * CONSULTING LTD. & CO. KG ``AS IS'' AND ANY EXPRESS OR IMPLIED
	 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
	 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
	 * IN NO EVENT SHALL APPLE INC. OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
	 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
	 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
	 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
	 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
	 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
	 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
	 * POSSIBILITY OF SUCH DAMAGE.
	 */
	'use strict';

	/**
	 * Represents a two-dimensional cubic bezier curve with the starting
	 * point (0, 0) and the end point (1, 1). The two control points p1 and p2
	 * have x and y coordinates between 0 and 1.
	 *
	 * This type of bezier curves can be used as CSS transform timing functions.
	 * 
	 * @constructor
	 * @export
	 * @param {number} p1x control point p1 x value between 0 and 1.
	 * @param {number} p1y control point p1 y value between 0 and 1.
	 * @param {number} p2x control point p2 x value between 0 and 1.
	 * @param {number} p2y control point p2 y value between 0 and 1.
	 * 
	 */
	var CubicBezier = window.CubicBezier = function (p1x, p1y, p2x, p2y) {
		if (!(p1x >= 0 && p1x <= 1)) {
			throw new RangeError('"p1x" must be a number between 0 and 1. ' + 'Got ' + p1x + 'instead.');
		}
		if (!(p1y >= 0 && p1y <= 1)) {
			throw new RangeError('"p1y" must be a number between 0 and 1. ' + 'Got ' + p1y + 'instead.');
		}
		if (!(p2x >= 0 && p2x <= 1)) {
			throw new RangeError('"p2x" must be a number between 0 and 1. ' + 'Got ' + p2x + 'instead.');
		}
		if (!(p2y >= 0 && p2y <= 1)) {
			throw new RangeError('"p2y" must be a number between 0 and 1. ' + 'Got ' + p2y + 'instead.');
		}

		// Control points
		this._p1 = { x: p1x, y: p1y };
		this._p2 = { x: p2x, y: p2y };
	};

	CubicBezier.prototype._getCoordinateForT = function (t, p1, p2) {
		var c = 3 * p1,
			b = 3 * (p2 - p1) - c,
			a = 1 - c - b;

		return ((a * t + b) * t + c) * t;
	};

	CubicBezier.prototype._getCoordinateDerivateForT = function (t, p1, p2) {
		var c = 3 * p1,
			b = 3 * (p2 - p1) - c,
			a = 1 - c - b;

		return (3 * a * t + 2 * b) * t + c;
	};

	CubicBezier.prototype._getTForCoordinate = function (c, p1, p2, epsilon) {
		if (!isFinite(epsilon) || epsilon <= 0) {
			throw new RangeError('"epsilon" must be a number greater than 0.');
		}
		var t2, i, c2, d2;

		// First try a few iterations of Newton's method -- normally very fast.
		for (t2 = c, i = 0; i < 8; i = i + 1) {
			c2 = this._getCoordinateForT(t2, p1, p2) - c;
			if (Math.abs(c2) < epsilon) {
				return t2;
			}
			d2 = this._getCoordinateDerivateForT(t2, p1, p2);
			if (Math.abs(d2) < 1e-6) {
				break;
			}
			t2 = t2 - c2 / d2;
		}

		// Fall back to the bisection method for reliability.
		t2 = c;
		var t0 = 0,
			t1 = 1;

		if (t2 < t0) {
			return t0;
		}
		if (t2 > t1) {
			return t1;
		}

		while (t0 < t1) {
			c2 = this._getCoordinateForT(t2, p1, p2);
			if (Math.abs(c2 - c) < epsilon) {
				return t2;
			}
			if (c > c2) {
				t0 = t2;
			} else {
				t1 = t2;
			}
			t2 = (t1 - t0) * 0.5 + t0;
		}

		// Failure.
		return t2;
	};

	/**
	 * Computes the point for a given t value.
	 *
	 * @param {number} t
	 * @returns {Object} Returns an object with x and y properties
	 */
	CubicBezier.prototype.getPointForT = function (t) {

		// Special cases: starting and ending points
		if (t === 0 || t === 1) {
			return { x: t, y: t };
		}

		// Check for correct t value (must be between 0 and 1)
		if (t < 0 || t > 1) {
			throw new RangeError('"t" must be a number between 0 and 1' + 'Got ' + t + ' instead.');
		}

		return {
			x: this._getCoordinateForT(t, this._p1.x, this._p2.x),
			y: this._getCoordinateForT(t, this._p1.y, this._p2.y)
		};
	};

	CubicBezier.prototype.getTForX = function (x, epsilon) {
		return this._getTForCoordinate(x, this._p1.x, this._p2.x, epsilon);
	};

	/**
	 * Get the time that the Y value will be equal to a given amount within error bound episilon.
	 * If error bound is insufficiently large, the original value is returned.
	 * @param  {number} y       the y value to get the corresponding t value.
	 * @param  {number} epsilon the size of the error ball desired.
	 * @return {number}         the time at which y equals the given value, or the given
	 *                          value if epison is insuffieciently large.
	 */
	CubicBezier.prototype.getTForY = function (y, epsilon) {
		return this._getTForCoordinate(y, this._p1.y, this._p2.y, epsilon);
	};
	/**
	 * Finds the slope of the curve at a given time
	 * @param  {number} t the time value between 0 and 1.
	 * @return {number}   the slope of the curve.
	 */
	CubicBezier.prototype.getDerivativeYForT = function (t) {
		return this._getCoordinateDerivateForT(t, this._p1.y, this._p2.y);
	};

	/**
	 * Computes auxiliary points using De Casteljau's algorithm.
	 *
	 * @param {number} t must be greater than 0 and lower than 1.
	 * @returns {Object} with members i0, i1, i2 (first iteration),
	 *	  j1, j2 (second iteration) and k (the exact point for t)
	 */
	CubicBezier.prototype._getAuxPoints = function (t) {
		if (t <= 0 || t >= 1) {
			throw new RangeError('"t" must be greater than 0 and lower than 1');
		}


		/* First series of auxiliary points */

		// First control point of the left curve
		var i0 = {
				x: t * this._p1.x,
				y: t * this._p1.y
			},
			i1 = {
				x: this._p1.x + t * (this._p2.x - this._p1.x),
				y: this._p1.y + t * (this._p2.y - this._p1.y)
			},

			// Second control point of the right curve
			i2  = {
				x: this._p2.x + t * (1 - this._p2.x),
				y: this._p2.y + t * (1 - this._p2.y)
			};


		/* Second series of auxiliary points */

		// Second control point of the left curve
		var j0 = {
				x: i0.x + t * (i1.x - i0.x),
				y: i0.y + t * (i1.y - i0.y)
			},

			// First control point of the right curve
			j1 = {
				x: i1.x + t * (i2.x - i1.x),
				y: i1.y + t * (i2.y - i1.y)
			};

		// The division point (ending point of left curve, starting point of right curve)
		var k = {
				x: j0.x + t * (j1.x - j0.x),
				y: j0.y + t * (j1.y - j0.y)
			};

		return {
			i0: i0,
			i1: i1,
			i2: i2,
			j0: j0,
			j1: j1,
			k: k
		};
	};

	/**
	 * Divides the bezier curve into two bezier functions.
	 *
	 * De Casteljau's algorithm is used to compute the new starting, ending, and
	 * control points.
	 *
	 * @param {number} t must be greater than 0 and lower than 1.
	 *     t === 1 or t === 0 are the starting/ending points of the curve, so no
	 *     division is needed.
	 *
	 * @returns {Array.<CubicBezier>} Returns an array containing two bezier curves
	 *     to the left and the right of t.
	 */
	CubicBezier.prototype.divideAtT = function (t) {
		if (t < 0 || t > 1) {
			throw new RangeError('"t" must be a number between 0 and 1. ' + 'Got ' + t + ' instead.');
		}

		// Special cases t = 0, t = 1: Curve can be cloned for one side, the other
		// side is a linear curve (with duration 0)
		if (t === 0 || t === 1) {
			var curves = [];
			curves[t] = CubicBezier.linear();
			curves[1 - t] = this.clone();
			return curves;
		}

		var left = {},
			right = {},
			points = this._getAuxPoints(t);

		var i0 = points.i0,
			i2 = points.i2,
			j0 = points.j0,
			j1 = points.j1,
			k = points.k;

		// Normalize derived points, so that the new curves starting/ending point
		// coordinates are (0, 0) respectively (1, 1)
		var factorX = k.x,
			factorY = k.y;

		left.p1 = {
			x: i0.x / factorX,
			y: i0.y / factorY
		};
		left.p2 = {
			x: j0.x / factorX,
			y: j0.y / factorY
		};

		right.p1 = {
			x: (j1.x - factorX) / (1 - factorX),
			y: (j1.y - factorY) / (1 - factorY)
		};

		right.p2 = {
			x: (i2.x - factorX) / (1 - factorX),
			y: (i2.y - factorY) / (1 - factorY)
		};

		return [
			new CubicBezier(left.p1.x, left.p1.y, left.p2.x, left.p2.y),
			new CubicBezier(right.p1.x, right.p1.y, right.p2.x, right.p2.y)
		];
	};

	CubicBezier.prototype.divideAtX = function (x, epsilon) {
		if (x < 0 || x > 1) {
			throw new RangeError('"x" must be a number between 0 and 1. ' + 'Got ' + x + ' instead.');
		}

		var t = this.getTForX(x, epsilon);
		return this.divideAtT(t);
	};

	CubicBezier.prototype.divideAtY = function (y, epsilon) {
		if (y < 0 || y > 1) {
			throw new RangeError('"y" must be a number between 0 and 1. ' + 'Got ' + y + ' instead.');
		}

		var t = this.getTForY(y, epsilon);
		return this.divideAtT(t);
	};

	CubicBezier.prototype.clone = function () {
		return new CubicBezier(this._p1.x, this._p1.y, this._p2.x, this._p2.y);
	};

	CubicBezier.prototype.toString = function () {
		return "cubic-bezier(" + [
			this._p1.x,
			this._p1.y,
			this._p2.x,
			this._p2.y
		].join(", ") + ")";
	};

	CubicBezier.linear = function () {
		return new CubicBezier(0.0, 0.0, 1.0, 1.0);
	};
	CubicBezier.ease = function () {
		return new CubicBezier(0.25, 0.1, 0.25, 1.0);
	};
	CubicBezier.linear = function () {
		return new CubicBezier(0.0, 0.0, 1.0, 1.0);
	};
	CubicBezier.easeIn = function () {
		return new CubicBezier(0.42, 0, 1.0, 1.0);
	};
	CubicBezier.easeOut = function () {
		return new CubicBezier(0, 0, 0.58, 1.0);
	};
	CubicBezier.easeInOut = function () {
		return new CubicBezier(0.42, 0, 0.58, 1.0);
	};


	/* ---- END: CUBIC BEZIER ---- */


	/* ---- ENVIRONMENT SETTINGS ---- */

	function prefixStyle(style, vendor) {
		if (vendor === false) {
			return false;
		}
		if (vendor === '') {
			return style;
		}
		return vendor + style.charAt(0).toUpperCase() + style.substr(1);
	}
	//todo: organize these in some coherent way.
	var dummyStyle = d.createElement('div').style,
		// it seems event.timestamp is not that reliable, so we use the best alternative we can find
		getTime = (function () {
			var perfNow = w.performance &&			// browser may support performance but not performance.now
				(w.performance.now		||
				w.performance.webkitNow	||
				w.performance.mozNow		||
				w.performance.msNow		||
				w.performance.oNow);

			return perfNow ?
					perfNow.bind(w.performance) :
					Date.now ||
					function getTime() {
						return new Date().getTime();
					};
		}()),
		// rAF is used if useTransition is false
		rAF = w.requestAnimationFrame		||
			w.webkitRequestAnimationFrame	||
			w.mozRequestAnimationFrame		||
			w.oRequestAnimationFrame		||
			function (callback) { w.setTimeout(callback, 1000 / 30); },
		transform = (function () {
			var vendors = ['', 'webkit', 'Moz', 'ms', 'O'],
				transform,
				i,
				l;

			for (i = 0, l = vendors.length; i < l; i++) {
				transform = vendors[i] + (vendors[i].length ? 'T' : 't')  + 'ransform';
				if (typeof dummyStyle[transform] !== 'undefined') {
					return transform;
				}
			}

			return false;
		}()),
		vendor = transform !== false && transform.replace(/transform/i, ''),
		cssVendor = vendor ? '-' + vendor + '-' : '',
		transitionTimingFunction = prefixStyle('transitionTimingFunction', vendor),
		transitionDuration = prefixStyle('transitionDuration', vendor),
		transformOrigin = prefixStyle('transformOrigin', vendor),
		has3d = typeof dummyStyle[prefixStyle('perspective', vendor)] !== 'undefined', //todo: verify this is best cross browser detection method
		hasPointer = navigator.msPointerEnabled,
		hasTouch = typeof w.ontouchstart !== 'undefined' || (w.DocumentTouch && d instanceof DocumentTouch) || w.navigator.msMaxTouchPoints,
		hasTransition = typeof dummyStyle[prefixStyle('transition', vendor)] !== 'undefined',
		hasTransform = !!transform,
		translateZ = has3d ? ' translateZ(0)' : '',
		isIOS = (/iphone|ipad/i).test(navigator.appVersion),
		eventStart = hasPointer ? 'MSPointerDown' : 'mousedown',
		eventMove = hasPointer ? 'MSPointerMove' : 'mousemove',
		eventEnd = hasPointer ? 'MSPointerUp' : 'mouseup',
		eventCancel = hasPointer ? 'MSPointerCancel' : 'mousecancel',
		//touch events will be able to swipe over content, normal events are for scrollbar control
		touchEventStart = hasPointer ? 'MSPointerDown' : 'touchstart',
		touchEventMove = hasPointer ? 'MSPointerMove' : 'touchmove',
		touchEventEnd = hasPointer ? 'MSPointerUp' : 'touchend',
		touchEventCancel = hasPointer ? 'MSPointerCancel' : 'touchcancel',
		// iOS seems the only one with a reliable orientationchange event, fall to resize for all the others
		eventResize = isIOS && w.onorientationchange ? 'orientationchange' : 'resize',
		// there's no standard way to find the name of the transitionend event, so we select it based on the vendor
		eventTransitionEnd = (function () {
			if (vendor === false) {
				return;
			}

			var transitionEnd = {
					''			: 'transitionend',
					'webkit'	: 'webkitTransitionEnd',
					'Moz'		: 'transitionend',
					'O'			: 'oTransitionEnd',
					'ms'		: 'MSTransitionEnd'
				};

			return transitionEnd[vendor];
		}()),
		Scrollbar,
		ScrollAnimation,
		config = {
			minStartDistance: 10, //in pixels, the distance a finger must move to begin the scrolling behaviour
			minDistanceToLock: 5, //in pixels, if movement in one direction is X greater than the other, lock the movement direction
			outOfBoundsSpeedReduction: 0.3, //0-1 the percentage of distance to move scroller vs finger movement when past max scroll bounds
			snapTime: 200, //in ms, the amount of time to animate scrolling when snapping to a specific point on scrollEnd
			friction: 0.996, //used in easing animation during a momentum scroll where velocities are supplied, try between .990 - .998
			overshotFriction: 0.985,
			minVelocityToDecelerate: 0.2, //the initial velocity of a flick to trigger momentum
			minMomentumVelocity: 0.20, //the velocity of momentum at which an animation should stop
			maxMomentumVelocity: 2.4,
			minOvershotVelocity: 0.20,
			bounceTime: 300, //ms
			momentumTiming: new CubicBezier(0.18, 1.0, 0.27, 1.0),
			overshotTiming: new CubicBezier(0.18, 1.0, 0.27, 1.0), //note: change this maybe?
			bounceBackTiming: new CubicBezier(0, 0.25, 0, 1),
			defaultTiming: new CubicBezier(0.18, 1.0, 0.27, 1.0)
		};

	/**
	 * holds callback functions created in inner functions to remove handlers later.
	 * @type {Object.<string, Function>}
	 */
	var savedEventHandlers = {};

	//todo: jsdoc
	/**
	 * removes an event from the specified dom element
	 * @param  {Node|Window}   el           the element to remove the event listener from.
	 * @param  {string}   type         the name of the element.
	 * @param  {Function|boolean} fn           the callback function.
	 * @param  {boolean=}   capture      whether the event was triggered in the capture phase.
	 * @param  {string=}   registerName a name of the callback function, used when the callback is an inner function
	 * @return {undefined}
	 */
	function removeEvent(el, type, fn, capture, registerName) {
		if (typeof registerName === 'string' && typeof savedEventHandlers[registerName] === 'function') {
			fn = savedEventHandlers[registerName];
			delete savedEventHandlers[registerName];
		}
		el.removeEventListener(type, fn, !!capture);
	}

	/**
	 * adds an event to the specified dom element
	 * @param  {Node|Window}   el           the element to remove the event listener from.
	 * @param  {string}   type         the name of the element.
	 * @param  {Function} fn           the callback function.
	 * @param  {boolean=}   capture      whether the event was triggered in the capture phase.
	 * @param  {string=}   registerName a name of the callback function, used when the callback is an inner function
	 * @return {undefined}
	 */
	function addEvent(el, type, fn, capture, registerName) {
		el.addEventListener(type, fn, !!capture);
		if (typeof registerName === 'string') {
			if (typeof savedEventHandlers[registerName] === 'function') {
				removeEvent(el, type, savedEventHandlers[registerName]);
			}
			savedEventHandlers[registerName] = fn;
		}
	}

	/* ---- SCROLLER ---- */

	/**
	 * The main access point for creating a scroller
	 * @constructor
	 * @export
	 * @param {Node|string} el        wrapper of the scroller, or string selector for the element.
	 * @param {Object} options scroll options to apply to this instance.
	 */
	var IScroll = window.IScroll = function (el, options) {
		if (this instanceof IScroll === false) {
			return new IScroll(el, options);
		}
		var i; //iterator

		this.wrapper = typeof el === 'string' ? d.querySelector(el) : el;
		this.scroller = this.wrapper.children[0];

		this.options = {
			axis: {
				'x': {
					direction: 'x',
					start: 0,
					scroll: false,
					hasScrollbar: false,
					active: true,
					scrollbarClass: '',
					indicatorClass: '',
					snapStep: 0
				},
				'y': {
					direction: 'y',
					start: 0,
					scroll: true,
					hasScrollbar: true,
					active: true,
					scrollbarClass: '',
					indicatorClass: '',
					snapStep: 0
				}
			},

			lockDirection: true,
			momentum: true,
			bounce: true,
			//eventPassthrough: false,	TODO: preserve native vertical scroll on horizontal JS scroll (and vice versa)

			HWCompositing: true,		// mostly a debug thing (set to false to skip hardware acceleration)
			useTransition: false,		//You may want to set this to false if requestAnimationFrame exists and is not shim
			useTransform: true,

			interactiveScrollbars: true,
			//hideScrollbars: true,		TODO: hide scrollbars when not scrolling
			//shrinkScrollbars: false,	TODO: shrink scrollbars when dragging over the limits

			mouseWheel: true,
			invertWheelDirection: false, //also known in apple land as natural scrolling
			//wheelSwitchAxes: false,	TODO: vertical wheel scrolls horizontally
			//wheelAction: 'scroll',	TODO: zoom with mouse wheel

			snap: false,
			snapThreshold: 10,
			//flickNavigation: true,	TODO: go to next/prev slide on flick

			zoom: false,
			zoomMin: 1,
			zoomMax: 3
			//startZomm: 1,				TODO: the initial zoom level

			//onFlick: null,			TODO: add flick custom event
		};

		function copyProperties(result, input) {
			var i;
			for (i in input) {
				if (typeof input[i] === 'object') {
					copyProperties(result[i], input[i]);
				} else {
					result[i] = input[i];
				}
			}
		}

		copyProperties(this.options, options);

		// Normalize options
		if (!this.options.HWCompositing) {
			translateZ = '';
		}
		this.options.useTransition = hasTransition && this.options.useTransition;
		this.options.useTransform = hasTransform && this.options.useTransform;
		this.options.invertWheelDirection = this.options.invertWheelDirection ? -1 : 1;

		// set some defaults
		if (hasTransform && this.options.zoom) {
			this.scroller.style[transformOrigin] = '0 0';		// we need the origin to 0 0 for the zoom
		}
		this.axis = this.options.axis;
		for (i in this.axis) {
			this.axis[i].pos = this.axis[i].start;
			this.axis[i].page = 0; // current page when paging in x direction, needed by snap, ignored otherwise
			if (this.axis[i].hasScrollbar) {
				this.axis[i].scrollbar = new Scrollbar(this, this.axis[i]);
			}
		}

		this.isRAFing = false;	//controls whether we want to keep requesting the next animation frame
		this.scale = 1;		//holds the current zoom amount	
		this.waitReset = false; //boolean to prevent refresh if we are in the middle of another operation
		this.currentPointer = null;	//tracks current pointer for browsers with pointer events
		this.positions = [];//save off positions user has scrolled to along with timestamp for momemtum purposes


		//refresh finishes the setup work
		this.refresh();

		this.__pos(this.axis.x.pos, this.axis.y.pos);

		addEvent(w, eventResize, this); //todo: debounce

		if (hasTouch) {
			addEvent(this.wrapper, touchEventStart, this);
		}

		addEvent(this.wrapper, 'mouseover', this);
		addEvent(this.wrapper, 'mouseout', this);

		if (this.options.mouseWheel) {
			addEvent(this.wrapper, 'DOMMouseScroll', this);
			addEvent(this.wrapper, 'mousewheel', this);
		}
	};

	window.IScroll.prototype = {
		/**
		 * Handles all dom events for the scroll wrapper element,
		 * uses the event type to call the appropriate method.
		 * @param  {Event} e the handled event.
		 * @return {undefined}
		 */
		'handleEvent': function (e) {
			switch (e.type) {

			case touchEventStart:
				if (!hasTouch && e.button !== 0) {
					return;
				}
				this.__start(e);
				break;
			case touchEventMove: //todo: zoom doesn't work for ie10
				if (this.options.zoom && hasTouch && e.touches[1]) {
					this.__zoom(e);
				} else {
					this.__move(e);
				}
				break;
			case touchEventEnd:
			case touchEventCancel:
				this.__end(e);
				break;
			case eventResize:
				this.__resize();
				break;
			case 'DOMMouseScroll':
			case 'mousewheel':
				this.__wheel(e);
				break;
			case 'mouseover': //todo: make these optional
				if (this.vScrollbar) {
					this.vScrollbar.over();
				}
				if (this.hScrollbar) {
					this.hScrollbar.over();
				}
				break;
			case 'mouseout':
				if (this.vScrollbar) {
					this.vScrollbar.out();
				}
				if (this.hScrollbar) {
					this.hScrollbar.out();
				}
				break;
			}
		},

		/**
		 * runs an array of ScrollAnimations, axis are run in parallel and ech array is run in series,
		 * without delays between.
		 * @param  {Object.<string, Array.<ScrollAnimation>>} animations an object of array of animations to be run for each axis.
		 * @return {undefined}
		 */
		__executeAnimations: function (animations) {
			var self = this,
				startTime = getTime(),
				now,
				newPos = {},
				bezierPoint,
				i;


			function transitionStep() {
				var duration = 0,
					i;

				for (i in animations) {
					if (animations[i].length) {
						duration = M.max(animations[i][0].duration, duration);
						newPos[i] = animations[i][0].destination;
						animations[i].shift();
					}
				}
				self.__transitionTime(duration);
				self.__pos(newPos);

				//if we have no more animations, remove event handler
				for (i in animations) {
					if (animations[i].length) {
						return;
					}
				}
				//todo BUG: need to remove this event when cancelling animation as well,
				removeEvent(self.scroller, eventTransitionEnd, transitionStep, false, 'transitionStep');
			}

			//todo: use the new version of rAF parameter that already has the performance time.
			function step() {
				var i;
				if (self.isRAFing === false) {
					return;
				}
				now = getTime();
				for (i in animations) {
					if (animations[i].length) {
						newPos[i] = animations[i][0].getPointForT(now);
						if (newPos[i] === animations[i][0].correctedDestination) {
							animations[i].shift();
							if (animations[i].length) {
								animations[i][0].begin(self.axis[i].pos, now);
							}
						}
					}
				}

				self.__pos(newPos);

				//if we still have more animations, request new frame
				for (i in animations) {
					if (animations[i].length) {
						rAF.call(w, step);
						return;
					}
				}
				//no animations still active, stop rAF.
				self.isRAFing = false;
			}

			if (this.options.useTransition) {
				addEvent(this.scroller, eventTransitionEnd, transitionStep, false, 'transitionStep');
				transitionStep();
			} else {
				this.__transitionTime(0);
				this.isRAFing = true;
				for (i in animations) {
					if (animations[i].length) {
						animations[i][0].begin(self.axis[i].pos, startTime);
					}
				}
				rAF.call(w, step);

			}
		},

		/**
		 * creates scrollAnimation objects from destination points and scroll options,
		 * sends these, if any are created, to __executeAnimations.
		 * @param	{Object.<string, number>}		dest		the destination on each axis
		 * @param	{Object.<string, number>}		duration	the duration of the animation.
		 * @param	{CubicBezier=}					timingFunc	the cubic bezier object to use to calculate animation path.
		 * @return  {undefined}
		 */
		__animate: function (dest, duration, timingFunc) {
			var self				= this,
				dist				= {},	//the distance travelled on each axis
				overshotDistance	= 0,	//the distance to travel beyond scroll boundaries
				overshotDuration	= 0,	//the time in ms to animate beyond scroll boundaries
				pct					= 0,	//the percent of the distance that is out of bounds
				animations			= {},	//holds array of animations for each axis
				i;							//iterator

			for (i in dest) {
				dist[i] = dest[i] - this.axis[i].pos;
			}

			timingFunc = timingFunc || config.defaultTiming;

			/*	
				if distance set is out of bounds, restrict to bounds if no bounce,
				otherwise queue additional animation with more friction, which starts
				at boundary with same velocity
			*/
			for (i in this.axis) {
				animations[i] = [];
				overshotDistance = dest[i] > 0 ?
						dest[i] :
						this.axis[i].maxScroll > dest[i] ?
								dest[i] - this.axis[i].maxScroll :
								0;

				pct = M.min(M.abs(overshotDistance / dist[i]), 1);

				if (this.options.bounce) {
					if (overshotDistance !== 0 && M.abs(dist[i]) > 0) {
						if (pct !== 1) {
							//first animation to boundary. pct will limit animation distance.
							animations[i].push(
								new ScrollAnimation(dest[i], duration[i], timingFunc, 0, (1 - pct))
							);
							//using overshot friction and initial velocity, we can construct the duration travelled out of bounds
							overshotDuration =
								M.max(0, M.log(config.minOvershotVelocity / M.abs(animations[i][0].endVelocity(this.axis[i].pos))) / M.log(config.overshotFriction));
							overshotDistance =
								(animations[i][0].endVelocity(this.axis[i].pos) / config.overshotTiming.getDerivativeYForT(0)) * overshotDuration;

						} else {
							overshotDuration = duration[i]; //note, duration should be using overshot friction as calculated by __momentum function
							overshotDistance = dist[i];		//ibid
						}
						//second (or first if already over edge) animation to new overshot amount after factoring higher friction, or normal amount if
						//momentum function calculated with increased friction
						//third(second) animation to boundary
						animations[i].push(
							new ScrollAnimation((dest[i] > 0 ? 0 : this.axis[i].maxScroll) + overshotDistance, overshotDuration, config.overshotTiming),
							new ScrollAnimation(dest[i] > 0 ? 0 : this.axis[i].maxScroll, config.bounceTime, config.bounceBackTiming)
						);
					} else if (M.abs(dist[i]) > 0) {
						//we aren't scrolling out of bounds, only 1 simple animation needed
						animations[i].push(
							new ScrollAnimation(M.floor(dest[i]), duration[i], timingFunc)
						);
					}
					//end this.options.bounce
				} else {
					if (overshotDistance !== 0) {
						//reduce duration by the percentage we will acutally be scrolling.
						duration[i] = duration[i] * (1 - pct);
					}
					//add animation only if final destination is not current destination
					if (dest[i] - overshotDistance !== this.axis[i].pos && duration[i] !== 0) {
						animations[i].push(new ScrollAnimation(M.floor(dest[i] - overshotDistance), duration[i], timingFunc));
					}
				}
			}
			for (i in animations) {
				//check if we have any animation to perform
				if (animations[i].length) {
					this.__executeAnimations(animations);
					break;
				}
			}
		},

		/**
		 * calls refresh to recalculate measurements, and ensures we are still in bounds.
		 * @return {undefined}
		 */
		__resize: function () {
			this.refresh();
			this.resetPosition(true);
		},

		/**
		 * moves the scroller element to the specified position, calls scrollbars to do the same
		 * @param  {Object.<string, number>} positions new positions for each listed axis.

		 * @return {undefined}
		 */
		__pos: function (positions) {
			var x = typeof positions.x !== 'undefined' ? positions.x : this.axis.x.pos,
				y = typeof positions.y !== 'undefined' ? positions.y : this.axis.y.pos,
				i;
			if (this.options.useTransform) {
				this.scroller.style[transform] = 'translate(' + x + 'px,' + y + 'px) scale(' + this.scale + ')' + translateZ;
			} else {
				x = M.round(x);
				y = M.round(y);
				this.scroller.style.left = x + 'px';
				this.scroller.style.top = y + 'px';
			}

			this.axis.x.pos = x;
			this.axis.y.pos = y;

			for (i in this.axis) {
				if (this.axis[i].active && this.axis[i].hasScrollbar) {
					this.axis[i].scrollbar.pos(this.axis[i].pos);
				}
			}
		},

		/**
		 * handles transitionend event, ensures we are still in bounds and resets transition time.
		 * @param  {Event} e  the transitionend event.
		 * @return {undefined}
		 */
		__transitionEnd: function (e) {
			if (e.target !== this.scroller) {
				return; //don't capture bubbled up transitionend events
			}

			if (this.waitReset) {
				this.waitReset = false;
			}
			this.resetPosition(true);

			this.__transitionTime(0);
		},
		/**
		 * handles the touchEventStart event. sets initial values to begin a drag or zoom movement,
		 * begin to capture move and and end events.
		 * 
		 * @param  {Event} e the touchEventStart event.
		 * @return {undefined}
		 */
		__start: function (e) {
			if (!this.enabled || this.waitReset) {
				return;
			}

			var point = hasPointer ? e : e.touches[0],
				matrix, //css transform matrix used if useTransition === true
				x,
				y,
				c1,
				c2,
				i;

			//filter non touch events and begin tracking first pointer
			if (hasPointer) {

				if (point.pointerType !== point.MSPOINTER_TYPE_TOUCH ||
							(this.currentPointer !== null && this.currentPointer !== point.pointerId)) {
					return; //only allow touch events through, only allow first pointer captured through
				}

				this.currentPointer = point.pointerId;
				if (hasPointer) {
					point.target.msSetPointerCapture(point.pointerId);
				}
			}

			//todo: performance implications of adding events here? better options?
			addEvent(w, touchEventMove, this);
			addEvent(w, touchEventCancel, this);
			addEvent(w, touchEventEnd, this);

			this.initiated			= true;
			this.moved				= false;
			this.directionLocked	= false;

			for (i in this.axis) {
				this.axis[i].distance = 0;
				this.axis[i].direction = 0;
			}

			this.__transitionTime(0);

			this.isRAFing = false;		// stop the rAF animation (only with useTransition:false)
			//cancel any further transition steps
			removeEvent(this.scroller, eventTransitionEnd, null, false, 'transitionStep'); //(only with useTransition: true)

			//todo: not pointer model compliant
			if (this.options.zoom && hasTouch && e.touches.length > 1) {
				c1 = M.abs(point.pageX - e.touches[1].pageX);
				c2 = M.abs(point.pageY - e.touches[1].pageY);
				this.touchesDistanceStart = M.sqrt(c1 * c1 + c2 * c2);
				this.startScale = this.scale;

				this.originX = M.abs(point.pageX + e.touches[1].pageX) / 2 - this.x;
				this.originY = M.abs(point.pageY + e.touches[1].pageY) / 2 - this.y;
			}

			//if we aren't using css transitions, we always know x and y, otherwise find x and y
			if (this.options.momentum && this.options.useTransition) {
				matrix = window.getComputedStyle(this.scroller, null);

				/*jslint regexp: true*/
				if (this.options.useTransform) {
					// Lame alternative to CSSMatrix
					matrix = matrix[transform].replace(/[^-\d.,]/g, '').split(',');
					x = +(matrix[12] || matrix[4]);
					y = +(matrix[13] || matrix[5]);
				} else {
					x = +matrix.left.replace(/[^-\d.]/g, '');
					y = +matrix.top.replace(/[^-\d.]/g, '');
				}
				/*jslint regexp: false*/

				if (x !== this.axis.x.pos || y !== this.axis.y.pos) {
					//this is the case of stopping a current transition which may be occuring.
					this.__pos({'x': x, 'y': y});
				}
			}

			for (i in this.axis) {
				this.axis[i].point = point['page' + i.toUpperCase()];
				// absolute start needed by snap to compute snap threashold
				this.axis[i].absStart = this.axis[i].pos;
			}

			this.startTime	= getTime();

			//begin recording positions and timestamps, will be used for momentum calculations
			this.positions	= [];
			this.positions.push(this.startTime, this.axis.x.pos, this.axis.y.pos);

		},
		//TODO: appears __move is missing zoom events?
		/**
		 * handles touch moves events to update the scroll position
		 * @param  {Event} e the touch move event.
		 * @return {undefined}
		 */
		__move: function (e) {
			if (!this.enabled || !this.initiated || this.waitReset) {
				return;
			}
			if (hasPointer && e.pointerId !== this.currentPointer) {
				return;//only track the pointer used to start the event
			}

			var point		= hasPointer ? e : e.touches[0],
				delta		= {},
				newPoint	= {},
				timestamp	= getTime(),
				canMove		= false,
				i;

			for (i in this.axis) {
				delta[i] = this.axis[i].active ? point['page' + i.toUpperCase()] - this.axis[i].point : 0;
				newPoint[i] = this.axis[i].pos + delta[i];
				this.axis[i].distance += delta[i];
				this.axis[i].point = point['page' + i.toUpperCase()];

				if (M.abs(this.axis[i].distance) > config.minStartDistance) {
					canMove = true;
				}
			}

			if (!canMove && !this.moved) {
				// We need to move at least a cetain distance for the scrolling to initiate
				return;
			}

			this.moved = true;

			// If you are scrolling in one direction lock the other
			if (!this.directionLocked && this.options.lockDirection) {
				if (M.abs(this.axis.x.distance) > M.abs(this.axis.y.distance) + config.minDistanceToLock) {
					this.directionLocked = 'x';		// lock horizontally
				} else if (M.abs(this.axis.y.distance) > M.abs(this.axis.x.distance) + config.minDistanceToLock) {
					this.directionLocked = 'y';		// lock vertically
				} else {
					this.directionLocked = false;		// no lock
				}
			}

			for (i in this.axis) {

				if (i !== this.directionLocked) {
					delete newPoint[i]; // remove new position for axis if locked on another axis.
				} else if (newPoint[i] > 0 || newPoint[i] < this.axis[i].maxScroll) {
					// Slow down if outside of the boundaries
					if (this.options.bounce) {
						newPoint[i] = this.axis[i].pos + delta[i] * config.outOfBoundsSpeedReduction;
					} else {
						newPoint[i] = newPoint[i] > 0 ? 0 : this.axis[i].maxScroll;
					}
				}
				// set current direction
				this.axis[i].direction = delta[i] > 0 ? -1 : delta[i] < 0 ? 1 : 0;
			}

			this.positions.push(timestamp, newPoint.x, newPoint.y);
			this.__pos(newPoint);
		},

		/**
		 * handles the touch end event, handling cases of scrolling outside bounds,
		 * momentum scrolling on release, and snapping into position, and ensuring
		 * zooming is within limits
		 * @param  {Event}		e the touch end event
		 * @return {undefined}
		 */
		__end: function (e) {
			removeEvent(w, touchEventMove, this);
			removeEvent(w, touchEventCancel, this);
			removeEvent(w, touchEventEnd, this);

			if (!this.enabled || !this.initiated || this.waitReset) {
				return;
			}

			var point			= hasPointer ? e : e.changedTouches[0],
				duration		= getTime() - this.startTime,
				newPos			= {x: this.axis.x.pos, y: this.axis.y.pos},
				momentum,
				scrollDuration	= null,
				snap,
				lastScale,
				i;

			if (hasPointer) {
				if (this.currentPointer !== point.pointerId) {
					return;
				}

				if (point.target.msReleasePointerCapture) {
					point.target.msReleasePointerCapture(this.currentPointer);
				}
				this.currentPointer = null;
			}

			this.initiated = false;

			// Reset if we were zooming
			if (this.scaled) {
				if (this.scale > this.options.zoomMax) {
					this.scale = this.options.zoomMax;
				} else if (this.scale < this.options.zoomMin) {
					this.scale = this.options.zoomMin;
				}

				// Update boundaries
				this.refresh();

				lastScale = this.scale / this.startScale;

				newPos.x = this.originX - this.originX * lastScale + this.axis.x.start;
				newPos.y = this.originY - this.originY * lastScale + this.axis.y.start;

				for (i in this.axis) {
					newPos[i] = M.min(0, M.max(newPos[i], this.axis[i].maxScroll));
				}

				this.waitReset = true;
				this.scrollTo(newPos);
				this.scaled = false;
				return;
			}

			// we scrolled less than the threshhold amount to start scrolling
			if (!this.moved) {
				return;
			}

			if (this.options.momentum) {
				momentum = this.__momentum(newPos);
				newPos = momentum.position;
				scrollDuration = momentum.duration;
			}

			if (this.options.snap) {
				snap = this.__snap(newPos);
				newPos = snap.position;
				this.axis.x.page = snap.pageX;
				this.axis.y.page = snap.pageY;
				scrollDuration = snap.snapTime || scrollDuration;
			}

			this.scrollTo(newPos, scrollDuration);
		},

		//todo: consider setting a maximum distance for these, in pixels
		//todo: bug, what about when direction is locked and the opposite direction triggers momentum?
		/**
		 * create a new ending position and duration of transition if/when
		 * a flick is detected. requires a previous scrolling of more than 100ms.
		 * @param  {Object.<string, number>} currentPos														the current position of each axis specified.
		 * @return {{position: Object.<string, number>, duration: Object.<string, number>}|Boolean	}		the final position and time in ms to reach the point.
		 */
		__momentum: function (currentPos) {
			var distance,
				velocity,
				outOfBounds,
				duration		= {},
				newPosition		= currentPos,
				i				= this.positions.length - 3,
				lastPosition	= this.positions[this.positions.length - 3],
				a; // iterator

			while (lastPosition - this.positions[i] < 100) {
				i -= 3;
			}
			if (i < 0) { // total scrolling less than 100ms, don't do momentum
				return {
					position: currentPos,
					duration: false
				};
			}
			for (a in this.axis) {
				if (this.directionLocked !== false && this.directionLocked !== a) {
					continue;
				}
				// (final velocity) ^ 2 = initial velocity ^ 2 + 2 * acceleration * distance
				distance = (a === 'x' ? (currentPos[a] - this.positions[i + 1]) : (currentPos[a] - this.positions[i + 2])); //pixel units
				// velocity = distance / time
				velocity = distance / (lastPosition - this.positions[i]); // pixels / ms
				// make sure velocity does not exceed maximum
				velocity = M.abs(velocity) > config.maxMomentumVelocity ?
						velocity < 0 ?
								config.maxMomentumVelocity * -1 :
								config.maxMomentumVelocity :
						velocity;

				if (M.abs(velocity) < config.minMomentumVelocity) { //if velocity below minimum threshold, no momentum
					duration[a] = 0;
					continue;
				}

				outOfBounds = M.min(0, M.max(this.axis[a].pos, this.axis[a].maxScroll)) !== this.axis[a].pos;

				//caution, unknown: if minMomentum velocity set too low, could this be negative when velocity is very low.? test velocity < 0.1.
				duration[a] = M.log((outOfBounds ? config.minOvershotVelocity : config.minMomentumVelocity) / M.abs(velocity)) / M.log(outOfBounds ? config.overshotFriction : config.friction);

				//use cubic bezier initial velocity && duration to compute final distance
				distance = (velocity / (outOfBounds ? config.overshotTiming : config.momentumTiming).getDerivativeYForT(0)) * duration[a];

				newPosition[a] = currentPos[a] + distance;

			}

			return {
				position: newPosition,
				duration: (duration.x || duration.y) ? duration : false
			};
		},

		/**
		 * set the css transition time for transforms, call scrollers to do the same.
		 * @param  {number}		duration the transition time duration in ms.
		 * @return {undefined}
		 */
		__transitionTime: function (duration) {
			var i;

			duration = duration || 0;
			this.scroller.style[transitionDuration] = duration + 'ms';

			for (i in this.axis) {
				if (this.axis[i].active && this.axis[i].hasScrollbar) {
					this.axis[i].scrollbar.transitionTime(duration);
				}
			}
		},

		//todo: firefox wheel has different distances, we need to make speeds same accross browsers
		/**
		 * handles the mouse wheel event (two finger scroll as well)
		 * @param  {Event}		e the wheel event
		 * @return {undefined}
		 */
		__wheel: function (e) {
			var wheelDeltaX, wheelDeltaY,
				deltaX, deltaY;

			if (typeof e.wheelDeltaX !== 'undefined') {
				wheelDeltaX = e.wheelDeltaX / 10;
				wheelDeltaY = e.wheelDeltaY / 10;
			} else if (typeof e.wheelDelta !== 'undefined') {
				wheelDeltaX = wheelDeltaY = e.wheelDelta / 10;
			} else if (typeof e.detail !== 'undefined') {
				wheelDeltaX = wheelDeltaY = -e.detail * 3;
			} else {
				return;
			}

			deltaX = this.axis.x.pos + wheelDeltaX * this.options.invertWheelDirection;
			deltaY = this.axis.y.pos + wheelDeltaY * this.options.invertWheelDirection;

			if (deltaX > 0) {
				deltaX = 0;
			} else if (deltaX < this.axis.x.maxScroll) {
				deltaX = this.axis.x.maxScroll;
			}

			if (deltaY > 0) {
				deltaY = 0;
			} else if (deltaY < this.axis.y.maxScroll) {
				deltaY = this.axis.y.maxScroll;
			}

			this.scrollTo({x: deltaX, y: deltaY}, 0);
		},
		//todo: doesn't work with pointer events
		__zoom: function (e) {
			if (!this.enabled || !this.initiated || this.waitReset) {
				return;
			}

			var c1 = M.abs(e.touches[0].pageX - e.touches[1].pageX),
				c2 = M.abs(e.touches[0].pageY - e.touches[1].pageY),
				distance = M.sqrt(c1 * c1 + c2 * c2),
				scale = 1 / this.touchesDistanceStart * distance * this.startScale,
				lastScale,
				x,
				y;

			if (scale < this.options.zoomMin) {
				scale = 0.5 * this.options.zoomMin * M.pow(2.0, scale / this.options.zoomMin);
			} else if (scale > this.options.zoomMax) {
				scale = 2.0 * this.options.zoomMax * M.pow(0.5, this.options.zoomMax / scale);
			}

			lastScale = scale / this.startScale;
			//x = this.originX - this.originX * lastScale + this.x;
			//y = this.originY - this.originY * lastScale + this.y;
			x = this.originX - this.originX * lastScale + this.axis.x.start;
			y = this.originY - this.originY * lastScale + this.axis.y.start;

			this.scroller.style[transform] = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')' + translateZ;

			this.scale = scale;

			this.scaled = scale !== 1;
		},

		__snap: function (x, y) {
			var result,
				current = {
					x: this.pages[this.pageX][this.pageY].x,
					y: this.pages[this.pageX][this.pageY].y,
					pageX: this.pageX,
					pageY: this.pageY
				};

			// check if we matched the snap threashold
			if (M.abs(x - this.axis.x.absStart) < this.options.snapThreshold &&
						M.abs(y - this.axis.y.absStart) < this.options.snapThreshold) {
				return current;
			}

			// find new page position
			result = this.getPage(x, y);

			if (!result) {
				return current;
			}

			if (M.abs(result.pageX - this.pageX) === 0) {
				result.pageX += this.axis.x.direction;

				if (result.pageX < 0) {
					result.pageX = 0;
				} else if (result.pageX >= result.pageCountX) {
					result.pageX = result.pageCountX - 1;
				}

				result.x = this.pages[result.pageX][result.pageY].x;

				if (result.x < this.axis.x.maxScroll) {
					result.x = this.axis.x.maxScroll;
				}
			}

			if (M.abs(result.pageY - this.pageY) === 0) {
				result.pageY += this.axis.y.direction;

				if (result.pageY < 0) {
					result.pageY = 0;
				} else if (result.pageY >= result.pageCountY) {
					result.pageY = result.pageCountY - 1;
				}

				result.y = this.pages[result.pageX][result.pageY].y;

				if (result.y < this.axis.y.maxScroll) {
					result.y = this.axis.y.maxScroll;
				}
			}

			return result;
		},

		/* ---- PUBLIC METHODS ---- */

		/**
		 * @export
		 */
		getPage: function (x, y) {
			if (!this.pages) {
				return false;
			}

			var i, l,
				m, n,
				newX, newY,
				pageX, pageY;

			x = x === undefined ? this.x : x;
			y = y === undefined ? this.y : y;

			for (i = 0, l = this.pages.length; i < l; i++) {
				for (m = 0, n = this.pages[i].length; m < n; m++) {
					if (newX === undefined && x > this.pages[i][m].cx) {
						newX = this.pages[i][m].x;
						pageX = i;
					}
					if (newY === undefined && y > this.pages[i][m].cy) {
						newY = this.pages[i][m].y;
						pageY = m;
					}

					if (newY !== undefined && newX !== undefined) {
						return {
							x: newX,
							y: newY,
							pageX: pageX,
							pageY: pageY,
							pageCountX: this.pages.length,
							pageCountY: this.pages[0].length
						};
					}
				}
			}

			return false;
		},
		/**
		 * @export
		 */
		disable: function () {
			this.enabled = false;
		},
		/**
		 * @export
		 */
		enable: function () {
			this.enabled = true;
		},
		/**
		 * @export
		 */
		refresh: function () {
			//todo: document these variables
			var x, y,
				cx, cy,
				i,
				l, m, n,
				el;

			//todo: add jslint ignore to this line
			this.wrapper.offsetHeight;	// Force browser recalculate layout (linters hate this)

			this.wrapperWidth		= this.wrapper.clientWidth;
			this.wrapperHeight		= this.wrapper.clientHeight;
			this.scrollerWidth		= M.round(this.scroller.offsetWidth * this.scale);
			this.scrollerHeight		= M.round(this.scroller.offsetHeight * this.scale);
			this.axis.x.maxScroll	= M.min(this.wrapperWidth - this.scrollerWidth, 0);
			this.axis.y.maxScroll	= M.min(this.wrapperHeight - this.scrollerHeight, 0);
			this.axis.x.active		= this.axis.x.scroll && this.axis.x.maxScroll < 0;
			this.axis.y.active		= this.axis.y.scroll && this.axis.y.maxScroll < 0;

			if (this.axis.x.hasScrollbar) {
				this.axis.x.scrollbar.refresh(this.scrollerWidth, this.axis.x.maxScroll, this.axis.x.pos);
			}
			if (this.axis.y.hasScrollbar) {
				this.axis.y.scrollbar.refresh(this.scrollerHeight, this.axis.y.maxScroll, this.axis.y.pos);
			}

			// this utterly complicated setup is needed to also support snapToElement
			if (this.options.snap === true) {
				this.axis.x.snapStep = this.axis.x.snapStep || this.wrapperWidth;
				this.axis.y.snapStep = this.axis.y.snapStep || this.wrapperHeight;

				this.pages = [];
				i = 0;
				x = 0;
				cx = M.round(this.axis.x.snapStep / 2);

				while (x < this.scrollerWidth) {
					this.pages[i] = [];
					l = 0;
					y = 0;
					cy = M.round(this.axis.y.snapStep / 2);

					while (y < this.scrollerHeight) {
						this.pages[i][l] = {
							x: -x,
							y: -y,
							cx: -cx,
							cy: -cy
						};

						y += this.axis.y.snapStep;
						cy += this.axis.y.snapStep;
						l++;
					}

					x += this.axis.y.snapStep;
					i++;
				}
			} else if (typeof this.options.snap === 'string') {
				el = this.scroller.querySelectorAll(this.options.snap);
				this.pages = [];
				m = 0;
				n = -1;
				x = y = 0;

				for (i = 0, l = el.length; i < l; i++) {
					if (el[i].offsetLeft === 0) {
						m = 0;
						n++;
					}

					if (!this.pages[m]) {
						this.pages[m] = [];
					}

					x = el[i].offsetLeft;
					y = el[i].offsetTop;
					cx = x + M.round(el[i].offsetWidth / 2);
					cy = y + M.round(el[i].offsetHeight / 2);

					this.pages[m][n] = {
						x: -x,
						y: -y,
						cx: -cx,
						cy: -cy
					};

					m++;
				}
			}
		},

		//if we have scrolled too far, bounce back to the max amounts, otherwise do nothing
		/**
		 * @export
		 */
		resetPosition: function (immediate) {
			var position = {},
				time = immediate ? 0 : config.snapTime,
				i,
				needsReposition = false;

			for (i in this.axis) {
				position[i] = M.min(0, M.max(this.axis[i].pos, this.axis[i].maxScroll));
				needsReposition = needsReposition || (position[i] !== this.axis[i].pos);
			}

			if (needsReposition) {
				this.scrollTo(position, {x: time, y: time}, config.bounceBackTiming);
				return true;
			}

			return false;
		},
		/**
		 * @export
		 */
		scrollBy: function (distance, duration) {
			var i;

			for (i in distance) {
				distance[i] += this.axis[i].pos;
			}

			this.scrollTo(distance, duration);
		},
		/**
		 * @export
		 */
		scrollTo: function (destination, duration, timingFunc) {

			if (!duration) {
				this.__transitionTime(0);
				this.__pos(destination);
				this.resetPosition(false);
			} else {
				this.__animate(destination, duration, timingFunc);
			}
		},
		/**
		 * @export
		 */
		scrollToElement: function () {
			// TODO
		},
		/**
		 * @export
		 */
		destroy: function () {
			// TODO
		}
	};

	/* ---- SCROLL BAR INDICATOR ---- */

	/**
	 * The draggable component of the scrollbar.
	 * @constructor
	 * @param {Scrollbar} scrollbar the scrollbar object on which the indicator resides
	 * @param {Object=} options   a set of options which can modify the default behaviour.
	 */
	function Indicator(scrollbar, options) {
		var i,
			defaults = {
				interactive: false,
				resize: true,
				sizeRatio: 0,
				position: 0
			};

		for (i in options) {
			defaults[i] = options[i];
		}

		this.el = d.createElement('div');
		this.scrollbar = scrollbar;
		this.direction = scrollbar.direction;
		this.interactive = !!defaults.interactive;
		this.resize = defaults.resize;
		this.sizeRatio = defaults.sizeRatio;
		this.maxPos = 0;
		this.position = defaults.position;
		this.size = 0;
		this.sizeProperty = this.direction === 'y' ? 'height' : 'width';
		this.el.style[transitionTimingFunction] = 'cubic-bezier(0.33,0.66,0.66,1)'; //todo: place in config file
		this.el.style[transform] = translateZ;

		if (this.scrollbar.axis.indicatorClass) {
			this.el.className = ' ' + this.scrollbar.axis.indicatorClass;
		} else {
			//todo: config file
			this.el.style.cssText = cssVendor + 'box-sizing:border-box;box-sizing:border-box;position:absolute;background:rgba(0,0,0,0.5);border:1px;border-radius:3px';
		}

		this.scrollbar.el.appendChild(this.el);
	}

	Indicator.prototype = {
		refresh: function (size, maxScroll, position) {
			this.transitionTime(0);

			this.size = M.max(M.round(this.scrollbar.size * this.scrollbar.size / size), 8);
			this.el.style[this.sizeProperty] = this.size + 'px';
			this.maxPos = this.scrollbar.size - this.size;
			this.sizeRatio = this.maxPos / maxScroll;

			this.pos(position);
		},
		//todo: consider the transition time for this
		pos: function (position) {
			position = M.round(this.sizeRatio * position * 100) / 100;
			this.position = position;

			if (position < 0) {
				position = 0;
			} else if (position > this.maxPos) {
				position = this.maxPos;
			}

			if (this.scrollbar.scroller.options.useTransform) { //todo: localize property to this object
				this.el.style[transform] = 'translate(' + (this.direction === 'h' ? position + 'px,0' : '0,' + position + 'px') + ')' + translateZ;
			} else {
				this.el.style[(this.direction === 'x' ? 'left' : 'top')] = position + 'px';
			}
		},

		transitionTime: function (duration) {
			duration = duration || 0;
			this.el.style[transitionDuration] = duration + 'ms';
		}
	};


	/* ---- SCROLLBAR ---- */
	/**
	 * A scrollbar.
	 * @constructor
	 * @param {IScroll}	scroller	the associated scroller object.
	 * @param {Object}	axis		the associated axis.
	 */
	Scrollbar = function (scroller, axis) {
		var indicator;

		//todo: document variables used such as 'overshot'

		this.el = d.createElement('div');
		this.direction = axis.direction;
		this.scroller = scroller;
		this.axis = axis;

		if (axis.wrapperClass) {
			this.el.className += ' ' + this.axis.scrollbarClass;
		} else {
			//todo: config object
			this.el.style.cssText = 'position:absolute;z-index:1;width:7px;bottom:2px;top:2px;right:1px';
		}

		this.scroller.wrapper.appendChild(this.el);

		if (this.direction === 'x') {
			this.sizeProperty = 'width';
			this.page = 'pageX';
		} else {
			this.sizeProperty = 'height';
			this.page = 'pageY';
		}

		this.size = 0;
		this.currentPointer = null;
		this.indicator = new Indicator(this);

		if (!this.scroller.options.interactiveScrollbars) {
			this.el.style.pointerEvents = 'none'; //todo: check if we need vendor specific here
		} else {
			addEvent(this.indicator.el, eventStart, this);
			//addEvent(this.el, 'mouseover', this);
			//addEvent(this.el, 'mouseout', this);
		}
		//todo: create up/down arrows
	};

	Scrollbar.prototype = {
		handleEvent: function (e) {
			switch (e.type) {

			case eventStart:
				if (!hasTouch && e.button !== 0) {
					return;
				}
				this.__start(e);
				break;
			case eventMove:
				this.__move(e);
				break;
			case eventEnd:
			case eventCancel:
				this.__end(e);
				break;
			}
			//todo: need event for clicking track
		},

		__start: function (e) {

			//filter touch events and begin tracking first pointer
			if (hasPointer) {
				if (e.pointerType === e.MSPOINTER_TYPE_TOUCH ||
							(this.currentPointer !== null && this.currentPointer !== e.pointerId)) {
					return; //only allow touch events through, only allow first pointer captured through
				}

				this.currentPointer = e.pointerId;
				if (hasPointer) {
					e.target.msSetPointerCapture(e.pointerId);
				}
			}

			e.preventDefault();
			e.stopPropagation();


			this.initiated	= true;
			this.overshot	= 0;

			this.indicator.transitionTime(0);

			//store current position to calculate difference on move
			this.lastPoint	= e[this.page];

			addEvent(w, eventMove, this);
			addEvent(w, eventEnd, this);
		},

		__move: function (e) {
			if (hasPointer && e.pointerId !== this.currentPointer) {
				return;
			}
			if (!this.initiated) {
				return;
			}

			var delta,
				newPos;

			//find change
			delta = e[this.page] - this.lastPoint;
			//store current point to calc next change
			this.lastPoint = e[this.page];

			//keep cursor on same spot on indicator, if it goes beyond, stop scrolling
			if ((this.overshot > 0 && this.overshotDir === 'positive') ||
					(this.overshot < 0 && this.overshotDir === 'negative')) {
			    this.overshot += delta;
				return;
			}

			//don't allow using scrollbar to move scroller out of bounds
			if (this.indicator.position + delta > this.indicator.maxPos) {
                this.overshot += this.indicator.position + delta - this.indicator.maxPos;
				this.overshotDir = 'positive';
				delta -= this.indicator.position + delta - this.indicator.maxPos;
			} else if (this.indicator.position + delta < 0) {
                this.overshot -= this.indicator.position - delta;
				this.overshotDir = 'negative';
				delta += this.indicator.position - delta;
			}
			//convert indicator distance to scroller distance
			newPos = delta / this.indicator.sizeRatio;

			if (this.direction === 'y') {
				this.scroller.scrollTo({y: newPos}, 0);
			} else {
				this.scroller.scrollTo({x: newPos}, 0);
			}

			e.preventDefault();
			e.stopPropagation();
		},

		__end: function (e) {

			if (hasPointer) {
				if (this.currentPointer !== e.pointerId) {
					return;
				}

				if (e.target.msReleasePointerCapture) {
					e.target.msReleasePointerCapture(this.currentPointer);
				}
				this.currentPointer = null;
			}
			if (!this.initiated) {
				return;
			}

			removeEvent(w, eventMove, this);
			removeEvent(w, eventEnd, this);

			this.initiated = false;

			if (e.target !== this.indicator) {
				this.out();
			}

			e.preventDefault();
			e.stopPropagation();
		},

		over: function () {
			//todo: inject all styles at once,
			//todo: set this in config section
			//this.el.style[transitionDuration] = '0.15s';
			this.el.style[this.sizeProperty] = '14px';
			this.el.style.backgroundColor = 'rgba(255,255,255,0.4)';
			//todo: this.indicator.over();
			//this.indicator.el.style[transitionDuration] = '0.15s';
			this.indicator.el.style.borderWidth = '7px';
			this.indicator.el.style.backgroundColor = 'green';//todo: remove test code
			this.indicator.el.style.width = '7px';
		},

		out: function () {
			if (this.initiated) {
				return;
			}
			//todo: see over
			//this.el.style[transitionDuration] = '0.1s';
			this.el.style[this.sizeProperty] = '7px';
			this.el.style.backgroundColor = 'rgba(255,255,255,0)';
			//todo: this.indicator.out()
			//this.indicator.el.style[transitionDuration] = '0.1s';
			this.indicator.el.style.borderWidth = '3px';
			this.indicator.el.style.backgroundColor = 'transparent'; //todo: remove test code
			this.indicator.el.style.width = '0px';
		},

		pos: function (position) {
			this.indicator.pos(position);
		},
		//todo: document what the refresh is doing
		refresh: function (size, maxScroll, position) {
			this.indicator.transitionTime(0);
			this.el.style.display = this.axis.active ? 'block' : 'none';

			this.el.offsetHeight;	// force refresh
			this.size = this.direction === 'x' ? this.el.clientWidth : this.el.clientHeight;
			this.indicator.refresh(size, maxScroll, position);
			this.pos(position);
			this.over(); //todo: hack for testing
		},

		transitionTime: function () {
			this.indicator.transitionTime([].slice.call(arguments));
		}
	};


	/**
	 * @description Utility class to describe an animation and calculate values along its path.
	 * @constructor
	 * 
	 * @property {number} 		startTime				the timing value at which the animation is started.
	 * @property {number}		correctedDestination	the destination of the animation after considering the end percent.
	 * @property {number}		startPos				starting position of the animation.
	 * @property {number}		distance				the distance the animation will travel, not correcting for start and end percent.
	 * @property {number}		destination				the end position of the animation, not correcting for end percent modifier.
	 * @property {number}		duration				the timing value of the duration of the animation, not considering start and end percent.
	 * @property {CubicBezier}	timingFunction			a CubicBezier object which describes the animation path.
	 * @property {number}		startPct				value between 0 and 1 which indicates the percent along the timing function path
	 *													that the animation calculation should start at.
	 * @property {number}		endPct					value between 0 and 1 which indicates the percent along the timing function path
	 *													that the animation calculation should end at.
	 * @property {number}		pctDistance				value between 0 and 1 which indicated the percentage of the distance which the
	 *													animation function should cover.
	 * 
	 * 
	 * @param {number}		destination		the destination of the animation on its axis if the animation ran to completion.
	 * @param {number}		duration		the duration of the animation in ms.
	 * @param {CubicBezier}	timingFunction	a CubicBezier object which describes the animation path.
	 * @param {number=}		startPct		value between 0 and 1 which indicates the percent along the timing function path
	 *										that the animation calculation should start at.
	 * @param {number=}		endPct			value between 0 and 1 which indicates the percent along the timing function path
	 *										that the animation calculation should end at.
	 */
	ScrollAnimation = function (destination, duration, timingFunction, startPct, endPct) {
		this.destination = destination;
		this.duration = duration;
		this.timingFunction = timingFunction;
		this.startPct = startPct ? timingFunction.getTForY(startPct, 0.02) : 0;
		this.endPct = endPct ? timingFunction.getTForY(endPct, 0.02) : 1;
		this.pctDistance = endPct;
		//this.startTime
		//this.correctedDestination
		//this.startPos
		//this.distance
	};

	ScrollAnimation.prototype = {
		/**
		 * Calculate the new position of the animation for a given timing value,
		 * or the final position if animation is complete.
		 * @param  {number}	t	a timing value from window.performance.now if exists, otherwise new Date().now.
		 * @return {number}		the position of the animation for the given time.
		 */
		getPointForT: function (t) {
			var pct				= (t - this.startTime) / this.duration + this.startPct,
				bezierPoint;

			if (pct >= this.endPct) {
				return this.correctedDestination;
			}

			bezierPoint	= this.timingFunction.getPointForT(pct);

			return (this.distance * bezierPoint.y + this.startPos);
		},
		/**
		 * Set needed properties for the animation to begin,
		 * should be set 1 frame prior to calculating values of animation.
		 * @param  {number} startPos  the current position of the axis.
		 * @param  {number} startTime timing value of the current time.
		 * @return {undefined}
		 */
		begin: function (startPos, startTime) {
			this.startPos = startPos;
			this.startTime = startTime;
			this.distance = this.destination - this.startPos;
			this.correctedDestination = this.startPos + this.distance * this.pctDistance;
		},
		/**
		 * For a given starting position, calculate the velocity of the animation at its end, factoring in the end percent.
		 * @param  {number} startPos a starting position on the axis.
		 * @return {number}          the velocity of the animation at end percent.
		 */
		endVelocity: function (startPos) {
			return this.timingFunction.getDerivativeYForT(this.endPct) * ((this.destination - startPos) / this.duration);
		}
	};

	dummyStyle = null;	// free some mem?

}(window, document, Math));


