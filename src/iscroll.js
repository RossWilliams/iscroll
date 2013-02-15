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

	Bug: Cubic Bezier starting velocity does not match initial velocity well over a range of values

	Consider limited the bounceback to when velocity at max point is greater than a certain threshold.

	Check for conflicts in global scope with new objects
	
 */
var IScroll, CubicBezier, ScrollAnimation;


(function () {
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
	 */
	CubicBezier = function (p1x, p1y, p2x, p2y) {
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

	CubicBezier.prototype.getTForY = function (y, epsilon) {
		return this._getTForCoordinate(y, this._p1.y, this._p2.y, epsilon);
	};
	CubicBezier.prototype.getDerivativeYForT = function (t) {
		return this._getCoordinateDerivateForT(0, this._p1.y, this._p2.y);
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
	 * @returns {CubicBezier[]} Returns an array containing two bezier curves
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
		return new CubicBezier();
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
}());



(function (w, d, M) {
	"use strict";
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
		config = {
			minStartDistance: 10, //in pixels, the distance a finger must move to begin the scrolling behaviour
			minDistanceToLock: 5, //in pixels, if movement in one direction is X greater than the other, lock the movement direction
			outOfBoundsSpeedReduction: 0.3, //0-1 the percentage of distance to move scroller vs finger movement when past max scroll bounds
			snapTime: 200, //in ms, the amount of time to animate scrolling when snapping to a specific point on scrollEnd
			friction: 0.996, //used in easing animation during a momentum scroll where velocities are supplied, try between .990 - .998
			overshotFriction: 0.993,
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

	function addEvent(el, type, fn, capture) {
		el.addEventListener(type, fn, !!capture);
	}

	function removeEvent(el, type, fn, capture) {
		el.removeEventListener(type, fn, !!capture);
	}

	/* ---- SCROLLER ---- */

	/**
	 * The main access point for creating a scroller
	 * @constructor
	 * @param {Node|string} el        wrapper of the scroller, or string selector for the element.
	 * @param {Object} options scroll options to apply to this instance.
	 */
	IScroll = function (el, options) {
		if (this instanceof IScroll === false) {
			return new IScroll(el, options);
		}
		var i; //iterator

		this.wrapper = typeof el === 'string' ? d.querySelector(el) : el;
		this.scroller = this.wrapper.children[0];
		this.enable();

		this.options = {
			startX: 0,
			startY: 0,
			scrollX: false,
			scrollY: true,
			vScrollbarWrapperClass: '',
			vScrollbarClass: '',
			hScrollbarWrapperClass: '',
			hScrollbarClass: '',
			lockDirection: true,
			momentum: true,
			bounce: true,
			//eventPassthrough: false,	TODO: preserve native vertical scroll on horizontal JS scroll (and vice versa)

			HWCompositing: true,		// mostly a debug thing (set to false to skip hardware acceleration)
			useTransition: false,		//You may want to set this to false if requestAnimationFrame exists and is not shim
			useTransform: true,

			scrollbars: true,
			interactiveScrollbars: true,
			//hideScrollbars: true,		TODO: hide scrollbars when not scrolling
			//shrinkScrollbars: false,	TODO: shrink scrollbars when dragging over the limits

			mouseWheel: true,
			invertWheelDirection: false, //also known in apple land as natural scrolling
			//wheelSwitchAxes: false,	TODO: vertical wheel scrolls horizontally
			//wheelAction: 'scroll',	TODO: zoom with mouse wheel

			snap: false,
			snapThreshold: 10,
			snapStepX: 0,
			snapStepY: 0,
			//flickNavigation: true,	TODO: go to next/prev slide on flick

			zoom: false,
			zoomMin: 1,
			zoomMax: 3
			//startZomm: 1,				TODO: the initial zoom level

			//onFlick: null,			TODO: add flick custom event
		};

		for (i in options) {
			this.options[i] = options[i];
		}

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

		this.x = this.options.startX;
		this.y = this.options.startY;
		this.isRAFing = false;	//controls whether we want to keep requesting the next animation frame
		this.scale = 1;		//holds the current zoom amount
		this.pageX = 0;		// current page when paging in x direction, needed by snap, ignored otherwise
		this.pageY = 0;		// current page when paging in y direction, ignored otherwise
		this.waitReset = false; //boolean to prevent refresh if we are in the middle of another operation
		this.currentPointer = null;	//tracks current pointer for browsers with pointer events
		this.positions = [];//save off positions user has scrolled to along with timestamp for momemtum purposes

		if (this.options.useTransition) {
			this.scroller.style[transitionTimingFunction] = 'cubic-bezier(0.33,0.66,0.66,1)';
		}

		if (this.options.scrollbars === true) {
			if (this.options.scrollY) {
				this.vScrollbar = new Scrollbar(this, 'v');
			}
			if (this.options.scrollX) {
				this.hScrollbar = new Scrollbar(this, 'h');
			}
		}
		//refresh finishes the setup work
		this.refresh();

		this.__pos(this.x, this.y);

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

	IScroll.prototype = {
		/**
		 * Handles all dom events for the scroll wrapper element,
		 * uses the event type to call the appropriate method.
		 * @param  {Event} e the handled event.
		 * @return {undefined}
		 */
		handleEvent: function (e) {
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
			case 'mouseover':
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
		 * @param  {Array<ScrollAnimation>} xAnimations an array of animations to be run on the x axis in serial.
		 * @param  {Array<ScrollAnimation>} yAnimations an array of animations to be run on the y axis in serial.
		 * @return {undefined}
		 */
		__executeAnimations: function (xAnimations, yAnimations) {
			var self = this,
				startX = this.x,
				startY = this.y,
				startTime = getTime(),
				currentXAnimation,
				currentYAnimation,
				now,
				newX,
				newY,
				bezierPoint;

			var oldNow = getTime();

			function transitionStep() {
				var xAxis, yAxis, duration;

				currentXAnimation = xAnimations.length ? xAnimations.shift() : null;
				currentYAnimation = yAnimations.length ? yAnimations.shift() : null;

				if (!currentXAnimation && !currentYAnimation) {
					removeEvent(self.scroller, eventTransitionEnd, transitionStep);
				} else {
					self.__transitionTime(
						M.max(
							currentXAnimation ? currentYAnimation.duration : 0,
							currentYAnimation ? currentYAnimation.duration : 0
						)
					);
					self.__pos(
						currentXAnimation ? currentXAnimation.destination : self.x,
						currentYAnimation ? currentYAnimation.destination : self.y
					);
				}
			}

			//todo: use the new version of rAF parameter that already has the performance time.
			function step() {
				if (self.isRAFing === false) {
					console.log('stopped');
					return;
				}
				now = getTime();
				if (currentXAnimation) {
					newX = currentXAnimation.getPointForT(now);
					if (newX === currentXAnimation.destination) {
						currentXAnimation = xAnimations.length ? xAnimations.shift() : null;
						if (currentXAnimation) {
							currentXAnimation.begin(self.x, now);
						}
					}
				} else {
					newX = self.x;
				}
				if (currentYAnimation) {
					newY = currentYAnimation.getPointForT(now);
					if (newY === currentYAnimation.destination) {
						currentYAnimation = yAnimations.length ? yAnimations.shift() : null;
						if (currentYAnimation) {
							currentYAnimation.begin(self.y, now);
						}
					}
				} else {
					newY = self.y;
				}
				console.log('velocity: ' + ((newY - self.y) / (now - oldNow)));
				oldNow = now;
				self.__pos(newX, newY);

				if (!currentXAnimation && !currentYAnimation) {
					self.isRAFing = false;
					console.log('STOP');
				} else {
					rAF(step);
				}
			}

			if (this.options.useTransition) {
				addEvent(this.scroller, eventTransitionEnd, transitionStep);
				transitionStep();
			} else {
				this.__transitionTime(0);
				this.isRAFing = true;
				currentXAnimation = xAnimations.length ? xAnimations.shift() : null;
				if (currentXAnimation) {
					currentXAnimation.begin(self.x, startTime);
				}
				currentYAnimation = yAnimations.length ? yAnimations.shift() : null;
				if (currentYAnimation) {
					currentYAnimation.begin(self.y, startTime);
				}
				rAF(step);
				console.log('begin animating');
			}
		},

		/**
		 * creates scrollAnimation objects from destination points and scroll options,
		 * sends these, if any are created, to __executeAnimations.
		 * @param	{number}		destX		the destination on x axis.
		 * @param	{number}		destY		the destination on y axis.
		 * @param	{number}		durationX	the duration of the animation.
		 * @param	{number}		durationY	the duration of the animation along the y axis.
		 * @param	{CubicBezier=}	timingFunc	the cubic bezier object to use to calculate animation path.
		 * @return  {undefined}
		 */
		__animate: function (destX, destY, durationX, durationY, timingFunc) {
			var self				= this,
				distX				= destX - this.x,
				distY				= destY - this.y,
				overshotDistanceX	= 0,
				overshotDistanceY	= 0,
				overshotDurationX,
				overshotDurationY,
				pctX,
				pctY,
				xAnimations			= [],
				yAnimations			= [],
				intermediateX		= this.x,
				intermediateY		= this.y;

			timingFunc = timingFunc || config.defaultTiming;

			/*	
				if distance set is out of bounds, restrict to bounds if no bounce,
				otherwise queue additional animation with more friction, which starts
				at boundary with same velocity
			*/

			if (this.options.bounce) {
				overshotDistanceX = destX > 0 ?
						destX :
						this.maxScrollX > destX ?
								destX - this.maxScrollX :
								0;
				overshotDistanceY = destY > 0 ?
						destY :
						this.maxScrollY > destY ?
								destY - this.maxScrollY :
								0;
				//todo: move this into utility function, call for each axis, return array
				if (overshotDistanceX !== 0 && M.abs(distX) > 0) {

					pctX = M.min(M.abs(overshotDistanceX / distX), 1);
					if (pctX !== 1) {
						//if we are already over the overscroll area, we don't need the initial slow down to the boundary
						xAnimations.push(
							new ScrollAnimation(destX - overshotDistanceX, durationX, timingFunc, 0, pctX)
						);
						overshotDurationX = M.max(0, M.log(config.minOvershotVelocity / M.abs(xAnimations[0].endVelocity(this.x))) / M.log(config.overshotFriction));
						overshotDistanceX = (xAnimations[0].endVelocity(this.x) / config.overshotTiming.getDerivativeYForT(0)) * overshotDurationX;
					} else {
						overshotDurationX = durationX;
						overshotDistanceX = distX;
					}

					xAnimations.push(
						//todo: should use a unique timing function here, with config deceleration for bounds
						//do same distance calc as __momentum
						new ScrollAnimation(overshotDistanceX, overshotDurationX, config.overshotTiming),
						new ScrollAnimation(destX > 0 ? 0 : this.maxScrollX, config.bounceTime, config.bounceBackTiming)
					);
				} else if (M.abs(distX) > 0) {
					xAnimations.push(new ScrollAnimation(M.floor(destX), durationX, timingFunc));
				}

				if (overshotDistanceY !== 0 && M.abs(distY) > 0) {
					//bug: consider edge case when initiating a bounce action after already overscrolling
					pctY = M.min(M.abs(overshotDistanceY / distY), 1);
					if (pctY !== 1) {
						//if we are already over the overscroll area, we don't need the initial slow down to the boundary
						yAnimations.push(
							new ScrollAnimation(destY - overshotDistanceY, durationY, timingFunc, 0, pctY)
						);
						overshotDurationY = M.max(0, M.log(config.minOvershotVelocity / M.abs(yAnimations[0].endVelocity(this.y))) / M.log(config.overshotFriction));
						overshotDistanceY = (yAnimations[0].endVelocity(this.y) / config.overshotTiming.getDerivativeYForT(0)) * overshotDurationY;
					} else {
						overshotDurationY = durationY;
						overshotDistanceX = distX;
					}

					yAnimations.push(
						new ScrollAnimation(overshotDistanceY, overshotDurationY, config.overshotTiming),
						new ScrollAnimation(destY > 0 ? 0 : this.maxScrollY, config.bounceTime, config.bounceBackTiming)
					);
				} else if (M.abs(distY) > 0) {
					yAnimations.push(new ScrollAnimation(M.floor(destY), durationY, timingFunc));
				}
			} else {
				//keep scrolling in bounds
				destX = destX > 0 ?
						0 :
						this.maxScrollX > destX ?
								this.maxScrollX :
								destX;
				destY = destY > 0 ?
						0 :
						this.maxScrollY > destY ?
								this.maxScrollY :
								destY;

				if (destX !== this.x) {
					xAnimations.push(new ScrollAnimation(M.floor(destX), durationX, timingFunc));
				}
				if (destY !== this.y) {
					yAnimations.push(new ScrollAnimation(M.floor(destY), durationY, timingFunc));
				}
			}

			if (xAnimations.length || yAnimations.length) {
				this.__executeAnimations(xAnimations, yAnimations);
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
		 * @param  {number} x the new position on the x axis.
		 * @param  {number} y the new position on the y axis.
		 * @return {undefined}
		 */
		__pos: function (x, y) {
			if (this.options.useTransform) {
				this.scroller.style[transform] = 'translate(' + x + 'px,' + y + 'px) scale(' + this.scale + ')' + translateZ;
			} else {
				x = M.round(x);
				y = M.round(y);
				this.scroller.style.left = x + 'px';
				this.scroller.style.top = y + 'px';
			}

			this.x = x;
			this.y = y;

			console.log('posY:   ' + this.y);

			if (this.hasHorizontalScroll) {
				this.hScrollbar.pos(this.x);
			}
			if (this.hasVerticalScroll) {
				this.vScrollbar.pos(this.y);
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
		 * @param  {Event} e [description]
		 * @return {[type]}   [description]
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
				c2;

			//filter non touch events and begin tracking first pointer
			if (hasPointer) {

				if (point.pointerType !== point.MSPOINTER_TYPE_TOUCH ||
							(this.currentPointer !== null && this.currentPointer !== point.pointerId)) {
					return; //only allow touch events through, only allow first pointer captured through
				}

				this.currentPointer = point.pointerId;
				if (point.target.msSetPointerCapture) {
					point.target.msSetPointerCapture(point.pointerId);
				}
			}

			//todo: performance implications of adding events here? better options?
			addEvent(w, touchEventMove, this);
			addEvent(w, touchEventCancel, this);
			addEvent(w, touchEventEnd, this);

			this.initiated			= true;
			this.moved				= false;
			this.distX				= 0;
			this.distY				= 0;
			this.directionX			= 0;
			this.directionY			= 0;
			this.directionLocked	= 0;

			this.__transitionTime(0);

			this.isRAFing = false;		// stop the rAF animation (only with useTransition:false)

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

				if (x !== this.x || y !== this.y) {
					//this is the case of stopping a current transition which may be occuring.
					this.__pos(x, y);
				}
			}

			this.pointX		= point.pageX;
			this.pointY		= point.pageY;

			// absolute start needed by snap to compute snap threashold
			this.absStartX	= this.x;
			this.absStartY	= this.y;
			this.startTime	= getTime();

			//begin recording positions and timestamps, will be used for momentum calculations
			this.positions	= [];
			this.positions.push(this.startTime, this.x, this.y);

		},
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
				deltaX		= this.hasHorizontalScroll ? point.pageX - this.pointX : 0,
				deltaY		= this.hasVerticalScroll ? point.pageY - this.pointY : 0,
				newX		= this.x + deltaX,
				newY		= this.y + deltaY,
				timestamp	= getTime(),
				absDistX,
				absDistY;

			//this.x and this.y will be set when actually doing the movement, not here
			this.pointX		= point.pageX;
			this.pointY		= point.pageY;

			this.distX		+= deltaX;
			this.distY		+= deltaY;
			absDistX		= M.abs(this.distX);
			absDistY		= M.abs(this.distY);

			// We need to move at least a cetain distance for the scrolling to initiate
			if (absDistX < config.minStartDistance && absDistY < config.minStartDistance) {
				return;
			}

			// If you are scrolling in one direction lock the other
			if (!this.directionLocked && this.options.lockDirection) {
				if (absDistX > absDistY + config.minDistanceToLock) {
					this.directionLocked = 'h';		// lock horizontally
				} else if (absDistY > absDistX + config.minDistanceToLock) {
					this.directionLocked = 'v';		// lock vertically
				} else {
					this.directionLocked = 'n';		// no lock
				}
			}

			if (this.directionLocked === 'h') {
				newY = this.y;
				deltaY = 0;
			} else if (this.directionLocked === 'v') {
				newX = this.x;
				deltaX = 0;
			}

			// Slow down if outside of the boundaries
			// TODO: restrict to boundaries if we don't have options.bounce
			if (newX > 0 || newX < this.maxScrollX) {
				newX = this.x + deltaX * config.outOfBoundsSpeedReduction;
			}
			if (newY > 0 || newY < this.maxScrollY) {
				newY = this.y + deltaY * config.outOfBoundsSpeedReduction;
			}

			this.moved = true;
			this.directionX = deltaX > 0 ? -1 : deltaX < 0 ? 1 : 0;
			this.directionY = deltaY > 0 ? -1 : deltaY < 0 ? 1 : 0;

			this.positions.push(timestamp, newX, newY);
			console.log('newy move: ' + newY);
			this.__pos(newX, newY);
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
				newX			= this.x,
				newY			= this.y,
				momentumX,
				momentumY,
				scrollDurationX	= 0,
				scrollDurationY	= 0,
				snap,
				lastScale;

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

				newX = this.originX - this.originX * lastScale + this.startX;
				newY = this.originY - this.originY * lastScale + this.startY;

				if (newX > 0) {
					newX = 0;
				} else if (newX < this.maxScrollX) {
					newX = this.maxScrollX;
				}

				if (newY > 0) {
					newY = 0;
				} else if (newY < this.maxScrollY) {
					newY = this.maxScrollY;
				}

				if (this.x !== newX || this.y !== newY) {
					this.waitReset = true;
					this.scrollTo(newX, newY, 0, 0);
				}

				this.scaled = false;
				return;
			}

			// we scrolled less than the threshhold amount to start scrolling
			if (!this.moved) {
				return;
			}

			if (this.options.momentum) {
				momentumX = this.hasHorizontalScroll ? this.__momentum('h', newX) : {position: newX, duration: 0};
				momentumY = this.hasVerticalScroll ? this.__momentum('v', newY) : {position: newY, duration: 0};
				newX = momentumX.position;
				scrollDurationX = momentumX.duration;
				newY = momentumY.position;
				scrollDurationY = momentumY.duration;
			}

			if (this.options.snap) {
				snap = this.__snap(newX, newY);
				newX = snap.x;
				newY = snap.y;
				this.pageX = snap.pageX;
				this.pageY = snap.pageY;
				scrollDurationX = scrollDurationX || config.snapTime;
				scrollDurationY = scrollDurationY || config.snapTime;
			}
			this.scrollTo(newX, newY, scrollDurationX, scrollDurationY);
		},

		//todo: consider setting a maximum distance for these, in pixels
		//todo: bug, what about when direction is locked and the opposite direction triggers momentum?
		/**
		 * create a new ending position and duration of transition if/when
		 * a flick is detected. requires a previous scrolling of more than 100ms.
		 * 
		 * @param  {string} dir								'h' or 'v' for direction
		 * @param  {number} currentPos						the current position on the axis specified
		 * @return {{position: number, duration: number}}   the final position and time in ms to reach the point
		 */
		__momentum: function (dir, currentPos) {
			var distance,
				velocity,
				duration,
				newPosition,
				i				= this.positions.length - 3,
				lastPosition	= this.positions[this.positions.length - 3];

			while (lastPosition - this.positions[i] < 100) {
				i -= 3;
			}
			if (i < 0) { //total scrolling less than 100ms, don't do momentum
				return {
					position: currentPos,
					duration: 0
				};
			}

			//(final velocity) ^ 2 = initial velocity ^ 2 + 2 * acceleration * distance
			distance = dir === 'h' ? (currentPos - this.positions[i + 1]) : (currentPos - this.positions[i + 2]); //pixel units
			//velocity = distance / time
			velocity = distance / (lastPosition - this.positions[i]); // pixels / ms
			//make sure velocity does not exceed maximum
			velocity = M.abs(velocity) > config.maxMomentumVelocity ?
					velocity < 0 ?
							config.maxMomentumVelocity * -1 :
							config.maxMomentumVelocity :
					velocity;

			//console.log('velocity start: ' + velocity);
			if (M.abs(velocity) < config.minMomentumVelocity) { //if velocity below minimum threshold, no momentum
				return {
					position: currentPos,
					duration: 0
				};
			}
//todo: this needs to handle overshot friction and overshot timing function stuff.
			//caution, unknown: if minMomentum velocity set too low, could this be negative when velocity is very low.? test velocity < 0.1.
			duration = M.log(config.minMomentumVelocity / M.abs(velocity)) / M.log(config.friction);

			//use cubic bezier initial velocity && duration to compute final distance
			distance = (velocity / config.momentumTiming.getDerivativeYForT(0)) * duration;

			newPosition = currentPos + distance;

			console.log('velocity: ' + velocity);

			return {
				position: newPosition,
				duration: duration
			};
		},

		/**
		 * set the css transition time for transforms, call scrollers to do the same.
		 * @param  {number}		duration the transition time duration in ms.
		 * @return {undefined}
		 */
		__transitionTime: function (duration) {
			duration = duration || 0;
			this.scroller.style[transitionDuration] = duration + 'ms';

			if (this.hasHorizontalScroll) {
				this.hScrollbar.indicator.transitionTime(duration);
			}
			if (this.hasVerticalScroll) {
				this.vScrollbar.indicator.transitionTime(duration);
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

			deltaX = this.x + wheelDeltaX * this.options.invertWheelDirection;
			deltaY = this.y + wheelDeltaY * this.options.invertWheelDirection;

			if (deltaX > 0) {
				deltaX = 0;
			} else if (deltaX < this.maxScrollX) {
				deltaX = this.maxScrollX;
			}

			if (deltaY > 0) {
				deltaY = 0;
			} else if (deltaY < this.maxScrollY) {
				deltaY = this.maxScrollY;
			}

			this.scrollTo(deltaX, deltaY, 0);
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
			x = this.originX - this.originX * lastScale + this.startX;
			y = this.originY - this.originY * lastScale + this.startY;

			//this.scroller.style[transform] = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')' + translateZ;

			this.scale = scale;
			this.scrollTo(x, y, 0);
			this.scaled = true;
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
			if (M.abs(x - this.absStartX) < this.options.snapThreshold && M.abs(y - this.absStartY) < this.options.snapThreshold) {
				return current;
			}

			// find new page position
			result = this.getPage(x, y);

			if (!result) {
				return current;
			}

			if (M.abs(result.pageX - this.pageX) === 0) {
				result.pageX += this.directionX;

				if (result.pageX < 0) {
					result.pageX = 0;
				} else if (result.pageX >= result.pageCountX) {
					result.pageX = result.pageCountX - 1;
				}

				result.x = this.pages[result.pageX][result.pageY].x;

				if (result.x < this.maxScrollX) {
					result.x = this.maxScrollX;
				}
			}

			if (M.abs(result.pageY - this.pageY) === 0) {
				result.pageY += this.directionY;

				if (result.pageY < 0) {
					result.pageY = 0;
				} else if (result.pageY >= result.pageCountY) {
					result.pageY = result.pageCountY - 1;
				}

				result.y = this.pages[result.pageX][result.pageY].y;

				if (result.y < this.maxScrollY) {
					result.y = this.maxScrollY;
				}
			}

			return result;
		},

		/* ---- PUBLIC METHODS ---- */

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

		disable: function () {
			this.enabled = false;
		},

		enable: function () {
			this.enabled = true;
		},

		refresh: function () {
			//todo: document these variables
			var x, y,
				cx, cy,
				i,
				l, m, n,
				el;

			//todo: add jslint ignore to this line
			this.wrapper.offsetHeight;	// Force browser recalculate layout (linters hate this)

			this.wrapperWidth	= this.wrapper.clientWidth;
			this.wrapperHeight	= this.wrapper.clientHeight;

			this.scrollerWidth	= M.round(this.scroller.offsetWidth * this.scale);
			this.scrollerHeight	= M.round(this.scroller.offsetHeight * this.scale);

			this.maxScrollX		= M.min(this.wrapperWidth - this.scrollerWidth, 0);
			this.maxScrollY		= M.min(this.wrapperHeight - this.scrollerHeight, 0);

			this.hasHorizontalScroll	= this.options.scrollX && this.maxScrollX < 0;
			this.hasVerticalScroll		= this.options.scrollY && this.maxScrollY < 0;

			if (this.hScrollbar) {
				this.hScrollbar.refresh(this.scrollerWidth, this.maxScrollX, this.x);
			}
			if (this.vScrollbar) {
				this.vScrollbar.refresh(this.scrollerHeight, this.maxScrollY, this.y);
			}

			// this utterly complicated setup is needed to also support snapToElement
			if (this.options.snap === true) {
				this.options.snapStepX = this.options.snapStepX || this.wrapperWidth;
				this.options.snapStepY = this.options.snapStepY || this.wrapperHeight;

				this.pages = [];
				i = 0;
				x = 0;
				cx = M.round(this.options.snapStepX / 2);

				while (x < this.scrollerWidth) {
					this.pages[i] = [];
					l = 0;
					y = 0;
					cy = M.round(this.options.snapStepY / 2);

					while (y < this.scrollerHeight) {
						this.pages[i][l] = {
							x: -x,
							y: -y,
							cx: -cx,
							cy: -cy
						};

						y += this.options.snapStepY;
						cy += this.options.snapStepY;
						l++;
					}

					x += this.options.snapStepX;
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
		resetPosition: function (immediate) {
			var x,
				y,
				time = immediate ? 0 : config.snapTime;

			if (this.x <= 0 && this.x >= this.maxScrollX && this.y <= 0 && this.y >= this.maxScrollY) {
				return false;
			}

			x = this.x;
			y = this.y;

			if (this.x > 0) {
				x = 0;
			} else if (this.x < this.maxScrollX) {
				x = this.maxScrollX;
			}

			if (this.y > 0) {
				y = 0;
			} else if (this.y < this.maxScrollY) {
				y = this.maxScrollY;
			}
			console.log('reset position: ' + x + '  ' + y);
			this.scrollTo(x, y, time, time, config.bounceBackTiming);

			return true;
		},

		scrollBy: function (x, y, duration) {
			x = this.x + x;
			y = this.y + y;

			this.scrollTo(x, y, duration);
		},

		scrollTo: function (x, y, durationX, durationY, timingFunc) {

			if (!durationX && !durationY) {
				this.__transitionTime(0);
				this.__pos(x, y);
				this.resetPosition(false);
			} else {
				this.__animate(x, y, durationX, durationY, timingFunc);
			}
		},

		scrollToElement: function () {
			// TODO
		}
	};

	/* ---- SCROLL BAR INDICATOR ---- */

	/**
	 * The draggable component of the scrollbar.
	 * @constructor
	 * @param {Scrollbar} scrollbar the scrollbar object on which the indicator resides
	 * @param {Object} options   a set of options which can modify the default behaviour.
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
		this.sizeProperty = this.direction === 'v' ? 'height' : 'width';
		this.el.style[transitionTimingFunction] = 'cubic-bezier(0.33,0.66,0.66,1)'; //todo: place in config file
		this.el.style[transform] = translateZ;

		if (this.scrollbar.scroller.options[this.direction + 'ScrollbarClass']) {
			this.el.className = this.scrollbar.scroller.options[this.direction + 'ScrollbarClass'];
		} else {
			this.el.style.cssText = cssVendor + 'box-sizing:border-box;box-sizing:border-box;position:absolute;background:rgba(0,0,0,0.5);border:1px;border-radius:3px';
		}

		this.scrollbar.el.appendChild(this.el);

		this.refresh();
	}

	Indicator.prototype = {
		refresh: function (size, maxScroll, position) {
			this.transitionTime(0);

			this.size = M.max(M.round(this.scrollbar.size * this.scrollbar.size / size), 8);
			this.el.style[this.sizeProperty] = this.size + 'px';
			this.maxPos = this.scrollbar.size - this.size;
			this.sizeRatio = this.maxPos / maxScroll;
			console.log('size ratio: ' + this.sizeRatio);

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
				this.el.style[(this.direction === 'h' ? 'left' : 'top')] = position + 'px';
			}
		},

		transitionTime: function (duration) {
			duration = duration || 0;
			this.el.style[transitionDuration] = duration + 'ms';
		}
	};


	/* ---- SCROLLBAR ---- */

	Scrollbar = function (scroller, dir) {
		var indicator;

		//todo: document variables used such as 'overshot'

		this.el = d.createElement('div');
		this.direction = dir;
		this.scroller = scroller;

		if (this.scroller.options[this.direction + 'ScrollbarWrapperClass']) {
			this.el.className += this.scroller.options.vScrollbarWrapperClass;
		} else {
			this.el.style.cssText = 'position:absolute;z-index:1;width:7px;bottom:2px;top:2px;right:1px';
		}

		this.scroller.wrapper.appendChild(this.el);

		if (this.direction === 'h') {
			this.sizeProperty = 'height';
			this.page = 'pageX';
		} else {
			this.sizeProperty = 'width';
			this.page = 'pageY';
		}

		this.indicator = new Indicator(this);

		this.size = 0;
		this.currentPointer = null;

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
			var x,
				y;

			//filter touch events and begin tracking first pointer
			if (hasPointer) {
				if (e.pointerType === e.MSPOINTER_TYPE_TOUCH ||
							(this.currentPointer !== null && this.currentPointer !== e.pointerId)) {
					return; //only allow touch events through, only allow first pointer captured through
				}

				this.currentPointer = e.pointerId;
				if (e.target.msSetPointerCapture) {
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

			if (this.direction === 'v') {
				this.scroller.scrollBy(0, newPos, 0);
			} else {
				this.scroller.scrollBy(newPos, 0, 0);
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

			if (this.direction === 'h') {
				this.el.style.display = this.scroller.hasHorizontalScroll ? 'block' : 'none';
			} else {
				this.el.style.display = this.scroller.hasVerticalScroll ? 'block' : 'none';
			}

			this.el.offsetHeight;	// force refresh
			this.size = this.direction === 'h' ? this.el.clientWidth : this.el.clientHeight;
			this.indicator.refresh(size, maxScroll, position);
			this.pos(position);
		}
	};

	ScrollAnimation = function (destination, duration, timingFunction, startPct, endPct) {
		if (duration < 0 || startPct < 0 || startPct > 1 || endPct < 0 || endPct > 1) {
			debugger;
		}

		this.startTime = 0;
		this.destination = destination;
		this.duration = duration;
		this.timingFunction = timingFunction;
		this.startPct = startPct ? timingFunction.getTForY(startPct, 0.02) : 0;
		this.endPct = endPct ? timingFunction.getTForY(endPct, 0.02) : 1;
	};

	ScrollAnimation.prototype = {

		getPointForT: function (t) {
			var pct				= (t - this.startTime) / this.duration + this.startPct,
				bezierPoint;

			if (pct >= this.endPct) {
				return this.destination;
			}
			if (isNaN(pct)) {
				debugger;
			}

			bezierPoint	= this.timingFunction.getPointForT(pct);
			console.log('pct: ' + pct);
			console.log('bezier: ' + bezierPoint.y + '  ' + bezierPoint.x);

			return (this.distance * bezierPoint.y + this.startPos);
		},
		begin: function (startPos, startTime) {
			this.startPos = startPos;
			this.startTime = startTime;
			this.distance = this.destination - this.startPos;
		},
		endVelocity: function (startPos) {
			return this.timingFunction.getDerivativeYForT(this.endPct) * ((this.destination - startPos) / this.duration);
		}
	};

	dummyStyle = null;	// free some mem?

}(window, document, Math));


