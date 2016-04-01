(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = require("../utils");

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

createjs.MotionGuidePlugin.install();
createjs.Sound.registerPlugins([createjs.WebAudioPlugin, createjs.HTMLAudioPlugin, createjs.FlashAudioPlugin]);
createjs.Ticker.frameRate = 30;

var points = 17;

var surface_times = ["sand-day", "plowed-day", "grass-day", "snow-day", "sand-night", "plowed-night", "grass-night", "snow-night"];

function getData() {
	return {
		"pressure": [1000, 990, 980, 970, 960, 950, 940, 930, 920, 910, 900, 890, 880, 870, 860, 850, 840],
		"altitude": [0, 80.9705308, 162.852307, 245.694059, 329.485335, 414.246019, 499.996631, 586.758344, 674.4897, 763.115875, 852.640464, 942.952656, 1034.00407, 1125.84507, 1218.44313, 1311.81595, 1405.99922],
		"sand-day": [285, 284.2, 283.4, 282.5, 281.7, 280.9, 280, 279.2, 278.3, 277.4, 276.5, 275.5, 274.8, 274, 273, 272.2, 271.3],
		"plowed-day": [283, 282.2, 281.4, 280.5, 279.7, 278.9, 278, 277.2, 277, 276.8, 276.5, 275.5, 274.8, 274, 273, 272.2, 271.3],
		"grass-day": [281, 280.2, 279.4, 278.6, 277.7, 276.9, 276.8, 277.2, 277, 276.8, 276.5, 275.5, 274.8, 274, 273, 272.2, 271.3],
		"snow-day": [273, 273.2, 273.4, 273.7, 274.6, 275.9, 276.8, 277.2, 277, 276.8, 276.5, 275.5, 274.8, 274, 273, 272.2, 271.3],
		"sand-night": [278.4, 278.5, 278.7, 278.8, 279.5, 280.1, 280, 279.2, 278.3, 277.4, 276.5, 275.2, 274.8, 274, 273, 272.2, 271.3],
		"plowed-night": [278.4, 278.5, 278.7, 278.8, 279.5, 280.1, 280, 279.2, 278.3, 277.4, 276.5, 275.2, 274.8274, 273, 272.2, 271.3],
		"grass-night": [274.4, 274.5, 274.7, 274.9, 275.5, 276.1, 276.8, 277.2, 277, 276.8, 276.5, 275.2, 274.8, 274, 273, 272.2, 271.3],
		"snow-night": [268, 270, 271.8, 273.2, 274.6, 275.9, 276.8, 277.2, 277, 276.8, 276.5, 275.5, 274.8, 274, 273, 272.2, 271.3]
	};
}

function toFahrenheit(kelvin) {
	return (kelvin - 273) * 9 / 5 + 32;
}

var Image = function () {
	function Image(src) {
		_classCallCheck(this, Image);

		this.day = new createjs.Bitmap(src);
		this.day.x = -1000;
		this.day.y = 0;
		this.night = new createjs.Bitmap(src);
		this.night.x = -1000;
		this.night.y = 0;
		this.night.filters = [new createjs.ColorFilter(1, 1, 1, 1, -60, -60, -60)];
		this.night.cache(0, 0, 300, 200);
	}

	_createClass(Image, [{
		key: "show",
		value: function show(time) {
			if (time == "day") this.day.x = 0;else this.night.x = 0;
		}
	}, {
		key: "hide",
		value: function hide() {
			this.day.x = this.night.x = -1000;
		}
	}]);

	return Image;
}();

var Settings = function () {
	function Settings() {
		var _this = this;

		_classCallCheck(this, Settings);

		this.setValue(document.querySelector('input[name="choice"]:checked').value);
		this.listener = null;
		var radios = document.querySelectorAll('input[name="choice"]');
		for (var i = 0; i < radios.length; i++) {
			radios[i].addEventListener("change", function (e) {
				_this.setValue(e.target.value);
				if (_this.listener) _this.listener(_this.surface, _this.time);
			});
		}
	}

	_createClass(Settings, [{
		key: "setValue",
		value: function setValue(value) {
			this.value = value;
			var v = value.split("-");
			this.surface = v[0];
			this.time = v[1];
		}
	}, {
		key: "getValue",
		value: function getValue() {
			return this.value;
		}
	}, {
		key: "getSurface",
		value: function getSurface() {
			return this.surface;
		}
	}, {
		key: "getTime",
		value: function getTime() {
			return this.time;
		}
	}, {
		key: "addListener",
		value: function addListener(listener) {
			this.listener = listener;
		}
	}]);

	return Settings;
}();

var Buttons = function () {
	function Buttons() {
		_classCallCheck(this, Buttons);

		this.plot = document.getElementById("plot");
		this.clear = document.getElementById("clear");
		this.plot.disabled = false;
		this.clear.disabled = false;
	}

	_createClass(Buttons, [{
		key: "addListener",
		value: function addListener(listener) {
			this.plot.addEventListener("click", function (e) {
				return listener(e);
			});
			this.clear.addEventListener("click", function (e) {
				return listener(e);
			});
		}
	}]);

	return Buttons;
}();

var ATGraph = function (_Graph) {
	_inherits(ATGraph, _Graph);

	function ATGraph(stage) {
		_classCallCheck(this, ATGraph);

		return _possibleConstructorReturn(this, Object.getPrototypeOf(ATGraph).call(this, {
			stage: stage,
			w: 200,
			h: 200,
			xlabel: "Temperature(F)",
			ylabel: "Z(km)",
			xscale: "linear",
			yscale: "linear",
			minX: 20,
			maxX: 54,
			minY: 0,
			maxY: 1.5,
			majorX: 4,
			minorX: 1,
			majorY: 0.3,
			minorY: 0.1,
			precisionY: 1
		}));
	}

	_createClass(ATGraph, [{
		key: "render",
		value: function render() {
			_get(Object.getPrototypeOf(ATGraph.prototype), "render", this).call(this);
			this.color = "#EEE";
			this.dotted = false;
			for (var t = 20; t < 54; t += 4) {
				var x = this.xaxis.getLoc(t);
				var y = this.yaxis.getLoc(0);
				this.drawLine(x, y, x, this.yaxis.getLoc(1.5));
			}
		}
	}]);

	return ATGraph;
}(_utils.Graph);

var Rad = function () {
	function Rad(stage, settings, atgraph) {
		var _this3 = this;

		_classCallCheck(this, Rad);

		this.stage = stage;
		this.settings = settings;
		this.atgraph = atgraph;
		this.images = [new Image("assets/desert.jpg"), new Image("assets/plowedfield.jpg"), new Image("assets/grassfield.jpg"), new Image("assets/snow.jpg")];
		this.lastImage = this.images[0];
		this.surfaces = ["sand", "plowed", "grass", "snow"];
		this.colors = { sand: "#8A4117", plowed: "#A52A2A", grass: "#667C26", snow: "#0000FF" };
		this.plotted = {
			"sand-day": [], "sand-night": [], "plowed-day": [], "plowed-night": [],
			"grass-day": [], "grass-night": [], "snow-day": [], "snow-night": []
		};
		surface_times.forEach(function (st) {
			for (var i = 0; i < points; i++) {
				_this3.plotted[st].push(false);
			}
		});

		this.balloon = new createjs.Bitmap("assets/balloon.png");
		this.balloon.x = 150;
		this.balloon.y = 150;
		this.balloon.scaleX = 0.15;
		this.balloon.scaleY = 0.15;
		this.data = getData();
		this.sun = new createjs.Shape().set({ x: 320, y: 20 });
		this.sun.graphics.beginFill("#FFFF00").drawCircle(0, 0, 10);
		this.moon = new createjs.Shape().set({ x: 320, y: 20 });
		this.moon.graphics.beginFill("#FFFFFF").drawCircle(0, 0, 10);
		this.settings.addListener(function (s, t) {
			return _this3.changeSetting(s, t);
		});
		this.balloon.on("pressmove", function (e) {
			e.target.x = 150;
			e.target.y = e.stageY;
		});
	}

	_createClass(Rad, [{
		key: "render",
		value: function render() {
			this.addChildren();
			this.changeSetting(this.settings.getSurface(), this.settings.getTime());
			this.balloon.y = 150;
		}
	}, {
		key: "addChildren",
		value: function addChildren() {
			var _this4 = this;

			this.images.forEach(function (img) {
				_this4.stage.addChild(img.day);
				_this4.stage.addChild(img.night);
			});
			this.stage.addChild(this.balloon);
			this.stage.addChild(this.sun);
			this.stage.addChild(this.moon);
		}
	}, {
		key: "changeSetting",
		value: function changeSetting(surface, time) {
			this.lastImage.hide();
			this.lastImage = this.images[this.surfaces.indexOf(surface)];
			this.lastImage.show(time);
			this.showTime();
			this.atgraph.setColor(this.colors[surface]);
			this.atgraph.setDotted(time == "night");
			this.balloon.y = 150;
		}
	}, {
		key: "showTime",
		value: function showTime() {
			var path = [320, 20, 300, 20, 280, 20];
			if (this.settings.getTime() == "day") {
				this.moon.x = 320;
				createjs.Tween.get(this.sun).to({ guide: { path: path } }, 500).play();
			} else {
				this.sun.x = 320;
				createjs.Tween.get(this.moon).to({ guide: { path: path } }, 500).play();
			}
		}
	}, {
		key: "clear",
		value: function clear() {
			this.stage.removeAllChildren();
			this.render();
		}
	}, {
		key: "plot",
		value: function plot() {
			var _this5 = this;

			var alt = 1500.0 * (150 - (this.balloon.y + 10)) / 150;
			var i = 0;
			while (alt > this.data.altitude[i]) {
				i++;
			}this.plotted[this.settings.getValue()][i] = true;
			this.atgraph.clear();
			this.atgraph.render();
			surface_times.forEach(function (st) {
				var v = st.split("-");
				_this5.atgraph.setColor(_this5.colors[v[0]]);
				_this5.atgraph.setDotted(v[1] == "night");
				var alts = _this5.data.altitude;
				var temps = _this5.data[st];
				for (var _i = 0; _i < points; _i++) {
					if (_this5.plotted[st][_i] === true) {
						_this5.atgraph.plot(toFahrenheit(temps[_i]), alts[_i] / 1000.0);
					}
				}
			});
		}
	}]);

	return Rad;
}();

var RadSim = function () {
	function RadSim() {
		var _this6 = this;

		_classCallCheck(this, RadSim);

		this.mainstage = new createjs.Stage("maincanvas");
		this.atstage = new createjs.Stage("atgraph");
		this.buttons = new Buttons();
		this.settings = new Settings();
		this.atgraph = new ATGraph(this.atstage);
		this.rad = new Rad(this.mainstage, this.settings, this.atgraph);
		this.rad.render();
		this.buttons.addListener(function (e) {
			switch (e.target.id) {
				case "plot":
					_this6.rad.plot();
					break;
				case "clear":
					_this6.atgraph.clear();
					_this6.atgraph.render();
					break;
			}
		});
	}

	_createClass(RadSim, [{
		key: "render",
		value: function render() {
			var _this7 = this;

			this.atgraph.render();
			this.rad.render();
			createjs.Ticker.addEventListener("tick", function (e) {
				_this7.atstage.update();
				_this7.mainstage.update();
			});
		}
	}]);

	return RadSim;
}();

new RadSim().render();

},{"../utils":4}],2:[function(require,module,exports){
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
    value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var marginX = 40,
    marginY = 30;

var Axis = exports.Axis = function () {
    function Axis(spec) {
        _classCallCheck(this, Axis);

        this.stage = spec.stage;
        this.w = spec.dim.w || 100;
        this.h = spec.dim.h || 100;
        this.min = spec.dim.min || 0;
        this.max = spec.dim.max || 100;
        this.font = spec.font || "12px Arial";
        this.color = spec.color || "#000";
        this.label = spec.label || "label";
        this.major = spec.major || 10;
        this.minor = spec.minor || 5;
        this.precision = spec.precision || 0;
        this.vertical = spec.orient && spec.orient == "vertical" || false;
        this.linear = spec.scale && spec.scale == "linear" || false;
        this.originX = marginX;
        this.originY = this.h - marginY;
        this.scale = this.vertical ? this.originY / (this.max - this.min) : (this.w - this.originX) / (this.max - this.min);
    }

    _createClass(Axis, [{
        key: "drawLine",
        value: function drawLine(x1, y1, x2, y2) {
            var line = new createjs.Shape();
            line.graphics.setStrokeStyle(1);
            line.graphics.beginStroke(this.color);
            line.graphics.moveTo(x1, y1);
            line.graphics.lineTo(x2, y2);
            line.graphics.endStroke();
            this.stage.addChild(line);
        }
    }, {
        key: "drawText",
        value: function drawText(text, x, y) {
            text.x = x;
            text.y = y;
            if (this.vertical && text.text == this.label) text.rotation = 270;
            this.stage.addChild(text);
            return text;
        }
    }, {
        key: "getText",
        value: function getText(s) {
            return new createjs.Text(s, this.font, this.color);
        }
    }, {
        key: "render",
        value: function render() {
            var label = this.getText(this.label);
            var label_bnds = label.getBounds();
            if (this.vertical) {
                this.drawLine(this.originX, this.originY, this.originX, 0);
                var y = this.originY - (this.originY - label_bnds.width) / 2;
                this.drawText(label, 4, y);
                for (var val = this.min; val <= this.max; val += this.major) {
                    var v = this.getLoc(val);
                    this.drawLine(this.originX - 3, v, this.originX + 3, v);
                    var text = this.getText(val.toFixed(this.precision));
                    var bnds = text.getBounds();
                    this.drawText(text, this.originX - 5 - bnds.width, v + bnds.height / 2 - 10);
                }
            } else {
                this.drawLine(this.originX, this.originY, this.w, this.originY);
                var x = (this.w - label_bnds.width) / 2;
                this.drawText(label, this.originX + x, this.originY + 15);
                for (var val = this.min; val <= this.max; val += this.major) {
                    var v = this.getLoc(val);
                    this.drawLine(v, this.originY - 3, v, this.originY + 3);
                    var text = this.getText(val.toFixed(this.precision));
                    var bnds = text.getBounds();
                    this.drawText(text, v - bnds.width / 2, this.originY + 4);
                }
            }
        }
    }, {
        key: "getLoc",
        value: function getLoc(val) {
            var ival = this.linear ? Math.round(this.scale * (val - this.min)) : Math.round(Math.log(this.scale * (val - this.min)));
            return this.vertical ? this.originY - ival : this.originX + ival;
        }
    }, {
        key: "getValue",
        value: function getValue(v) {
            var factor = this.vertical ? (this.h - (v - this.originY)) / this.h : (v - this.originX) / this.w;
            return this.min + (this.max - this.min) * factor;
        }
    }, {
        key: "isInside",
        value: function isInside(v) {
            if (this.vertical) return v >= this.originY && v <= this.originY + this.h;else return v >= this.originX && v <= this.originY + this.w;
        }
    }]);

    return Axis;
}();

},{}],3:[function(require,module,exports){
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.Graph = undefined;

var _axis = require("./axis");

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Graph = exports.Graph = function () {
	function Graph(spec) {
		_classCallCheck(this, Graph);

		this.stage = spec.stage;
		this.xaxis = new _axis.Axis({
			stage: this.stage,
			label: spec.xlabel,
			dim: { w: spec.w, h: spec.h, min: spec.minX, max: spec.maxX },
			orient: "horizontal",
			scale: spec.xscale,
			major: spec.majorX,
			minor: spec.minorX,
			precision: spec.precisionX
		});
		this.yaxis = new _axis.Axis({
			stage: this.stage,
			label: spec.ylabel,
			dim: { w: spec.w, h: spec.h, min: spec.minY, max: spec.maxY },
			orient: "vertical",
			scale: spec.yscale,
			major: spec.majorY,
			minor: spec.minorY,
			precision: spec.precisionY
		});
		this.last = null;
		this.marker = null;
		this.color = "#000000";
		this.dotted = false;
	}

	_createClass(Graph, [{
		key: "setDotted",
		value: function setDotted(dotted) {
			this.dotted = dotted;
		}
	}, {
		key: "setColor",
		value: function setColor(color) {
			this.color = color;
			this.endPlot();
			this.marker = new createjs.Shape();
			this.marker.graphics.beginStroke(color).beginFill(color).drawRect(0, 0, 4, 4);
			this.marker.x = -10;
			this.stage.addChild(this.marker);
		}
	}, {
		key: "render",
		value: function render() {
			this.xaxis.render();
			this.yaxis.render();
		}
	}, {
		key: "clear",
		value: function clear() {
			this.stage.removeAllChildren();
			this.endPlot();
		}
	}, {
		key: "moveMarker",
		value: function moveMarker(x, y) {
			if (this.marker) {
				this.marker.x = x - 2;
				this.marker.y = y - 2;
			}
		}
	}, {
		key: "drawLine",
		value: function drawLine(x1, y1, x2, y2) {
			var line = new createjs.Shape();
			if (this.dotted === true) line.graphics.setStrokeDash([1, 4]).setStrokeStyle(1).beginStroke(this.color).moveTo(x1, y1).lineTo(x2, y2).endStroke();else line.graphics.setStrokeStyle(1).beginStroke(this.color).moveTo(x1, y1).lineTo(x2, y2).endStroke();
			this.stage.addChild(line);
		}
	}, {
		key: "plot",
		value: function plot(xv, yv) {
			if (xv >= this.xaxis.min && xv <= this.xaxis.max && yv >= this.yaxis.min && yv <= this.yaxis.max) {
				var x = this.xaxis.getLoc(xv);
				var y = this.yaxis.getLoc(yv);
				if (this.last) {
					this.moveMarker(this.last.x, this.last.y);
					this.drawLine(this.last.x, this.last.y, x, y);
				}
				this.last = new createjs.Point(x, y);
				this.moveMarker(x, y);
			}
		}
	}, {
		key: "endPlot",
		value: function endPlot() {
			this.last = null;
		}
	}]);

	return Graph;
}();

},{"./axis":2}],4:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _graph = require("./graph");

