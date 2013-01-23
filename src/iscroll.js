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
	
 */
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
			friction: 0.95, //used in easing animation during a momentum scroll where velocities are supplied
			minVelocityToDecelerate: 0.2
		};

	function addEvent(el, type, fn, capture) {
		el.addEventListener(type, fn, !!capture);
	}

	function removeEvent(el, type, fn, capture) {
		el.removeEventListener(type, fn, !!capture);
	}

	/* ---- SCROLLER ---- */

	function IScroll(el, options) {
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
			overshoot: true,
			//eventPassthrough: false,	TODO: preserve native vertical scroll on horizontal JS scroll (and vice versa)

			HWCompositing: true,		// mostly a debug thing (set to false to skip hardware acceleration)
			useTransition: false,		//You may want to set this to false if requestAnimationFrame exists and is not shim
			useTransform: true,

			scrollbars: true,
			interactiveScrollbars: true,
			//hideScrollbars: true,		TODO: hide scrollbars when not scrolling
			//shrinkScrollbars: false,	TODO: shrink scrollbars when dragging over the limits

			mouseWheel: true,
			invertWheelDirection: false,
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
		if (hasTransform) {
			this.scroller.style[transformOrigin] = '0 0';		// we need the origin to 0 0 for the zoom
		}

		this.x = this.options.startX;
		this.y = this.options.startY;
		this.isRAFing = false;
		this.scale = 1;
		this.pageX = 0;		// current page, needed by snap, ignored otherwise
		this.pageY = 0;
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

		addEvent(this.scroller, eventTransitionEnd, this);
		addEvent(this.wrapper, 'mouseover', this);
		addEvent(this.wrapper, 'mouseout', this);

		if (this.options.mouseWheel) {
			addEvent(this.wrapper, 'DOMMouseScroll', this);
			addEvent(this.wrapper, 'mousewheel', this);
		}
	}

	IScroll.prototype = {
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
			case eventTransitionEnd:
				this.__transitionEnd(e);
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

		__animateVelocity: function (velocityX, velocityY) {
			var self = this,
				lastTime = getTime(),
				now,
				newX,
				newY;

			if (!velocityX && !velocityY) {
				return;
			}

			function step() {
				now = getTime();

				//if velocity is low enough, stop animating on that axis
				if (M.abs(velocityX) > config.minVelocityToDecelerate) {
					velocityX *= config.friction;
				} else {
					velocityX = 0;
				}
				if (M.abs(velocityY) > config.minVelocityToDecelerate) {
					velocityY *= config.friction;
				} else {
					velocityY = 0;
				}

				newX = self.x + velocityX * (now - lastTime);
				newY = self.y + velocityY * (now - lastTime);

				//add mucho resistance if outside boundaries and can overshoot, otherwise hard stop
				if (self.x > 0 || self.x < self.maxScrollX) {
					if (self.options.overshoot) {
						velocityX *= config.friction * config.friction;
					} else {
						newX = self.x > 0 ? 0 : self.maxScrollX;
						velocityX = 0;
					}
				}
				if (self.y > 0 || self.y < self.maxScrollY) {
					if (self.options.overshoot) {
						velocityY *= config.friction * config.friction;
					} else {
						newY = self.y > 0 ? 0 : self.maxScrollX;
					}
				}
				console.log('velocity x ' + velocityX);
				console.log('velocity y' + velocityY + ' y ' + newY);
				self.__pos(newX, newY);

				//if there is no more velocity, we are done animating
				if (velocityX === 0 && velocityY === 0) {
					self.isRAFing = false;
				}

				lastTime = now;

				if (self.isRAFing) {
					rAF(step);
				} else {
					self.resetPosition(false);
				}
			}

			this.isRAFing = true;
			step();
		},

		/**
		 * uses requestAnimationFrame or shim to move scroller to destination.
		 * @param  {number}			destX		the destination on x axis.
		 * @param  {number}			destY		the destination on y axis.
		 * @param  {number}			duration	the duration of the animation.
		 */
		__animate: function (destX, destY, duration) {
			var self = this,
				startX,
				startY,
				distX,
				distY,
				destTime,
				startTime = getTime(),
				now,
				easing,
				step,
				newX,
				newY;

			startX = this.x;
			startY = this.y;
			distX = startX - destX;
			distY = startY - destY;
			destTime = startTime + duration;
			//todo: rAF handlers are sent a timestamp object, but standards have chnaged. Consider using instead of creating another
			step = function () {
				now = getTime();

				if (now >= destTime) {
					self.isRAFing = false;
					self.__pos(destX, destY);
					self.resetPosition(false);
					return;
				}

				now = (now - startTime) / duration - 1;
				easing = M.sqrt(1 - now * now);
				newX = (destX - startX) * easing + startX;
				newY = (destY - startY) * easing + startY;
				self.__pos(newX, newY);

				if (self.isRAFing) {
					rAF(step);
				}
			};
			self.isRAFing = true;
			rAF(step);
		},

		__resize: function () {
			this.refresh();
			this.resetPosition(true);
		},

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

			if (this.hasHorizontalScroll) {
				this.hScrollbar.pos(this.x);
			}
			if (this.hasVerticalScroll) {
				this.vScrollbar.pos(this.y);
			}
		},

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

			this.initiated		= true;
			this.moved			= false;
			this.distX			= 0;
			this.distY			= 0;
			this.directionX		= 0;
			this.directionY		= 0;
			this.directionLocked = 0;

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

			//if we aren't using css transitions, we always know x and y.
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
					this.__pos(x, y);
				}
			}

			this.pointX		= point.pageX;
			this.pointY		= point.pageY;

			// absolute start needed by snap to compute snap threashold
			this.absStartX	= this.x;
			this.absStartY	= this.y;
			this.startTime	= getTime();

			//begin recording positions and timestamps
			this.positions	= [];
			this.positions.push(this.startTime, this.x, this.y);

		},

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
			this.scrollTo(newX, newY, 0);
		},

		__end: function (e) {
			if (!this.enabled || !this.initiated || this.waitReset) {
				return;
			}

			var point		= hasPointer ? e : e.changedTouches[0],
				velocityX,
				velocityY,
				duration	= getTime() - this.startTime,
				newX		= this.x,
				newY		= this.y,
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

			removeEvent(w, touchEventMove, this);
			removeEvent(w, touchEventCancel, this);
			removeEvent(w, touchEventEnd, this);

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
					this.scrollTo(newX, newY);
				}

				this.scaled = false;
				return;
			}

			// we scrolled less than the threshhold amount to start scrolling
			if (!this.moved) {
				return;
			}

			// reset if we are outside of the boundaries
			if (this.resetPosition(false)) {
				return;
			}

			if (this.options.momentum) {
				velocityX = this.hasHorizontalScroll ? this.__momentum('h') : 0;
				velocityY = this.hasVerticalScroll ? this.__momentum('v') : 0;
			}

			if (this.options.snap) {
				snap = this.__snap(newX, newY);
				newX = snap.x;
				newY = snap.y;
				this.pageX = snap.pageX;
				this.pageY = snap.pageY;
			}

			if (newX !== this.x || newY !== this.y || velocityX !== 0 || velocityY !== 0) {
				this.scrollTo(newX, newY, config.snapTime, velocityX, velocityY);
			}
		},

		//todo: consider setting a maximum distance for these, in pixels
		__momentum: function (dir) {
			var distance,
				velocity,
				i				= this.positions.length - 3,
				lastPosition	= this.positions[this.positions.length - 3];

			while (lastPosition - this.positions[i] < 100) {
				i -= 3;
			}
			if (i < 0) { //total scrolling less than 100ms, don't do momentum
				return {destination: dir === 'h' ? this.x : this.y, duration: 0};
			}
			//velocity ^ 2 = initial velocity ^ 2 + 2 * acceleration * distance

			distance = dir === 'h' ? (this.x - this.positions[i + 1]) : (this.y - this.positions[i + 2]); //pixel units
			//velocity = distance / time
			velocity = distance / (lastPosition - this.positions[i]); // pixels / ms

			console.log('velocity ' + velocity);
			if (M.abs(velocity) < config.minVelocityForMomentum) {
				return 0;
			} else {
				return velocity;
			}
		},

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
				velocity;

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

			this.scrollTo(x, y, immediate ? 0 : config.snapTime);

			return true;
		},

		scrollBy: function (x, y, duration) {
			x = this.x + x;
			y = this.y + y;

			this.scrollTo(x, y, duration);
		},

		scrollTo: function (x, y, duration, velocityX, velocityY) {
			if (!duration || this.options.useTransition) {
				this.__transitionTime(duration);
				this.__pos(x, y);
			} else if (velocityX || velocityY) {
				this.__animateVelocity(velocityX, velocityY);
			} else {
				this.__animate(x, y, duration);
			}
		},

		scrollToElement: function () {
			// TODO
		}
	};

	/* ---- SCROLL BAR INDICATOR ---- */

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

			this.pos(position);
		},
		//todo: consider the transition time for this
		pos: function (position) {
			position = M.round(this.sizeRatio * position);
			this.position = position;

			if (position < 0) {
				position = 0;
			} else if (position > this.maxPos) {
				position = this.maxPos;
			}

			if (this.scrollbar.scroller.options.useTransform) {
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
			this.el.style[transitionDuration] = '0.15s';
			this.el.style[this.sizeProperty] = '14px';
			this.el.style.backgroundColor = 'rgba(255,255,255,0.4)';
			//todo: this.indicator.over();
			this.indicator.el.style[transitionDuration] = '0.15s';
			this.indicator.el.style.borderWidth = '7px';
			this.indicator.el.style.backgroundColor = 'green';//todo: remove test code
			this.indicator.el.style.width = '7px';
		},

		out: function () {
			if (this.initiated) {
				return;
			}
			//todo: see over
			this.el.style[transitionDuration] = '0.1s';
			this.el.style[this.sizeProperty] = '7px';
			this.el.style.backgroundColor = 'rgba(255,255,255,0)';
			//todo: this.indicator.out()
			this.indicator.el.style[transitionDuration] = '0.1s';
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

	dummyStyle = null;	// free some mem?

	w.IScroll = IScroll;
}(window, document, Math));