Object.defineProperty(exports, "Graph", {
  enumerable: true,
  get: function get() {
    return _graph.Graph;
  }
});

},{"./graph":3}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiLi5cXC4uXFxwcm9zZW1pcnJvclxccHJvc2VtaXJyb3Itd2lkZ2V0c1xcc3JjXFxzaW1zXFxyYWRzaW1cXG1haW4uanMiLCIuLlxcLi5cXHByb3NlbWlycm9yXFxwcm9zZW1pcnJvci13aWRnZXRzXFxzcmNcXHNpbXNcXHV0aWxzXFxheGlzLmpzIiwiLi5cXC4uXFxwcm9zZW1pcnJvclxccHJvc2VtaXJyb3Itd2lkZ2V0c1xcc3JjXFxzaW1zXFx1dGlsc1xcZ3JhcGguanMiLCIuLlxcLi5cXHByb3NlbWlycm9yXFxwcm9zZW1pcnJvci13aWRnZXRzXFxzcmNcXHNpbXNcXHV0aWxzXFxpbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7O0FDRUEsU0FBUyxpQkFBVCxDQUEyQixPQUEzQjtBQUNBLFNBQVMsS0FBVCxDQUFlLGVBQWYsQ0FBK0IsQ0FBQyxTQUFTLGNBQVQsRUFBeUIsU0FBUyxlQUFULEVBQTBCLFNBQVMsZ0JBQVQsQ0FBbkY7QUFDQSxTQUFTLE1BQVQsQ0FBZ0IsU0FBaEIsR0FBNEIsRUFBNUI7O0FBRUEsSUFBTSxTQUFTLEVBQVQ7O0FBRU4sSUFBTSxnQkFBZ0IsQ0FBQyxVQUFELEVBQVksWUFBWixFQUF5QixXQUF6QixFQUFxQyxVQUFyQyxFQUFnRCxZQUFoRCxFQUE2RCxjQUE3RCxFQUE0RSxhQUE1RSxFQUEwRixZQUExRixDQUFoQjs7QUFFTixTQUFTLE9BQVQsR0FBbUI7QUFDbEIsUUFBTztBQUNOLGNBQVksQ0FBQyxJQUFELEVBQU0sR0FBTixFQUFVLEdBQVYsRUFBYyxHQUFkLEVBQWtCLEdBQWxCLEVBQXNCLEdBQXRCLEVBQTBCLEdBQTFCLEVBQThCLEdBQTlCLEVBQWtDLEdBQWxDLEVBQXNDLEdBQXRDLEVBQTBDLEdBQTFDLEVBQThDLEdB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QVYsRUFBWSxDQUF0QyxFQUF3QyxDQUF4QyxFQUZZO0tBQWhCO0FBSUEsU0FBSyxJQUFMLEdBQVksSUFBSSxTQUFTLEtBQVQsQ0FBZSxDQUFuQixFQUFxQixDQUFyQixDQUFaLENBUDhGO0FBUTlGLFNBQUssVUFBTCxDQUFnQixDQUFoQixFQUFrQixDQUFsQixFQVI4RjtJQUFsRzs7Ozs0QkFZTTtBQUFFLFFBQUssSUFBTCxHQUFZLElBQVosQ0FBRjs7OztRQWxGRDs7Ozs7Ozs7Ozs7Ozs7O2tCQ0RMIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsImltcG9ydCB7R3JhcGh9IGZyb20gXCIuLi91dGlsc1wiXHJcblxyXG5jcmVhdGVqcy5Nb3Rpb25HdWlkZVBsdWdpbi5pbnN0YWxsKClcclxuY3JlYXRlanMuU291bmQucmVnaXN0ZXJQbHVnaW5zKFtjcmVhdGVqcy5XZWJBdWRpb1BsdWdpbiwgY3JlYXRlanMuSFRNTEF1ZGlvUGx1Z2luLCBjcmVhdGVqcy5GbGFzaEF1ZGlvUGx1Z2luXSlcclxuY3JlYXRlanMuVGlja2VyLmZyYW1lUmF0ZSA9IDMwXHJcblxyXG5jb25zdCBwb2ludHMgPSAxN1xyXG5cclxuY29uc3Qgc3VyZmFjZV90aW1lcyA9IFtcInNhbmQtZGF5XCIsXCJwbG93ZWQtZGF5XCIsXCJncmFzcy1kYXlcIixcInNub3ctZGF5XCIsXCJzYW5kLW5pZ2h0XCIsXCJwbG93ZWQtbmlnaHRcIixcImdyYXNzLW5pZ2h0XCIsXCJzbm93LW5pZ2h0XCJdXHJcbiAgICAgICAgICAgICAgICAgICAgICBcclxuZnVuY3Rpb24gZ2V0RGF0YSgpIHtcclxuXHRyZXR1cm4ge1xyXG5cdFx0XCJwcmVzc3VyZVwiOiBbMTAwMCw5OTAsOTgwLDk3MCw5NjAsOTUwLDk0MCw5MzAsOTIwLDkxMCw5MDAsODkwLDg4MCw4NzAsODYwLDg1MCw4NDBdLFxyXG5cdFx0XCJhbHRpdHVkZVwiOiBbMCw4MC45NzA1MzA4LDE2Mi44NTIzMDcsMjQ1LjY5NDA1OSwzMjkuNDg1MzM1LDQxNC4yNDYwMTksNDk5Ljk5NjYzMSw1ODYuNzU4MzQ0LDY3NC40ODk3LDc2My4xMTU4NzUsODUyLjY0MDQ2NCw5NDIuOTUyNjU2LDEwMzQuMDA0MDcsMTEyNS44NDUwNywxMjE4LjQ0MzEzLDEzMTEuODE1OTUsMTQwNS45OTkyMiBdLFxyXG5cdFx0XCJzYW5kLWRheVwiOiBbMjg1LDI4NC4yLDI4My40LDI4Mi41LDI4MS43LDI4MC45LDI4MCwyNzkuMiwyNzguMywyNzcuNCwyNzYuNSwyNzUuNSwyNzQuOCwyNzQsMjczLDI3Mi4yLDI3MS4zXSxcclxuXHRcdFwicGxvd2VkLWRheVwiOiBbMjgzLDI4Mi4yLDI4MS40LDI4MC41LDI3OS43LDI3OC45LDI3OCwyNzcuMiwyNzcsMjc2LjgsMjc2LjUsMjc1LjUsMjc0LjgsMjc0LDI3MywyNzIuMiwyNzEuM10sXHJcblx0XHRcImdyYXNzLWRheVwiOiBbMjgxLDI4MC4yLDI3OS40LDI3OC42LDI3Ny43LDI3Ni45LDI3Ni44LDI3Ny4yLDI3NywyNzYuOCwyNzYuNSwyNzUuNSwyNzQuOCwyNzQsMjczLDI3Mi4yLDI3MS4zXSxcclxuXHRcdFwic25vdy1kYXlcIjogWzI3MywyNzMuMiwyNzMuNCwyNzMuNywyNzQuNiwyNzUuOSwyNzYuOCwyNzcuMiwyNzcsMjc2LjgsMjc2LjUsMjc1LjUsMjc0LjgsMjc0LDI3MywyNzIuMiwyNzEuM10sXHJcblx0XHRcInNhbmQtbmlnaHRcIjogWzI3OC40LDI3OC41LDI3OC43LDI3OC44LDI3OS41LDI4MC4xLDI4MCwyNzkuMiwyNzguMywyNzcuNCwyNzYuNSwyNzUuMiwyNzQuOCwyNzQsMjczLDI3Mi4yLDI3MS4zXSxcclxuXHRcdFwicGxvd2VkLW5pZ2h0XCI6IFsyNzguNCwyNzguNSwyNzguNywyNzguOCwyNzkuNSwyODAuMSwyODAsMjc5LjIsMjc4LjMsMjc3LjQsMjc2LjUsMjc1LjIsMjc0LjgyNzQsMjczLDI3Mi4yLDI3MS4zXSxcclxuXHRcdFwiZ3Jhc3MtbmlnaHRcIjogWzI3NC40LDI3NC41LDI3NC43LDI3NC45LDI3NS41LDI3Ni4xLDI3Ni44LDI3Ny4yLDI3NywyNzYuOCwyNzYuNSwyNzUuMiwyNzQuOCwyNzQsMjczLDI3Mi4yLDI3MS4zXSxcclxuXHRcdFwic25vdy1uaWdodFwiOiBbMjY4LDI3MCwyNzEuOCwyNzMuMiwyNzQuNiwyNzUuOSwyNzYuOCwyNzcuMiwyNzcsMjc2LjgsMjc2LjUsMjc1LjUsMjc0LjgsMjc0LDI3MywyNzIuMiwyNzEuM11cclxuXHR9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHRvRmFocmVuaGVpdChrZWx2aW4pIHtcclxuXHRyZXR1cm4gKGtlbHZpbiAtIDI3MykgKiA5IC8gNSArIDMyO1xyXG59XHJcblxyXG5jbGFzcyBJbWFnZSB7XHJcblx0Y29uc3RydWN0b3Ioc3JjKSB7XHJcblx0XHR0aGlzLmRheSA9IG5ldyBjcmVhdGVqcy5CaXRtYXAoc3JjKVxyXG5cdFx0dGhpcy5kYXkueCA9IC0xMDAwXHJcblx0XHR0aGlzLmRheS55ID0gMFxyXG5cdFx0dGhpcy5uaWdodCA9IG5ldyBjcmVhdGVqcy5CaXRtYXAoc3JjKVxyXG5cdFx0dGhpcy5uaWdodC54ID0gLTEwMDBcclxuXHRcdHRoaXMubmlnaHQueSA9IDBcclxuXHRcdHRoaXMubmlnaHQuZmlsdGVycyA9IFsgbmV3IGNyZWF0ZWpzLkNvbG9yRmlsdGVyKDEsMSwxLDEsIC02MCwtNjAsLTYwKSBdXHJcblx0XHR0aGlzLm5pZ2h0LmNhY2hlKDAsMCwzMDAsMjAwKVxyXG5cdH1cclxuXHRcclxuXHRzaG93KHRpbWUpIHtcclxuXHRcdGlmICh0aW1lID09IFwiZGF5XCIpXHJcblx0XHRcdHRoaXMuZGF5LnggPSAwIFxyXG5cdFx0ZWxzZVxyXG5cdFx0XHR0aGlzLm5pZ2h0LnggPSAwXHJcblx0fVxyXG5cdFxyXG5cdGhpZGUoKSB7IFxyXG5cdFx0dGhpcy5kYXkueCA9IHRoaXMubmlnaHQueCA9IC0xMDAwXHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBTZXR0aW5ncyB7XHJcblx0Y29uc3RydWN0b3IoKSB7XHJcblx0XHR0aGlzLnNldFZhbHVlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0W25hbWU9XCJjaG9pY2VcIl06Y2hlY2tlZCcpLnZhbHVlKVxyXG5cdFx0dGhpcy5saXN0ZW5lciA9IG51bGxcclxuXHRcdGxldCByYWRpb3MgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdpbnB1dFtuYW1lPVwiY2hvaWNlXCJdJylcclxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFkaW9zLmxlbmd0aDsgaSsrKSB7XHJcblx0XHRcdHJhZGlvc1tpXS5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGUgPT4ge1xyXG5cdFx0XHRcdHRoaXMuc2V0VmFsdWUoZS50YXJnZXQudmFsdWUpXHJcblx0XHRcdFx0aWYgKHRoaXMubGlzdGVuZXIpIHRoaXMubGlzdGVuZXIodGhpcy5zdXJmYWNlLHRoaXMudGltZSlcclxuXHRcdFx0fSlcclxuXHRcdH1cclxuXHR9XHJcblx0XHJcblx0c2V0VmFsdWUodmFsdWUpIHtcclxuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZVxyXG5cdFx0bGV0IHYgPSB2YWx1ZS5zcGxpdChcIi1cIilcclxuXHRcdHRoaXMuc3VyZmFjZSA9IHZbMF1cclxuXHRcdHRoaXMudGltZSA9IHZbMV1cclxuXHR9XHJcblx0XHJcblx0Z2V0VmFsdWUoKSB7IHJldHVybiB0aGlzLnZhbHVlIH1cclxuXHRcclxuXHRnZXRTdXJmYWNlKCkgeyByZXR1cm4gdGhpcy5zdXJmYWNlIH1cclxuXHJcblx0Z2V0VGltZSgpIHsgcmV0dXJuIHRoaXMudGltZSB9XHJcblxyXG5cdGFkZExpc3RlbmVyKGxpc3RlbmVyKSB7IHRoaXMubGlzdGVuZXIgPSBsaXN0ZW5lciB9XHJcbn1cclxuXHJcbmNsYXNzIEJ1dHRvbnMge1xyXG5cdGNvbnN0cnVjdG9yKCkge1xyXG5cdFx0dGhpcy5wbG90ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJwbG90XCIpXHJcblx0XHR0aGlzLmNsZWFyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJjbGVhclwiKVxyXG5cdFx0dGhpcy5wbG90LmRpc2FibGVkID0gZmFsc2VcclxuXHRcdHRoaXMuY2xlYXIuZGlzYWJsZWQgPSBmYWxzZVxyXG5cdH1cclxuXHRcclxuXHRhZGRMaXN0ZW5lcihsaXN0ZW5lcikgeyBcclxuXHRcdHRoaXMucGxvdC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZSA9PiBsaXN0ZW5lcihlKSlcclxuXHRcdHRoaXMuY2xlYXIuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4gbGlzdGVuZXIoZSkpXHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBBVEdyYXBoIGV4dGVuZHMgR3JhcGgge1xyXG5cdGNvbnN0cnVjdG9yKHN0YWdlKSB7XHJcblx0XHRzdXBlcih7XHJcblx0XHRcdHN0YWdlOiBzdGFnZSxcclxuXHRcdFx0dzogMjAwLFxyXG5cdFx0XHRoOiAyMDAsXHJcblx0XHRcdHhsYWJlbDogXCJUZW1wZXJhdHVyZShGKVwiLFxyXG5cdFx0XHR5bGFiZWw6IFwiWihrbSlcIixcclxuXHRcdFx0eHNjYWxlOiBcImxpbmVhclwiLFxyXG5cdFx0XHR5c2NhbGU6IFwibGluZWFyXCIsXHJcblx0XHRcdG1pblg6IDIwLFxyXG5cdFx0XHRtYXhYOiA1NCxcclxuXHRcdFx0bWluWTogMCxcclxuXHRcdFx0bWF4WTogMS41LFxyXG5cdFx0XHRtYWpvclg6IDQsXHJcblx0XHRcdG1pbm9yWDogMSxcclxuXHRcdFx0bWFqb3JZOiAwLjMsXHJcblx0XHRcdG1pbm9yWTogMC4xLFxyXG5cdFx0XHRwcmVjaXNpb25ZIDogMVxyXG5cdFx0fSlcclxuXHR9XHJcblx0XHJcblx0cmVuZGVyKCkge1xyXG5cdFx0c3VwZXIucmVuZGVyKClcclxuXHRcdHRoaXMuY29sb3IgPSBcIiNFRUVcIlxyXG5cdFx0dGhpcy5kb3R0ZWQgPSBmYWxzZVxyXG5cdFx0Zm9yIChsZXQgdCA9IDIwOyB0IDwgNTQ7IHQgKz0gNCkge1xyXG4gICAgICAgICAgICBsZXQgeCA9IHRoaXMueGF4aXMuZ2V0TG9jKHQpXHJcbiAgICAgICAgICAgIGxldCB5ID0gdGhpcy55YXhpcy5nZXRMb2MoMClcclxuXHRcdFx0dGhpcy5kcmF3TGluZSh4LHkseCx0aGlzLnlheGlzLmdldExvYygxLjUpKVxyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgUmFkIHtcclxuXHRjb25zdHJ1Y3RvcihzdGFnZSwgc2V0dGluZ3MsIGF0Z3JhcGgpIHtcclxuXHRcdHRoaXMuc3RhZ2UgPSBzdGFnZVxyXG5cdFx0dGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzXHJcblx0XHR0aGlzLmF0Z3JhcGggPSBhdGdyYXBoXHJcblx0XHR0aGlzLmltYWdlcyA9IFtcclxuXHRcdCAgICBuZXcgSW1hZ2UoXCJhc3NldHMvZGVzZXJ0LmpwZ1wiKSxcclxuXHRcdCAgICBuZXcgSW1hZ2UoXCJhc3NldHMvcGxvd2VkZmllbGQuanBnXCIpLFxyXG5cdFx0ICAgIG5ldyBJbWFnZShcImFzc2V0cy9ncmFzc2ZpZWxkLmpwZ1wiKSxcclxuXHRcdCAgICBuZXcgSW1hZ2UoXCJhc3NldHMvc25vdy5qcGdcIilcclxuXHRcdF1cclxuXHRcdHRoaXMubGFzdEltYWdlID0gdGhpcy5pbWFnZXNbMF1cclxuXHRcdHRoaXMuc3VyZmFjZXMgPSBbXCJzYW5kXCIsXCJwbG93ZWRcIixcImdyYXNzXCIsXCJzbm93XCJdXHJcblx0XHR0aGlzLmNvbG9ycyA9IHtzYW5kOlwiIzhBNDExN1wiLHBsb3dlZDogXCIjQTUyQTJBXCIsIGdyYXNzOiBcIiM2NjdDMjZcIiwgc25vdzogXCIjMDAwMEZGXCJ9XHJcblx0XHR0aGlzLnBsb3R0ZWQgPSB7XHJcblx0XHRcdFwic2FuZC1kYXlcIjpbXSxcInNhbmQtbmlnaHRcIjpbXSxcInBsb3dlZC1kYXlcIjogW10sIFwicGxvd2VkLW5pZ2h0XCI6W10sXHJcblx0XHRcdFwiZ3Jhc3MtZGF5XCI6W10sXCJncmFzcy1uaWdodFwiOltdLFwic25vdy1kYXlcIjogW10sIFwic25vdy1uaWdodFwiOltdXHJcblx0XHR9XHJcblx0XHRzdXJmYWNlX3RpbWVzLmZvckVhY2goc3QgPT4geyBmb3IgKGxldCBpID0gMDsgaSA8IHBvaW50czsgaSsrKSB0aGlzLnBsb3R0ZWRbc3RdLnB1c2goZmFsc2UpIH0pXHJcblxyXG5cdFx0dGhpcy5iYWxsb29uID0gbmV3IGNyZWF0ZWpzLkJpdG1hcChcImFzc2V0cy9iYWxsb29uLnBuZ1wiKVxyXG5cdFx0dGhpcy5iYWxsb29uLnggPSAxNTBcclxuXHRcdHRoaXMuYmFsbG9vbi55ID0gMTUwXHJcblx0XHR0aGlzLmJhbGxvb24uc2NhbGVYID0gMC4xNVxyXG5cdFx0dGhpcy5iYWxsb29uLnNjYWxlWSA9IDAuMTVcclxuXHRcdHRoaXMuZGF0YSA9IGdldERhdGEoKVxyXG5cdFx0dGhpcy5zdW4gPSBuZXcgY3JlYXRlanMuU2hhcGUoKS5zZXQoe3g6MzIwLHk6MjB9KVxyXG5cdFx0dGhpcy5zdW4uZ3JhcGhpY3MuYmVnaW5GaWxsKFwiI0ZGRkYwMFwiKS5kcmF3Q2lyY2xlKDAsMCwxMClcclxuXHRcdHRoaXMubW9vbiA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpLnNldCh7eDozMjAseToyMH0pXHJcblx0XHR0aGlzLm1vb24uZ3JhcGhpY3MuYmVnaW5GaWxsKFwiI0ZGRkZGRlwiKS5kcmF3Q2lyY2xlKDAsMCwxMClcclxuXHRcdHRoaXMuc2V0dGluZ3MuYWRkTGlzdGVuZXIoKHMsdCkgPT4gdGhpcy5jaGFuZ2VTZXR0aW5nKHMsdCkpXHJcblx0XHR0aGlzLmJhbGxvb24ub24oXCJwcmVzc21vdmVcIiwgZSA9PiB7XHJcblx0XHQgICAgZS50YXJnZXQueCA9IDE1MFxyXG5cdFx0ICAgIGUudGFyZ2V0LnkgPSBlLnN0YWdlWVxyXG5cdFx0fSlcclxuXHR9XHJcblx0XHJcblx0cmVuZGVyKCkge1xyXG5cdFx0dGhpcy5hZGRDaGlsZHJlbigpXHJcblx0XHR0aGlzLmNoYW5nZVNldHRpbmcodGhpcy5zZXR0aW5ncy5nZXRTdXJmYWNlKCksdGhpcy5zZXR0aW5ncy5nZXRUaW1lKCkpXHJcblx0XHR0aGlzLmJhbGxvb24ueSA9IDE1MFxyXG5cdH1cclxuXHRcclxuXHRhZGRDaGlsZHJlbigpIHtcclxuXHRcdHRoaXMuaW1hZ2VzLmZvckVhY2goaW1nID0+IHtcclxuXHRcdFx0dGhpcy5zdGFnZS5hZGRDaGlsZChpbWcuZGF5KVxyXG5cdFx0XHR0aGlzLnN0YWdlLmFkZENoaWxkKGltZy5uaWdodClcclxuXHRcdH0pXHJcblx0XHR0aGlzLnN0YWdlLmFkZENoaWxkKHRoaXMuYmFsbG9vbilcclxuXHRcdHRoaXMuc3RhZ2UuYWRkQ2hpbGQodGhpcy5zdW4pXHJcblx0XHR0aGlzLnN0YWdlLmFkZENoaWxkKHRoaXMubW9vbilcclxuXHR9XHJcblx0XHJcblx0Y2hhbmdlU2V0dGluZyhzdXJmYWNlLHRpbWUpIHtcclxuXHRcdHRoaXMubGFzdEltYWdlLmhpZGUoKVxyXG5cdFx0dGhpcy5sYXN0SW1hZ2UgPSB0aGlzLmltYWdlc1t0aGlzLnN1cmZhY2VzLmluZGV4T2Yoc3VyZmFjZSldXHRcdCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcblx0XHR0aGlzLmxhc3RJbWFnZS5zaG93KHRpbWUpXHJcblx0XHR0aGlzLnNob3dUaW1lKClcclxuXHRcdHRoaXMuYXRncmFwaC5zZXRDb2xvcih0aGlzLmNvbG9yc1tzdXJmYWNlXSlcclxuXHRcdHRoaXMuYXRncmFwaC5zZXREb3R0ZWQodGltZSA9PSBcIm5pZ2h0XCIpXHJcblx0XHR0aGlzLmJhbGxvb24ueSA9IDE1MFxyXG5cdH1cclxuXHRcclxuXHRzaG93VGltZSgpIHtcclxuXHRcdGxldCBwYXRoID0gWzMyMCwyMCwgMzAwLDIwLCAyODAsMjBdXHJcblx0XHRpZiAodGhpcy5zZXR0aW5ncy5nZXRUaW1lKCkgPT0gXCJkYXlcIikge1xyXG5cdFx0XHR0aGlzLm1vb24ueCA9IDMyMFxyXG5cdFx0XHRjcmVhdGVqcy5Ud2Vlbi5nZXQodGhpcy5zdW4pLnRvKHtndWlkZTp7cGF0aDpwYXRofX0sNTAwKS5wbGF5KClcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMuc3VuLnggPSAzMjBcclxuXHRcdFx0Y3JlYXRlanMuVHdlZW4uZ2V0KHRoaXMubW9vbikudG8oe2d1aWRlOntwYXRoOnBhdGh9fSw1MDApLnBsYXkoKVxyXG5cdFx0fVxyXG5cdH1cclxuXHJcblx0Y2xlYXIoKSB7XHJcblx0XHR0aGlzLnN0YWdlLnJlbW92ZUFsbENoaWxkcmVuKClcclxuXHRcdHRoaXMucmVuZGVyKClcclxuXHR9XHJcblx0XHJcblx0cGxvdCgpIHtcclxuXHRcdGxldCBhbHQgPSAxNTAwLjAgKiAoMTUwLSh0aGlzLmJhbGxvb24ueSsxMCkpLzE1MFxyXG5cdFx0bGV0IGkgPSAwXHJcblx0XHR3aGlsZShhbHQgPiB0aGlzLmRhdGEuYWx0aXR1ZGVbaV0pIGkrK1xyXG5cdFx0dGhpcy5wbG90dGVkW3RoaXMuc2V0dGluZ3MuZ2V0VmFsdWUoKV1baV0gPSB0cnVlXHJcblx0XHR0aGlzLmF0Z3JhcGguY2xlYXIoKVxyXG5cdFx0dGhpcy5hdGdyYXBoLnJlbmRlcigpXHJcblx0XHRzdXJmYWNlX3RpbWVzLmZvckVhY2goc3QgPT4ge1xyXG5cdFx0XHRsZXQgdiA9IHN0LnNwbGl0KFwiLVwiKVxyXG5cdFx0XHR0aGlzLmF0Z3JhcGguc2V0Q29sb3IodGhpcy5jb2xvcnNbdlswXV0pXHJcblx0XHRcdHRoaXMuYXRncmFwaC5zZXREb3R0ZWQodlsxXSA9PSBcIm5pZ2h0XCIpXHJcblx0XHRcdGxldCBhbHRzID0gdGhpcy5kYXRhLmFsdGl0dWRlXHJcblx0XHRcdGxldCB0ZW1wcyA9IHRoaXMuZGF0YVtzdF1cclxuXHRcdFx0Zm9yKGxldCBpID0gMDsgaSA8IHBvaW50czsgaSsrKSB7XHJcblx0XHRcdFx0aWYgKHRoaXMucGxvdHRlZFtzdF1baV0gPT09IHRydWUpIHtcclxuXHRcdFx0XHRcdHRoaXMuYXRncmFwaC5wbG90KHRvRmFocmVuaGVpdCh0ZW1wc1tpXSksYWx0c1tpXS8xMDAwLjApXHJcblx0XHRcdFx0fVxyXG5cdFx0XHR9XHJcblx0XHR9KVxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgUmFkU2ltIHtcclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMubWFpbnN0YWdlID0gbmV3IGNyZWF0ZWpzLlN0YWdlKFwibWFpbmNhbnZhc1wiKVxyXG5cdFx0dGhpcy5hdHN0YWdlID0gbmV3IGNyZWF0ZWpzLlN0YWdlKFwiYXRncmFwaFwiKVxyXG5cdFx0dGhpcy5idXR0b25zID0gbmV3IEJ1dHRvbnMoKVxyXG5cdFx0dGhpcy5zZXR0aW5ncyA9IG5ldyBTZXR0aW5ncygpXHJcblx0XHR0aGlzLmF0Z3JhcGggPSBuZXcgQVRHcmFwaCh0aGlzLmF0c3RhZ2UpXHJcblx0XHR0aGlzLnJhZCA9IG5ldyBSYWQodGhpcy5tYWluc3RhZ2UsIHRoaXMuc2V0dGluZ3MsIHRoaXMuYXRncmFwaClcclxuXHRcdHRoaXMucmFkLnJlbmRlcigpXHJcblx0XHR0aGlzLmJ1dHRvbnMuYWRkTGlzdGVuZXIoZSA9PiB7XHJcblx0XHRcdHN3aXRjaChlLnRhcmdldC5pZCkge1xyXG5cdFx0XHRjYXNlIFwicGxvdFwiOlxyXG5cdFx0XHRcdHRoaXMucmFkLnBsb3QoKVxyXG5cdFx0XHRcdGJyZWFrXHJcblx0XHRcdGNhc2UgXCJjbGVhclwiOlxyXG5cdFx0XHRcdHRoaXMuYXRncmFwaC5jbGVhcigpXHJcblx0XHRcdFx0dGhpcy5hdGdyYXBoLnJlbmRlcigpXHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH0pXHJcblx0fVxyXG5cdFx0XHJcblx0cmVuZGVyKCkge1xyXG5cdFx0dGhpcy5hdGdyYXBoLnJlbmRlcigpXHJcblx0XHR0aGlzLnJhZC5yZW5kZXIoKVxyXG5cdFx0Y3JlYXRlanMuVGlja2VyLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWNrXCIsIGUgPT4ge1xyXG5cdFx0XHR0aGlzLmF0c3RhZ2UudXBkYXRlKClcclxuXHRcdFx0dGhpcy5tYWluc3RhZ2UudXBkYXRlKClcclxuXHRcdH0pXHJcblx0fVxyXG59XHJcblxyXG4obmV3IFJhZFNpbSgpKS5yZW5kZXIoKVxyXG4iLCJjb25zdCBtYXJnaW5YID0gNDAsIG1hcmdpblkgPSAzMFxyXG5cclxuZXhwb3J0IGNsYXNzIEF4aXMge1xyXG5cdGNvbnN0cnVjdG9yKHNwZWMpIHtcclxuXHRcdHRoaXMuc3RhZ2UgPSBzcGVjLnN0YWdlXHJcblx0XHR0aGlzLncgPSBzcGVjLmRpbS53IHx8IDEwMFxyXG5cdFx0dGhpcy5oID0gc3BlYy5kaW0uaCB8fCAxMDBcclxuXHRcdHRoaXMubWluID0gc3BlYy5kaW0ubWluIHx8IDBcclxuXHRcdHRoaXMubWF4ID0gc3BlYy5kaW0ubWF4IHx8IDEwMFxyXG5cdFx0dGhpcy5mb250ID0gc3BlYy5mb250IHx8IFwiMTJweCBBcmlhbFwiXHJcblx0XHR0aGlzLmNvbG9yID0gc3BlYy5jb2xvciB8fCBcIiMwMDBcIlxyXG5cdFx0dGhpcy5sYWJlbCA9IHNwZWMubGFiZWwgfHwgXCJsYWJlbFwiXHJcblx0XHR0aGlzLm1ham9yID0gc3BlYy5tYWpvciB8fCAxMFxyXG5cdFx0dGhpcy5taW5vciA9IHNwZWMubWlub3IgfHwgNVxyXG5cdFx0dGhpcy5wcmVjaXNpb24gPSBzcGVjLnByZWNpc2lvbiB8fCAwXHJcblx0XHR0aGlzLnZlcnRpY2FsID0gc3BlYy5vcmllbnQgJiYgc3BlYy5vcmllbnQgPT0gXCJ2ZXJ0aWNhbFwiIHx8IGZhbHNlXHJcblx0XHR0aGlzLmxpbmVhciA9IHNwZWMuc2NhbGUgJiYgc3BlYy5zY2FsZSA9PSBcImxpbmVhclwiIHx8IGZhbHNlIFxyXG5cdFx0dGhpcy5vcmlnaW5YID0gbWFyZ2luWFxyXG5cdFx0dGhpcy5vcmlnaW5ZID0gdGhpcy5oLW1hcmdpbllcclxuXHRcdHRoaXMuc2NhbGUgPSB0aGlzLnZlcnRpY2FsID8gdGhpcy5vcmlnaW5ZLyh0aGlzLm1heCAtIHRoaXMubWluKTogKHRoaXMudy10aGlzLm9yaWdpblgpLyh0aGlzLm1heCAtIHRoaXMubWluKVxyXG5cdH1cclxuXHJcblx0ZHJhd0xpbmUoeDEseTEseDIseTIpIHtcclxuXHRcdGxldCBsaW5lID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuXHRcdGxpbmUuZ3JhcGhpY3Muc2V0U3Ryb2tlU3R5bGUoMSlcclxuXHRcdGxpbmUuZ3JhcGhpY3MuYmVnaW5TdHJva2UodGhpcy5jb2xvcilcclxuXHRcdGxpbmUuZ3JhcGhpY3MubW92ZVRvKHgxLCB5MSlcclxuXHRcdGxpbmUuZ3JhcGhpY3MubGluZVRvKHgyLCB5MilcclxuXHRcdGxpbmUuZ3JhcGhpY3MuZW5kU3Ryb2tlKCk7XHJcblx0XHR0aGlzLnN0YWdlLmFkZENoaWxkKGxpbmUpXHJcblx0fVxyXG5cdFxyXG5cdGRyYXdUZXh0KHRleHQseCx5KSB7XHJcblx0XHR0ZXh0LnggPSB4XHJcblx0XHR0ZXh0LnkgPSB5XHJcblx0XHRpZiAodGhpcy52ZXJ0aWNhbCAmJiB0ZXh0LnRleHQgPT0gdGhpcy5sYWJlbCkgdGV4dC5yb3RhdGlvbiA9IDI3MFxyXG5cdFx0dGhpcy5zdGFnZS5hZGRDaGlsZCh0ZXh0KVxyXG5cdFx0cmV0dXJuIHRleHRcclxuXHR9XHJcblxyXG5cdGdldFRleHQocykgeyByZXR1cm4gbmV3IGNyZWF0ZWpzLlRleHQocyx0aGlzLmZvbnQsdGhpcy5jb2xvcikgfVxyXG5cclxuICAgIHJlbmRlcigpIHtcclxuICAgIFx0bGV0IGxhYmVsID0gdGhpcy5nZXRUZXh0KHRoaXMubGFiZWwpXHJcbiAgICBcdGxldCBsYWJlbF9ibmRzID0gbGFiZWwuZ2V0Qm91bmRzKClcclxuICAgICAgICBpZiAodGhpcy52ZXJ0aWNhbCkge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMaW5lKHRoaXMub3JpZ2luWCx0aGlzLm9yaWdpblksdGhpcy5vcmlnaW5YLDApICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldCB5ID0gdGhpcy5vcmlnaW5ZIC0gKHRoaXMub3JpZ2luWSAtIGxhYmVsX2JuZHMud2lkdGgpLzJcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChsYWJlbCwgNCwgeSlcclxuICAgICAgICAgICAgZm9yIChsZXQgdmFsID0gdGhpcy5taW47IHZhbCA8PSB0aGlzLm1heDsgdmFsICs9IHRoaXMubWFqb3IpIHtcclxuICAgICAgICAgICAgICAgIGxldCB2ID0gdGhpcy5nZXRMb2ModmFsKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3TGluZSh0aGlzLm9yaWdpblgtMyx2LHRoaXMub3JpZ2luWCszLHYpICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbGV0IHRleHQgPSB0aGlzLmdldFRleHQodmFsLnRvRml4ZWQodGhpcy5wcmVjaXNpb24pKVxyXG4gICAgICAgICAgICAgICAgbGV0IGJuZHMgPSB0ZXh0LmdldEJvdW5kcygpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHQsdGhpcy5vcmlnaW5YLTUtYm5kcy53aWR0aCx2K2JuZHMuaGVpZ2h0LzItMTApXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLmRyYXdMaW5lKHRoaXMub3JpZ2luWCx0aGlzLm9yaWdpblksIHRoaXMudyx0aGlzLm9yaWdpblkpICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGxldCB4ID0gKHRoaXMudyAtIGxhYmVsX2JuZHMud2lkdGgpLzJcclxuICAgICAgICAgICAgdGhpcy5kcmF3VGV4dChsYWJlbCwgdGhpcy5vcmlnaW5YICsgeCwgdGhpcy5vcmlnaW5ZICsgMTUpXHJcbiAgICAgICAgICAgIGZvciAobGV0IHZhbCA9IHRoaXMubWluOyB2YWwgPD0gdGhpcy5tYXg7IHZhbCArPSB0aGlzLm1ham9yKSAge1xyXG4gICAgICAgICAgICAgICAgbGV0IHYgPSB0aGlzLmdldExvYyh2YWwpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMaW5lKHYsdGhpcy5vcmlnaW5ZLTMsdix0aGlzLm9yaWdpblkrMykgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbGV0IHRleHQgPSB0aGlzLmdldFRleHQodmFsLnRvRml4ZWQodGhpcy5wcmVjaXNpb24pKVxyXG4gICAgICAgICAgICAgICAgbGV0IGJuZHMgPSB0ZXh0LmdldEJvdW5kcygpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHQsdi1ibmRzLndpZHRoLzIsdGhpcy5vcmlnaW5ZKzQpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0TG9jKHZhbCkge1xyXG4gICAgICAgIGxldCBpdmFsID0gdGhpcy5saW5lYXI/IE1hdGgucm91bmQodGhpcy5zY2FsZSoodmFsLXRoaXMubWluKSk6IE1hdGgucm91bmQoTWF0aC5sb2codGhpcy5zY2FsZSoodmFsLXRoaXMubWluKSkpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMudmVydGljYWw/dGhpcy5vcmlnaW5ZIC0gaXZhbDp0aGlzLm9yaWdpblggKyBpdmFsXHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VmFsdWUodikge1xyXG4gICAgXHRsZXQgZmFjdG9yID0gdGhpcy52ZXJ0aWNhbD8gKHRoaXMuaCAtICh2IC0gdGhpcy5vcmlnaW5ZKSkvdGhpcy5oOih2IC0gdGhpcy5vcmlnaW5YKS90aGlzLndcclxuICAgICAgICByZXR1cm4gdGhpcy5taW4gKyAodGhpcy5tYXggLSB0aGlzLm1pbikgKiBmYWN0b3JcclxuICAgIH1cclxuXHJcbiAgICBpc0luc2lkZSh2KSB7XHJcbiAgICAgICAgaWYgKHRoaXMudmVydGljYWwpXHJcbiAgICAgICAgICAgIHJldHVybiB2ID49IHRoaXMub3JpZ2luWSAmJiB2IDw9ICh0aGlzLm9yaWdpblkgKyB0aGlzLmgpXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICByZXR1cm4gdiA+PSB0aGlzLm9yaWdpblggJiYgdiA8PSAodGhpcy5vcmlnaW5ZICsgdGhpcy53KVxyXG4gICAgfVxyXG59XHJcbiIsImltcG9ydCB7QXhpc30gZnJvbSBcIi4vYXhpc1wiXHJcbmV4cG9ydCBjbGFzcyBHcmFwaCB7XHJcblx0Y29uc3RydWN0b3Ioc3BlYykge1xyXG5cdFx0dGhpcy5zdGFnZSA9IHNwZWMuc3RhZ2VcclxuXHRcdHRoaXMueGF4aXMgPSBuZXcgQXhpcyh7XHJcblx0XHRcdHN0YWdlOiB0aGlzLnN0YWdlLFxyXG5cdFx0XHRsYWJlbDogc3BlYy54bGFiZWwsXHJcblx0XHRcdGRpbTogeyB3OiBzcGVjLncsIGg6IHNwZWMuaCwgbWluOiBzcGVjLm1pblgsIG1heDogc3BlYy5tYXhYIH0sXHJcblx0XHRcdG9yaWVudDogXCJob3Jpem9udGFsXCIsXHJcblx0XHRcdHNjYWxlOiBzcGVjLnhzY2FsZSxcclxuXHRcdFx0bWFqb3I6IHNwZWMubWFqb3JYLFxyXG5cdFx0XHRtaW5vcjogc3BlYy5taW5vclgsXHJcblx0XHRcdHByZWNpc2lvbjogc3BlYy5wcmVjaXNpb25YXHJcblx0XHR9KVxyXG5cdFx0dGhpcy55YXhpcyA9IG5ldyBBeGlzKHtcclxuXHRcdFx0c3RhZ2U6IHRoaXMuc3RhZ2UsXHJcblx0XHRcdGxhYmVsOiBzcGVjLnlsYWJlbCxcclxuXHRcdFx0ZGltOiB7IHc6IHNwZWMudywgaDogc3BlYy5oLCBtaW46IHNwZWMubWluWSwgbWF4OiBzcGVjLm1heFkgfSxcclxuXHRcdFx0b3JpZW50OiBcInZlcnRpY2FsXCIsXHJcblx0XHRcdHNjYWxlOiBzcGVjLnlzY2FsZSxcclxuXHRcdFx0bWFqb3I6IHNwZWMubWFqb3JZLFxyXG5cdFx0XHRtaW5vcjogc3BlYy5taW5vclksXHJcblx0XHRcdHByZWNpc2lvbjogc3BlYy5wcmVjaXNpb25ZXHJcblx0XHR9KVxyXG5cdFx0dGhpcy5sYXN0ID0gbnVsbFxyXG5cdFx0dGhpcy5tYXJrZXIgPSBudWxsXHJcblx0XHR0aGlzLmNvbG9yID0gXCIjMDAwMDAwXCJcclxuXHRcdHRoaXMuZG90dGVkID0gZmFsc2VcclxuXHR9XHJcblx0XHJcblx0c2V0RG90dGVkKGRvdHRlZCkge1xyXG5cdFx0dGhpcy5kb3R0ZWQgPSBkb3R0ZWRcclxuXHR9XHJcblx0XHJcblx0c2V0Q29sb3IoY29sb3IpIHtcclxuXHRcdHRoaXMuY29sb3IgPSBjb2xvclxyXG5cdFx0dGhpcy5lbmRQbG90KClcclxuXHRcdHRoaXMubWFya2VyID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuICAgIFx0dGhpcy5tYXJrZXIuZ3JhcGhpY3MuYmVnaW5TdHJva2UoY29sb3IpLmJlZ2luRmlsbChjb2xvcikuZHJhd1JlY3QoMCwwLDQsNClcclxuICAgIFx0dGhpcy5tYXJrZXIueCA9IC0xMFxyXG4gICAgXHR0aGlzLnN0YWdlLmFkZENoaWxkKHRoaXMubWFya2VyKVxyXG5cdH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICBcdHRoaXMueGF4aXMucmVuZGVyKClcclxuICAgIFx0dGhpcy55YXhpcy5yZW5kZXIoKVxyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyKCkge1xyXG4gICAgXHR0aGlzLnN0YWdlLnJlbW92ZUFsbENoaWxkcmVuKClcclxuICAgIFx0dGhpcy5lbmRQbG90KClcclxuICAgIH1cclxuXHJcbiAgICBtb3ZlTWFya2VyKHgseSkge1xyXG4gICAgXHRpZiAodGhpcy5tYXJrZXIpIHtcclxuICAgIFx0XHR0aGlzLm1hcmtlci54ID0geC0yXHJcbiAgICBcdFx0dGhpcy5tYXJrZXIueSA9IHktMlxyXG5cclxuICAgIFx0fVxyXG4gICAgfVxyXG5cclxuXHRkcmF3TGluZSh4MSx5MSx4Mix5Mikge1xyXG5cdFx0bGV0IGxpbmUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0aWYgKHRoaXMuZG90dGVkID09PSB0cnVlKVxyXG5cdFx0XHRsaW5lLmdyYXBoaWNzLnNldFN0cm9rZURhc2goWzEsNF0pLnNldFN0cm9rZVN0eWxlKDEpLmJlZ2luU3Ryb2tlKHRoaXMuY29sb3IpLm1vdmVUbyh4MSwgeTEpLmxpbmVUbyh4MiwgeTIpLmVuZFN0cm9rZSgpXHJcblx0XHRlbHNlXHJcblx0XHRcdGxpbmUuZ3JhcGhpY3Muc2V0U3Ryb2tlU3R5bGUoMSkuYmVnaW5TdHJva2UodGhpcy5jb2xvcikubW92ZVRvKHgxLCB5MSkubGluZVRvKHgyLCB5MikuZW5kU3Ryb2tlKClcclxuXHRcdHRoaXMuc3RhZ2UuYWRkQ2hpbGQobGluZSlcclxuXHR9XHJcblx0XHJcbiAgICBwbG90KHh2LHl2KSB7XHJcbiAgICAgICAgaWYgKHh2ID49IHRoaXMueGF4aXMubWluICYmIHh2IDw9IHRoaXMueGF4aXMubWF4ICYmIHl2ID49IHRoaXMueWF4aXMubWluICYmIHl2IDw9IHRoaXMueWF4aXMubWF4KSB7ICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsZXQgeCA9IHRoaXMueGF4aXMuZ2V0TG9jKHh2KVxyXG4gICAgICAgICAgICBsZXQgeSA9IHRoaXMueWF4aXMuZ2V0TG9jKHl2KVxyXG4gICAgICAgICAgICBpZiAodGhpcy5sYXN0KSAge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlTWFya2VyKHRoaXMubGFzdC54LHRoaXMubGFzdC55KVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3TGluZSh0aGlzLmxhc3QueCx0aGlzLmxhc3QueSx4LHkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5sYXN0ID0gbmV3IGNyZWF0ZWpzLlBvaW50KHgseSlcclxuICAgICAgICAgICAgdGhpcy5tb3ZlTWFya2VyKHgseSlcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGVuZFBsb3QoKSB7IHRoaXMubGFzdCA9IG51bGwgfVxyXG4gICAgXHJcbn1cclxuIiwiZXhwb3J0IHtHcmFwaH0gZnJvbSBcIi4vZ3JhcGhcIiJdfQ==
