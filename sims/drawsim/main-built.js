(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.4.0 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.3.2',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],2:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],4:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":2,"./encode":3}],5:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":6,"punycode":1,"querystring":4}],6:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],7:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _get = function get(_x, _x2, _x3) { var _again = true; _function: while (_again) { var object = _x, property = _x2, receiver = _x3; _again = false; if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { _x = parent; _x2 = property; _x3 = receiver; _again = true; desc = parent = undefined; continue _function; } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } } };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var _utils = require("../utils");

var _url = require("url");

var store = (0, _utils.getStore)(),
    searchParams = new URLSearchParams(window.location.search.substring(1));

var image = searchParams.get('img');
if (!image) image = prompt("Enter image url:", "");
var edit = searchParams.get('mode') == "edit";
var scale = searchParams.get('scale') || 1.0;
var tool = searchParams.get('tool') || "pressure";
var ex = searchParams.get('ex') || "";
var width = searchParams.get('w') || 20;
var height = searchParams.get('h') || 20;
var opt = searchParams.get('opt') || "all";

var linetypes = {
	dry: { w: 1, c: "#000" },
	highT: { w: 1, c: "#F00" },
	highTd: { w: 1, c: "#0F0" },
	jet850: { w: 5, c: "#F00" },
	jet300: { w: 5, c: "#800080" }
};

var linetype = "dry";
var linetypeButton = null;

createjs.MotionGuidePlugin.install();

//Lines with symbols for a dry line, moisture axis, thermal ridge, low level jet and upper level jet

function dist(p1, p2) {
	var dx = p1.x - p2.x,
	    dy = p1.y - p2.y;
	return Math.sqrt(dx * dx + dy * dy);
}

function angle(p1, p2) {
	return Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;
}

function componentToHex(c) {
	var hex = c.toString(16);
	return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
	return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function getMid(start, end) {
	var mid = Math.abs((end - start) / 2);
	return start < end ? start + mid : end + mid;
}

var descIsOpen = false;

function getDesc(pt, json, cb) {
	descIsOpen = true;
	var editor = document.getElementById("editor");
	editor.style.left = pt.x + "px";
	editor.style.top = pt.y + "px";
	editor.style.visibility = "visible";
	document.getElementById("desc_editor").value = json.desc;
	document.getElementById("save").addEventListener('click', function () {
		descIsOpen = false;
		json.desc = document.getElementById("desc_editor").value;
		editor.style.visibility = "hidden";
		cb();
	});
}

function getSymbols() {
	var symbols = store.get(image + ex);
	if (!symbols) {
		symbols = [];
		store.set(image + ex, symbols);
	}
	return symbols;
}

function addSymbol(symbol) {
	var symbols = getSymbols();
	store.set(image + ex, symbols.concat(symbol));
}

function removeSymbol(symbol) {
	var symbols = getSymbols();
	for (var i = 0; i < symbols.length; i++) {
		var json = symbols[i];
		switch (json.type) {
			case "vector":
				if (Vector.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "region":
				if (PressureRegion.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "airmass":
				if (Airmass.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "isopleth":
				if (IsoPleth.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "line":
				if (Line.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "ellipse":
				if (Ellipse.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
			case "field":
				if (Field.isSame(symbol, symbols[i])) {
					symbols.splice(i, 1);
					store.set(image + ex, symbols);
					return;
				}
				break;
		}
	}
}

function deleteSymbols() {
	store.set(image + ex, []);
}

var Vector = (function (_createjs$Container) {
	_inherits(Vector, _createjs$Container);

	_createClass(Vector, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var map = new createjs.Bitmap(json.img);
			map.x = json.pt.x;
			map.y = json.pt.y;
			map.regX = 12;
			map.regY = 12;
			map.rotation = json.rot;
			map.cursor = "not-allowed";
			map.addEventListener("click", function (e) {
				removeSymbol(json);
				map.stage.removeChild(map);
			});
			stage.addChild(map);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.img != json2.img) return false;
			if (json1.pt.x != json2.pt.x) return false;
			if (json1.pt.y != json2.pt.y) return false;
			return true;
		}
	}]);

	function Vector(x, rot, img, drawsim) {
		var _this = this;

		_classCallCheck(this, Vector);

		_get(Object.getPrototypeOf(Vector.prototype), "constructor", this).call(this);
		this.x = x;
		this.y = 0;
		this.img = img;
		this.rot = rot;
		var select = new createjs.Shape();
		select.graphics.beginFill("#CCC").drawRoundRect(0, 0, 26, 26, 2, 2, 2, 2).endStroke();
		this.addChild(select);
		var map = new createjs.Bitmap(img);
		map.x = 13;
		map.y = 13;
		map.regX = 12;
		map.regY = 12;
		map.rotation = rot;
		this.setBounds(x, 0, 26, 26);
		this.addChild(map);
		select.alpha = 0;
		this.addEventListener("mouseover", function (e) {
			return select.alpha = 0.5;
		});
		this.addEventListener("mouseout", function (e) {
			return select.alpha = 0;
		});
		this.addEventListener("click", function (e) {
			return drawsim.toolbar.select(_this);
		});
	}

	_createClass(Vector, [{
		key: "toJSON",
		value: function toJSON(x, y) {
			return { type: "vector", img: this.img, rot: this.rot, pt: { x: x, y: y } };
		}
	}]);

	return Vector;
})(createjs.Container);

var PressureRegion = (function (_createjs$Container2) {
	_inherits(PressureRegion, _createjs$Container2);

	_createClass(PressureRegion, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var region = new createjs.Container();
			var txt = new createjs.Text(json.high ? "H" : "L", "bold 24px Arial", json.high ? "#00F" : "#F00");
			txt.x = json.pt.x - 12;
			txt.y = json.pt.y - 12;
			var circle = new createjs.Shape();
			circle.graphics.beginFill(json.high ? "#0F0" : "#FF0").drawCircle(json.pt.x, json.pt.y, 24).endFill();
			circle.alpha = 0.5;
			region.addChild(circle);
			region.addChild(txt);
			region.addEventListener("click", function (e) {
				removeSymbol(json);
				region.stage.removeChild(region);
			});
			region.cursor = "not-allowed";
			stage.addChild(region);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.high != json2.high) return false;
			if (json1.pt.x != json2.pt.x) return false;
			if (json1.pt.y != json2.pt.y) return false;
			return true;
		}
	}]);

	function PressureRegion(x, high, drawsim) {
		var _this2 = this;

		_classCallCheck(this, PressureRegion);

		_get(Object.getPrototypeOf(PressureRegion.prototype), "constructor", this).call(this);
		this.high = high;
		var txt = new createjs.Text(high ? "H" : "L", "bold 24px Arial", high ? "#00F" : "#F00");
		txt.x = x + 2;
		txt.y = 2;
		var select = new createjs.Shape();
		select.graphics.beginFill("#CCC").drawRoundRect(x, 0, 26, 26, 2, 2, 2, 2).endStroke();
		this.addChild(select);
		var circle = new createjs.Shape();
		circle.graphics.beginFill(high ? "#0F0" : "#FF0").drawCircle(x + 12, 12, 13).endFill();
		circle.alpha = 0.3;
		this.addChild(circle, txt);
		this.setBounds(x, 0, 26, 26);
		select.alpha = 0;
		this.addEventListener("mouseover", function (e) {
			return select.alpha = 0.5;
		});
		this.addEventListener("mouseout", function (e) {
			return select.alpha = 0;
		});
		this.addEventListener("click", function (e) {
			return drawsim.toolbar.select(_this2);
		});
	}

	_createClass(PressureRegion, [{
		key: "toJSON",
		value: function toJSON(x, y) {
			return { type: "region", high: this.high, pt: { x: x, y: y } };
		}
	}, {
		key: "getLength",
		value: function getLength() {
			return 2 * 30 + 2;
		}
	}, {
		key: "getInst",
		value: function getInst() {
			return "<p>Click location and select an icon to add. Click icon in map to delete.</p>";
		}
	}]);

	return PressureRegion;
})(createjs.Container);

var Pressures = (function (_createjs$Container3) {
	_inherits(Pressures, _createjs$Container3);

	function Pressures(x, drawsim) {
		_classCallCheck(this, Pressures);

		_get(Object.getPrototypeOf(Pressures.prototype), "constructor", this).call(this);
		this.x = x;
		this.y = 2;
		if (opt == "all" || opt == "arrows") for (var i = 0; i < 8; i++) {
			var v = new Vector(x, 45 * i, "assets/left-arrow.png", drawsim);
			this.addChild(v);
			x += 30;
		}
		if (opt == "all" || opt == "hl") {
			this.addChild(new PressureRegion(x, true, drawsim));
			x += 30;
			this.addChild(new PressureRegion(x, false, drawsim));
			x += 30;
		}
	}

	_createClass(Pressures, [{
		key: "getLength",
		value: function getLength() {
			var n = opt == "all" ? 10 : opt == "arrows" ? 8 : 2;
			return n * 30 + 2;
		}
	}, {
		key: "getInst",
		value: function getInst() {
			return "<p>Click location and select an icon to add. Click icon in map to delete.</p>";
		}
	}]);

	return Pressures;
})(createjs.Container);

var Airmass = (function (_createjs$Container4) {
	_inherits(Airmass, _createjs$Container4);

	_createClass(Airmass, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var airmass = new createjs.Container();
			airmass.x = json.pt.x;
			airmass.y = json.pt.y;
			var circle = new createjs.Shape();
			circle.graphics.beginFill("#FFF").beginStroke("#000").drawCircle(14, 14, 14).endStroke();
			airmass.addChild(circle);
			var txt = new createjs.Text(json.name, "12px Arial", "#000");
			txt.x = 6;
			txt.y = 10;
			airmass.addChild(txt);
			airmass.cursor = "not-allowed";
			airmass.addEventListener("click", function (e) {
				removeSymbol(json);
				airmass.stage.removeChild(airmass);
			});
			stage.addChild(airmass);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.name != json2.name) return false;
			if (json1.pt.x != json2.pt.x) return false;
			if (json1.pt.y != json2.pt.y) return false;
			return true;
		}
	}]);

	function Airmass(x, name, drawsim) {
		var _this3 = this;

		_classCallCheck(this, Airmass);

		_get(Object.getPrototypeOf(Airmass.prototype), "constructor", this).call(this);
		this.x = x;
		this.y = 2;
		this.name = name;
		var circle = new createjs.Shape();
		circle.graphics.beginFill("#FFF").beginStroke("#000").drawCircle(14, 14, 14).endStroke();
		this.addChild(circle);
		var txt = new createjs.Text(name, "12px Arial", "#000");
		txt.x = 6;
		txt.y = 10;
		this.addChild(txt);
		var select = new createjs.Shape();
		select.graphics.beginFill("#CCC").drawCircle(14, 14, 14).endStroke();
		this.addChild(select);
		select.alpha = 0;
		this.addEventListener("mouseover", function (e) {
			select.alpha = 0.5;
		});
		this.addEventListener("mouseout", function (e) {
			select.alpha = 0;
		});
		this.addEventListener("click", function (e) {
			drawsim.toolbar.select(_this3);
		});
	}

	_createClass(Airmass, [{
		key: "toJSON",
		value: function toJSON(x, y) {
			return { type: "airmass", name: this.name, pt: { x: x, y: y } };
		}
	}]);

	return Airmass;
})(createjs.Container);

var Airmasses = (function (_createjs$Container5) {
	_inherits(Airmasses, _createjs$Container5);

	function Airmasses(x, toolbar) {
		var _this4 = this;

		_classCallCheck(this, Airmasses);

		_get(Object.getPrototypeOf(Airmasses.prototype), "constructor", this).call(this);
		var masses = ["cP", "mP", "cT", "mT", "cE", "mE", "cA", "mA"];
		masses.forEach(function (name) {
			_this4.addChild(new Airmass(x, name, toolbar));
			x += 30;
		});
	}

	_createClass(Airmasses, [{
		key: "getLength",
		value: function getLength() {
			return 8 * 30 + 2;
		}
	}, {
		key: "getInst",
		value: function getInst() {
			return "<p>Click location and select airmass to add. Click airmass to delete.</p>";
		}
	}]);

	return Airmasses;
})(createjs.Container);

var IsoPleth = (function () {
	_createClass(IsoPleth, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var pts = json.pts;
			var path = new createjs.Container();
			var shape = new createjs.Shape();
			shape.graphics.beginStroke("#00F");
			var oldX = pts[0].x;
			var oldY = pts[0].y;
			var oldMidX = oldX;
			var oldMidY = oldY;
			json.pts.forEach(function (pt) {
				var midPoint = new createjs.Point(oldX + pt.x >> 1, oldY + pt.y >> 1);
				shape.graphics.setStrokeStyle(4).moveTo(midPoint.x, midPoint.y);
				shape.graphics.curveTo(oldX, oldY, oldMidX, oldMidY);
				oldX = pt.x;
				oldY = pt.y;
				oldMidX = midPoint.x;
				oldMidY = midPoint.y;
			});
			path.addChild(shape);
			var first = pts[0],
			    last = pts[pts.length - 1];
			var label = IsoPleth.getLabel(json.value, first.x - 10, first.y + (first.y < last.y ? -24 : 0));
			label.cursor = "not-allowed";
			label.addEventListener("click", function (e) {
				removeSymbol(json);
				stage.removeChild(path);
			});
			path.addChild(label);
			if (dist(first, last) > 10) {
				var _label = IsoPleth.getLabel(json.value, last.x - 10, last.y + (first.y < last.y ? 0 : -24));
				_label.cursor = "not-allowed";
				_label.addEventListener("click", function (e) {
					removeSymbol(json);
					stage.removeChild(path);
				});
				path.addChild(_label);
			}
			stage.addChild(path);
		}
	}, {
		key: "getLabel",
		value: function getLabel(name, x, y) {
			var label = new createjs.Container();
			var txt = new createjs.Text(name, "bold 24px Arial", "#00F");
			txt.x = x;
			txt.y = y;
			var circle = new createjs.Shape();
			circle.graphics.beginFill("#FFF").drawCircle(x + 12, y + 12, 20).endFill();
			label.addChild(circle);
			label.addChild(txt);
			return label;
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.value != json2.value) return false;
			if (json1.pts[0].x != json2.pts[0].x) return false;
			if (json1.pts[0].y != json2.pts[0].y) return false;
			return true;
		}
	}]);

	function IsoPleth(back, drawsim) {
		var _this5 = this;

		_classCallCheck(this, IsoPleth);

		createjs.Ticker.framerate = 10;
		this.back = back;
		this.mouseDown = false;
		drawsim.mainstage.addEventListener("stagemousedown", function (e) {
			_this5.currentShape = new createjs.Shape();
			_this5.currentShape.graphics.beginStroke("#00F");
			drawsim.mainstage.addChild(_this5.currentShape);
			_this5.oldX = _this5.oldMidX = e.stageX;
			_this5.oldY = _this5.oldMidY = e.stageY;
			_this5.mouseDown = true;
			_this5.pts = [];
		});
		drawsim.mainstage.addEventListener("stagemousemove", function (e) {
			if (_this5.mouseDown == false) return;
			_this5.pt = new createjs.Point(e.stageX, e.stageY);
			_this5.pts = _this5.pts.concat({ x: e.stageX, y: e.stageY });
			var midPoint = new createjs.Point(_this5.oldX + _this5.pt.x >> 1, _this5.oldY + _this5.pt.y >> 1);
			_this5.currentShape.graphics.setStrokeStyle(4).moveTo(midPoint.x, midPoint.y);
			_this5.currentShape.graphics.curveTo(_this5.oldX, _this5.oldY, _this5.oldMidX, _this5.oldMidY);
			_this5.oldX = _this5.pt.x;
			_this5.oldY = _this5.pt.y;
			_this5.oldMidX = midPoint.x;
			_this5.oldMidY = midPoint.y;
		});
		drawsim.mainstage.addEventListener("stagemouseup", function (e) {
			_this5.mouseDown = false;
			drawsim.mainstage.removeChild(_this5.currentShape);
			if (_this5.pts.length < 3) return;
			var value = prompt("Enter value:", 1);
			if (value) {
				var symbol = { type: "isopleth", value: value, pts: _this5.pts };
				IsoPleth.showSymbol(drawsim.mainstage, symbol);
				addSymbol(symbol);
			}
		});
	}

	_createClass(IsoPleth, [{
		key: "getInst",
		value: function getInst() {
			return "<p>Press and drag mouse to draw line. Release when done. Supply a value when prompted.  Click value to delete.</p>";
		}
	}]);

	return IsoPleth;
})();

var Line = (function () {
	_createClass(Line, null, [{
		key: "getLineShape",
		value: function getLineShape(lt) {
			var shape = new createjs.Shape();
			shape.graphics.setStrokeStyle(lt.w).beginStroke(lt.c);
			return shape;
		}
	}, {
		key: "setButton",
		value: function setButton(button, color) {
			var b = button.getChildAt(0);
			var border = new createjs.Shape();
			border.x = b.x;
			border.graphics.setStrokeStyle(1).beginFill(color).beginStroke("#AAA").drawRoundRect(0, 2, 62, 18, 2, 2, 2, 2).endStroke();
			button.removeChildAt(0);
			button.addChildAt(border, 0);
		}
	}, {
		key: "getButton",
		value: function getButton(x, name) {
			var lt = linetypes[name];
			var button = new createjs.Container();
			button.cursor = "pointer";
			button.addEventListener("click", function (e) {
				if (name == linetype) return;
				if (linetypeButton) Line.setButton(linetypeButton, "#FFF");
				Line.setButton(button, "#EEE");
				linetype = name;
				linetypeButton = button;
			});
			var border = new createjs.Shape();
			border.graphics.setStrokeStyle(1).beginFill(name == linetype ? "#EEE" : "#FFF").beginStroke("#AAA").drawRoundRect(0, 2, 62, 18, 2, 2, 2, 2).endStroke();
			if (name == linetype) linetypeButton = button;
			border.x = x;
			var txt = new createjs.Text(name, "bold 12px Arial", "#000");
			txt.x = x + 5;
			txt.y = 5;
			var line = Line.getLineShape(lt);
			var left = x + txt.getBounds().width + 10;
			line.graphics.moveTo(left, 10).lineTo(left + 15, 10).endStroke();
			button.addChild(border, txt, line);
			return button;
		}
	}, {
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var pts = json.pts;
			var path = new createjs.Container();
			path.name = json.ltype;
			var shape = Line.getLineShape(linetypes[json.ltype]);
			var oldX = pts[0].x;
			var oldY = pts[0].y;
			var oldMidX = oldX;
			var oldMidY = oldY;
			json.pts.forEach(function (pt) {
				var midPoint = new createjs.Point(oldX + pt.x >> 1, oldY + pt.y >> 1);
				shape.graphics.moveTo(midPoint.x, midPoint.y);
				shape.graphics.curveTo(oldX, oldY, oldMidX, oldMidY);
				oldX = pt.x;
				oldY = pt.y;
				oldMidX = midPoint.x;
				oldMidY = midPoint.y;
			});
			path.addChild(shape);
			stage.addChild(path);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.ltype != json2.ltype) return false;
			if (json1.pts[0].x != json2.pts[0].x) return false;
			if (json1.pts[0].y != json2.pts[0].y) return false;
			return true;
		}
	}]);

	function Line(back, drawsim) {
		var _this6 = this;

		_classCallCheck(this, Line);

		createjs.Ticker.framerate = 10;
		this.back = back;
		this.mouseDown = false;
		var x = 5;
		for (var key in linetypes) {
			var b = Line.getButton(x, key);
			drawsim.mainstage.addChild(b);
			x += 65;
		}
		drawsim.mainstage.addEventListener("stagemousedown", function (e) {
			_this6.currentShape = Line.getLineShape(linetypes[linetype]);
			drawsim.mainstage.addChild(_this6.currentShape);
			_this6.oldX = _this6.oldMidX = e.stageX;
			_this6.oldY = _this6.oldMidY = e.stageY;
			_this6.mouseDown = true;
			_this6.pts = [];
		});
		drawsim.mainstage.addEventListener("stagemousemove", function (e) {
			if (_this6.mouseDown == false) return;
			_this6.pt = new createjs.Point(e.stageX, e.stageY);
			_this6.pts = _this6.pts.concat({ x: e.stageX, y: e.stageY });
			var midPoint = new createjs.Point(_this6.oldX + _this6.pt.x >> 1, _this6.oldY + _this6.pt.y >> 1);
			_this6.currentShape.graphics.setStrokeStyle(linetypes[linetype].w).moveTo(midPoint.x, midPoint.y);
			_this6.currentShape.graphics.curveTo(_this6.oldX, _this6.oldY, _this6.oldMidX, _this6.oldMidY);
			_this6.oldX = _this6.pt.x;
			_this6.oldY = _this6.pt.y;
			_this6.oldMidX = midPoint.x;
			_this6.oldMidY = midPoint.y;
		});
		drawsim.mainstage.addEventListener("stagemouseup", function (e) {
			_this6.mouseDown = false;
			drawsim.mainstage.removeChild(_this6.currentShape);
			if (_this6.pts.length < 3) return;
			drawsim.mainstage.removeChild(drawsim.mainstage.getChildByName(linetype));
			getSymbols().forEach(function (s) {
				if (s.ltype == linetype) removeSymbol(s);
			});
			var symbol = { type: "line", ltype: linetype, pts: _this6.pts };
			Line.showSymbol(drawsim.mainstage, symbol);
			addSymbol(symbol);
		});
	}

	_createClass(Line, [{
		key: "getInst",
		value: function getInst() {
			return "<p>Select a line type, then press and drag mouse to draw. Release when done.<br/>Drawing another line of the same type will replace the previous line.</p>";
		}
	}]);

	return Line;
})();

var Ellipse = (function (_createjs$Container6) {
	_inherits(Ellipse, _createjs$Container6);

	_createClass(Ellipse, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var ellipse = new createjs.Shape();
			ellipse.graphics.setStrokeStyle(2).beginFill("#FFF").beginStroke("#F00").drawEllipse(Math.round(json.pt.x - json.w / 2), Math.round(json.pt.y - json.h / 2), Math.round(json.w), Math.round(json.h)).endStroke();
			ellipse.alpha = 0.5;
			ellipse.cursor = "not-allowed";
			ellipse.addEventListener("click", function (e) {
				removeSymbol(json);
				stage.removeChild(ellipse);
			});
			stage.addChild(ellipse);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.ex != json2.ex) return false;
			if (json1.w != json2.w) return false;
			if (json1.h != json2.h) return false;
			if (json1.pt.x != json2.pt.x) return false;
			if (json1.pt.y != json2.pt.y) return false;
			return true;
		}
	}]);

	function Ellipse(back, drawsim) {
		var _this7 = this;

		_classCallCheck(this, Ellipse);

		_get(Object.getPrototypeOf(Ellipse.prototype), "constructor", this).call(this);
		back.cursor = "pointer";
		back.addEventListener("click", function (e) {
			var symbol = _this7.toJSON(e.stageX, e.stageY);
			addSymbol(symbol);
			Ellipse.showSymbol(drawsim.mainstage, symbol);
		});
	}

	_createClass(Ellipse, [{
		key: "toJSON",
		value: function toJSON(x, y) {
			return { type: "ellipse", ex: ex, w: width, h: height, pt: { x: x, y: y } };
		}
	}, {
		key: "getInst",
		value: function getInst() {
			return "<p>Click to add an ellipse. Click ellipse to delete.</p>";
		}
	}]);

	return Ellipse;
})(createjs.Container);

var Field = (function () {
	_createClass(Field, null, [{
		key: "showSymbol",
		value: function showSymbol(stage, json) {
			var pts = json.pts;
			var shape = new createjs.Shape();
			if (pts.length == 0) return;
			var oldX = pts[0].x;
			var oldY = pts[0].y;
			var oldMidX = oldX;
			var oldMidY = oldY;
			this.color = json.color;
			shape.graphics.beginStroke(this.color);
			json.pts.forEach(function (pt) {
				var midPoint = new createjs.Point(oldX + pt.x >> 1, oldY + pt.y >> 1);
				shape.graphics.setStrokeStyle(4).moveTo(midPoint.x, midPoint.y);
				shape.graphics.curveTo(oldX, oldY, oldMidX, oldMidY);
				oldX = pt.x;
				oldY = pt.y;
				oldMidX = midPoint.x;
				oldMidY = midPoint.y;
			});
			var path = new createjs.Container();
			path.addChild(shape);
			if ((opt == 'head' || opt == "colorhead") && pts.length > 4) {
				var lastpt = pts[pts.length - 6];
				var endpt = pts[pts.length - 3];
				var head = new createjs.Shape();
				head.graphics.f(this.color).setStrokeStyle(4).beginStroke(this.color).mt(4, 0).lt(-4, -4).lt(-4, 4).lt(4, 0);
				head.x = endpt.x;
				head.y = endpt.y;
				head.rotation = angle(lastpt, endpt);
				path.addChild(head);
				var desc = new createjs.Text(json.desc, "14px Arial", "#000");
				var mid = Math.trunc(pts.length / 2);
				desc.x = json.pts[mid].x;
				desc.y = json.pts[mid].y;
				var rect = new createjs.Shape();
				rect.graphics.beginFill("white");
				rect.graphics.drawRect(desc.x, desc.y, desc.getMeasuredWidth(), desc.getMeasuredHeight());
				rect.graphics.endFill();
				rect.alpha = 0.9;
				path.addChild(rect);
				path.addChild(desc);
			}
			path.cursor = "not-allowed";
			path.addEventListener("click", function (e) {
				removeSymbol(json);
				path.stage.removeChild(path);
			});
			stage.addChild(path);
		}
	}, {
		key: "isSame",
		value: function isSame(json1, json2) {
			if (json1.type != json2.type) return false;
			if (json1.pts[0].x != json2.pts[0].x) return false;
			if (json1.pts[0].y != json2.pts[0].y) return false;
			return true;
		}
	}]);

	function Field(back, drawsim) {
		var _this8 = this;

		_classCallCheck(this, Field);

		createjs.Ticker.framerate = 5;
		this.back = back;
		this.mouseDown = false;
		this.w = 1;
		drawsim.mainstage.addEventListener("stagemousedown", function (e) {
			_this8.currentShape = new createjs.Shape();
			_this8.oldX = _this8.oldMidX = e.stageX;
			_this8.oldY = _this8.oldMidY = e.stageY;
			_this8.mouseDown = true;
			_this8.pts = [];
			_this8.color = "#000";
			if (opt == "colorhead") {
				var ctx = document.getElementById("maincanvas").getContext("2d");
				var data = ctx.getImageData(_this8.oldX, _this8.oldY, 1, 1).data;
				_this8.color = rgbToHex(data[0], data[1], data[2]);
			}
			_this8.currentShape.graphics.beginStroke(_this8.color);
			drawsim.mainstage.addChild(_this8.currentShape);
		});
		drawsim.mainstage.addEventListener("stagemousemove", function (e) {
			if (_this8.mouseDown == false) return;
			_this8.pt = new createjs.Point(e.stageX, e.stageY);
			_this8.pts = _this8.pts.concat({ x: e.stageX, y: e.stageY });
			var midPoint = new createjs.Point(_this8.oldX + _this8.pt.x >> 1, _this8.oldY + _this8.pt.y >> 1);
			_this8.currentShape.graphics.setStrokeStyle(4).moveTo(midPoint.x, midPoint.y);
			_this8.currentShape.graphics.curveTo(_this8.oldX, _this8.oldY, _this8.oldMidX, _this8.oldMidY);
			_this8.oldX = _this8.pt.x;
			_this8.oldY = _this8.pt.y;
			_this8.oldMidX = midPoint.x;
			_this8.oldMidY = midPoint.y;
		});
		drawsim.mainstage.addEventListener("stagemouseup", function (e) {
			_this8.mouseDown = false;
			if (_this8.pts.length == 0) return;
			drawsim.mainstage.removeChild(_this8.currentShape);
			var symbol = { type: "field", pts: _this8.pts, color: _this8.color, desc: "" };
			Field.showSymbol(drawsim.mainstage, symbol);
			if ((opt == 'head' || opt == "colorhead") && _this8.pts.length > 4) {
				symbol.desc = getDesc(_this8.pts[Math.trunc(_this8.pts.length / 2)], symbol, function () {
					Field.showSymbol(drawsim.mainstage, symbol);
					addSymbol(symbol);
				});
			}
		});
	}

	_createClass(Field, [{
		key: "getInst",
		value: function getInst() {
			return opt ? "<p>Press and drag mouse to draw a line. Release when done. Click on line when red cursor appears to delete." : "<p>Join horizontal field lines on left and right by drawing over top of image. Lines should not cross. <br/>Click on line when red cursor appears to delete.</p>";
		}
	}]);

	return Field;
})();

var Transform = (function () {
	function Transform(back, drawsim) {
		var _this9 = this;

		_classCallCheck(this, Transform);

		createjs.Ticker.framerate = 5;
		this.back = back;
		if (edit) {
			document.getElementById("transform").style.visibility = "visible";
			document.getElementById("rotate").addEventListener("click", function (e) {
				return _this9.rotate(back, e);
			});
			document.getElementById("fliph").addEventListener("click", function (e) {
				return _this9.flipH(back, e);
			});
			document.getElementById("flipv").addEventListener("click", function (e) {
				return _this9.flipV(back, e);
			});
		}
	}

	_createClass(Transform, [{
		key: "rotate",
		value: function rotate(img, e) {
			img.rotation += 90;
		}
	}, {
		key: "flipH",
		value: function flipH(img, e) {
			img.scaleX = img.scaleX == 1 ? -1 : 1;
		}
	}, {
		key: "flipV",
		value: function flipV(img, e) {
			img.scaleY = img.scaleY == 1 ? -1 : 1;
		}
	}]);

	return Transform;
})();

var Toolbar = (function (_createjs$Container7) {
	_inherits(Toolbar, _createjs$Container7);

	function Toolbar(tool, drawsim) {
		_classCallCheck(this, Toolbar);

		_get(Object.getPrototypeOf(Toolbar.prototype), "constructor", this).call(this);
		createjs.Ticker.framerate = 20;
		var border = new createjs.Shape();
		this.addChild(border);
		var w = 2;
		this.addChild(tool);
		w += tool.getLength();
		this.cancel = new Vector(w, 0, "assets/cross.png", drawsim);
		this.cancel.y = 2;
		this.addChild(this.cancel);
		w += 30;
		this.x = 0;
		this.y = -100;
		this.w = w;
		border.graphics.beginFill("#FFF").beginStroke("#AAA").drawRoundRect(0, 0, w, 30, 5, 5, 5, 5).endStroke();
	}

	_createClass(Toolbar, [{
		key: "select",
		value: function select(obj) {
			this.y = -100;
			if (obj == this.cancel) return;
			var json = null;
			if (obj instanceof Vector) {
				json = obj.toJSON(this.e.stageX, this.e.stageY);
				Vector.showSymbol(this.stage, json);
			}
			if (obj instanceof Airmass) {
				json = obj.toJSON(this.e.stageX - 14, this.e.stageY - 14);
				Airmass.showSymbol(this.stage, json);
			}
			if (obj instanceof PressureRegion) {
				json = obj.toJSON(this.e.stageX, this.e.stageY);
				PressureRegion.showSymbol(this.stage, json);
			}
			addSymbol(json);
			this.stage.setChildIndex(this, this.stage.getNumChildren() - 1);
		}
	}, {
		key: "show",
		value: function show(e) {
			if (!e.relatedTarget && this.y < 0) {
				this.x = e.stageX - this.w / 2;
				this.y = e.stageY - 30;
				this.e = e;
			}
		}
	}]);

	return Toolbar;
})(createjs.Container);

var DrawSim = (function () {
	function DrawSim() {
		var _this10 = this;

		_classCallCheck(this, DrawSim);

		this.mainstage = new createjs.Stage("maincanvas");
		createjs.Touch.enable(this.mainstage);
		var back = new createjs.Bitmap(image);
		back.image.onload = function () {
			var bnd = back.getBounds();
			drawsim.mainstage.canvas.width = bnd.width + 40;
			drawsim.mainstage.canvas.height = bnd.height + 40;
			back.x = bnd.width / 2 + 20;
			back.y = bnd.width / 2 + 20;
			back.regX = bnd.width / 2;
			back.regY = bnd.height / 2;
		};
		this.mainstage.addChild(back);
		this.showSymbols();
		if (edit) {
			this.mainstage.enableMouseOver();
			//let inst = document.getElementById("instruct")
			switch (tool) {
				case "pressure":
					var pressures = new Pressures(2, this);
					this.toolbar = new Toolbar(pressures, this);
					//inst.innerHTML = pressures.getInst()
					back.addEventListener("mousedown", function (e) {
						return _this10.toolbar.show(e);
					});
					this.mainstage.addChild(this.toolbar);
					break;
				case "airmass":
					var airmasses = new Airmasses(2, this);
					this.toolbar = new Toolbar(airmasses, this);
					//inst.innerHTML = airmasses.getInst()
					back.addEventListener("mousedown", function (e) {
						return _this10.toolbar.show(e);
					});
					this.mainstage.addChild(this.toolbar);
					break;
				case "isopleth":
					this.isopleth = new IsoPleth(back, this);
					//inst.innerHTML = this.isopleth.getInst()
					break;
				case "line":
					this.line = new Line(back, this);
					//inst.innerHTML = this.line.getInst()
					break;
				case "ellipse":
					this.ellipse = new Ellipse(back, this);
					//inst.innerHTML = this.ellipse.getInst()
					break;
				case "field":
					this.field = new Field(back, this);
					//inst.innerHTML = this.field.getInst()
					break;
				case "transform":
					this.field = new Transform(back, this);
					break;
				default:
					{
						alert("Parameter tool should be pressure, airmass, isopleth, line, ellipse, field or transform");
					}
			}
		}
		// handle download
		var dl = document.getElementById("download");
		dl.addEventListener("click", function (e) {
			var dt = _this10.mainstage.canvas.toDataURL('image/png');
			/* Change MIME type to trick the browser to download the file instead of displaying it */
			dt = dt.replace(/^data:image\/[^;]*/, 'data:application/octet-stream');
			/* In addition to <a>'s "download" attribute, you can define HTTP-style headers */
			dt = dt.replace(/^data:application\/octet-stream/, 'data:application/octet-stream;headers=Content-Disposition%3A%20attachment%3B%20filename=map.png');
			dl.href = dt;
		});
	}

	_createClass(DrawSim, [{
		key: "showSymbols",
		value: function showSymbols() {
			var _this11 = this;

			var symbols = getSymbols();
			symbols.forEach(function (json) {
				switch (json.type) {
					case "vector":
						Vector.showSymbol(_this11.mainstage, json);
						break;
					case "region":
						PressureRegion.showSymbol(_this11.mainstage, json);
						break;
					case "airmass":
						Airmass.showSymbol(_this11.mainstage, json);
						break;
					case "isopleth":
						IsoPleth.showSymbol(_this11.mainstage, json);
						break;
					case "line":
						Line.showSymbol(_this11.mainstage, json);
						break;
					case "ellipse":
						Ellipse.showSymbol(_this11.mainstage, json);
						break;
					case "field":
						Field.showSymbol(_this11.mainstage, json);
						break;
				}
			});
		}
	}, {
		key: "run",
		value: function run() {
			var _this12 = this;

			var tick = 0;
			createjs.Ticker.addEventListener("tick", function (e) {
				_this12.mainstage.update();
				tick++;
			});
		}
	}]);

	return DrawSim;
})();

var drawsim = new DrawSim();
drawsim.run();

},{"../utils":10,"url":5}],8:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
				value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var marginX = 40,
    marginY = 30,
    endMargin = 5;

var Axis = (function () {
				function Axis(spec) {
								_classCallCheck(this, Axis);

								this.spec = spec;
								this.stage = spec.stage;
								this.w = spec.dim.w || 100;
								this.h = spec.dim.h || 100;
								this.min = spec.dim.min || 0;
								this.max = spec.dim.max || 100;
								this.font = spec.font || "11px Arial";
								this.color = spec.color || "#000";
								this.label = spec.label;
								this.major = spec.major || 10;
								this.minor = spec.minor || spec.major;
								this.precision = spec.precision || 0;
								this.vertical = spec.orient && spec.orient == "vertical" || false;
								this.linear = spec.scale && spec.scale == "linear" || false;
								this.invert = spec.invert || false;
								if (spec.dim.x) {
												this.originX = spec.dim.x;
												this.endX = this.originX + this.w;
								} else {
												this.originX = marginX;
												this.endX = this.w - endMargin;
								}
								if (spec.dim.y) {
												this.originY = spec.dim.y;
												this.endY = this.originY - this.h + endMargin;
								} else {
												this.originY = this.h - marginY;
												this.endY = endMargin;
								}
								this.scale = this.vertical ? Math.abs(this.endY - this.originY) / (this.max - this.min) : Math.abs(this.endX - this.originX) / (this.max - this.min);
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
																this.drawLine(this.originX, this.originY, this.originX, this.endY);
																var minXLabel = this.originX;
																for (var val = this.min; val <= this.max; val += this.major) {
																				var v = this.getLoc(val);
																				this.drawLine(this.originX - 4, v, this.originX + 4, v);
																				var text = this.getText(val.toFixed(this.precision));
																				var bnds = text.getBounds();
																				var x = this.originX - 5 - bnds.width;
																				this.drawText(text, x, v + bnds.height / 2 - 10);
																				if (x < minXLabel) minXLabel = x;
																}
																for (var val = this.min; val <= this.max; val += this.minor) {
																				var v = this.getLoc(val);
																				this.drawLine(this.originX - 2, v, this.originX + 2, v);
																}
																if (this.spec.label) {
																				var y = this.originY - (this.originY - label_bnds.width) / 2;
																				this.drawText(label, minXLabel - label_bnds.height, y);
																}
												} else {
																this.drawLine(this.originX, this.originY, this.endX, this.originY);
																if (this.spec.label) {
																				var x = (this.w - endMargin - label_bnds.width) / 2;
																				this.drawText(label, this.originX + x, this.originY + 15);
																}
																for (var val = this.min; val <= this.max; val += this.major) {
																				var v = this.getLoc(val);
																				this.drawLine(v, this.originY - 4, v, this.originY + 4);
																				var text = this.getText(val.toFixed(this.precision));
																				var bnds = text.getBounds();
																				this.drawText(text, v - bnds.width / 2, this.originY + 4);
																}
																for (var val = this.min; val <= this.max; val += this.minor) {
																				var v = this.getLoc(val);
																				this.drawLine(v, this.originY - 2, v, this.originY + 2);
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
												var factor = this.vertical ? (this.originY - v) / this.originY : (v - this.originX) / (this.w - this.originX);
												return this.min + (this.max - this.min) * factor;
								}
				}, {
								key: "isInside",
								value: function isInside(v) {
												if (this.vertical) return v >= this.originY && v <= this.originY + this.h;else return v >= this.originX && v <= this.originY + this.w;
								}
				}]);

				return Axis;
})();

exports.Axis = Axis;

},{}],9:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _axis = require("./axis");

var Graph = (function () {
	function Graph(spec) {
		_classCallCheck(this, Graph);

		this.stage = spec.stage;
		this.xaxis = new _axis.Axis({
			stage: this.stage,
			label: spec.xlabel,
			dim: { x: spec.x, y: spec.y, w: spec.w, h: spec.h, min: spec.minX, max: spec.maxX },
			orient: "horizontal",
			scale: spec.xscale,
			major: spec.majorX,
			minor: spec.minorX,
			precision: spec.precisionX,
			invert: spec.xinvert
		});
		this.yaxis = new _axis.Axis({
			stage: this.stage,
			label: spec.ylabel,
			dim: { x: spec.x, y: spec.y, w: spec.w, h: spec.h, min: spec.minY, max: spec.maxY },
			orient: "vertical",
			scale: spec.yscale,
			major: spec.majorY,
			minor: spec.minorY,
			precision: spec.precisionY,
			invert: spec.yinvert
		});
		this.width = 1;
		this.last = null;
		this.marker = null;
		this.color = "#000";
		this.dotted = false;
		if (spec.background) {
			var b = new createjs.Shape();
			b.graphics.beginStroke("#AAA").beginFill(spec.background).drawRect(spec.x, spec.y - spec.h, spec.w, spec.h).endStroke();
			b.alpha = 0.3;
			spec.stage.addChild(b);
		}
	}

	_createClass(Graph, [{
		key: "setWidth",
		value: function setWidth(width) {
			this.width = width;
		}
	}, {
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
			if (this.dotted === true) line.graphics.setStrokeDash([2, 2]).setStrokeStyle(this.width).beginStroke(this.color).moveTo(x1, y1).lineTo(x2, y2).endStroke();else line.graphics.setStrokeStyle(this.width).beginStroke(this.color).moveTo(x1, y1).lineTo(x2, y2).endStroke();
			this.stage.addChild(line);
			return line;
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
})();

exports.Graph = Graph;

},{"./axis":8}],10:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getParams = getParams;
exports.getStore = getStore;

var _graph = require("./graph");

Object.defineProperty(exports, "Graph", {
  enumerable: true,
  get: function get() {
    return _graph.Graph;
  }
});

var JSON = require("./json2");
var store = require("./store");

function getParams() {
  var params = {};
  if (location.search) {
    location.search.slice(1).split('&').forEach(function (part) {
      var pair = part.split('=');
      pair[0] = decodeURIComponent(pair[0]);
      pair[1] = decodeURIComponent(pair[1]);
      params[pair[0]] = pair[1] !== 'undefined' ? pair[1] : true;
    });
  }
  return params;
}

function getStore() {
  if (!store.enabled) {
    alert('Local storage is not supported by your browser. Please disable "Private Mode", or upgrade to a modern browser.');
    return;
  }
  return store;
}

},{"./graph":9,"./json2":11,"./store":12}],11:[function(require,module,exports){
/*
    json2.js
    2015-05-03

    Public Domain.

    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

    See http://www.JSON.org/js.html


    This code should be minified before deployment.
    See http://javascript.crockford.com/jsmin.html

    USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
    NOT CONTROL.


    This file creates a global JSON object containing two methods: stringify
    and parse. This file is provides the ES5 JSON capability to ES3 systems.
    If a project might run on IE8 or earlier, then this file should be included.
    This file does nothing on ES5 systems.

        JSON.stringify(value, replacer, space)
            value       any JavaScript value, usually an object or array.

            replacer    an optional parameter that determines how object
                        values are stringified for objects. It can be a
                        function or an array of strings.

            space       an optional parameter that specifies the indentation
                        of nested structures. If it is omitted, the text will
                        be packed without extra whitespace. If it is a number,
                        it will specify the number of spaces to indent at each
                        level. If it is a string (such as '\t' or '&nbsp;'),
                        it contains the characters used to indent at each level.

            This method produces a JSON text from a JavaScript value.

            When an object value is found, if the object contains a toJSON
            method, its toJSON method will be called and the result will be
            stringified. A toJSON method does not serialize: it returns the
            value represented by the name/value pair that should be serialized,
            or undefined if nothing should be serialized. The toJSON method
            will be passed the key associated with the value, and this will be
            bound to the value

            For example, this would serialize Dates as ISO strings.

                Date.prototype.toJSON = function (key) {
                    function f(n) {
                        // Format integers to have at least two digits.
                        return n < 10 
                            ? '0' + n 
                            : n;
                    }

                    return this.getUTCFullYear()   + '-' +
                         f(this.getUTCMonth() + 1) + '-' +
                         f(this.getUTCDate())      + 'T' +
                         f(this.getUTCHours())     + ':' +
                         f(this.getUTCMinutes())   + ':' +
                         f(this.getUTCSeconds())   + 'Z';
                };

            You can provide an optional replacer method. It will be passed the
            key and value of each member, with this bound to the containing
            object. The value that is returned from your method will be
            serialized. If your method returns undefined, then the member will
            be excluded from the serialization.

            If the replacer parameter is an array of strings, then it will be
            used to select the members to be serialized. It filters the results
            such that only members with keys listed in the replacer array are
            stringified.

            Values that do not have JSON representations, such as undefined or
            functions, will not be serialized. Such values in objects will be
            dropped; in arrays they will be replaced with null. You can use
            a replacer function to replace those with JSON values.
            JSON.stringify(undefined) returns undefined.

            The optional space parameter produces a stringification of the
            value that is filled with line breaks and indentation to make it
            easier to read.

            If the space parameter is a non-empty string, then that string will
            be used for indentation. If the space parameter is a number, then
            the indentation will be that many spaces.

            Example:

            text = JSON.stringify(['e', {pluribus: 'unum'}]);
            // text is '["e",{"pluribus":"unum"}]'


            text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
            // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

            text = JSON.stringify([new Date()], function (key, value) {
                return this[key] instanceof Date 
                    ? 'Date(' + this[key] + ')' 
                    : value;
            });
            // text is '["Date(---current time---)"]'


        JSON.parse(text, reviver)
            This method parses a JSON text to produce an object or array.
            It can throw a SyntaxError exception.

            The optional reviver parameter is a function that can filter and
            transform the results. It receives each of the keys and values,
            and its return value is used instead of the original value.
            If it returns what it received, then the structure is not modified.
            If it returns undefined then the member is deleted.

            Example:

            // Parse the text. Values that look like ISO date strings will
            // be converted to Date objects.

            myData = JSON.parse(text, function (key, value) {
                var a;
                if (typeof value === 'string') {
                    a =
/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
                    if (a) {
                        return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
                            +a[5], +a[6]));
                    }
                }
                return value;
            });

            myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
                var d;
                if (typeof value === 'string' &&
                        value.slice(0, 5) === 'Date(' &&
                        value.slice(-1) === ')') {
                    d = new Date(value.slice(5, -1));
                    if (d) {
                        return d;
                    }
                }
                return value;
            });


    This is a reference implementation. You are free to copy, modify, or
    redistribute.
*/

/*jslint 
    eval, for, this 
*/

/*property
    JSON, apply, call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/

// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

'use strict';

if (typeof JSON !== 'object') {
    JSON = {};
}

(function () {
    'use strict';

    var rx_one = /^[\],:{}\s]*$/,
        rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,
        rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,
        rx_four = /(?:^|:|,)(?:\s*\[)+/g,
        rx_escapable = /[\\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10 ? '0' + n : n;
    }

    function this_value() {
        return this.valueOf();
    }

    if (typeof Date.prototype.toJSON !== 'function') {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf()) ? this.getUTCFullYear() + '-' + f(this.getUTCMonth() + 1) + '-' + f(this.getUTCDate()) + 'T' + f(this.getUTCHours()) + ':' + f(this.getUTCMinutes()) + ':' + f(this.getUTCSeconds()) + 'Z' : null;
        };

        Boolean.prototype.toJSON = this_value;
        Number.prototype.toJSON = this_value;
        String.prototype.toJSON = this_value;
    }

    var gap, indent, meta, rep;

    function quote(string) {

        // If the string contains no control characters, no quote characters, and no
        // backslash characters, then we can safely slap some quotes around it.
        // Otherwise we must also replace the offending characters with safe escape
        // sequences.

        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string) ? '"' + string.replace(rx_escapable, function (a) {
            var c = meta[a];
            return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
    }

    function str(key, holder) {

        // Produce a string from holder[key].

        var i,
            // The loop counter.
        k,
            // The member key.
        v,
            // The member value.
        length,
            mind = gap,
            partial,
            value = holder[key];

        // If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
            value = value.toJSON(key);
        }

        // If we were called with a replacer function, then call the replacer to
        // obtain a replacement value.

        if (typeof rep === 'function') {
            value = rep.call(holder, key, value);
        }

        // What happens next depends on the value's type.

        switch (typeof value) {
            case 'string':
                return quote(value);

            case 'number':

                // JSON numbers must be finite. Encode non-finite numbers as null.

                return isFinite(value) ? String(value) : 'null';

            case 'boolean':
            case 'null':

                // If the value is a boolean or null, convert it to a string. Note:
                // typeof null does not produce 'null'. The case is included here in
                // the remote chance that this gets fixed someday.

                return String(value);

            // If the type is 'object', we might be dealing with an object or an array or
            // null.

            case 'object':

                // Due to a specification blunder in ECMAScript, typeof null is 'object',
                // so watch out for that case.

                if (!value) {
                    return 'null';
                }

                // Make an array to hold the partial results of stringifying this object value.

                gap += indent;
                partial = [];

                // Is the value an array?

                if (Object.prototype.toString.apply(value) === '[object Array]') {

                    // The value is an array. Stringify every element. Use null as a placeholder
                    // for non-JSON values.

                    length = value.length;
                    for (i = 0; i < length; i += 1) {
                        partial[i] = str(i, value) || 'null';
                    }

                    // Join all of the elements together, separated with commas, and wrap them in
                    // brackets.

                    v = partial.length === 0 ? '[]' : gap ? '[\n' + gap + partial.join(',\n' + gap) + '\n' + mind + ']' : '[' + partial.join(',') + ']';
                    gap = mind;
                    return v;
                }

                // If the replacer is an array, use it to select the members to be stringified.

                if (rep && typeof rep === 'object') {
                    length = rep.length;
                    for (i = 0; i < length; i += 1) {
                        if (typeof rep[i] === 'string') {
                            k = rep[i];
                            v = str(k, value);
                            if (v) {
                                partial.push(quote(k) + (gap ? ': ' : ':') + v);
                            }
                        }
                    }
                } else {

                    // Otherwise, iterate through all of the keys in the object.

                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = str(k, value);
                            if (v) {
                                partial.push(quote(k) + (gap ? ': ' : ':') + v);
                            }
                        }
                    }
                }

                // Join all of the member texts together, separated with commas,
                // and wrap them in braces.

                v = partial.length === 0 ? '{}' : gap ? '{\n' + gap + partial.join(',\n' + gap) + '\n' + mind + '}' : '{' + partial.join(',') + '}';
                gap = mind;
                return v;
        }
    }

    // If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== 'function') {
        meta = { // table of character substitutions
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"': '\\"',
            '\\': '\\\\'
        };
        JSON.stringify = function (value, replacer, space) {

            // The stringify method takes a value and an optional replacer, and an optional
            // space parameter, and returns a JSON text. The replacer can be a function
            // that can replace values, or an array of strings that will select the keys.
            // A default replacer method can be provided. Use of the space parameter can
            // produce text that is more easily readable.

            var i;
            gap = '';
            indent = '';

            // If the space parameter is a number, make an indent string containing that
            // many spaces.

            if (typeof space === 'number') {
                for (i = 0; i < space; i += 1) {
                    indent += ' ';
                }

                // If the space parameter is a string, it will be used as the indent string.
            } else if (typeof space === 'string') {
                    indent = space;
                }

            // If there is a replacer, it must be a function or an array.
            // Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== 'function' && (typeof replacer !== 'object' || typeof replacer.length !== 'number')) {
                throw new Error('JSON.stringify');
            }

            // Make a fake root object containing our value under the key of ''.
            // Return the result of stringifying the value.

            return str('', { '': value });
        };
    }

    // If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text, reviver) {

            // The parse method takes a text and an optional reviver function, and returns
            // a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

                // The walk method is used to recursively walk the resulting structure so
                // that modifications can be made.

                var k,
                    v,
                    value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }

            // Parsing happens in four stages. In the first stage, we replace certain
            // Unicode characters with escape sequences. JavaScript handles many characters
            // incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            rx_dangerous.lastIndex = 0;
            if (rx_dangerous.test(text)) {
                text = text.replace(rx_dangerous, function (a) {
                    return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

            // In the second stage, we run the text against regular expressions that look
            // for non-JSON patterns. We are especially concerned with '()' and 'new'
            // because they can cause invocation, and '=' because it can cause mutation.
            // But just to be safe, we want to reject all unexpected forms.

            // We split the second stage into 4 regexp operations in order to work around
            // crippling inefficiencies in IE's and Safari's regexp engines. First we
            // replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
            // replace all simple value tokens with ']' characters. Third, we delete all
            // open brackets that follow a colon or comma or that begin the text. Finally,
            // we look to see that the remaining characters are only whitespace or ']' or
            // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (rx_one.test(text.replace(rx_two, '@').replace(rx_three, ']').replace(rx_four, ''))) {

                // In the third stage we use the eval function to compile the text into a
                // JavaScript structure. The '{' operator is subject to a syntactic ambiguity
                // in JavaScript: it can begin a block or an object literal. We wrap the text
                // in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

                // In the optional fourth stage, we recursively walk the new structure, passing
                // each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function' ? walk({ '': j }, '') : j;
            }

            // If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        };
    }
})();

},{}],12:[function(require,module,exports){
(function (global){
"use strict";

module.exports = (function () {
	// Store.js
	var store = {},
	    win = typeof window != 'undefined' ? window : global,
	    doc = win.document,
	    localStorageName = 'localStorage',
	    scriptTag = 'script',
	    storage;

	store.disabled = false;
	store.version = '1.3.20';
	store.set = function (key, value) {};
	store.get = function (key, defaultVal) {};
	store.has = function (key) {
		return store.get(key) !== undefined;
	};
	store.remove = function (key) {};
	store.clear = function () {};
	store.transact = function (key, defaultVal, transactionFn) {
		if (transactionFn == null) {
			transactionFn = defaultVal;
			defaultVal = null;
		}
		if (defaultVal == null) {
			defaultVal = {};
		}
		var val = store.get(key, defaultVal);
		transactionFn(val);
		store.set(key, val);
	};
	store.getAll = function () {
		var ret = {};
		store.forEach(function (key, val) {
			ret[key] = val;
		});
		return ret;
	};
	store.forEach = function () {};
	store.serialize = function (value) {
		return JSON.stringify(value);
	};
	store.deserialize = function (value) {
		if (typeof value != 'string') {
			return undefined;
		}
		try {
			return JSON.parse(value);
		} catch (e) {
			return value || undefined;
		}
	};

	// Functions to encapsulate questionable FireFox 3.6.13 behavior
	// when about.config::dom.storage.enabled === false
	// See https://github.com/marcuswestin/store.js/issues#issue/13
	function isLocalStorageNameSupported() {
		try {
			return localStorageName in win && win[localStorageName];
		} catch (err) {
			return false;
		}
	}

	if (isLocalStorageNameSupported()) {
		storage = win[localStorageName];
		store.set = function (key, val) {
			if (val === undefined) {
				return store.remove(key);
			}
			storage.setItem(key, store.serialize(val));
			return val;
		};
		store.get = function (key, defaultVal) {
			var val = store.deserialize(storage.getItem(key));
			return val === undefined ? defaultVal : val;
		};
		store.remove = function (key) {
			storage.removeItem(key);
		};
		store.clear = function () {
			storage.clear();
		};
		store.forEach = function (callback) {
			for (var i = 0; i < storage.length; i++) {
				var key = storage.key(i);
				callback(key, store.get(key));
			}
		};
	} else if (doc && doc.documentElement.addBehavior) {
		var storageOwner, storageContainer;
		// Since #userData storage applies only to specific paths, we need to
		// somehow link our data to a specific path.  We choose /favicon.ico
		// as a pretty safe option, since all browsers already make a request to
		// this URL anyway and being a 404 will not hurt us here.  We wrap an
		// iframe pointing to the favicon in an ActiveXObject(htmlfile) object
		// (see: http://msdn.microsoft.com/en-us/library/aa752574(v=VS.85).aspx)
		// since the iframe access rules appear to allow direct access and
		// manipulation of the document element, even for a 404 page.  This
		// document can be used instead of the current document (which would
		// have been limited to the current path) to perform #userData storage.
		try {
			storageContainer = new ActiveXObject('htmlfile');
			storageContainer.open();
			storageContainer.write('<' + scriptTag + '>document.w=window</' + scriptTag + '><iframe src="/favicon.ico"></iframe>');
			storageContainer.close();
			storageOwner = storageContainer.w.frames[0].document;
			storage = storageOwner.createElement('div');
		} catch (e) {
			// somehow ActiveXObject instantiation failed (perhaps some special
			// security settings or otherwse), fall back to per-path storage
			storage = doc.createElement('div');
			storageOwner = doc.body;
		}
		var withIEStorage = function withIEStorage(storeFunction) {
			return function () {
				var args = Array.prototype.slice.call(arguments, 0);
				args.unshift(storage);
				// See http://msdn.microsoft.com/en-us/library/ms531081(v=VS.85).aspx
				// and http://msdn.microsoft.com/en-us/library/ms531424(v=VS.85).aspx
				storageOwner.appendChild(storage);
				storage.addBehavior('#default#userData');
				storage.load(localStorageName);
				var result = storeFunction.apply(store, args);
				storageOwner.removeChild(storage);
				return result;
			};
		};

		// In IE7, keys cannot start with a digit or contain certain chars.
		// See https://github.com/marcuswestin/store.js/issues/40
		// See https://github.com/marcuswestin/store.js/issues/83
		var forbiddenCharsRegex = new RegExp("[!\"#$%&'()*+,/\\\\:;<=>?@[\\]^`{|}~]", "g");
		var ieKeyFix = function ieKeyFix(key) {
			return key.replace(/^d/, '___$&').replace(forbiddenCharsRegex, '___');
		};
		store.set = withIEStorage(function (storage, key, val) {
			key = ieKeyFix(key);
			if (val === undefined) {
				return store.remove(key);
			}
			storage.setAttribute(key, store.serialize(val));
			storage.save(localStorageName);
			return val;
		});
		store.get = withIEStorage(function (storage, key, defaultVal) {
			key = ieKeyFix(key);
			var val = store.deserialize(storage.getAttribute(key));
			return val === undefined ? defaultVal : val;
		});
		store.remove = withIEStorage(function (storage, key) {
			key = ieKeyFix(key);
			storage.removeAttribute(key);
			storage.save(localStorageName);
		});
		store.clear = withIEStorage(function (storage) {
			var attributes = storage.XMLDocument.documentElement.attributes;
			storage.load(localStorageName);
			for (var i = attributes.length - 1; i >= 0; i--) {
				storage.removeAttribute(attributes[i].name);
			}
			storage.save(localStorageName);
		});
		store.forEach = withIEStorage(function (storage, callback) {
			var attributes = storage.XMLDocument.documentElement.attributes;
			for (var i = 0, attr; attr = attributes[i]; ++i) {
				callback(attr.name, store.deserialize(storage.getAttribute(attr.name)));
			}
		});
	}

	try {
		var testKey = '__storejs__';
		store.set(testKey, testKey);
		if (store.get(testKey) != testKey) {
			store.disabled = true;
		}
		store.remove(testKey);
	} catch (e) {
		store.disabled = true;
	}
	store.enabled = !store.disabled;

	return store;
})();

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuLi8uLi9BcHBEYXRhL1JvYW1pbmcvbnBtL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvcHVueWNvZGUvcHVueWNvZGUuanMiLCIuLi8uLi9BcHBEYXRhL1JvYW1pbmcvbnBtL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2RlY29kZS5qcyIsIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIi4uLy4uL0FwcERhdGEvUm9hbWluZy9ucG0vbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy91cmwvdXJsLmpzIiwiLi4vLi4vQXBwRGF0YS9Sb2FtaW5nL25wbS9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL3VybC91dGlsLmpzIiwiQzovVXNlcnMvcGJveXNlbi9naXQvd3hhcHBzL3NyYy9kcmF3c2ltL21haW4uanMiLCJDOi9Vc2Vycy9wYm95c2VuL2dpdC93eGFwcHMvc3JjL3V0aWxzL2F4aXMuanMiLCJDOi9Vc2Vycy9wYm95c2VuL2dpdC93eGFwcHMvc3JjL3V0aWxzL2dyYXBoLmpzIiwiQzovVXNlcnMvcGJveXNlbi9naXQvd3hhcHBzL3NyYy91dGlscy9pbmRleC5qcyIsIkM6L1VzZXJzL3Bib3lzZW4vZ2l0L3d4YXBwcy9zcmMvdXRpbHMvanNvbjIuanMiLCJDOi9Vc2Vycy9wYm95c2VuL2dpdC93eGFwcHMvc3JjL3V0aWxzL3N0b3JlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3JoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7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QUMsTUFBTSxDQUFDLE1BQU0sRUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUNyQyxZQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQTtBQUNuQixVQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBQyxFQUFFLEVBQUMsT0FBTyxDQUFDLENBQUE7QUFDM0IsWUFBTTtLQUNOO0FBQ0QsVUFBSztBQUFBLEFBQ04sUUFBSyxRQUFRO0FBQ1osUUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUM3QyxZQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQTtBQUNuQixVQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBQyxFQUFFLEVBQUMsT0FBTyxDQUFDLENBQUE7QUFDM0IsWUFBTTtLQUNOO0FBQ0QsVUFBSztBQUFBLEFBQ04sUUFBSyxTQUFTO0FBQ2IsUUFBSSxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUN0QyxZQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQTtBQUNuQixVQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBQyxFQUFFLEVBQUMsT0FBTyxDQUFDLENBQUE7QUFDM0IsWUFBTTtLQUNOO0FBQ0QsVUFBSztBQUFBLEFBQ04sUUFBSyxVQUFVO0FBQ2QsUUFBSSxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtBQUN2QyxZQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBQyxDQUFDLENBQUMsQ0FBQTtBQUNuQixVQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssR0FBQyxFQUFFLEVBQUMsT0FBTyxDQUFDLENBQUE7QUFDM0IsWUFBTTtLQUNOO0FBQ0QsVUFBSztBQUFBLEFBQ04sUUFBSyxNQUFNO0FBQ1Ys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Q0FBQyxDQUFBO0VBQ3JCLENBQUMsT0FBTSxDQUFDLEVBQUU7QUFDVixPQUFLLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQTtFQUNyQjtBQUNELE1BQUssQ0FBQyxPQUFPLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFBOztBQUUvQixRQUFPLEtBQUssQ0FBQTtDQUNaLENBQUEsRUFBRSxBQUFDLENBQUEiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohIGh0dHBzOi8vbXRocy5iZS9wdW55Y29kZSB2MS40LjAgYnkgQG1hdGhpYXMgKi9cbjsoZnVuY3Rpb24ocm9vdCkge1xuXG5cdC8qKiBEZXRlY3QgZnJlZSB2YXJpYWJsZXMgKi9cblx0dmFyIGZyZWVFeHBvcnRzID0gdHlwZW9mIGV4cG9ydHMgPT0gJ29iamVjdCcgJiYgZXhwb3J0cyAmJlxuXHRcdCFleHBvcnRzLm5vZGVUeXBlICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHQhbW9kdWxlLm5vZGVUeXBlICYmIG1vZHVsZTtcblx0dmFyIGZyZWVHbG9iYWwgPSB0eXBlb2YgZ2xvYmFsID09ICdvYmplY3QnICYmIGdsb2JhbDtcblx0aWYgKFxuXHRcdGZyZWVHbG9iYWwuZ2xvYmFsID09PSBmcmVlR2xvYmFsIHx8XG5cdFx0ZnJlZUdsb2JhbC53aW5kb3cgPT09IGZyZWVHbG9iYWwgfHxcblx0XHRmcmVlR2xvYmFsLnNlbGYgPT09IGZyZWVHbG9iYWxcblx0KSB7XG5cdFx0cm9vdCA9IGZyZWVHbG9iYWw7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGBwdW55Y29kZWAgb2JqZWN0LlxuXHQgKiBAbmFtZSBwdW55Y29kZVxuXHQgKiBAdHlwZSBPYmplY3Rcblx0ICovXG5cdHZhciBwdW55Y29kZSxcblxuXHQvKiogSGlnaGVzdCBwb3NpdGl2ZSBzaWduZWQgMzItYml0IGZsb2F0IHZhbHVlICovXG5cdG1heEludCA9IDIxNDc0ODM2NDcsIC8vIGFrYS4gMHg3RkZGRkZGRiBvciAyXjMxLTFcblxuXHQvKiogQm9vdHN0cmluZyBwYXJhbWV0ZXJzICovXG5cdGJhc2UgPSAzNixcblx0dE1pbiA9IDEsXG5cdHRNYXggPSAyNixcblx0c2tldyA9IDM4LFxuXHRkYW1wID0gNzAwLFxuXHRpbml0aWFsQmlhcyA9IDcyLFxuXHRpbml0aWFsTiA9IDEyOCwgLy8gMHg4MFxuXHRkZWxpbWl0ZXIgPSAnLScsIC8vICdcXHgyRCdcblxuXHQvKiogUmVndWxhciBleHByZXNzaW9ucyAqL1xuXHRyZWdleFB1bnljb2RlID0gL154bi0tLyxcblx0cmVnZXhOb25BU0NJSSA9IC9bXlxceDIwLVxceDdFXS8sIC8vIHVucHJpbnRhYmxlIEFTQ0lJIGNoYXJzICsgbm9uLUFTQ0lJIGNoYXJzXG5cdHJlZ2V4U2VwYXJhdG9ycyA9IC9bXFx4MkVcXHUzMDAyXFx1RkYwRVxcdUZGNjFdL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IG5ldyBSYW5nZUVycm9yKGVycm9yc1t0eXBlXSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBnZW5lcmljIGBBcnJheSNtYXBgIHV0aWxpdHkgZnVuY3Rpb24uXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IFRoZSBhcnJheSB0byBpdGVyYXRlIG92ZXIuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeSBhcnJheVxuXHQgKiBpdGVtLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IEEgbmV3IGFycmF5IG9mIHZhbHVlcyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2sgZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXAoYXJyYXksIGZuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDtcblx0XHR2YXIgcmVzdWx0ID0gW107XG5cdFx0d2hpbGUgKGxlbmd0aC0tKSB7XG5cdFx0XHRyZXN1bHRbbGVuZ3RoXSA9IGZuKGFycmF5W2xlbmd0aF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc2ltcGxlIGBBcnJheSNtYXBgLWxpa2Ugd3JhcHBlciB0byB3b3JrIHdpdGggZG9tYWluIG5hbWUgc3RyaW5ncyBvciBlbWFpbFxuXHQgKiBhZGRyZXNzZXMuXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBkb21haW4gVGhlIGRvbWFpbiBuYW1lIG9yIGVtYWlsIGFkZHJlc3MuXG5cdCAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIFRoZSBmdW5jdGlvbiB0aGF0IGdldHMgY2FsbGVkIGZvciBldmVyeVxuXHQgKiBjaGFyYWN0ZXIuXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgc3RyaW5nIG9mIGNoYXJhY3RlcnMgcmV0dXJuZWQgYnkgdGhlIGNhbGxiYWNrXG5cdCAqIGZ1bmN0aW9uLlxuXHQgKi9cblx0ZnVuY3Rpb24gbWFwRG9tYWluKHN0cmluZywgZm4pIHtcblx0XHR2YXIgcGFydHMgPSBzdHJpbmcuc3BsaXQoJ0AnKTtcblx0XHR2YXIgcmVzdWx0ID0gJyc7XG5cdFx0aWYgKHBhcnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdC8vIEluIGVtYWlsIGFkZHJlc3Nlcywgb25seSB0aGUgZG9tYWluIG5hbWUgc2hvdWxkIGJlIHB1bnljb2RlZC4gTGVhdmVcblx0XHRcdC8vIHRoZSBsb2NhbCBwYXJ0IChpLmUuIGV2ZXJ5dGhpbmcgdXAgdG8gYEBgKSBpbnRhY3QuXG5cdFx0XHRyZXN1bHQgPSBwYXJ0c1swXSArICdAJztcblx0XHRcdHN0cmluZyA9IHBhcnRzWzFdO1xuXHRcdH1cblx0XHQvLyBBdm9pZCBgc3BsaXQocmVnZXgpYCBmb3IgSUU4IGNvbXBhdGliaWxpdHkuIFNlZSAjMTcuXG5cdFx0c3RyaW5nID0gc3RyaW5nLnJlcGxhY2UocmVnZXhTZXBhcmF0b3JzLCAnXFx4MkUnKTtcblx0XHR2YXIgbGFiZWxzID0gc3RyaW5nLnNwbGl0KCcuJyk7XG5cdFx0dmFyIGVuY29kZWQgPSBtYXAobGFiZWxzLCBmbikuam9pbignLicpO1xuXHRcdHJldHVybiByZXN1bHQgKyBlbmNvZGVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgbnVtZXJpYyBjb2RlIHBvaW50cyBvZiBlYWNoIFVuaWNvZGVcblx0ICogY2hhcmFjdGVyIGluIHRoZSBzdHJpbmcuIFdoaWxlIEphdmFTY3JpcHQgdXNlcyBVQ1MtMiBpbnRlcm5hbGx5LFxuXHQgKiB0aGlzIGZ1bmN0aW9uIHdpbGwgY29udmVydCBhIHBhaXIgb2Ygc3Vycm9nYXRlIGhhbHZlcyAoZWFjaCBvZiB3aGljaFxuXHQgKiBVQ1MtMiBleHBvc2VzIGFzIHNlcGFyYXRlIGNoYXJhY3RlcnMpIGludG8gYSBzaW5nbGUgY29kZSBwb2ludCxcblx0ICogbWF0Y2hpbmcgVVRGLTE2LlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmVuY29kZWBcblx0ICogQHNlZSA8aHR0cHM6Ly9tYXRoaWFzYnluZW5zLmJlL25vdGVzL2phdmFzY3JpcHQtZW5jb2Rpbmc+XG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGRlY29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIFRoZSBVbmljb2RlIGlucHV0IHN0cmluZyAoVUNTLTIpLlxuXHQgKiBAcmV0dXJucyB7QXJyYXl9IFRoZSBuZXcgYXJyYXkgb2YgY29kZSBwb2ludHMuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZGVjb2RlKHN0cmluZykge1xuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgY291bnRlciA9IDAsXG5cdFx0ICAgIGxlbmd0aCA9IHN0cmluZy5sZW5ndGgsXG5cdFx0ICAgIHZhbHVlLFxuXHRcdCAgICBleHRyYTtcblx0XHR3aGlsZSAoY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0dmFsdWUgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0aWYgKHZhbHVlID49IDB4RDgwMCAmJiB2YWx1ZSA8PSAweERCRkYgJiYgY291bnRlciA8IGxlbmd0aCkge1xuXHRcdFx0XHQvLyBoaWdoIHN1cnJvZ2F0ZSwgYW5kIHRoZXJlIGlzIGEgbmV4dCBjaGFyYWN0ZXJcblx0XHRcdFx0ZXh0cmEgPSBzdHJpbmcuY2hhckNvZGVBdChjb3VudGVyKyspO1xuXHRcdFx0XHRpZiAoKGV4dHJhICYgMHhGQzAwKSA9PSAweERDMDApIHsgLy8gbG93IHN1cnJvZ2F0ZVxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKCgodmFsdWUgJiAweDNGRikgPDwgMTApICsgKGV4dHJhICYgMHgzRkYpICsgMHgxMDAwMCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdW5tYXRjaGVkIHN1cnJvZ2F0ZTsgb25seSBhcHBlbmQgdGhpcyBjb2RlIHVuaXQsIGluIGNhc2UgdGhlIG5leHRcblx0XHRcdFx0XHQvLyBjb2RlIHVuaXQgaXMgdGhlIGhpZ2ggc3Vycm9nYXRlIG9mIGEgc3Vycm9nYXRlIHBhaXJcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y291bnRlci0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQ7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIHN0cmluZyBiYXNlZCBvbiBhbiBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAc2VlIGBwdW55Y29kZS51Y3MyLmRlY29kZWBcblx0ICogQG1lbWJlck9mIHB1bnljb2RlLnVjczJcblx0ICogQG5hbWUgZW5jb2RlXG5cdCAqIEBwYXJhbSB7QXJyYXl9IGNvZGVQb2ludHMgVGhlIGFycmF5IG9mIG51bWVyaWMgY29kZSBwb2ludHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBuZXcgVW5pY29kZSBzdHJpbmcgKFVDUy0yKS5cblx0ICovXG5cdGZ1bmN0aW9uIHVjczJlbmNvZGUoYXJyYXkpIHtcblx0XHRyZXR1cm4gbWFwKGFycmF5LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFyIG91dHB1dCA9ICcnO1xuXHRcdFx0aWYgKHZhbHVlID4gMHhGRkZGKSB7XG5cdFx0XHRcdHZhbHVlIC09IDB4MTAwMDA7XG5cdFx0XHRcdG91dHB1dCArPSBzdHJpbmdGcm9tQ2hhckNvZGUodmFsdWUgPj4+IDEwICYgMHgzRkYgfCAweEQ4MDApO1xuXHRcdFx0XHR2YWx1ZSA9IDB4REMwMCB8IHZhbHVlICYgMHgzRkY7XG5cdFx0XHR9XG5cdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSkuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBiYXNpYyBjb2RlIHBvaW50IGludG8gYSBkaWdpdC9pbnRlZ2VyLlxuXHQgKiBAc2VlIGBkaWdpdFRvQmFzaWMoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGNvZGVQb2ludCBUaGUgYmFzaWMgbnVtZXJpYyBjb2RlIHBvaW50IHZhbHVlLlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgbnVtZXJpYyB2YWx1ZSBvZiBhIGJhc2ljIGNvZGUgcG9pbnQgKGZvciB1c2UgaW5cblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpbiB0aGUgcmFuZ2UgYDBgIHRvIGBiYXNlIC0gMWAsIG9yIGBiYXNlYCBpZlxuXHQgKiB0aGUgY29kZSBwb2ludCBkb2VzIG5vdCByZXByZXNlbnQgYSB2YWx1ZS5cblx0ICovXG5cdGZ1bmN0aW9uIGJhc2ljVG9EaWdpdChjb2RlUG9pbnQpIHtcblx0XHRpZiAoY29kZVBvaW50IC0gNDggPCAxMCkge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDIyO1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gNjUgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDY1O1xuXHRcdH1cblx0XHRpZiAoY29kZVBvaW50IC0gOTcgPCAyNikge1xuXHRcdFx0cmV0dXJuIGNvZGVQb2ludCAtIDk3O1xuXHRcdH1cblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIGRpZ2l0L2ludGVnZXIgaW50byBhIGJhc2ljIGNvZGUgcG9pbnQuXG5cdCAqIEBzZWUgYGJhc2ljVG9EaWdpdCgpYFxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge051bWJlcn0gZGlnaXQgVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgYmFzaWMgY29kZSBwb2ludCB3aG9zZSB2YWx1ZSAod2hlbiB1c2VkIGZvclxuXHQgKiByZXByZXNlbnRpbmcgaW50ZWdlcnMpIGlzIGBkaWdpdGAsIHdoaWNoIG5lZWRzIHRvIGJlIGluIHRoZSByYW5nZVxuXHQgKiBgMGAgdG8gYGJhc2UgLSAxYC4gSWYgYGZsYWdgIGlzIG5vbi16ZXJvLCB0aGUgdXBwZXJjYXNlIGZvcm0gaXNcblx0ICogdXNlZDsgZWxzZSwgdGhlIGxvd2VyY2FzZSBmb3JtIGlzIHVzZWQuIFRoZSBiZWhhdmlvciBpcyB1bmRlZmluZWRcblx0ICogaWYgYGZsYWdgIGlzIG5vbi16ZXJvIGFuZCBgZGlnaXRgIGhhcyBubyB1cHBlcmNhc2UgZm9ybS5cblx0ICovXG5cdGZ1bmN0aW9uIGRpZ2l0VG9CYXNpYyhkaWdpdCwgZmxhZykge1xuXHRcdC8vICAwLi4yNSBtYXAgdG8gQVNDSUkgYS4ueiBvciBBLi5aXG5cdFx0Ly8gMjYuLjM1IG1hcCB0byBBU0NJSSAwLi45XG5cdFx0cmV0dXJuIGRpZ2l0ICsgMjIgKyA3NSAqIChkaWdpdCA8IDI2KSAtICgoZmxhZyAhPSAwKSA8PCA1KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaWFzIGFkYXB0YXRpb24gZnVuY3Rpb24gYXMgcGVyIHNlY3Rpb24gMy40IG9mIFJGQyAzNDkyLlxuXHQgKiBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gYWRhcHQoZGVsdGEsIG51bVBvaW50cywgZmlyc3RUaW1lKSB7XG5cdFx0dmFyIGsgPSAwO1xuXHRcdGRlbHRhID0gZmlyc3RUaW1lID8gZmxvb3IoZGVsdGEgLyBkYW1wKSA6IGRlbHRhID4+IDE7XG5cdFx0ZGVsdGEgKz0gZmxvb3IoZGVsdGEgLyBudW1Qb2ludHMpO1xuXHRcdGZvciAoLyogbm8gaW5pdGlhbGl6YXRpb24gKi87IGRlbHRhID4gYmFzZU1pbnVzVE1pbiAqIHRNYXggPj4gMTsgayArPSBiYXNlKSB7XG5cdFx0XHRkZWx0YSA9IGZsb29yKGRlbHRhIC8gYmFzZU1pbnVzVE1pbik7XG5cdFx0fVxuXHRcdHJldHVybiBmbG9vcihrICsgKGJhc2VNaW51c1RNaW4gKyAxKSAqIGRlbHRhIC8gKGRlbHRhICsgc2tldykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scyB0byBhIHN0cmluZyBvZiBVbmljb2RlXG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGRlY29kZShpbnB1dCkge1xuXHRcdC8vIERvbid0IHVzZSBVQ1MtMlxuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGgsXG5cdFx0ICAgIG91dCxcblx0XHQgICAgaSA9IDAsXG5cdFx0ICAgIG4gPSBpbml0aWFsTixcblx0XHQgICAgYmlhcyA9IGluaXRpYWxCaWFzLFxuXHRcdCAgICBiYXNpYyxcblx0XHQgICAgaixcblx0XHQgICAgaW5kZXgsXG5cdFx0ICAgIG9sZGksXG5cdFx0ICAgIHcsXG5cdFx0ICAgIGssXG5cdFx0ICAgIGRpZ2l0LFxuXHRcdCAgICB0LFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgYmFzZU1pbnVzVDtcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHM6IGxldCBgYmFzaWNgIGJlIHRoZSBudW1iZXIgb2YgaW5wdXQgY29kZVxuXHRcdC8vIHBvaW50cyBiZWZvcmUgdGhlIGxhc3QgZGVsaW1pdGVyLCBvciBgMGAgaWYgdGhlcmUgaXMgbm9uZSwgdGhlbiBjb3B5XG5cdFx0Ly8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cblx0XHRiYXNpYyA9IGlucHV0Lmxhc3RJbmRleE9mKGRlbGltaXRlcik7XG5cdFx0aWYgKGJhc2ljIDwgMCkge1xuXHRcdFx0YmFzaWMgPSAwO1xuXHRcdH1cblxuXHRcdGZvciAoaiA9IDA7IGogPCBiYXNpYzsgKytqKSB7XG5cdFx0XHQvLyBpZiBpdCdzIG5vdCBhIGJhc2ljIGNvZGUgcG9pbnRcblx0XHRcdGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcblx0XHRcdFx0ZXJyb3IoJ25vdC1iYXNpYycpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0LnB1c2goaW5wdXQuY2hhckNvZGVBdChqKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBkZWNvZGluZyBsb29wOiBzdGFydCBqdXN0IGFmdGVyIHRoZSBsYXN0IGRlbGltaXRlciBpZiBhbnkgYmFzaWMgY29kZVxuXHRcdC8vIHBvaW50cyB3ZXJlIGNvcGllZDsgc3RhcnQgYXQgdGhlIGJlZ2lubmluZyBvdGhlcndpc2UuXG5cblx0XHRmb3IgKGluZGV4ID0gYmFzaWMgPiAwID8gYmFzaWMgKyAxIDogMDsgaW5kZXggPCBpbnB1dExlbmd0aDsgLyogbm8gZmluYWwgZXhwcmVzc2lvbiAqLykge1xuXG5cdFx0XHQvLyBgaW5kZXhgIGlzIHRoZSBpbmRleCBvZiB0aGUgbmV4dCBjaGFyYWN0ZXIgdG8gYmUgY29uc3VtZWQuXG5cdFx0XHQvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG5cdFx0XHQvLyB3aGljaCBnZXRzIGFkZGVkIHRvIGBpYC4gVGhlIG92ZXJmbG93IGNoZWNraW5nIGlzIGVhc2llclxuXHRcdFx0Ly8gaWYgd2UgaW5jcmVhc2UgYGlgIGFzIHdlIGdvLCB0aGVuIHN1YnRyYWN0IG9mZiBpdHMgc3RhcnRpbmdcblx0XHRcdC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG5cdFx0XHRmb3IgKG9sZGkgPSBpLCB3ID0gMSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cblx0XHRcdFx0aWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZ2l0ID0gYmFzaWNUb0RpZ2l0KGlucHV0LmNoYXJDb2RlQXQoaW5kZXgrKykpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGkgKz0gZGlnaXQgKiB3O1xuXHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPCB0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdGlmICh3ID4gZmxvb3IobWF4SW50IC8gYmFzZU1pbnVzVCkpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHcgKj0gYmFzZU1pbnVzVDtcblxuXHRcdFx0fVxuXG5cdFx0XHRvdXQgPSBvdXRwdXQubGVuZ3RoICsgMTtcblx0XHRcdGJpYXMgPSBhZGFwdChpIC0gb2xkaSwgb3V0LCBvbGRpID09IDApO1xuXG5cdFx0XHQvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuXHRcdFx0Ly8gaW5jcmVtZW50aW5nIGBuYCBlYWNoIHRpbWUsIHNvIHdlJ2xsIGZpeCB0aGF0IG5vdzpcblx0XHRcdGlmIChmbG9vcihpIC8gb3V0KSA+IG1heEludCAtIG4pIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG4gKz0gZmxvb3IoaSAvIG91dCk7XG5cdFx0XHRpICU9IG91dDtcblxuXHRcdFx0Ly8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dFxuXHRcdFx0b3V0cHV0LnNwbGljZShpKyssIDAsIG4pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVjczJlbmNvZGUob3V0cHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgKGUuZy4gYSBkb21haW4gbmFtZSBsYWJlbCkgdG8gYVxuXHQgKiBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seSBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBlbmNvZGUoaW5wdXQpIHtcblx0XHR2YXIgbixcblx0XHQgICAgZGVsdGEsXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50LFxuXHRcdCAgICBiYXNpY0xlbmd0aCxcblx0XHQgICAgYmlhcyxcblx0XHQgICAgaixcblx0XHQgICAgbSxcblx0XHQgICAgcSxcblx0XHQgICAgayxcblx0XHQgICAgdCxcblx0XHQgICAgY3VycmVudFZhbHVlLFxuXHRcdCAgICBvdXRwdXQgPSBbXSxcblx0XHQgICAgLyoqIGBpbnB1dExlbmd0aGAgd2lsbCBob2xkIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgaW4gYGlucHV0YC4gKi9cblx0XHQgICAgaW5wdXRMZW5ndGgsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG5cdFx0ICAgIGJhc2VNaW51c1QsXG5cdFx0ICAgIHFNaW51c1Q7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBpbnB1dCBpbiBVQ1MtMiB0byBVbmljb2RlXG5cdFx0aW5wdXQgPSB1Y3MyZGVjb2RlKGlucHV0KTtcblxuXHRcdC8vIENhY2hlIHRoZSBsZW5ndGhcblx0XHRpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aDtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHN0YXRlXG5cdFx0biA9IGluaXRpYWxOO1xuXHRcdGRlbHRhID0gMDtcblx0XHRiaWFzID0gaW5pdGlhbEJpYXM7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzXG5cdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IDB4ODApIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGN1cnJlbnRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhhbmRsZWRDUENvdW50ID0gYmFzaWNMZW5ndGggPSBvdXRwdXQubGVuZ3RoO1xuXG5cdFx0Ly8gYGhhbmRsZWRDUENvdW50YCBpcyB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIHRoYXQgaGF2ZSBiZWVuIGhhbmRsZWQ7XG5cdFx0Ly8gYGJhc2ljTGVuZ3RoYCBpcyB0aGUgbnVtYmVyIG9mIGJhc2ljIGNvZGUgcG9pbnRzLlxuXG5cdFx0Ly8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgLSBpZiBpdCBpcyBub3QgZW1wdHkgLSB3aXRoIGEgZGVsaW1pdGVyXG5cdFx0aWYgKGJhc2ljTGVuZ3RoKSB7XG5cdFx0XHRvdXRwdXQucHVzaChkZWxpbWl0ZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcblx0XHR3aGlsZSAoaGFuZGxlZENQQ291bnQgPCBpbnB1dExlbmd0aCkge1xuXG5cdFx0XHQvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG5cdFx0XHQvLyBsYXJnZXIgb25lOlxuXHRcdFx0Zm9yIChtID0gbWF4SW50LCBqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPj0gbiAmJiBjdXJyZW50VmFsdWUgPCBtKSB7XG5cdFx0XHRcdFx0bSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBgZGVsdGFgIGVub3VnaCB0byBhZHZhbmNlIHRoZSBkZWNvZGVyJ3MgPG4saT4gc3RhdGUgdG8gPG0sMD4sXG5cdFx0XHQvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvd1xuXHRcdFx0aGFuZGxlZENQQ291bnRQbHVzT25lID0gaGFuZGxlZENQQ291bnQgKyAxO1xuXHRcdFx0aWYgKG0gLSBuID4gZmxvb3IoKG1heEludCAtIGRlbHRhKSAvIGhhbmRsZWRDUENvdW50UGx1c09uZSkpIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG5cdFx0XHRuID0gbTtcblxuXHRcdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA9PSBuKSB7XG5cdFx0XHRcdFx0Ly8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXJcblx0XHRcdFx0XHRmb3IgKHEgPSBkZWx0YSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cdFx0XHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblx0XHRcdFx0XHRcdGlmIChxIDwgdCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHFNaW51c1QgPSBxIC0gdDtcblx0XHRcdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cSA9IGZsb29yKHFNaW51c1QgLyBiYXNlTWludXNUKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHEsIDApKSk7XG5cdFx0XHRcdFx0YmlhcyA9IGFkYXB0KGRlbHRhLCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsIGhhbmRsZWRDUENvdW50ID09IGJhc2ljTGVuZ3RoKTtcblx0XHRcdFx0XHRkZWx0YSA9IDA7XG5cdFx0XHRcdFx0KytoYW5kbGVkQ1BDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQrK2RlbHRhO1xuXHRcdFx0KytuO1xuXG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgb3IgYW4gZW1haWwgYWRkcmVzc1xuXHQgKiB0byBVbmljb2RlLiBPbmx5IHRoZSBQdW55Y29kZWQgcGFydHMgb2YgdGhlIGlucHV0IHdpbGwgYmUgY29udmVydGVkLCBpLmUuXG5cdCAqIGl0IGRvZXNuJ3QgbWF0dGVyIGlmIHlvdSBjYWxsIGl0IG9uIGEgc3RyaW5nIHRoYXQgaGFzIGFscmVhZHkgYmVlblxuXHQgKiBjb252ZXJ0ZWQgdG8gVW5pY29kZS5cblx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdCAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCBUaGUgUHVueWNvZGVkIGRvbWFpbiBuYW1lIG9yIGVtYWlsIGFkZHJlc3MgdG9cblx0ICogY29udmVydCB0byBVbmljb2RlLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgVW5pY29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gUHVueWNvZGVcblx0ICogc3RyaW5nLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9Vbmljb2RlKGlucHV0KSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihpbnB1dCwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhQdW55Y29kZS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyBkZWNvZGUoc3RyaW5nLnNsaWNlKDQpLnRvTG93ZXJDYXNlKCkpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgVW5pY29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgb3IgYW4gZW1haWwgYWRkcmVzcyB0b1xuXHQgKiBQdW55Y29kZS4gT25seSB0aGUgbm9uLUFTQ0lJIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCxcblx0ICogaS5lLiBpdCBkb2Vzbid0IG1hdHRlciBpZiB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQncyBhbHJlYWR5IGluXG5cdCAqIEFTQ0lJLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBkb21haW4gbmFtZSBvciBlbWFpbCBhZGRyZXNzIHRvIGNvbnZlcnQsIGFzIGFcblx0ICogVW5pY29kZSBzdHJpbmcuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBQdW55Y29kZSByZXByZXNlbnRhdGlvbiBvZiB0aGUgZ2l2ZW4gZG9tYWluIG5hbWUgb3Jcblx0ICogZW1haWwgYWRkcmVzcy5cblx0ICovXG5cdGZ1bmN0aW9uIHRvQVNDSUkoaW5wdXQpIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGlucHV0LCBmdW5jdGlvbihzdHJpbmcpIHtcblx0XHRcdHJldHVybiByZWdleE5vbkFTQ0lJLnRlc3Qoc3RyaW5nKVxuXHRcdFx0XHQ/ICd4bi0tJyArIGVuY29kZShzdHJpbmcpXG5cdFx0XHRcdDogc3RyaW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqIERlZmluZSB0aGUgcHVibGljIEFQSSAqL1xuXHRwdW55Y29kZSA9IHtcblx0XHQvKipcblx0XHQgKiBBIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGN1cnJlbnQgUHVueWNvZGUuanMgdmVyc2lvbiBudW1iZXIuXG5cdFx0ICogQG1lbWJlck9mIHB1bnljb2RlXG5cdFx0ICogQHR5cGUgU3RyaW5nXG5cdFx0ICovXG5cdFx0J3ZlcnNpb24nOiAnMS4zLjInLFxuXHRcdC8qKlxuXHRcdCAqIEFuIG9iamVjdCBvZiBtZXRob2RzIHRvIGNvbnZlcnQgZnJvbSBKYXZhU2NyaXB0J3MgaW50ZXJuYWwgY2hhcmFjdGVyXG5cdFx0ICogcmVwcmVzZW50YXRpb24gKFVDUy0yKSB0byBVbmljb2RlIGNvZGUgcG9pbnRzLCBhbmQgYmFjay5cblx0XHQgKiBAc2VlIDxodHRwczovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBPYmplY3Rcblx0XHQgKi9cblx0XHQndWNzMic6IHtcblx0XHRcdCdkZWNvZGUnOiB1Y3MyZGVjb2RlLFxuXHRcdFx0J2VuY29kZSc6IHVjczJlbmNvZGVcblx0XHR9LFxuXHRcdCdkZWNvZGUnOiBkZWNvZGUsXG5cdFx0J2VuY29kZSc6IGVuY29kZSxcblx0XHQndG9BU0NJSSc6IHRvQVNDSUksXG5cdFx0J3RvVW5pY29kZSc6IHRvVW5pY29kZVxuXHR9O1xuXG5cdC8qKiBFeHBvc2UgYHB1bnljb2RlYCAqL1xuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZSgncHVueWNvZGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBwdW55Y29kZTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiBmcmVlTW9kdWxlKSB7XG5cdFx0aWYgKG1vZHVsZS5leHBvcnRzID09IGZyZWVFeHBvcnRzKSB7XG5cdFx0XHQvLyBpbiBOb2RlLmpzLCBpby5qcywgb3IgUmluZ29KUyB2MC44LjArXG5cdFx0XHRmcmVlTW9kdWxlLmV4cG9ydHMgPSBwdW55Y29kZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gaW4gUmhpbm8gb3IgYSB3ZWIgYnJvd3NlclxuXHRcdHJvb3QucHVueWNvZGUgPSBwdW55Y29kZTtcblx0fVxuXG59KHRoaXMpKTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG1hcChvYmpba10sIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZSgncHVueWNvZGUnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsJyk7XG5cbmV4cG9ydHMucGFyc2UgPSB1cmxQYXJzZTtcbmV4cG9ydHMucmVzb2x2ZSA9IHVybFJlc29sdmU7XG5leHBvcnRzLnJlc29sdmVPYmplY3QgPSB1cmxSZXNvbHZlT2JqZWN0O1xuZXhwb3J0cy5mb3JtYXQgPSB1cmxGb3JtYXQ7XG5cbmV4cG9ydHMuVXJsID0gVXJsO1xuXG5mdW5jdGlvbiBVcmwoKSB7XG4gIHRoaXMucHJvdG9jb2wgPSBudWxsO1xuICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICB0aGlzLmF1dGggPSBudWxsO1xuICB0aGlzLmhvc3QgPSBudWxsO1xuICB0aGlzLnBvcnQgPSBudWxsO1xuICB0aGlzLmhvc3RuYW1lID0gbnVsbDtcbiAgdGhpcy5oYXNoID0gbnVsbDtcbiAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICB0aGlzLnF1ZXJ5ID0gbnVsbDtcbiAgdGhpcy5wYXRobmFtZSA9IG51bGw7XG4gIHRoaXMucGF0aCA9IG51bGw7XG4gIHRoaXMuaHJlZiA9IG51bGw7XG59XG5cbi8vIFJlZmVyZW5jZTogUkZDIDM5ODYsIFJGQyAxODA4LCBSRkMgMjM5NlxuXG4vLyBkZWZpbmUgdGhlc2UgaGVyZSBzbyBhdCBsZWFzdCB0aGV5IG9ubHkgaGF2ZSB0byBiZVxuLy8gY29tcGlsZWQgb25jZSBvbiB0aGUgZmlyc3QgbW9kdWxlIGxvYWQuXG52YXIgcHJvdG9jb2xQYXR0ZXJuID0gL14oW2EtejAtOS4rLV0rOikvaSxcbiAgICBwb3J0UGF0dGVybiA9IC86WzAtOV0qJC8sXG5cbiAgICAvLyBTcGVjaWFsIGNhc2UgZm9yIGEgc2ltcGxlIHBhdGggVVJMXG4gICAgc2ltcGxlUGF0aFBhdHRlcm4gPSAvXihcXC9cXC8/KD8hXFwvKVteXFw/XFxzXSopKFxcP1teXFxzXSopPyQvLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgcmVzZXJ2ZWQgZm9yIGRlbGltaXRpbmcgVVJMcy5cbiAgICAvLyBXZSBhY3R1YWxseSBqdXN0IGF1dG8tZXNjYXBlIHRoZXNlLlxuICAgIGRlbGltcyA9IFsnPCcsICc+JywgJ1wiJywgJ2AnLCAnICcsICdcXHInLCAnXFxuJywgJ1xcdCddLFxuXG4gICAgLy8gUkZDIDIzOTY6IGNoYXJhY3RlcnMgbm90IGFsbG93ZWQgZm9yIHZhcmlvdXMgcmVhc29ucy5cbiAgICB1bndpc2UgPSBbJ3snLCAnfScsICd8JywgJ1xcXFwnLCAnXicsICdgJ10uY29uY2F0KGRlbGltcyksXG5cbiAgICAvLyBBbGxvd2VkIGJ5IFJGQ3MsIGJ1dCBjYXVzZSBvZiBYU1MgYXR0YWNrcy4gIEFsd2F5cyBlc2NhcGUgdGhlc2UuXG4gICAgYXV0b0VzY2FwZSA9IFsnXFwnJ10uY29uY2F0KHVud2lzZSksXG4gICAgLy8gQ2hhcmFjdGVycyB0aGF0IGFyZSBuZXZlciBldmVyIGFsbG93ZWQgaW4gYSBob3N0bmFtZS5cbiAgICAvLyBOb3RlIHRoYXQgYW55IGludmFsaWQgY2hhcnMgYXJlIGFsc28gaGFuZGxlZCwgYnV0IHRoZXNlXG4gICAgLy8gYXJlIHRoZSBvbmVzIHRoYXQgYXJlICpleHBlY3RlZCogdG8gYmUgc2Vlbiwgc28gd2UgZmFzdC1wYXRoXG4gICAgLy8gdGhlbS5cbiAgICBub25Ib3N0Q2hhcnMgPSBbJyUnLCAnLycsICc/JywgJzsnLCAnIyddLmNvbmNhdChhdXRvRXNjYXBlKSxcbiAgICBob3N0RW5kaW5nQ2hhcnMgPSBbJy8nLCAnPycsICcjJ10sXG4gICAgaG9zdG5hbWVNYXhMZW4gPSAyNTUsXG4gICAgaG9zdG5hbWVQYXJ0UGF0dGVybiA9IC9eWythLXowLTlBLVpfLV17MCw2M30kLyxcbiAgICBob3N0bmFtZVBhcnRTdGFydCA9IC9eKFsrYS16MC05QS1aXy1dezAsNjN9KSguKikkLyxcbiAgICAvLyBwcm90b2NvbHMgdGhhdCBjYW4gYWxsb3cgXCJ1bnNhZmVcIiBhbmQgXCJ1bndpc2VcIiBjaGFycy5cbiAgICB1bnNhZmVQcm90b2NvbCA9IHtcbiAgICAgICdqYXZhc2NyaXB0JzogdHJ1ZSxcbiAgICAgICdqYXZhc2NyaXB0Oic6IHRydWVcbiAgICB9LFxuICAgIC8vIHByb3RvY29scyB0aGF0IG5ldmVyIGhhdmUgYSBob3N0bmFtZS5cbiAgICBob3N0bGVzc1Byb3RvY29sID0ge1xuICAgICAgJ2phdmFzY3JpcHQnOiB0cnVlLFxuICAgICAgJ2phdmFzY3JpcHQ6JzogdHJ1ZVxuICAgIH0sXG4gICAgLy8gcHJvdG9jb2xzIHRoYXQgYWx3YXlzIGNvbnRhaW4gYSAvLyBiaXQuXG4gICAgc2xhc2hlZFByb3RvY29sID0ge1xuICAgICAgJ2h0dHAnOiB0cnVlLFxuICAgICAgJ2h0dHBzJzogdHJ1ZSxcbiAgICAgICdmdHAnOiB0cnVlLFxuICAgICAgJ2dvcGhlcic6IHRydWUsXG4gICAgICAnZmlsZSc6IHRydWUsXG4gICAgICAnaHR0cDonOiB0cnVlLFxuICAgICAgJ2h0dHBzOic6IHRydWUsXG4gICAgICAnZnRwOic6IHRydWUsXG4gICAgICAnZ29waGVyOic6IHRydWUsXG4gICAgICAnZmlsZTonOiB0cnVlXG4gICAgfSxcbiAgICBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJyk7XG5cbmZ1bmN0aW9uIHVybFBhcnNlKHVybCwgcGFyc2VRdWVyeVN0cmluZywgc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgaWYgKHVybCAmJiB1dGlsLmlzT2JqZWN0KHVybCkgJiYgdXJsIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gdXJsO1xuXG4gIHZhciB1ID0gbmV3IFVybDtcbiAgdS5wYXJzZSh1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KTtcbiAgcmV0dXJuIHU7XG59XG5cblVybC5wcm90b3R5cGUucGFyc2UgPSBmdW5jdGlvbih1cmwsIHBhcnNlUXVlcnlTdHJpbmcsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gIGlmICghdXRpbC5pc1N0cmluZyh1cmwpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIlBhcmFtZXRlciAndXJsJyBtdXN0IGJlIGEgc3RyaW5nLCBub3QgXCIgKyB0eXBlb2YgdXJsKTtcbiAgfVxuXG4gIC8vIENvcHkgY2hyb21lLCBJRSwgb3BlcmEgYmFja3NsYXNoLWhhbmRsaW5nIGJlaGF2aW9yLlxuICAvLyBCYWNrIHNsYXNoZXMgYmVmb3JlIHRoZSBxdWVyeSBzdHJpbmcgZ2V0IGNvbnZlcnRlZCB0byBmb3J3YXJkIHNsYXNoZXNcbiAgLy8gU2VlOiBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjU5MTZcbiAgdmFyIHF1ZXJ5SW5kZXggPSB1cmwuaW5kZXhPZignPycpLFxuICAgICAgc3BsaXR0ZXIgPVxuICAgICAgICAgIChxdWVyeUluZGV4ICE9PSAtMSAmJiBxdWVyeUluZGV4IDwgdXJsLmluZGV4T2YoJyMnKSkgPyAnPycgOiAnIycsXG4gICAgICB1U3BsaXQgPSB1cmwuc3BsaXQoc3BsaXR0ZXIpLFxuICAgICAgc2xhc2hSZWdleCA9IC9cXFxcL2c7XG4gIHVTcGxpdFswXSA9IHVTcGxpdFswXS5yZXBsYWNlKHNsYXNoUmVnZXgsICcvJyk7XG4gIHVybCA9IHVTcGxpdC5qb2luKHNwbGl0dGVyKTtcblxuICB2YXIgcmVzdCA9IHVybDtcblxuICAvLyB0cmltIGJlZm9yZSBwcm9jZWVkaW5nLlxuICAvLyBUaGlzIGlzIHRvIHN1cHBvcnQgcGFyc2Ugc3R1ZmYgbGlrZSBcIiAgaHR0cDovL2Zvby5jb20gIFxcblwiXG4gIHJlc3QgPSByZXN0LnRyaW0oKTtcblxuICBpZiAoIXNsYXNoZXNEZW5vdGVIb3N0ICYmIHVybC5zcGxpdCgnIycpLmxlbmd0aCA9PT0gMSkge1xuICAgIC8vIFRyeSBmYXN0IHBhdGggcmVnZXhwXG4gICAgdmFyIHNpbXBsZVBhdGggPSBzaW1wbGVQYXRoUGF0dGVybi5leGVjKHJlc3QpO1xuICAgIGlmIChzaW1wbGVQYXRoKSB7XG4gICAgICB0aGlzLnBhdGggPSByZXN0O1xuICAgICAgdGhpcy5ocmVmID0gcmVzdDtcbiAgICAgIHRoaXMucGF0aG5hbWUgPSBzaW1wbGVQYXRoWzFdO1xuICAgICAgaWYgKHNpbXBsZVBhdGhbMl0pIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBzaW1wbGVQYXRoWzJdO1xuICAgICAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZSh0aGlzLnNlYXJjaC5zdWJzdHIoMSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucXVlcnkgPSB0aGlzLnNlYXJjaC5zdWJzdHIoMSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgICB0aGlzLnNlYXJjaCA9ICcnO1xuICAgICAgICB0aGlzLnF1ZXJ5ID0ge307XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG4gIH1cblxuICB2YXIgcHJvdG8gPSBwcm90b2NvbFBhdHRlcm4uZXhlYyhyZXN0KTtcbiAgaWYgKHByb3RvKSB7XG4gICAgcHJvdG8gPSBwcm90b1swXTtcbiAgICB2YXIgbG93ZXJQcm90byA9IHByb3RvLnRvTG93ZXJDYXNlKCk7XG4gICAgdGhpcy5wcm90b2NvbCA9IGxvd2VyUHJvdG87XG4gICAgcmVzdCA9IHJlc3Quc3Vic3RyKHByb3RvLmxlbmd0aCk7XG4gIH1cblxuICAvLyBmaWd1cmUgb3V0IGlmIGl0J3MgZ290IGEgaG9zdFxuICAvLyB1c2VyQHNlcnZlciBpcyAqYWx3YXlzKiBpbnRlcnByZXRlZCBhcyBhIGhvc3RuYW1lLCBhbmQgdXJsXG4gIC8vIHJlc29sdXRpb24gd2lsbCB0cmVhdCAvL2Zvby9iYXIgYXMgaG9zdD1mb28scGF0aD1iYXIgYmVjYXVzZSB0aGF0J3NcbiAgLy8gaG93IHRoZSBicm93c2VyIHJlc29sdmVzIHJlbGF0aXZlIFVSTHMuXG4gIGlmIChzbGFzaGVzRGVub3RlSG9zdCB8fCBwcm90byB8fCByZXN0Lm1hdGNoKC9eXFwvXFwvW15AXFwvXStAW15AXFwvXSsvKSkge1xuICAgIHZhciBzbGFzaGVzID0gcmVzdC5zdWJzdHIoMCwgMikgPT09ICcvLyc7XG4gICAgaWYgKHNsYXNoZXMgJiYgIShwcm90byAmJiBob3N0bGVzc1Byb3RvY29sW3Byb3RvXSkpIHtcbiAgICAgIHJlc3QgPSByZXN0LnN1YnN0cigyKTtcbiAgICAgIHRoaXMuc2xhc2hlcyA9IHRydWU7XG4gICAgfVxuICB9XG5cbiAgaWYgKCFob3N0bGVzc1Byb3RvY29sW3Byb3RvXSAmJlxuICAgICAgKHNsYXNoZXMgfHwgKHByb3RvICYmICFzbGFzaGVkUHJvdG9jb2xbcHJvdG9dKSkpIHtcblxuICAgIC8vIHRoZXJlJ3MgYSBob3N0bmFtZS5cbiAgICAvLyB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgLywgPywgOywgb3IgIyBlbmRzIHRoZSBob3N0LlxuICAgIC8vXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gQCBpbiB0aGUgaG9zdG5hbWUsIHRoZW4gbm9uLWhvc3QgY2hhcnMgKmFyZSogYWxsb3dlZFxuICAgIC8vIHRvIHRoZSBsZWZ0IG9mIHRoZSBsYXN0IEAgc2lnbiwgdW5sZXNzIHNvbWUgaG9zdC1lbmRpbmcgY2hhcmFjdGVyXG4gICAgLy8gY29tZXMgKmJlZm9yZSogdGhlIEAtc2lnbi5cbiAgICAvLyBVUkxzIGFyZSBvYm5veGlvdXMuXG4gICAgLy9cbiAgICAvLyBleDpcbiAgICAvLyBodHRwOi8vYUBiQGMvID0+IHVzZXI6YUBiIGhvc3Q6Y1xuICAgIC8vIGh0dHA6Ly9hQGI/QGMgPT4gdXNlcjphIGhvc3Q6YyBwYXRoOi8/QGNcblxuICAgIC8vIHYwLjEyIFRPRE8oaXNhYWNzKTogVGhpcyBpcyBub3QgcXVpdGUgaG93IENocm9tZSBkb2VzIHRoaW5ncy5cbiAgICAvLyBSZXZpZXcgb3VyIHRlc3QgY2FzZSBhZ2FpbnN0IGJyb3dzZXJzIG1vcmUgY29tcHJlaGVuc2l2ZWx5LlxuXG4gICAgLy8gZmluZCB0aGUgZmlyc3QgaW5zdGFuY2Ugb2YgYW55IGhvc3RFbmRpbmdDaGFyc1xuICAgIHZhciBob3N0RW5kID0gLTE7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBob3N0RW5kaW5nQ2hhcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBoZWMgPSByZXN0LmluZGV4T2YoaG9zdEVuZGluZ0NoYXJzW2ldKTtcbiAgICAgIGlmIChoZWMgIT09IC0xICYmIChob3N0RW5kID09PSAtMSB8fCBoZWMgPCBob3N0RW5kKSlcbiAgICAgICAgaG9zdEVuZCA9IGhlYztcbiAgICB9XG5cbiAgICAvLyBhdCB0aGlzIHBvaW50LCBlaXRoZXIgd2UgaGF2ZSBhbiBleHBsaWNpdCBwb2ludCB3aGVyZSB0aGVcbiAgICAvLyBhdXRoIHBvcnRpb24gY2Fubm90IGdvIHBhc3QsIG9yIHRoZSBsYXN0IEAgY2hhciBpcyB0aGUgZGVjaWRlci5cbiAgICB2YXIgYXV0aCwgYXRTaWduO1xuICAgIGlmIChob3N0RW5kID09PSAtMSkge1xuICAgICAgLy8gYXRTaWduIGNhbiBiZSBhbnl3aGVyZS5cbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gYXRTaWduIG11c3QgYmUgaW4gYXV0aCBwb3J0aW9uLlxuICAgICAgLy8gaHR0cDovL2FAYi9jQGQgPT4gaG9zdDpiIGF1dGg6YSBwYXRoOi9jQGRcbiAgICAgIGF0U2lnbiA9IHJlc3QubGFzdEluZGV4T2YoJ0AnLCBob3N0RW5kKTtcbiAgICB9XG5cbiAgICAvLyBOb3cgd2UgaGF2ZSBhIHBvcnRpb24gd2hpY2ggaXMgZGVmaW5pdGVseSB0aGUgYXV0aC5cbiAgICAvLyBQdWxsIHRoYXQgb2ZmLlxuICAgIGlmIChhdFNpZ24gIT09IC0xKSB7XG4gICAgICBhdXRoID0gcmVzdC5zbGljZSgwLCBhdFNpZ24pO1xuICAgICAgcmVzdCA9IHJlc3Quc2xpY2UoYXRTaWduICsgMSk7XG4gICAgICB0aGlzLmF1dGggPSBkZWNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgfVxuXG4gICAgLy8gdGhlIGhvc3QgaXMgdGhlIHJlbWFpbmluZyB0byB0aGUgbGVmdCBvZiB0aGUgZmlyc3Qgbm9uLWhvc3QgY2hhclxuICAgIGhvc3RFbmQgPSAtMTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vbkhvc3RDaGFycy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGhlYyA9IHJlc3QuaW5kZXhPZihub25Ib3N0Q2hhcnNbaV0pO1xuICAgICAgaWYgKGhlYyAhPT0gLTEgJiYgKGhvc3RFbmQgPT09IC0xIHx8IGhlYyA8IGhvc3RFbmQpKVxuICAgICAgICBob3N0RW5kID0gaGVjO1xuICAgIH1cbiAgICAvLyBpZiB3ZSBzdGlsbCBoYXZlIG5vdCBoaXQgaXQsIHRoZW4gdGhlIGVudGlyZSB0aGluZyBpcyBhIGhvc3QuXG4gICAgaWYgKGhvc3RFbmQgPT09IC0xKVxuICAgICAgaG9zdEVuZCA9IHJlc3QubGVuZ3RoO1xuXG4gICAgdGhpcy5ob3N0ID0gcmVzdC5zbGljZSgwLCBob3N0RW5kKTtcbiAgICByZXN0ID0gcmVzdC5zbGljZShob3N0RW5kKTtcblxuICAgIC8vIHB1bGwgb3V0IHBvcnQuXG4gICAgdGhpcy5wYXJzZUhvc3QoKTtcblxuICAgIC8vIHdlJ3ZlIGluZGljYXRlZCB0aGF0IHRoZXJlIGlzIGEgaG9zdG5hbWUsXG4gICAgLy8gc28gZXZlbiBpZiBpdCdzIGVtcHR5LCBpdCBoYXMgdG8gYmUgcHJlc2VudC5cbiAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCAnJztcblxuICAgIC8vIGlmIGhvc3RuYW1lIGJlZ2lucyB3aXRoIFsgYW5kIGVuZHMgd2l0aCBdXG4gICAgLy8gYXNzdW1lIHRoYXQgaXQncyBhbiBJUHY2IGFkZHJlc3MuXG4gICAgdmFyIGlwdjZIb3N0bmFtZSA9IHRoaXMuaG9zdG5hbWVbMF0gPT09ICdbJyAmJlxuICAgICAgICB0aGlzLmhvc3RuYW1lW3RoaXMuaG9zdG5hbWUubGVuZ3RoIC0gMV0gPT09ICddJztcblxuICAgIC8vIHZhbGlkYXRlIGEgbGl0dGxlLlxuICAgIGlmICghaXB2Nkhvc3RuYW1lKSB7XG4gICAgICB2YXIgaG9zdHBhcnRzID0gdGhpcy5ob3N0bmFtZS5zcGxpdCgvXFwuLyk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGhvc3RwYXJ0cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIHBhcnQgPSBob3N0cGFydHNbaV07XG4gICAgICAgIGlmICghcGFydCkgY29udGludWU7XG4gICAgICAgIGlmICghcGFydC5tYXRjaChob3N0bmFtZVBhcnRQYXR0ZXJuKSkge1xuICAgICAgICAgIHZhciBuZXdwYXJ0ID0gJyc7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IDAsIGsgPSBwYXJ0Lmxlbmd0aDsgaiA8IGs7IGorKykge1xuICAgICAgICAgICAgaWYgKHBhcnQuY2hhckNvZGVBdChqKSA+IDEyNykge1xuICAgICAgICAgICAgICAvLyB3ZSByZXBsYWNlIG5vbi1BU0NJSSBjaGFyIHdpdGggYSB0ZW1wb3JhcnkgcGxhY2Vob2xkZXJcbiAgICAgICAgICAgICAgLy8gd2UgbmVlZCB0aGlzIHRvIG1ha2Ugc3VyZSBzaXplIG9mIGhvc3RuYW1lIGlzIG5vdFxuICAgICAgICAgICAgICAvLyBicm9rZW4gYnkgcmVwbGFjaW5nIG5vbi1BU0NJSSBieSBub3RoaW5nXG4gICAgICAgICAgICAgIG5ld3BhcnQgKz0gJ3gnO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbmV3cGFydCArPSBwYXJ0W2pdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyB3ZSB0ZXN0IGFnYWluIHdpdGggQVNDSUkgY2hhciBvbmx5XG4gICAgICAgICAgaWYgKCFuZXdwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFBhdHRlcm4pKSB7XG4gICAgICAgICAgICB2YXIgdmFsaWRQYXJ0cyA9IGhvc3RwYXJ0cy5zbGljZSgwLCBpKTtcbiAgICAgICAgICAgIHZhciBub3RIb3N0ID0gaG9zdHBhcnRzLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgICAgIHZhciBiaXQgPSBwYXJ0Lm1hdGNoKGhvc3RuYW1lUGFydFN0YXJ0KTtcbiAgICAgICAgICAgIGlmIChiaXQpIHtcbiAgICAgICAgICAgICAgdmFsaWRQYXJ0cy5wdXNoKGJpdFsxXSk7XG4gICAgICAgICAgICAgIG5vdEhvc3QudW5zaGlmdChiaXRbMl0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5vdEhvc3QubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHJlc3QgPSAnLycgKyBub3RIb3N0LmpvaW4oJy4nKSArIHJlc3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdmFsaWRQYXJ0cy5qb2luKCcuJyk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5ob3N0bmFtZS5sZW5ndGggPiBob3N0bmFtZU1heExlbikge1xuICAgICAgdGhpcy5ob3N0bmFtZSA9ICcnO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBob3N0bmFtZXMgYXJlIGFsd2F5cyBsb3dlciBjYXNlLlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHRoaXMuaG9zdG5hbWUudG9Mb3dlckNhc2UoKTtcbiAgICB9XG5cbiAgICBpZiAoIWlwdjZIb3N0bmFtZSkge1xuICAgICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueWNvZGVkIHJlcHJlc2VudGF0aW9uIG9mIFwiZG9tYWluXCIuXG4gICAgICAvLyBJdCBvbmx5IGNvbnZlcnRzIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB0aGF0XG4gICAgICAvLyBoYXZlIG5vbi1BU0NJSSBjaGFyYWN0ZXJzLCBpLmUuIGl0IGRvZXNuJ3QgbWF0dGVyIGlmXG4gICAgICAvLyB5b3UgY2FsbCBpdCB3aXRoIGEgZG9tYWluIHRoYXQgYWxyZWFkeSBpcyBBU0NJSS1vbmx5LlxuICAgICAgdGhpcy5ob3N0bmFtZSA9IHB1bnljb2RlLnRvQVNDSUkodGhpcy5ob3N0bmFtZSk7XG4gICAgfVxuXG4gICAgdmFyIHAgPSB0aGlzLnBvcnQgPyAnOicgKyB0aGlzLnBvcnQgOiAnJztcbiAgICB2YXIgaCA9IHRoaXMuaG9zdG5hbWUgfHwgJyc7XG4gICAgdGhpcy5ob3N0ID0gaCArIHA7XG4gICAgdGhpcy5ocmVmICs9IHRoaXMuaG9zdDtcblxuICAgIC8vIHN0cmlwIFsgYW5kIF0gZnJvbSB0aGUgaG9zdG5hbWVcbiAgICAvLyB0aGUgaG9zdCBmaWVsZCBzdGlsbCByZXRhaW5zIHRoZW0sIHRob3VnaFxuICAgIGlmIChpcHY2SG9zdG5hbWUpIHtcbiAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3RuYW1lLnN1YnN0cigxLCB0aGlzLmhvc3RuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgaWYgKHJlc3RbMF0gIT09ICcvJykge1xuICAgICAgICByZXN0ID0gJy8nICsgcmVzdDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBub3cgcmVzdCBpcyBzZXQgdG8gdGhlIHBvc3QtaG9zdCBzdHVmZi5cbiAgLy8gY2hvcCBvZmYgYW55IGRlbGltIGNoYXJzLlxuICBpZiAoIXVuc2FmZVByb3RvY29sW2xvd2VyUHJvdG9dKSB7XG5cbiAgICAvLyBGaXJzdCwgbWFrZSAxMDAlIHN1cmUgdGhhdCBhbnkgXCJhdXRvRXNjYXBlXCIgY2hhcnMgZ2V0XG4gICAgLy8gZXNjYXBlZCwgZXZlbiBpZiBlbmNvZGVVUklDb21wb25lbnQgZG9lc24ndCB0aGluayB0aGV5XG4gICAgLy8gbmVlZCB0byBiZS5cbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIgYWUgPSBhdXRvRXNjYXBlW2ldO1xuICAgICAgaWYgKHJlc3QuaW5kZXhPZihhZSkgPT09IC0xKVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIHZhciBlc2MgPSBlbmNvZGVVUklDb21wb25lbnQoYWUpO1xuICAgICAgaWYgKGVzYyA9PT0gYWUpIHtcbiAgICAgICAgZXNjID0gZXNjYXBlKGFlKTtcbiAgICAgIH1cbiAgICAgIHJlc3QgPSByZXN0LnNwbGl0KGFlKS5qb2luKGVzYyk7XG4gICAgfVxuICB9XG5cblxuICAvLyBjaG9wIG9mZiBmcm9tIHRoZSB0YWlsIGZpcnN0LlxuICB2YXIgaGFzaCA9IHJlc3QuaW5kZXhPZignIycpO1xuICBpZiAoaGFzaCAhPT0gLTEpIHtcbiAgICAvLyBnb3QgYSBmcmFnbWVudCBzdHJpbmcuXG4gICAgdGhpcy5oYXNoID0gcmVzdC5zdWJzdHIoaGFzaCk7XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoMCwgaGFzaCk7XG4gIH1cbiAgdmFyIHFtID0gcmVzdC5pbmRleE9mKCc/Jyk7XG4gIGlmIChxbSAhPT0gLTEpIHtcbiAgICB0aGlzLnNlYXJjaCA9IHJlc3Quc3Vic3RyKHFtKTtcbiAgICB0aGlzLnF1ZXJ5ID0gcmVzdC5zdWJzdHIocW0gKyAxKTtcbiAgICBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgICAgdGhpcy5xdWVyeSA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHRoaXMucXVlcnkpO1xuICAgIH1cbiAgICByZXN0ID0gcmVzdC5zbGljZSgwLCBxbSk7XG4gIH0gZWxzZSBpZiAocGFyc2VRdWVyeVN0cmluZykge1xuICAgIC8vIG5vIHF1ZXJ5IHN0cmluZywgYnV0IHBhcnNlUXVlcnlTdHJpbmcgc3RpbGwgcmVxdWVzdGVkXG4gICAgdGhpcy5zZWFyY2ggPSAnJztcbiAgICB0aGlzLnF1ZXJ5ID0ge307XG4gIH1cbiAgaWYgKHJlc3QpIHRoaXMucGF0aG5hbWUgPSByZXN0O1xuICBpZiAoc2xhc2hlZFByb3RvY29sW2xvd2VyUHJvdG9dICYmXG4gICAgICB0aGlzLmhvc3RuYW1lICYmICF0aGlzLnBhdGhuYW1lKSB7XG4gICAgdGhpcy5wYXRobmFtZSA9ICcvJztcbiAgfVxuXG4gIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgaWYgKHRoaXMucGF0aG5hbWUgfHwgdGhpcy5zZWFyY2gpIHtcbiAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgJyc7XG4gICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCAnJztcbiAgICB0aGlzLnBhdGggPSBwICsgcztcbiAgfVxuXG4gIC8vIGZpbmFsbHksIHJlY29uc3RydWN0IHRoZSBocmVmIGJhc2VkIG9uIHdoYXQgaGFzIGJlZW4gdmFsaWRhdGVkLlxuICB0aGlzLmhyZWYgPSB0aGlzLmZvcm1hdCgpO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGZvcm1hdCBhIHBhcnNlZCBvYmplY3QgaW50byBhIHVybCBzdHJpbmdcbmZ1bmN0aW9uIHVybEZvcm1hdChvYmopIHtcbiAgLy8gZW5zdXJlIGl0J3MgYW4gb2JqZWN0LCBhbmQgbm90IGEgc3RyaW5nIHVybC5cbiAgLy8gSWYgaXQncyBhbiBvYmosIHRoaXMgaXMgYSBuby1vcC5cbiAgLy8gdGhpcyB3YXksIHlvdSBjYW4gY2FsbCB1cmxfZm9ybWF0KCkgb24gc3RyaW5nc1xuICAvLyB0byBjbGVhbiB1cCBwb3RlbnRpYWxseSB3b25reSB1cmxzLlxuICBpZiAodXRpbC5pc1N0cmluZyhvYmopKSBvYmogPSB1cmxQYXJzZShvYmopO1xuICBpZiAoIShvYmogaW5zdGFuY2VvZiBVcmwpKSByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufVxuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYXV0aCA9IHRoaXMuYXV0aCB8fCAnJztcbiAgaWYgKGF1dGgpIHtcbiAgICBhdXRoID0gZW5jb2RlVVJJQ29tcG9uZW50KGF1dGgpO1xuICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCAnOicpO1xuICAgIGF1dGggKz0gJ0AnO1xuICB9XG5cbiAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCAnJyxcbiAgICAgIHBhdGhuYW1lID0gdGhpcy5wYXRobmFtZSB8fCAnJyxcbiAgICAgIGhhc2ggPSB0aGlzLmhhc2ggfHwgJycsXG4gICAgICBob3N0ID0gZmFsc2UsXG4gICAgICBxdWVyeSA9ICcnO1xuXG4gIGlmICh0aGlzLmhvc3QpIHtcbiAgICBob3N0ID0gYXV0aCArIHRoaXMuaG9zdDtcbiAgfSBlbHNlIGlmICh0aGlzLmhvc3RuYW1lKSB7XG4gICAgaG9zdCA9IGF1dGggKyAodGhpcy5ob3N0bmFtZS5pbmRleE9mKCc6JykgPT09IC0xID9cbiAgICAgICAgdGhpcy5ob3N0bmFtZSA6XG4gICAgICAgICdbJyArIHRoaXMuaG9zdG5hbWUgKyAnXScpO1xuICAgIGlmICh0aGlzLnBvcnQpIHtcbiAgICAgIGhvc3QgKz0gJzonICsgdGhpcy5wb3J0O1xuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5ICYmXG4gICAgICB1dGlsLmlzT2JqZWN0KHRoaXMucXVlcnkpICYmXG4gICAgICBPYmplY3Qua2V5cyh0aGlzLnF1ZXJ5KS5sZW5ndGgpIHtcbiAgICBxdWVyeSA9IHF1ZXJ5c3RyaW5nLnN0cmluZ2lmeSh0aGlzLnF1ZXJ5KTtcbiAgfVxuXG4gIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCAocXVlcnkgJiYgKCc/JyArIHF1ZXJ5KSkgfHwgJyc7XG5cbiAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLnN1YnN0cigtMSkgIT09ICc6JykgcHJvdG9jb2wgKz0gJzonO1xuXG4gIC8vIG9ubHkgdGhlIHNsYXNoZWRQcm90b2NvbHMgZ2V0IHRoZSAvLy4gIE5vdCBtYWlsdG86LCB4bXBwOiwgZXRjLlxuICAvLyB1bmxlc3MgdGhleSBoYWQgdGhlbSB0byBiZWdpbiB3aXRoLlxuICBpZiAodGhpcy5zbGFzaGVzIHx8XG4gICAgICAoIXByb3RvY29sIHx8IHNsYXNoZWRQcm90b2NvbFtwcm90b2NvbF0pICYmIGhvc3QgIT09IGZhbHNlKSB7XG4gICAgaG9zdCA9ICcvLycgKyAoaG9zdCB8fCAnJyk7XG4gICAgaWYgKHBhdGhuYW1lICYmIHBhdGhuYW1lLmNoYXJBdCgwKSAhPT0gJy8nKSBwYXRobmFtZSA9ICcvJyArIHBhdGhuYW1lO1xuICB9IGVsc2UgaWYgKCFob3N0KSB7XG4gICAgaG9zdCA9ICcnO1xuICB9XG5cbiAgaWYgKGhhc2ggJiYgaGFzaC5jaGFyQXQoMCkgIT09ICcjJykgaGFzaCA9ICcjJyArIGhhc2g7XG4gIGlmIChzZWFyY2ggJiYgc2VhcmNoLmNoYXJBdCgwKSAhPT0gJz8nKSBzZWFyY2ggPSAnPycgKyBzZWFyY2g7XG5cbiAgcGF0aG5hbWUgPSBwYXRobmFtZS5yZXBsYWNlKC9bPyNdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gIH0pO1xuICBzZWFyY2ggPSBzZWFyY2gucmVwbGFjZSgnIycsICclMjMnKTtcblxuICByZXR1cm4gcHJvdG9jb2wgKyBob3N0ICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuZnVuY3Rpb24gdXJsUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gIHJldHVybiB1cmxQYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn1cblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlID0gZnVuY3Rpb24ocmVsYXRpdmUpIHtcbiAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdCh1cmxQYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpKS5mb3JtYXQoKTtcbn07XG5cbmZ1bmN0aW9uIHVybFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICBpZiAoIXNvdXJjZSkgcmV0dXJuIHJlbGF0aXZlO1xuICByZXR1cm4gdXJsUGFyc2Uoc291cmNlLCBmYWxzZSwgdHJ1ZSkucmVzb2x2ZU9iamVjdChyZWxhdGl2ZSk7XG59XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZU9iamVjdCA9IGZ1bmN0aW9uKHJlbGF0aXZlKSB7XG4gIGlmICh1dGlsLmlzU3RyaW5nKHJlbGF0aXZlKSkge1xuICAgIHZhciByZWwgPSBuZXcgVXJsKCk7XG4gICAgcmVsLnBhcnNlKHJlbGF0aXZlLCBmYWxzZSwgdHJ1ZSk7XG4gICAgcmVsYXRpdmUgPSByZWw7XG4gIH1cblxuICB2YXIgcmVzdWx0ID0gbmV3IFVybCgpO1xuICB2YXIgdGtleXMgPSBPYmplY3Qua2V5cyh0aGlzKTtcbiAgZm9yICh2YXIgdGsgPSAwOyB0ayA8IHRrZXlzLmxlbmd0aDsgdGsrKykge1xuICAgIHZhciB0a2V5ID0gdGtleXNbdGtdO1xuICAgIHJlc3VsdFt0a2V5XSA9IHRoaXNbdGtleV07XG4gIH1cblxuICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgLy8gZXZlbiBocmVmPVwiXCIgd2lsbCByZW1vdmUgaXQuXG4gIHJlc3VsdC5oYXNoID0gcmVsYXRpdmUuaGFzaDtcblxuICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlJ3Mgbm90aGluZyBsZWZ0IHRvIGRvIGhlcmUuXG4gIGlmIChyZWxhdGl2ZS5ocmVmID09PSAnJykge1xuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBocmVmcyBsaWtlIC8vZm9vL2JhciBhbHdheXMgY3V0IHRvIHRoZSBwcm90b2NvbC5cbiAgaWYgKHJlbGF0aXZlLnNsYXNoZXMgJiYgIXJlbGF0aXZlLnByb3RvY29sKSB7XG4gICAgLy8gdGFrZSBldmVyeXRoaW5nIGV4Y2VwdCB0aGUgcHJvdG9jb2wgZnJvbSByZWxhdGl2ZVxuICAgIHZhciBya2V5cyA9IE9iamVjdC5rZXlzKHJlbGF0aXZlKTtcbiAgICBmb3IgKHZhciByayA9IDA7IHJrIDwgcmtleXMubGVuZ3RoOyByaysrKSB7XG4gICAgICB2YXIgcmtleSA9IHJrZXlzW3JrXTtcbiAgICAgIGlmIChya2V5ICE9PSAncHJvdG9jb2wnKVxuICAgICAgICByZXN1bHRbcmtleV0gPSByZWxhdGl2ZVtya2V5XTtcbiAgICB9XG5cbiAgICAvL3VybFBhcnNlIGFwcGVuZHMgdHJhaWxpbmcgLyB0byB1cmxzIGxpa2UgaHR0cDovL3d3dy5leGFtcGxlLmNvbVxuICAgIGlmIChzbGFzaGVkUHJvdG9jb2xbcmVzdWx0LnByb3RvY29sXSAmJlxuICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgcmVzdWx0LnBhdGggPSByZXN1bHQucGF0aG5hbWUgPSAnLyc7XG4gICAgfVxuXG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGlmIChyZWxhdGl2ZS5wcm90b2NvbCAmJiByZWxhdGl2ZS5wcm90b2NvbCAhPT0gcmVzdWx0LnByb3RvY29sKSB7XG4gICAgLy8gaWYgaXQncyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgIC8vIHRoZSBwcm90b2NvbCBkb2VzIHdlaXJkIHRoaW5nc1xuICAgIC8vIGZpcnN0LCBpZiBpdCdzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgIC8vIGFuZCBpZiB0aGVyZSB3YXMgYSBwYXRoXG4gICAgLy8gdG8gYmVnaW4gd2l0aCwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBwYXRoLlxuICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgLy8gYmVjYXVzZSB0aGF0J3Mga25vd24gdG8gYmUgaG9zdGxlc3MuXG4gICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgIGlmICghc2xhc2hlZFByb3RvY29sW3JlbGF0aXZlLnByb3RvY29sXSkge1xuICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhyZWxhdGl2ZSk7XG4gICAgICBmb3IgKHZhciB2ID0gMDsgdiA8IGtleXMubGVuZ3RoOyB2KyspIHtcbiAgICAgICAgdmFyIGsgPSBrZXlzW3ZdO1xuICAgICAgICByZXN1bHRba10gPSByZWxhdGl2ZVtrXTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICByZXN1bHQucHJvdG9jb2wgPSByZWxhdGl2ZS5wcm90b2NvbDtcbiAgICBpZiAoIXJlbGF0aXZlLmhvc3QgJiYgIWhvc3RsZXNzUHJvdG9jb2xbcmVsYXRpdmUucHJvdG9jb2xdKSB7XG4gICAgICB2YXIgcmVsUGF0aCA9IChyZWxhdGl2ZS5wYXRobmFtZSB8fCAnJykuc3BsaXQoJy8nKTtcbiAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9ICcnO1xuICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0bmFtZSkgcmVsYXRpdmUuaG9zdG5hbWUgPSAnJztcbiAgICAgIGlmIChyZWxQYXRoWzBdICE9PSAnJykgcmVsUGF0aC51bnNoaWZ0KCcnKTtcbiAgICAgIGlmIChyZWxQYXRoLmxlbmd0aCA8IDIpIHJlbFBhdGgudW5zaGlmdCgnJyk7XG4gICAgICByZXN1bHQucGF0aG5hbWUgPSByZWxQYXRoLmpvaW4oJy8nKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsYXRpdmUucGF0aG5hbWU7XG4gICAgfVxuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8ICcnO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSByZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0O1xuICAgIHJlc3VsdC5wb3J0ID0gcmVsYXRpdmUucG9ydDtcbiAgICAvLyB0byBzdXBwb3J0IGh0dHAucmVxdWVzdFxuICAgIGlmIChyZXN1bHQucGF0aG5hbWUgfHwgcmVzdWx0LnNlYXJjaCkge1xuICAgICAgdmFyIHAgPSByZXN1bHQucGF0aG5hbWUgfHwgJyc7XG4gICAgICB2YXIgcyA9IHJlc3VsdC5zZWFyY2ggfHwgJyc7XG4gICAgICByZXN1bHQucGF0aCA9IHAgKyBzO1xuICAgIH1cbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0LmhyZWYgPSByZXN1bHQuZm9ybWF0KCk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBpc1NvdXJjZUFicyA9IChyZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLmNoYXJBdCgwKSA9PT0gJy8nKSxcbiAgICAgIGlzUmVsQWJzID0gKFxuICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5jaGFyQXQoMCkgPT09ICcvJ1xuICAgICAgKSxcbiAgICAgIG11c3RFbmRBYnMgPSAoaXNSZWxBYnMgfHwgaXNTb3VyY2VBYnMgfHxcbiAgICAgICAgICAgICAgICAgICAgKHJlc3VsdC5ob3N0ICYmIHJlbGF0aXZlLnBhdGhuYW1lKSksXG4gICAgICByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicyxcbiAgICAgIHNyY1BhdGggPSByZXN1bHQucGF0aG5hbWUgJiYgcmVzdWx0LnBhdGhuYW1lLnNwbGl0KCcvJykgfHwgW10sXG4gICAgICByZWxQYXRoID0gcmVsYXRpdmUucGF0aG5hbWUgJiYgcmVsYXRpdmUucGF0aG5hbWUuc3BsaXQoJy8nKSB8fCBbXSxcbiAgICAgIHBzeWNob3RpYyA9IHJlc3VsdC5wcm90b2NvbCAmJiAhc2xhc2hlZFByb3RvY29sW3Jlc3VsdC5wcm90b2NvbF07XG5cbiAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAvLyBsaW5rcyBsaWtlIC4uLy4uIHNob3VsZCBiZSBhYmxlXG4gIC8vIHRvIGNyYXdsIHVwIHRvIHRoZSBob3N0bmFtZSwgYXMgd2VsbC4gIFRoaXMgaXMgc3RyYW5nZS5cbiAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgLy8gTGF0ZXIgb24sIHB1dCB0aGUgZmlyc3QgcGF0aCBwYXJ0IGludG8gdGhlIGhvc3QgZmllbGQuXG4gIGlmIChwc3ljaG90aWMpIHtcbiAgICByZXN1bHQuaG9zdG5hbWUgPSAnJztcbiAgICByZXN1bHQucG9ydCA9IG51bGw7XG4gICAgaWYgKHJlc3VsdC5ob3N0KSB7XG4gICAgICBpZiAoc3JjUGF0aFswXSA9PT0gJycpIHNyY1BhdGhbMF0gPSByZXN1bHQuaG9zdDtcbiAgICAgIGVsc2Ugc3JjUGF0aC51bnNoaWZ0KHJlc3VsdC5ob3N0KTtcbiAgICB9XG4gICAgcmVzdWx0Lmhvc3QgPSAnJztcbiAgICBpZiAocmVsYXRpdmUucHJvdG9jb2wpIHtcbiAgICAgIHJlbGF0aXZlLmhvc3RuYW1lID0gbnVsbDtcbiAgICAgIHJlbGF0aXZlLnBvcnQgPSBudWxsO1xuICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgaWYgKHJlbFBhdGhbMF0gPT09ICcnKSByZWxQYXRoWzBdID0gcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICB9XG4gICAgICByZWxhdGl2ZS5ob3N0ID0gbnVsbDtcbiAgICB9XG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgJiYgKHJlbFBhdGhbMF0gPT09ICcnIHx8IHNyY1BhdGhbMF0gPT09ICcnKTtcbiAgfVxuXG4gIGlmIChpc1JlbEFicykge1xuICAgIC8vIGl0J3MgYWJzb2x1dGUuXG4gICAgcmVzdWx0Lmhvc3QgPSAocmVsYXRpdmUuaG9zdCB8fCByZWxhdGl2ZS5ob3N0ID09PSAnJykgP1xuICAgICAgICAgICAgICAgICAgcmVsYXRpdmUuaG9zdCA6IHJlc3VsdC5ob3N0O1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IChyZWxhdGl2ZS5ob3N0bmFtZSB8fCByZWxhdGl2ZS5ob3N0bmFtZSA9PT0gJycpID9cbiAgICAgICAgICAgICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA6IHJlc3VsdC5ob3N0bmFtZTtcbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIHNyY1BhdGggPSByZWxQYXRoO1xuICAgIC8vIGZhbGwgdGhyb3VnaCB0byB0aGUgZG90LWhhbmRsaW5nIGJlbG93LlxuICB9IGVsc2UgaWYgKHJlbFBhdGgubGVuZ3RoKSB7XG4gICAgLy8gaXQncyByZWxhdGl2ZVxuICAgIC8vIHRocm93IGF3YXkgdGhlIGV4aXN0aW5nIGZpbGUsIGFuZCB0YWtlIHRoZSBuZXcgcGF0aCBpbnN0ZWFkLlxuICAgIGlmICghc3JjUGF0aCkgc3JjUGF0aCA9IFtdO1xuICAgIHNyY1BhdGgucG9wKCk7XG4gICAgc3JjUGF0aCA9IHNyY1BhdGguY29uY2F0KHJlbFBhdGgpO1xuICAgIHJlc3VsdC5zZWFyY2ggPSByZWxhdGl2ZS5zZWFyY2g7XG4gICAgcmVzdWx0LnF1ZXJ5ID0gcmVsYXRpdmUucXVlcnk7XG4gIH0gZWxzZSBpZiAoIXV0aWwuaXNOdWxsT3JVbmRlZmluZWQocmVsYXRpdmUuc2VhcmNoKSkge1xuICAgIC8vIGp1c3QgcHVsbCBvdXQgdGhlIHNlYXJjaC5cbiAgICAvLyBsaWtlIGhyZWY9Jz9mb28nLlxuICAgIC8vIFB1dCB0aGlzIGFmdGVyIHRoZSBvdGhlciB0d28gY2FzZXMgYmVjYXVzZSBpdCBzaW1wbGlmaWVzIHRoZSBib29sZWFuc1xuICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgLy90aGlzIGVzcGVjaWFsbHkgaGFwcGVucyBpbiBjYXNlcyBsaWtlXG4gICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KCdtYWlsdG86bG9jYWwxQGRvbWFpbjEnLCAnbG9jYWwyQGRvbWFpbjInKVxuICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoJ0AnKSA6IGZhbHNlO1xuICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgIHJlc3VsdC5xdWVyeSA9IHJlbGF0aXZlLnF1ZXJ5O1xuICAgIC8vdG8gc3VwcG9ydCBodHRwLnJlcXVlc3RcbiAgICBpZiAoIXV0aWwuaXNOdWxsKHJlc3VsdC5wYXRobmFtZSkgfHwgIXV0aWwuaXNOdWxsKHJlc3VsdC5zZWFyY2gpKSB7XG4gICAgICByZXN1bHQucGF0aCA9IChyZXN1bHQucGF0aG5hbWUgPyByZXN1bHQucGF0aG5hbWUgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gICAgfVxuICAgIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICBpZiAoIXNyY1BhdGgubGVuZ3RoKSB7XG4gICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgIC8vIHdlJ3ZlIGFscmVhZHkgaGFuZGxlZCB0aGUgb3RoZXIgc3R1ZmYgYWJvdmUuXG4gICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAvL3RvIHN1cHBvcnQgaHR0cC5yZXF1ZXN0XG4gICAgaWYgKHJlc3VsdC5zZWFyY2gpIHtcbiAgICAgIHJlc3VsdC5wYXRoID0gJy8nICsgcmVzdWx0LnNlYXJjaDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnBhdGggPSBudWxsO1xuICAgIH1cbiAgICByZXN1bHQuaHJlZiA9IHJlc3VsdC5mb3JtYXQoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgLy8gaWYgYSB1cmwgRU5EcyBpbiAuIG9yIC4uLCB0aGVuIGl0IG11c3QgZ2V0IGEgdHJhaWxpbmcgc2xhc2guXG4gIC8vIGhvd2V2ZXIsIGlmIGl0IGVuZHMgaW4gYW55dGhpbmcgZWxzZSBub24tc2xhc2h5LFxuICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICB2YXIgbGFzdCA9IHNyY1BhdGguc2xpY2UoLTEpWzBdO1xuICB2YXIgaGFzVHJhaWxpbmdTbGFzaCA9IChcbiAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0IHx8IHNyY1BhdGgubGVuZ3RoID4gMSkgJiZcbiAgICAgIChsYXN0ID09PSAnLicgfHwgbGFzdCA9PT0gJy4uJykgfHwgbGFzdCA9PT0gJycpO1xuXG4gIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgIGxhc3QgPSBzcmNQYXRoW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgIH0gZWxzZSBpZiAobGFzdCA9PT0gJy4uJykge1xuICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmICghbXVzdEVuZEFicyAmJiAhcmVtb3ZlQWxsRG90cykge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgc3JjUGF0aC51bnNoaWZ0KCcuLicpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChtdXN0RW5kQWJzICYmIHNyY1BhdGhbMF0gIT09ICcnICYmXG4gICAgICAoIXNyY1BhdGhbMF0gfHwgc3JjUGF0aFswXS5jaGFyQXQoMCkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnVuc2hpZnQoJycpO1xuICB9XG5cbiAgaWYgKGhhc1RyYWlsaW5nU2xhc2ggJiYgKHNyY1BhdGguam9pbignLycpLnN1YnN0cigtMSkgIT09ICcvJykpIHtcbiAgICBzcmNQYXRoLnB1c2goJycpO1xuICB9XG5cbiAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSAnJyB8fFxuICAgICAgKHNyY1BhdGhbMF0gJiYgc3JjUGF0aFswXS5jaGFyQXQoMCkgPT09ICcvJyk7XG5cbiAgLy8gcHV0IHRoZSBob3N0IGJhY2tcbiAgaWYgKHBzeWNob3RpYykge1xuICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gaXNBYnNvbHV0ZSA/ICcnIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogJyc7XG4gICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgIC8vdGhpcyBlc3BlY2lhbGx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgIC8vdXJsLnJlc29sdmVPYmplY3QoJ21haWx0bzpsb2NhbDFAZG9tYWluMScsICdsb2NhbDJAZG9tYWluMicpXG4gICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKCdAJykgPiAwID9cbiAgICAgICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KCdAJykgOiBmYWxzZTtcbiAgICBpZiAoYXV0aEluSG9zdCkge1xuICAgICAgcmVzdWx0LmF1dGggPSBhdXRoSW5Ib3N0LnNoaWZ0KCk7XG4gICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICB9XG4gIH1cblxuICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyB8fCAocmVzdWx0Lmhvc3QgJiYgc3JjUGF0aC5sZW5ndGgpO1xuXG4gIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgc3JjUGF0aC51bnNoaWZ0KCcnKTtcbiAgfVxuXG4gIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBudWxsO1xuICAgIHJlc3VsdC5wYXRoID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmpvaW4oJy8nKTtcbiAgfVxuXG4gIC8vdG8gc3VwcG9ydCByZXF1ZXN0Lmh0dHBcbiAgaWYgKCF1dGlsLmlzTnVsbChyZXN1bHQucGF0aG5hbWUpIHx8ICF1dGlsLmlzTnVsbChyZXN1bHQuc2VhcmNoKSkge1xuICAgIHJlc3VsdC5wYXRoID0gKHJlc3VsdC5wYXRobmFtZSA/IHJlc3VsdC5wYXRobmFtZSA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAocmVzdWx0LnNlYXJjaCA/IHJlc3VsdC5zZWFyY2ggOiAnJyk7XG4gIH1cbiAgcmVzdWx0LmF1dGggPSByZWxhdGl2ZS5hdXRoIHx8IHJlc3VsdC5hdXRoO1xuICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gIHJlc3VsdC5ocmVmID0gcmVzdWx0LmZvcm1hdCgpO1xuICByZXR1cm4gcmVzdWx0O1xufTtcblxuVXJsLnByb3RvdHlwZS5wYXJzZUhvc3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGhvc3QgPSB0aGlzLmhvc3Q7XG4gIHZhciBwb3J0ID0gcG9ydFBhdHRlcm4uZXhlYyhob3N0KTtcbiAgaWYgKHBvcnQpIHtcbiAgICBwb3J0ID0gcG9ydFswXTtcbiAgICBpZiAocG9ydCAhPT0gJzonKSB7XG4gICAgICB0aGlzLnBvcnQgPSBwb3J0LnN1YnN0cigxKTtcbiAgICB9XG4gICAgaG9zdCA9IGhvc3Quc3Vic3RyKDAsIGhvc3QubGVuZ3RoIC0gcG9ydC5sZW5ndGgpO1xuICB9XG4gIGlmIChob3N0KSB0aGlzLmhvc3RuYW1lID0gaG9zdDtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBpc1N0cmluZzogZnVuY3Rpb24oYXJnKSB7XG4gICAgcmV0dXJuIHR5cGVvZihhcmcpID09PSAnc3RyaW5nJztcbiAgfSxcbiAgaXNPYmplY3Q6IGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiB0eXBlb2YoYXJnKSA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xuICB9LFxuICBpc051bGw6IGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiBhcmcgPT09IG51bGw7XG4gIH0sXG4gIGlzTnVsbE9yVW5kZWZpbmVkOiBmdW5jdGlvbihhcmcpIHtcbiAgICByZXR1cm4gYXJnID09IG51bGw7XG4gIH1cbn07XG4iLCJpbXBvcnQge2dldFN0b3JlfSBmcm9tIFwiLi4vdXRpbHNcIiAgIFxyXG5pbXBvcnQge1VybH0gZnJvbSBcInVybFwiIFxyXG4gXHJcbmxldCBzdG9yZSA9IGdldFN0b3JlKCksIHNlYXJjaFBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMod2luZG93LmxvY2F0aW9uLnNlYXJjaC5zdWJzdHJpbmcoMSkpXHJcbiBcclxubGV0IGltYWdlID0gc2VhcmNoUGFyYW1zLmdldCgnaW1nJylcclxuaWYgKCFpbWFnZSkgaW1hZ2UgPSBwcm9tcHQoXCJFbnRlciBpbWFnZSB1cmw6XCIsXCJcIilcclxubGV0IGVkaXQgPSBzZWFyY2hQYXJhbXMuZ2V0KCdtb2RlJykgPT0gXCJlZGl0XCJcclxubGV0IHNjYWxlID0gc2VhcmNoUGFyYW1zLmdldCgnc2NhbGUnKSB8fCAxLjBcclxubGV0IHRvb2wgPSBzZWFyY2hQYXJhbXMuZ2V0KCd0b29sJykgfHwgXCJwcmVzc3VyZVwiXHJcbmxldCBleCA9IHNlYXJjaFBhcmFtcy5nZXQoJ2V4JykgfHwgXCJcIlxyXG5sZXQgd2lkdGggPSBzZWFyY2hQYXJhbXMuZ2V0KCd3JykgfHwgMjBcclxubGV0IGhlaWdodCA9IHNlYXJjaFBhcmFtcy5nZXQoJ2gnKSB8fCAyMFxyXG5sZXQgb3B0ID0gc2VhcmNoUGFyYW1zLmdldCgnb3B0JykgfHwgXCJhbGxcIlxyXG5cclxubGV0IGxpbmV0eXBlcyA9IHtcclxuXHRkcnk6e3c6MSxjOlwiIzAwMFwifSxcclxuXHRoaWdoVDp7dzoxLGM6XCIjRjAwXCJ9LFxyXG5cdGhpZ2hUZDp7dzoxLGM6XCIjMEYwXCJ9LFxyXG5cdGpldDg1MDp7dzo1LGM6XCIjRjAwXCJ9LFxyXG5cdGpldDMwMDp7dzo1LGM6XCIjODAwMDgwXCJ9XHJcbn1cclxuXHJcbmxldCBsaW5ldHlwZSA9IFwiZHJ5XCIgXHJcbmxldCBsaW5ldHlwZUJ1dHRvbiA9IG51bGxcclxuXHJcbmNyZWF0ZWpzLk1vdGlvbkd1aWRlUGx1Z2luLmluc3RhbGwoKVxyXG5cclxuLy9MaW5lcyB3aXRoIHN5bWJvbHMgZm9yIGEgZHJ5IGxpbmUsIG1vaXN0dXJlIGF4aXMsIHRoZXJtYWwgcmlkZ2UsIGxvdyBsZXZlbCBqZXQgYW5kIHVwcGVyIGxldmVsIGpldCBcclxuXHJcbmZ1bmN0aW9uIGRpc3QocDEscDIpIHsgXHJcblx0bGV0IGR4ID0gcDEueCAtIHAyLngsIGR5ID0gcDEueSAtIHAyLnlcclxuXHRyZXR1cm4gTWF0aC5zcXJ0KGR4KmR4ICsgZHkqZHkpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFuZ2xlKHAxLCBwMikge1xyXG4gICAgcmV0dXJuIE1hdGguYXRhbjIocDIueSAtIHAxLnksIHAyLnggLSBwMS54KSAqIDE4MCAvIE1hdGguUEk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbXBvbmVudFRvSGV4KGMpIHtcclxuXHQgIHZhciBoZXggPSBjLnRvU3RyaW5nKDE2KTtcclxuXHQgIHJldHVybiBoZXgubGVuZ3RoID09IDEgPyBcIjBcIiArIGhleCA6IGhleDtcclxuXHR9XHJcblxyXG5mdW5jdGlvbiByZ2JUb0hleChyLCBnLCBiKSB7XHJcbiAgcmV0dXJuIFwiI1wiICsgY29tcG9uZW50VG9IZXgocikgKyBjb21wb25lbnRUb0hleChnKSArIGNvbXBvbmVudFRvSGV4KGIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRNaWQoc3RhcnQsIGVuZCkge1xyXG5cdGxldCBtaWQgPSBNYXRoLmFicygoZW5kIC0gc3RhcnQpIC8gMik7XHJcblx0cmV0dXJuIChzdGFydCA8IGVuZCkgPyBzdGFydCArIG1pZCA6IGVuZCArIG1pZDtcclxufVxyXG5cclxudmFyIGRlc2NJc09wZW4gPSBmYWxzZTtcclxuXHJcbmZ1bmN0aW9uIGdldERlc2MocHQsIGpzb24sIGNiKSB7XHJcblx0ZGVzY0lzT3BlbiA9IHRydWU7XHJcblx0dmFyIGVkaXRvciA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZWRpdG9yXCIpO1xyXG5cdGVkaXRvci5zdHlsZS5sZWZ0ID0gcHQueCArIFwicHhcIjtcclxuXHRlZGl0b3Iuc3R5bGUudG9wID0gcHQueSArIFwicHhcIjtcclxuXHRlZGl0b3Iuc3R5bGUudmlzaWJpbGl0eSA9IFwidmlzaWJsZVwiO1xyXG5cdGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiZGVzY19lZGl0b3JcIikudmFsdWUgPSBqc29uLmRlc2M7XHJcblx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJzYXZlXCIpLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJyxmdW5jdGlvbiAoKSB7XHJcblx0XHRkZXNjSXNPcGVuID0gZmFsc2U7XHJcblx0XHRqc29uLmRlc2MgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImRlc2NfZWRpdG9yXCIpLnZhbHVlO1xyXG5cdFx0ZWRpdG9yLnN0eWxlLnZpc2liaWxpdHkgPSBcImhpZGRlblwiO1xyXG5cdFx0Y2IoKTtcclxuXHR9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gZ2V0U3ltYm9scygpIHtcclxuXHRsZXQgc3ltYm9scyA9IHN0b3JlLmdldChpbWFnZStleClcclxuXHRpZiAoIXN5bWJvbHMpIHtcclxuXHRcdHN5bWJvbHMgPSBbXVxyXG5cdFx0c3RvcmUuc2V0KGltYWdlK2V4LHN5bWJvbHMpXHJcblx0fVxyXG5cdHJldHVybiBzeW1ib2xzXHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZFN5bWJvbChzeW1ib2wpIHtcclxuXHRsZXQgc3ltYm9scyA9IGdldFN5bWJvbHMoKVxyXG5cdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzLmNvbmNhdChzeW1ib2wpKVxyXG59XHJcblxyXG5mdW5jdGlvbiByZW1vdmVTeW1ib2woc3ltYm9sKSB7XHJcblx0bGV0IHN5bWJvbHMgPSBnZXRTeW1ib2xzKClcclxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHN5bWJvbHMubGVuZ3RoOyBpKyspIHtcclxuXHRcdGxldCBqc29uID0gc3ltYm9sc1tpXVxyXG5cdFx0c3dpdGNoIChqc29uLnR5cGUpIHtcclxuXHRcdGNhc2UgXCJ2ZWN0b3JcIjpcclxuXHRcdFx0aWYgKFZlY3Rvci5pc1NhbWUoc3ltYm9sLHN5bWJvbHNbaV0pKSB7XHJcblx0XHRcdFx0c3ltYm9scy5zcGxpY2UoaSwxKVxyXG5cdFx0XHRcdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzKVxyXG5cdFx0XHRcdHJldHVyblxyXG5cdFx0XHR9XHJcblx0XHRcdGJyZWFrXHJcblx0XHRjYXNlIFwicmVnaW9uXCI6XHJcblx0XHRcdGlmIChQcmVzc3VyZVJlZ2lvbi5pc1NhbWUoc3ltYm9sLHN5bWJvbHNbaV0pKSB7XHJcblx0XHRcdFx0c3ltYm9scy5zcGxpY2UoaSwxKVxyXG5cdFx0XHRcdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzKVxyXG5cdFx0XHRcdHJldHVyblxyXG5cdFx0XHR9XHJcblx0XHRcdGJyZWFrXHJcblx0XHRjYXNlIFwiYWlybWFzc1wiOlxyXG5cdFx0XHRpZiAoQWlybWFzcy5pc1NhbWUoc3ltYm9sLHN5bWJvbHNbaV0pKSB7XHJcblx0XHRcdFx0c3ltYm9scy5zcGxpY2UoaSwxKVxyXG5cdFx0XHRcdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzKVxyXG5cdFx0XHRcdHJldHVyblxyXG5cdFx0XHR9XHJcblx0XHRcdGJyZWFrXHJcblx0XHRjYXNlIFwiaXNvcGxldGhcIjpcclxuXHRcdFx0aWYgKElzb1BsZXRoLmlzU2FtZShzeW1ib2wsc3ltYm9sc1tpXSkpIHtcclxuXHRcdFx0XHRzeW1ib2xzLnNwbGljZShpLDEpXHJcblx0XHRcdFx0c3RvcmUuc2V0KGltYWdlK2V4LHN5bWJvbHMpXHJcblx0XHRcdFx0cmV0dXJuXHJcblx0XHRcdH1cclxuXHRcdFx0YnJlYWtcclxuXHRcdGNhc2UgXCJsaW5lXCI6XHJcblx0XHRcdGlmIChMaW5lLmlzU2FtZShzeW1ib2wsc3ltYm9sc1tpXSkpIHtcclxuXHRcdFx0XHRzeW1ib2xzLnNwbGljZShpLDEpXHJcblx0XHRcdFx0c3RvcmUuc2V0KGltYWdlK2V4LHN5bWJvbHMpXHJcblx0XHRcdFx0cmV0dXJuXHJcblx0XHRcdH1cclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlIFwiZWxsaXBzZVwiOlxyXG5cdFx0XHRpZiAoRWxsaXBzZS5pc1NhbWUoc3ltYm9sLHN5bWJvbHNbaV0pKSB7XHJcblx0XHRcdFx0c3ltYm9scy5zcGxpY2UoaSwxKVxyXG5cdFx0XHRcdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzKVxyXG5cdFx0XHRcdHJldHVyblxyXG5cdFx0XHR9XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0Y2FzZSBcImZpZWxkXCI6XHJcblx0XHRcdGlmIChGaWVsZC5pc1NhbWUoc3ltYm9sLHN5bWJvbHNbaV0pKSB7XHJcblx0XHRcdFx0c3ltYm9scy5zcGxpY2UoaSwxKVxyXG5cdFx0XHRcdHN0b3JlLnNldChpbWFnZStleCxzeW1ib2xzKVxyXG5cdFx0XHRcdHJldHVyblxyXG5cdFx0XHR9XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0fVxyXG5cdH1cclxufVxyXG5cclxuZnVuY3Rpb24gZGVsZXRlU3ltYm9scygpIHtcclxuXHRzdG9yZS5zZXQoaW1hZ2UrZXgsW10pXHJcbn1cclxuXHJcblxyXG5jbGFzcyBWZWN0b3IgZXh0ZW5kcyBjcmVhdGVqcy5Db250YWluZXIge1xyXG5cdHN0YXRpYyBzaG93U3ltYm9sKHN0YWdlLGpzb24pIHtcclxuXHRcdGxldCBtYXAgPSBuZXcgY3JlYXRlanMuQml0bWFwKGpzb24uaW1nKVxyXG5cdFx0bWFwLnggPSBqc29uLnB0LnhcclxuXHRcdG1hcC55ID0ganNvbi5wdC55XHJcblx0XHRtYXAucmVnWCA9IDEyXHJcblx0XHRtYXAucmVnWSA9IDEyXHJcbiAgICBcdG1hcC5yb3RhdGlvbiA9IGpzb24ucm90XHJcbiAgICBcdG1hcC5jdXJzb3IgPSBcIm5vdC1hbGxvd2VkXCJcclxuXHRcdG1hcC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZSA9PiB7XHJcblx0XHRcdHJlbW92ZVN5bWJvbChqc29uKVxyXG5cdFx0XHRtYXAuc3RhZ2UucmVtb3ZlQ2hpbGQobWFwKVxyXG5cdFx0fSlcclxuXHRcdHN0YWdlLmFkZENoaWxkKG1hcClcclxuXHR9XHJcblx0XHJcblx0c3RhdGljIGlzU2FtZShqc29uMSxqc29uMikge1xyXG5cdFx0aWYgKGpzb24xLnR5cGUgIT0ganNvbjIudHlwZSkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEuaW1nICE9IGpzb24yLmltZykgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEucHQueCAhPSBqc29uMi5wdC54KSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5wdC55ICE9IGpzb24yLnB0LnkpIHJldHVybiBmYWxzZVxyXG5cdFx0cmV0dXJuIHRydWVcclxuXHR9XHJcblx0XHJcblx0Y29uc3RydWN0b3IoeCxyb3QsaW1nLGRyYXdzaW0pIHtcclxuXHRcdHN1cGVyKClcclxuXHRcdHRoaXMueCA9IHhcclxuXHRcdHRoaXMueSA9IDBcclxuXHRcdHRoaXMuaW1nID0gaW1nXHJcblx0XHR0aGlzLnJvdCA9IHJvdFxyXG5cdFx0bGV0IHNlbGVjdCA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0XHRzZWxlY3QuZ3JhcGhpY3MuYmVnaW5GaWxsKFwiI0NDQ1wiKS5kcmF3Um91bmRSZWN0KDAsMCwyNiwyNiwyLDIsMiwyKS5lbmRTdHJva2UoKVxyXG5cdFx0dGhpcy5hZGRDaGlsZChzZWxlY3QpXHJcblx0XHRsZXQgbWFwID0gbmV3IGNyZWF0ZWpzLkJpdG1hcChpbWcpXHJcblx0XHRtYXAueCA9IDEzXHJcblx0XHRtYXAueSA9IDEzXHJcblx0XHRtYXAucmVnWCA9IDEyXHJcblx0XHRtYXAucmVnWSA9IDEyXHJcbiAgICBcdG1hcC5yb3RhdGlvbiA9IHJvdFxyXG4gICAgXHR0aGlzLnNldEJvdW5kcyh4LDAsMjYsMjYpXHJcbiAgICBcdHRoaXMuYWRkQ2hpbGQobWFwKVxyXG5cdFx0c2VsZWN0LmFscGhhID0gMFxyXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdmVyXCIsIGUgPT4gc2VsZWN0LmFscGhhID0gMC41KVxyXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdXRcIiwgZSA9PiBzZWxlY3QuYWxwaGEgPSAwKVxyXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZSA9PiBkcmF3c2ltLnRvb2xiYXIuc2VsZWN0KHRoaXMpKVxyXG5cdH1cclxuXHRcclxuXHR0b0pTT04oeCx5KSB7XHJcblx0XHRyZXR1cm4ge3R5cGU6XCJ2ZWN0b3JcIiwgaW1nOiB0aGlzLmltZywgcm90OiB0aGlzLnJvdCwgcHQ6e3g6eCx5Onl9fVxyXG5cdH1cdFx0XHJcbn1cclxuXHJcbmNsYXNzIFByZXNzdXJlUmVnaW9uIGV4dGVuZHMgY3JlYXRlanMuQ29udGFpbmVyIHtcclxuXHRzdGF0aWMgc2hvd1N5bWJvbChzdGFnZSxqc29uKSB7XHJcblx0XHRsZXQgcmVnaW9uID0gbmV3IGNyZWF0ZWpzLkNvbnRhaW5lcigpXHJcblx0XHRsZXQgdHh0ID0gbmV3IGNyZWF0ZWpzLlRleHQoanNvbi5oaWdoP1wiSFwiOlwiTFwiLFwiYm9sZCAyNHB4IEFyaWFsXCIsanNvbi5oaWdoP1wiIzAwRlwiOlwiI0YwMFwiKVxyXG5cdFx0dHh0LnggPSBqc29uLnB0LnggLSAxMlxyXG5cdFx0dHh0LnkgPSBqc29uLnB0LnkgLSAxMlxyXG5cdFx0bGV0IGNpcmNsZSA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0XHRjaXJjbGUuZ3JhcGhpY3MuYmVnaW5GaWxsKGpzb24uaGlnaD9cIiMwRjBcIjpcIiNGRjBcIikuZHJhd0NpcmNsZShqc29uLnB0LngsanNvbi5wdC55LDI0KS5lbmRGaWxsKClcclxuXHRcdGNpcmNsZS5hbHBoYSA9IDAuNVxyXG5cdFx0cmVnaW9uLmFkZENoaWxkKGNpcmNsZSlcclxuXHRcdHJlZ2lvbi5hZGRDaGlsZCh0eHQpXHJcblx0XHRyZWdpb24uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4ge1xyXG5cdFx0XHRyZW1vdmVTeW1ib2woanNvbilcclxuXHRcdFx0cmVnaW9uLnN0YWdlLnJlbW92ZUNoaWxkKHJlZ2lvbilcclxuXHRcdH0pXHJcbiAgICBcdHJlZ2lvbi5jdXJzb3IgPSBcIm5vdC1hbGxvd2VkXCJcclxuXHRcdHN0YWdlLmFkZENoaWxkKHJlZ2lvbilcclxuXHR9XHJcblx0XHJcblx0c3RhdGljIGlzU2FtZShqc29uMSxqc29uMikge1xyXG5cdFx0aWYgKGpzb24xLnR5cGUgIT0ganNvbjIudHlwZSkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEuaGlnaCAhPSBqc29uMi5oaWdoKSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5wdC54ICE9IGpzb24yLnB0LngpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLnB0LnkgIT0ganNvbjIucHQueSkgcmV0dXJuIGZhbHNlXHJcblx0XHRyZXR1cm4gdHJ1ZVxyXG5cdH1cclxuXHRcclxuXHRjb25zdHJ1Y3Rvcih4LGhpZ2gsZHJhd3NpbSkge1xyXG5cdFx0c3VwZXIoKVxyXG5cdFx0dGhpcy5oaWdoID0gaGlnaFxyXG5cdFx0bGV0IHR4dCA9IG5ldyBjcmVhdGVqcy5UZXh0KGhpZ2g/XCJIXCI6XCJMXCIsXCJib2xkIDI0cHggQXJpYWxcIixoaWdoP1wiIzAwRlwiOlwiI0YwMFwiKVxyXG5cdFx0dHh0LnggPSB4ICsgMlxyXG5cdFx0dHh0LnkgPSAyXHJcblx0XHRsZXQgc2VsZWN0ID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuXHRcdHNlbGVjdC5ncmFwaGljcy5iZWdpbkZpbGwoXCIjQ0NDXCIpLmRyYXdSb3VuZFJlY3QoeCwwLDI2LDI2LDIsMiwyLDIpLmVuZFN0cm9rZSgpXHJcblx0XHR0aGlzLmFkZENoaWxkKHNlbGVjdClcclxuXHRcdGxldCBjaXJjbGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0Y2lyY2xlLmdyYXBoaWNzLmJlZ2luRmlsbChoaWdoP1wiIzBGMFwiOlwiI0ZGMFwiKS5kcmF3Q2lyY2xlKHgrMTIsMTIsMTMpLmVuZEZpbGwoKVxyXG5cdFx0Y2lyY2xlLmFscGhhID0gMC4zXHJcblx0XHR0aGlzLmFkZENoaWxkKGNpcmNsZSx0eHQpXHJcbiAgICBcdHRoaXMuc2V0Qm91bmRzKHgsMCwyNiwyNilcclxuXHRcdHNlbGVjdC5hbHBoYSA9IDBcclxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3ZlclwiLCBlID0+IHNlbGVjdC5hbHBoYSA9IDAuNSlcclxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcIm1vdXNlb3V0XCIsIGUgPT4gc2VsZWN0LmFscGhhID0gMClcclxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4gZHJhd3NpbS50b29sYmFyLnNlbGVjdCh0aGlzKSlcclxuXHR9XHJcblxyXG5cdHRvSlNPTih4LHkpIHtcclxuXHRcdHJldHVybiB7dHlwZTpcInJlZ2lvblwiLCBoaWdoOiB0aGlzLmhpZ2gsIHB0Ont4OngseTp5fX1cclxuXHR9XHRcdFxyXG5cclxuXHRnZXRMZW5ndGgoKSB7IHJldHVybiAyKjMwKzIgfVxyXG5cclxuXHRnZXRJbnN0KCkge1xyXG5cdFx0cmV0dXJuIFwiPHA+Q2xpY2sgbG9jYXRpb24gYW5kIHNlbGVjdCBhbiBpY29uIHRvIGFkZC4gQ2xpY2sgaWNvbiBpbiBtYXAgdG8gZGVsZXRlLjwvcD5cIlxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgUHJlc3N1cmVzIGV4dGVuZHMgY3JlYXRlanMuQ29udGFpbmVyIHtcclxuXHRjb25zdHJ1Y3Rvcih4LGRyYXdzaW0pIHtcclxuXHRcdHN1cGVyKClcclxuXHRcdHRoaXMueCA9IHhcclxuXHRcdHRoaXMueSA9IDJcclxuXHRcdGlmIChvcHQgPT0gXCJhbGxcIiB8fCBvcHQgPT0gXCJhcnJvd3NcIilcclxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA4OyBpKyspIHtcclxuXHRcdFx0XHRsZXQgdiA9IG5ldyBWZWN0b3IoeCw0NSppLFwiYXNzZXRzL2xlZnQtYXJyb3cucG5nXCIsZHJhd3NpbSlcclxuXHRcdFx0XHR0aGlzLmFkZENoaWxkKHYpXHJcblx0XHRcdFx0eCArPSAzMFxyXG5cdFx0XHR9XHJcblx0XHRpZiAob3B0ID09IFwiYWxsXCIgfHwgb3B0ID09IFwiaGxcIikge1xyXG5cdFx0XHR0aGlzLmFkZENoaWxkKG5ldyBQcmVzc3VyZVJlZ2lvbih4LHRydWUsZHJhd3NpbSkpXHJcblx0XHRcdHggKz0gMzBcclxuXHRcdFx0dGhpcy5hZGRDaGlsZChuZXcgUHJlc3N1cmVSZWdpb24oeCxmYWxzZSxkcmF3c2ltKSlcclxuXHRcdFx0eCArPSAzMFxyXG5cdFx0fVxyXG5cdH1cclxuXHRcclxuXHRnZXRMZW5ndGgoKSB7XHJcblx0XHRsZXQgbiA9IG9wdCA9PSBcImFsbFwiPzEwOm9wdCA9PSBcImFycm93c1wiPzg6MlxyXG5cdFx0cmV0dXJuIG4qMzArMiBcclxuXHR9XHJcblxyXG5cdGdldEluc3QoKSB7XHJcblx0XHRyZXR1cm4gXCI8cD5DbGljayBsb2NhdGlvbiBhbmQgc2VsZWN0IGFuIGljb24gdG8gYWRkLiBDbGljayBpY29uIGluIG1hcCB0byBkZWxldGUuPC9wPlwiXHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBBaXJtYXNzIGV4dGVuZHMgY3JlYXRlanMuQ29udGFpbmVyIHtcclxuXHRzdGF0aWMgc2hvd1N5bWJvbChzdGFnZSxqc29uKSB7XHJcblx0XHRsZXQgYWlybWFzcyA9IG5ldyBjcmVhdGVqcy5Db250YWluZXIoKVxyXG5cdFx0YWlybWFzcy54ID0ganNvbi5wdC54XHJcblx0XHRhaXJtYXNzLnkgPSBqc29uLnB0LnlcclxuXHRcdGxldCBjaXJjbGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0Y2lyY2xlLmdyYXBoaWNzLmJlZ2luRmlsbChcIiNGRkZcIikuYmVnaW5TdHJva2UoXCIjMDAwXCIpLmRyYXdDaXJjbGUoMTQsMTQsMTQpLmVuZFN0cm9rZSgpXHJcblx0XHRhaXJtYXNzLmFkZENoaWxkKGNpcmNsZSlcclxuXHRcdGxldCB0eHQgPSBuZXcgY3JlYXRlanMuVGV4dChqc29uLm5hbWUsXCIxMnB4IEFyaWFsXCIsXCIjMDAwXCIpXHJcblx0XHR0eHQueCA9IDZcclxuXHRcdHR4dC55ID0gMTBcclxuXHRcdGFpcm1hc3MuYWRkQ2hpbGQodHh0KVxyXG4gICAgXHRhaXJtYXNzLmN1cnNvciA9IFwibm90LWFsbG93ZWRcIlxyXG5cdFx0XHRhaXJtYXNzLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBlID0+IHtcclxuXHRcdFx0cmVtb3ZlU3ltYm9sKGpzb24pXHJcblx0XHRcdGFpcm1hc3Muc3RhZ2UucmVtb3ZlQ2hpbGQoYWlybWFzcylcclxuXHRcdH0pXHJcbiAgICBcdHN0YWdlLmFkZENoaWxkKGFpcm1hc3MpXHJcblx0fVxyXG5cdFxyXG5cdHN0YXRpYyBpc1NhbWUoanNvbjEsanNvbjIpIHtcclxuXHRcdGlmIChqc29uMS50eXBlICE9IGpzb24yLnR5cGUpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLm5hbWUgIT0ganNvbjIubmFtZSkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEucHQueCAhPSBqc29uMi5wdC54KSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5wdC55ICE9IGpzb24yLnB0LnkpIHJldHVybiBmYWxzZVxyXG5cdFx0cmV0dXJuIHRydWVcclxuXHR9XHJcblx0XHJcblx0Y29uc3RydWN0b3IoeCxuYW1lLGRyYXdzaW0pIHtcclxuXHRcdHN1cGVyKClcclxuXHRcdHRoaXMueCA9IHhcclxuXHRcdHRoaXMueSA9IDJcclxuXHRcdHRoaXMubmFtZSA9IG5hbWVcclxuXHRcdGxldCBjaXJjbGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0Y2lyY2xlLmdyYXBoaWNzLmJlZ2luRmlsbChcIiNGRkZcIikuYmVnaW5TdHJva2UoXCIjMDAwXCIpLmRyYXdDaXJjbGUoMTQsMTQsMTQpLmVuZFN0cm9rZSgpXHJcblx0XHR0aGlzLmFkZENoaWxkKGNpcmNsZSlcclxuXHRcdGxldCB0eHQgPSBuZXcgY3JlYXRlanMuVGV4dChuYW1lLFwiMTJweCBBcmlhbFwiLFwiIzAwMFwiKVxyXG5cdFx0dHh0LnggPSA2XHJcblx0XHR0eHQueSA9IDEwXHJcblx0XHR0aGlzLmFkZENoaWxkKHR4dClcclxuXHRcdGxldCBzZWxlY3QgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0c2VsZWN0LmdyYXBoaWNzLmJlZ2luRmlsbChcIiNDQ0NcIikuZHJhd0NpcmNsZSgxNCwxNCwxNCkuZW5kU3Ryb2tlKClcclxuXHRcdHRoaXMuYWRkQ2hpbGQoc2VsZWN0KVxyXG5cdFx0c2VsZWN0LmFscGhhID0gMFxyXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKFwibW91c2VvdmVyXCIsIGUgPT4ge1xyXG5cdFx0XHRzZWxlY3QuYWxwaGEgPSAwLjVcclxuXHRcdH0pXHJcblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZW91dFwiLCBlID0+IHtcclxuXHRcdFx0c2VsZWN0LmFscGhhID0gMFxyXG5cdFx0fSlcclxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4ge1xyXG5cdFx0XHRkcmF3c2ltLnRvb2xiYXIuc2VsZWN0KHRoaXMpXHJcblx0XHR9KVxyXG5cdH1cclxuXHRcclxuXHR0b0pTT04oeCx5KSB7XHJcblx0XHRyZXR1cm4ge3R5cGU6XCJhaXJtYXNzXCIsIG5hbWU6IHRoaXMubmFtZSwgcHQ6e3g6eCx5Onl9fVxyXG5cdH1cdFx0XHJcbn1cclxuXHJcbmNsYXNzIEFpcm1hc3NlcyBleHRlbmRzIGNyZWF0ZWpzLkNvbnRhaW5lciB7XHJcblx0Y29uc3RydWN0b3IoeCx0b29sYmFyKSB7XHJcblx0XHRzdXBlcigpXHJcblx0XHRsZXQgbWFzc2VzID0gW1wiY1BcIixcIm1QXCIsXCJjVFwiLFwibVRcIixcImNFXCIsXCJtRVwiLFwiY0FcIixcIm1BXCJdXHJcblx0XHRtYXNzZXMuZm9yRWFjaChuYW1lID0+IHtcclxuXHRcdFx0dGhpcy5hZGRDaGlsZChuZXcgQWlybWFzcyh4LG5hbWUsdG9vbGJhcikpXHJcblx0XHRcdHggKz0gMzBcclxuXHRcdH0pXHJcblx0fVxyXG5cdFxyXG5cdGdldExlbmd0aCgpIHsgcmV0dXJuIDgqMzArMiB9XHJcblxyXG5cdGdldEluc3QoKSB7XHJcblx0XHRyZXR1cm4gXCI8cD5DbGljayBsb2NhdGlvbiBhbmQgc2VsZWN0IGFpcm1hc3MgdG8gYWRkLiBDbGljayBhaXJtYXNzIHRvIGRlbGV0ZS48L3A+XCJcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIElzb1BsZXRoIHtcclxuXHRzdGF0aWMgc2hvd1N5bWJvbChzdGFnZSxqc29uKSB7XHJcblx0XHRsZXQgcHRzID0ganNvbi5wdHNcclxuXHRcdGxldCBwYXRoID0gbmV3IGNyZWF0ZWpzLkNvbnRhaW5lcigpXHJcblx0XHRsZXQgc2hhcGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdCAgICBzaGFwZS5ncmFwaGljcy5iZWdpblN0cm9rZShcIiMwMEZcIilcclxuXHRcdGxldCBvbGRYID0gcHRzWzBdLnhcclxuXHRcdGxldCBvbGRZID0gcHRzWzBdLnlcclxuXHRcdGxldCBvbGRNaWRYID0gb2xkWFxyXG5cdFx0bGV0IG9sZE1pZFkgPSBvbGRZXHJcblx0ICAgIGpzb24ucHRzLmZvckVhY2gocHQgPT4ge1xyXG5cdFx0XHRsZXQgbWlkUG9pbnQgPSBuZXcgY3JlYXRlanMuUG9pbnQob2xkWCArIHB0LnggPj4gMSwgb2xkWStwdC55ID4+IDEpXHJcblx0ICAgICAgICBzaGFwZS5ncmFwaGljcy5zZXRTdHJva2VTdHlsZSg0KS5tb3ZlVG8obWlkUG9pbnQueCwgbWlkUG9pbnQueSlcclxuXHQgICAgICAgIHNoYXBlLmdyYXBoaWNzLmN1cnZlVG8ob2xkWCwgb2xkWSwgb2xkTWlkWCwgb2xkTWlkWSlcclxuXHQgICAgICAgIG9sZFggPSBwdC54XHJcblx0ICAgICAgICBvbGRZID0gcHQueVxyXG5cdCAgICAgICAgb2xkTWlkWCA9IG1pZFBvaW50LnhcclxuXHQgICAgICAgIG9sZE1pZFkgPSBtaWRQb2ludC55XHJcblx0ICAgIH0pXHJcblx0XHRwYXRoLmFkZENoaWxkKHNoYXBlKVxyXG5cdFx0bGV0IGZpcnN0ID0gcHRzWzBdLCBsYXN0ID0gcHRzW3B0cy5sZW5ndGgtMV1cclxuXHRcdGxldCBsYWJlbCA9IElzb1BsZXRoLmdldExhYmVsKGpzb24udmFsdWUsZmlyc3QueCAtIDEwLGZpcnN0LnkgKyAoZmlyc3QueSA8IGxhc3QueT8gLTI0OiAwKSlcclxuICAgIFx0bGFiZWwuY3Vyc29yID0gXCJub3QtYWxsb3dlZFwiXHJcblx0XHRsYWJlbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZSA9PiB7XHJcblx0XHRcdHJlbW92ZVN5bWJvbChqc29uKVxyXG5cdFx0XHRzdGFnZS5yZW1vdmVDaGlsZChwYXRoKVxyXG5cdFx0fSlcclxuXHRcdHBhdGguYWRkQ2hpbGQobGFiZWwpXHJcblx0XHRpZiAoZGlzdChmaXJzdCxsYXN0KSA+IDEwKSB7XHJcblx0XHRcdGxldCBsYWJlbCA9IElzb1BsZXRoLmdldExhYmVsKGpzb24udmFsdWUsbGFzdC54IC0gMTAsbGFzdC55ICsgKGZpcnN0LnkgPCBsYXN0Lnk/IDAgOiAtMjQpKVxyXG5cdFx0XHRsYWJlbC5jdXJzb3IgPSBcIm5vdC1hbGxvd2VkXCJcclxuXHRcdFx0bGFiZWwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4ge1xyXG5cdFx0XHRcdHJlbW92ZVN5bWJvbChqc29uKVxyXG5cdFx0XHRcdHN0YWdlLnJlbW92ZUNoaWxkKHBhdGgpXHJcblx0XHRcdH0pXHJcblx0XHRcdHBhdGguYWRkQ2hpbGQobGFiZWwpXHJcblx0XHR9XHJcblx0XHRzdGFnZS5hZGRDaGlsZChwYXRoKVxyXG5cdH1cclxuXHRcclxuXHRzdGF0aWMgZ2V0TGFiZWwobmFtZSx4LHkpIHtcclxuXHRcdGxldCBsYWJlbCA9IG5ldyBjcmVhdGVqcy5Db250YWluZXIoKVxyXG5cdFx0bGV0IHR4dCA9IG5ldyBjcmVhdGVqcy5UZXh0KG5hbWUsXCJib2xkIDI0cHggQXJpYWxcIixcIiMwMEZcIilcclxuXHRcdHR4dC54ID0geFxyXG5cdFx0dHh0LnkgPSB5XHJcblx0XHRsZXQgY2lyY2xlID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuXHRcdGNpcmNsZS5ncmFwaGljcy5iZWdpbkZpbGwoXCIjRkZGXCIpLmRyYXdDaXJjbGUoeCArIDEyLHkgKyAxMiwyMCkuZW5kRmlsbCgpXHJcblx0XHRsYWJlbC5hZGRDaGlsZChjaXJjbGUpXHJcblx0XHRsYWJlbC5hZGRDaGlsZCh0eHQpXHJcblx0XHRyZXR1cm4gbGFiZWxcclxuXHR9XHJcblx0XHJcblx0c3RhdGljIGlzU2FtZShqc29uMSxqc29uMikge1xyXG5cdFx0aWYgKGpzb24xLnR5cGUgIT0ganNvbjIudHlwZSkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEudmFsdWUgIT0ganNvbjIudmFsdWUpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLnB0c1swXS54ICE9IGpzb24yLnB0c1swXS54KSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5wdHNbMF0ueSAhPSBqc29uMi5wdHNbMF0ueSkgcmV0dXJuIGZhbHNlXHJcblx0XHRyZXR1cm4gdHJ1ZVxyXG5cdH1cclxuXHRcclxuXHRjb25zdHJ1Y3RvcihiYWNrLGRyYXdzaW0pIHtcclxuXHRcdGNyZWF0ZWpzLlRpY2tlci5mcmFtZXJhdGUgPSAxMFxyXG5cdFx0dGhpcy5iYWNrID0gYmFja1xyXG5cdFx0dGhpcy5tb3VzZURvd24gPSBmYWxzZVxyXG5cdFx0ZHJhd3NpbS5tYWluc3RhZ2UuYWRkRXZlbnRMaXN0ZW5lcihcInN0YWdlbW91c2Vkb3duXCIsIGUgPT4ge1xyXG5cdFx0XHR0aGlzLmN1cnJlbnRTaGFwZSA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0XHQgICAgdGhpcy5jdXJyZW50U2hhcGUuZ3JhcGhpY3MuYmVnaW5TdHJva2UoXCIjMDBGXCIpXHJcblx0XHRcdGRyYXdzaW0ubWFpbnN0YWdlLmFkZENoaWxkKHRoaXMuY3VycmVudFNoYXBlKVxyXG5cdFx0ICAgIHRoaXMub2xkWCA9IHRoaXMub2xkTWlkWCA9IGUuc3RhZ2VYXHJcblx0XHQgICAgdGhpcy5vbGRZID0gdGhpcy5vbGRNaWRZID0gZS5zdGFnZVlcclxuXHRcdFx0dGhpcy5tb3VzZURvd24gPSB0cnVlXHJcblx0XHRcdHRoaXMucHRzID0gW11cclxuXHRcdH0pXHJcblx0XHRkcmF3c2ltLm1haW5zdGFnZS5hZGRFdmVudExpc3RlbmVyKFwic3RhZ2Vtb3VzZW1vdmVcIiwgZSA9PiB7XHJcblx0XHRcdGlmICh0aGlzLm1vdXNlRG93biA9PSBmYWxzZSkgcmV0dXJuXHJcblx0ICAgICAgICB0aGlzLnB0ID0gbmV3IGNyZWF0ZWpzLlBvaW50KGUuc3RhZ2VYLCBlLnN0YWdlWSlcclxuXHRcdFx0dGhpcy5wdHMgPSB0aGlzLnB0cy5jb25jYXQoe3g6ZS5zdGFnZVgseTplLnN0YWdlWX0pXHJcblx0XHRcdGxldCBtaWRQb2ludCA9IG5ldyBjcmVhdGVqcy5Qb2ludCh0aGlzLm9sZFggKyB0aGlzLnB0LnggPj4gMSwgdGhpcy5vbGRZK3RoaXMucHQueSA+PiAxKVxyXG5cdCAgICAgICAgdGhpcy5jdXJyZW50U2hhcGUuZ3JhcGhpY3Muc2V0U3Ryb2tlU3R5bGUoNCkubW92ZVRvKG1pZFBvaW50LngsIG1pZFBvaW50LnkpXHJcblx0ICAgICAgICB0aGlzLmN1cnJlbnRTaGFwZS5ncmFwaGljcy5jdXJ2ZVRvKHRoaXMub2xkWCwgdGhpcy5vbGRZLCB0aGlzLm9sZE1pZFgsIHRoaXMub2xkTWlkWSlcclxuXHQgICAgICAgIHRoaXMub2xkWCA9IHRoaXMucHQueFxyXG5cdCAgICAgICAgdGhpcy5vbGRZID0gdGhpcy5wdC55XHJcblx0ICAgICAgICB0aGlzLm9sZE1pZFggPSBtaWRQb2ludC54XHJcblx0ICAgICAgICB0aGlzLm9sZE1pZFkgPSBtaWRQb2ludC55XHJcblx0XHR9KVxyXG5cdFx0ZHJhd3NpbS5tYWluc3RhZ2UuYWRkRXZlbnRMaXN0ZW5lcihcInN0YWdlbW91c2V1cFwiLCBlID0+IHtcclxuXHRcdFx0dGhpcy5tb3VzZURvd24gPSBmYWxzZVxyXG5cdFx0XHRkcmF3c2ltLm1haW5zdGFnZS5yZW1vdmVDaGlsZCh0aGlzLmN1cnJlbnRTaGFwZSlcclxuXHRcdFx0aWYgKHRoaXMucHRzLmxlbmd0aCA8IDMpIHJldHVyblxyXG5cdFx0XHRsZXQgdmFsdWUgPSBwcm9tcHQoXCJFbnRlciB2YWx1ZTpcIiwxKVxyXG5cdFx0XHRpZiAodmFsdWUpIHtcclxuXHRcdFx0XHRsZXQgc3ltYm9sID0ge3R5cGU6XCJpc29wbGV0aFwiLHZhbHVlOiB2YWx1ZSwgcHRzOiB0aGlzLnB0c31cclxuXHRcdFx0XHRJc29QbGV0aC5zaG93U3ltYm9sKGRyYXdzaW0ubWFpbnN0YWdlLHN5bWJvbClcclxuXHRcdFx0XHRhZGRTeW1ib2woc3ltYm9sKVxyXG5cdFx0XHR9XHJcblx0XHR9KVxyXG5cdH1cclxuXHRcclxuXHRnZXRJbnN0KCkge1xyXG5cdFx0cmV0dXJuIFwiPHA+UHJlc3MgYW5kIGRyYWcgbW91c2UgdG8gZHJhdyBsaW5lLiBSZWxlYXNlIHdoZW4gZG9uZS4gU3VwcGx5IGEgdmFsdWUgd2hlbiBwcm9tcHRlZC4gIENsaWNrIHZhbHVlIHRvIGRlbGV0ZS48L3A+XCJcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIExpbmUge1xyXG5cdHN0YXRpYyBnZXRMaW5lU2hhcGUobHQpIHtcclxuXHRcdGxldCBzaGFwZSA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0ICAgIHNoYXBlLmdyYXBoaWNzLnNldFN0cm9rZVN0eWxlKGx0LncpLmJlZ2luU3Ryb2tlKGx0LmMpXHJcblx0ICAgIHJldHVybiBzaGFwZVxyXG5cdH1cclxuXHRcclxuXHRzdGF0aWMgc2V0QnV0dG9uKGJ1dHRvbixjb2xvcikge1xyXG5cdFx0bGV0IGIgPSBidXR0b24uZ2V0Q2hpbGRBdCgwKVxyXG5cdFx0bGV0IGJvcmRlciA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0XHRib3JkZXIueCA9IGIueFxyXG5cdFx0Ym9yZGVyLmdyYXBoaWNzLnNldFN0cm9rZVN0eWxlKDEpLmJlZ2luRmlsbChjb2xvcikuYmVnaW5TdHJva2UoXCIjQUFBXCIpLmRyYXdSb3VuZFJlY3QoMCwyLDYyLDE4LDIsMiwyLDIpLmVuZFN0cm9rZSgpXHJcblx0XHRidXR0b24ucmVtb3ZlQ2hpbGRBdCgwKVxyXG5cdFx0YnV0dG9uLmFkZENoaWxkQXQoYm9yZGVyLDApXHJcblx0fVxyXG5cdFxyXG5cdHN0YXRpYyBnZXRCdXR0b24oeCxuYW1lKSB7XHJcblx0XHRsZXQgbHQgPSBsaW5ldHlwZXNbbmFtZV1cclxuXHRcdGxldCBidXR0b24gPSBuZXcgY3JlYXRlanMuQ29udGFpbmVyKClcclxuXHRcdGJ1dHRvbi5jdXJzb3IgPSBcInBvaW50ZXJcIlxyXG5cdFx0YnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLGUgPT4ge1xyXG5cdFx0XHRpZiAobmFtZSA9PSBsaW5ldHlwZSkgcmV0dXJuXHJcblx0XHRcdGlmIChsaW5ldHlwZUJ1dHRvbikgTGluZS5zZXRCdXR0b24obGluZXR5cGVCdXR0b24sXCIjRkZGXCIpXHJcblx0XHRcdExpbmUuc2V0QnV0dG9uKGJ1dHRvbixcIiNFRUVcIilcclxuXHRcdFx0bGluZXR5cGUgPSBuYW1lXHJcblx0XHRcdGxpbmV0eXBlQnV0dG9uID0gYnV0dG9uXHRcdFx0XHJcblx0XHR9KVxyXG5cdFx0bGV0IGJvcmRlciA9IG5ldyBjcmVhdGVqcy5TaGFwZSgpXHJcblx0XHRib3JkZXIuZ3JhcGhpY3Muc2V0U3Ryb2tlU3R5bGUoMSkuYmVnaW5GaWxsKG5hbWUgPT0gbGluZXR5cGU/XCIjRUVFXCI6XCIjRkZGXCIpLmJlZ2luU3Ryb2tlKFwiI0FBQVwiKS5kcmF3Um91bmRSZWN0KDAsMiw2MiwxOCwyLDIsMiwyKS5lbmRTdHJva2UoKVxyXG5cdFx0aWYgKG5hbWUgPT0gbGluZXR5cGUpIGxpbmV0eXBlQnV0dG9uID0gYnV0dG9uXHJcblx0XHRib3JkZXIueCA9IHhcclxuXHRcdGxldCB0eHQgPSBuZXcgY3JlYXRlanMuVGV4dChuYW1lLFwiYm9sZCAxMnB4IEFyaWFsXCIsXCIjMDAwXCIpXHJcblx0XHR0eHQueCA9IHgrNVxyXG5cdFx0dHh0LnkgPSA1XHJcblx0XHRsZXQgbGluZSA9IExpbmUuZ2V0TGluZVNoYXBlKGx0KVxyXG5cdFx0bGV0IGxlZnQgPSB4ICsgdHh0LmdldEJvdW5kcygpLndpZHRoKzEwXHJcblx0XHRsaW5lLmdyYXBoaWNzLm1vdmVUbyhsZWZ0LDEwKS5saW5lVG8obGVmdCsxNSwxMCkuZW5kU3Ryb2tlKClcclxuXHRcdGJ1dHRvbi5hZGRDaGlsZChib3JkZXIsdHh0LGxpbmUpXHJcblx0XHRyZXR1cm4gYnV0dG9uXHJcblx0fVxyXG5cdFxyXG5cdHN0YXRpYyBzaG93U3ltYm9sKHN0YWdlLGpzb24pIHtcclxuXHRcdGxldCBwdHMgPSBqc29uLnB0c1xyXG5cdFx0bGV0IHBhdGggPSBuZXcgY3JlYXRlanMuQ29udGFpbmVyKClcclxuXHRcdHBhdGgubmFtZSA9IGpzb24ubHR5cGVcclxuXHRcdGxldCBzaGFwZSA9IExpbmUuZ2V0TGluZVNoYXBlKGxpbmV0eXBlc1tqc29uLmx0eXBlXSlcclxuXHRcdGxldCBvbGRYID0gcHRzWzBdLnhcclxuXHRcdGxldCBvbGRZID0gcHRzWzBdLnlcclxuXHRcdGxldCBvbGRNaWRYID0gb2xkWFxyXG5cdFx0bGV0IG9sZE1pZFkgPSBvbGRZXHJcblx0ICAgIGpzb24ucHRzLmZvckVhY2gocHQgPT4ge1xyXG5cdFx0XHRsZXQgbWlkUG9pbnQgPSBuZXcgY3JlYXRlanMuUG9pbnQob2xkWCArIHB0LnggPj4gMSwgb2xkWStwdC55ID4+IDEpXHJcblx0ICAgICAgICBzaGFwZS5ncmFwaGljcy5tb3ZlVG8obWlkUG9pbnQueCwgbWlkUG9pbnQueSlcclxuXHQgICAgICAgIHNoYXBlLmdyYXBoaWNzLmN1cnZlVG8ob2xkWCwgb2xkWSwgb2xkTWlkWCwgb2xkTWlkWSlcclxuXHQgICAgICAgIG9sZFggPSBwdC54XHJcblx0ICAgICAgICBvbGRZID0gcHQueVxyXG5cdCAgICAgICAgb2xkTWlkWCA9IG1pZFBvaW50LnhcclxuXHQgICAgICAgIG9sZE1pZFkgPSBtaWRQb2ludC55XHJcblx0ICAgIH0pXHJcblx0ICAgIHBhdGguYWRkQ2hpbGQoc2hhcGUpXHJcblx0ICAgIHN0YWdlLmFkZENoaWxkKHBhdGgpXHJcblx0fVxyXG5cdFxyXG5cdHN0YXRpYyBpc1NhbWUoanNvbjEsanNvbjIpIHtcclxuXHRcdGlmIChqc29uMS50eXBlICE9IGpzb24yLnR5cGUpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLmx0eXBlICE9IGpzb24yLmx0eXBlKSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5wdHNbMF0ueCAhPSBqc29uMi5wdHNbMF0ueCkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEucHRzWzBdLnkgIT0ganNvbjIucHRzWzBdLnkpIHJldHVybiBmYWxzZVxyXG5cdFx0cmV0dXJuIHRydWVcclxuXHR9XHJcblx0XHJcblx0Y29uc3RydWN0b3IoYmFjayxkcmF3c2ltKSB7XHJcblx0XHRjcmVhdGVqcy5UaWNrZXIuZnJhbWVyYXRlID0gMTBcclxuXHRcdHRoaXMuYmFjayA9IGJhY2tcclxuXHRcdHRoaXMubW91c2VEb3duID0gZmFsc2VcclxuXHRcdGxldCB4ID0gNVxyXG5cdFx0Zm9yIChsZXQga2V5IGluIGxpbmV0eXBlcykge1xyXG5cdFx0XHRsZXQgYiA9IExpbmUuZ2V0QnV0dG9uKHgsa2V5KVxyXG5cdFx0XHRkcmF3c2ltLm1haW5zdGFnZS5hZGRDaGlsZChiKVxyXG5cdFx0XHR4ICs9IDY1XHJcblx0XHR9XHJcblx0XHRkcmF3c2ltLm1haW5zdGFnZS5hZGRFdmVudExpc3RlbmVyKFwic3RhZ2Vtb3VzZWRvd25cIiwgZSA9PiB7XHJcblx0XHRcdHRoaXMuY3VycmVudFNoYXBlID0gTGluZS5nZXRMaW5lU2hhcGUobGluZXR5cGVzW2xpbmV0eXBlXSlcclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UuYWRkQ2hpbGQodGhpcy5jdXJyZW50U2hhcGUpXHJcblx0XHQgICAgdGhpcy5vbGRYID0gdGhpcy5vbGRNaWRYID0gZS5zdGFnZVhcclxuXHRcdCAgICB0aGlzLm9sZFkgPSB0aGlzLm9sZE1pZFkgPSBlLnN0YWdlWVxyXG5cdFx0XHR0aGlzLm1vdXNlRG93biA9IHRydWVcclxuXHRcdFx0dGhpcy5wdHMgPSBbXVxyXG5cdFx0fSlcclxuXHRcdGRyYXdzaW0ubWFpbnN0YWdlLmFkZEV2ZW50TGlzdGVuZXIoXCJzdGFnZW1vdXNlbW92ZVwiLCBlID0+IHtcclxuXHRcdFx0aWYgKHRoaXMubW91c2VEb3duID09IGZhbHNlKSByZXR1cm5cclxuXHQgICAgICAgIHRoaXMucHQgPSBuZXcgY3JlYXRlanMuUG9pbnQoZS5zdGFnZVgsIGUuc3RhZ2VZKVxyXG5cdFx0XHR0aGlzLnB0cyA9IHRoaXMucHRzLmNvbmNhdCh7eDplLnN0YWdlWCx5OmUuc3RhZ2VZfSlcclxuXHRcdFx0bGV0IG1pZFBvaW50ID0gbmV3IGNyZWF0ZWpzLlBvaW50KHRoaXMub2xkWCArIHRoaXMucHQueCA+PiAxLCB0aGlzLm9sZFkrdGhpcy5wdC55ID4+IDEpXHJcblx0ICAgICAgICB0aGlzLmN1cnJlbnRTaGFwZS5ncmFwaGljcy5zZXRTdHJva2VTdHlsZShsaW5ldHlwZXNbbGluZXR5cGVdLncpLm1vdmVUbyhtaWRQb2ludC54LCBtaWRQb2ludC55KVxyXG5cdCAgICAgICAgdGhpcy5jdXJyZW50U2hhcGUuZ3JhcGhpY3MuY3VydmVUbyh0aGlzLm9sZFgsIHRoaXMub2xkWSwgdGhpcy5vbGRNaWRYLCB0aGlzLm9sZE1pZFkpXHJcblx0ICAgICAgICB0aGlzLm9sZFggPSB0aGlzLnB0LnhcclxuXHQgICAgICAgIHRoaXMub2xkWSA9IHRoaXMucHQueVxyXG5cdCAgICAgICAgdGhpcy5vbGRNaWRYID0gbWlkUG9pbnQueFxyXG5cdCAgICAgICAgdGhpcy5vbGRNaWRZID0gbWlkUG9pbnQueVxyXG5cdFx0fSlcclxuXHRcdGRyYXdzaW0ubWFpbnN0YWdlLmFkZEV2ZW50TGlzdGVuZXIoXCJzdGFnZW1vdXNldXBcIiwgZSA9PiB7XHJcblx0XHRcdHRoaXMubW91c2VEb3duID0gZmFsc2VcclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UucmVtb3ZlQ2hpbGQodGhpcy5jdXJyZW50U2hhcGUpXHJcblx0XHRcdGlmICh0aGlzLnB0cy5sZW5ndGggPCAzKSByZXR1cm5cclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UucmVtb3ZlQ2hpbGQoZHJhd3NpbS5tYWluc3RhZ2UuZ2V0Q2hpbGRCeU5hbWUobGluZXR5cGUpKVxyXG5cdFx0XHRnZXRTeW1ib2xzKCkuZm9yRWFjaChzID0+IHtcclxuXHRcdFx0XHRpZiAocy5sdHlwZSA9PSBsaW5ldHlwZSkgcmVtb3ZlU3ltYm9sKHMpXHJcblx0XHRcdH0pXHJcblx0XHRcdGxldCBzeW1ib2wgPSB7dHlwZTpcImxpbmVcIixsdHlwZTogbGluZXR5cGUsIHB0czogdGhpcy5wdHN9XHJcblx0XHRcdExpbmUuc2hvd1N5bWJvbChkcmF3c2ltLm1haW5zdGFnZSxzeW1ib2wpXHJcblx0XHRcdGFkZFN5bWJvbChzeW1ib2wpXHJcblx0XHRcdFxyXG5cdFx0fSlcclxuXHR9XHJcblx0XHJcblx0Z2V0SW5zdCgpIHtcclxuXHRcdHJldHVybiBcIjxwPlNlbGVjdCBhIGxpbmUgdHlwZSwgdGhlbiBwcmVzcyBhbmQgZHJhZyBtb3VzZSB0byBkcmF3LiBSZWxlYXNlIHdoZW4gZG9uZS48YnIvPkRyYXdpbmcgYW5vdGhlciBsaW5lIG9mIHRoZSBzYW1lIHR5cGUgd2lsbCByZXBsYWNlIHRoZSBwcmV2aW91cyBsaW5lLjwvcD5cIlxyXG5cdH1cclxufVxyXG5cclxuY2xhc3MgRWxsaXBzZSBleHRlbmRzIGNyZWF0ZWpzLkNvbnRhaW5lciB7XHJcblx0c3RhdGljIHNob3dTeW1ib2woc3RhZ2UsanNvbikge1xyXG5cdFx0bGV0IGVsbGlwc2UgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0ZWxsaXBzZS5ncmFwaGljcy5zZXRTdHJva2VTdHlsZSgyKS5iZWdpbkZpbGwoXCIjRkZGXCIpLmJlZ2luU3Ryb2tlKFwiI0YwMFwiKS5kcmF3RWxsaXBzZShNYXRoLnJvdW5kKGpzb24ucHQueC1qc29uLncvMiksTWF0aC5yb3VuZChqc29uLnB0LnktanNvbi5oLzIpLE1hdGgucm91bmQoanNvbi53KSxNYXRoLnJvdW5kKGpzb24uaCkpLmVuZFN0cm9rZSgpXHJcblx0XHRlbGxpcHNlLmFscGhhID0gMC41XHJcbiAgICBcdGVsbGlwc2UuY3Vyc29yID0gXCJub3QtYWxsb3dlZFwiXHJcblx0XHRlbGxpcHNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBlID0+IHtcclxuXHRcdFx0cmVtb3ZlU3ltYm9sKGpzb24pXHJcblx0XHRcdHN0YWdlLnJlbW92ZUNoaWxkKGVsbGlwc2UpXHJcblx0XHR9KVxyXG4gICAgXHRzdGFnZS5hZGRDaGlsZChlbGxpcHNlKVxyXG5cdH1cclxuXHRcclxuXHRzdGF0aWMgaXNTYW1lKGpzb24xLGpzb24yKSB7XHJcblx0XHRpZiAoanNvbjEudHlwZSAhPSBqc29uMi50eXBlKSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5leCAhPSBqc29uMi5leCkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEudyAhPSBqc29uMi53KSByZXR1cm4gZmFsc2VcclxuXHRcdGlmIChqc29uMS5oICE9IGpzb24yLmgpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLnB0LnggIT0ganNvbjIucHQueCkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEucHQueSAhPSBqc29uMi5wdC55KSByZXR1cm4gZmFsc2VcclxuXHRcdHJldHVybiB0cnVlXHJcblx0fVxyXG5cdFxyXG5cdGNvbnN0cnVjdG9yKGJhY2ssZHJhd3NpbSkge1xyXG5cdFx0c3VwZXIoKVxyXG4gICAgXHRiYWNrLmN1cnNvciA9IFwicG9pbnRlclwiXHJcblx0XHRiYWNrLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBlID0+IHtcclxuXHRcdFx0bGV0IHN5bWJvbCA9IHRoaXMudG9KU09OKGUuc3RhZ2VYLGUuc3RhZ2VZKVxyXG5cdFx0XHRhZGRTeW1ib2woc3ltYm9sKVxyXG5cdFx0XHRFbGxpcHNlLnNob3dTeW1ib2woZHJhd3NpbS5tYWluc3RhZ2Usc3ltYm9sKVxyXG5cdFx0fSlcclxuXHR9XHJcblx0XHJcblx0dG9KU09OKHgseSkge1xyXG5cdFx0cmV0dXJuIHt0eXBlOlwiZWxsaXBzZVwiLCBleDogZXgsIHc6d2lkdGgsIGg6aGVpZ2h0LCBwdDp7eDp4LHk6eX19XHJcblx0fVxyXG5cdFxyXG5cdGdldEluc3QoKSB7XHJcblx0XHRyZXR1cm4gXCI8cD5DbGljayB0byBhZGQgYW4gZWxsaXBzZS4gQ2xpY2sgZWxsaXBzZSB0byBkZWxldGUuPC9wPlwiXHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBGaWVsZCB7XHJcblx0c3RhdGljIHNob3dTeW1ib2woc3RhZ2UsanNvbikge1xyXG5cdFx0bGV0IHB0cyA9IGpzb24ucHRzXHJcblx0XHRsZXQgc2hhcGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdCAgICBpZiAocHRzLmxlbmd0aCA9PSAwKSByZXR1cm5cclxuXHRcdGxldCBvbGRYID0gcHRzWzBdLnhcclxuXHRcdGxldCBvbGRZID0gcHRzWzBdLnlcclxuXHRcdGxldCBvbGRNaWRYID0gb2xkWFxyXG5cdFx0bGV0IG9sZE1pZFkgPSBvbGRZXHJcblx0XHR0aGlzLmNvbG9yID0ganNvbi5jb2xvcjtcclxuXHQgICAgc2hhcGUuZ3JhcGhpY3MuYmVnaW5TdHJva2UodGhpcy5jb2xvcik7XHJcblx0ICAgIGpzb24ucHRzLmZvckVhY2gocHQgPT4ge1xyXG5cdFx0XHRsZXQgbWlkUG9pbnQgPSBuZXcgY3JlYXRlanMuUG9pbnQob2xkWCArIHB0LnggPj4gMSwgb2xkWStwdC55ID4+IDEpXHJcblx0ICAgICAgICBzaGFwZS5ncmFwaGljcy5zZXRTdHJva2VTdHlsZSg0KS5tb3ZlVG8obWlkUG9pbnQueCwgbWlkUG9pbnQueSlcclxuXHQgICAgICAgIHNoYXBlLmdyYXBoaWNzLmN1cnZlVG8ob2xkWCwgb2xkWSwgb2xkTWlkWCwgb2xkTWlkWSlcclxuXHQgICAgICAgIG9sZFggPSBwdC54XHJcblx0ICAgICAgICBvbGRZID0gcHQueVxyXG5cdCAgICAgICAgb2xkTWlkWCA9IG1pZFBvaW50LnhcclxuXHQgICAgICAgIG9sZE1pZFkgPSBtaWRQb2ludC55XHJcblx0ICAgIH0pXHJcblx0XHRsZXQgcGF0aCA9IG5ldyBjcmVhdGVqcy5Db250YWluZXIoKVxyXG5cdFx0cGF0aC5hZGRDaGlsZChzaGFwZSlcclxuXHQgICAgaWYgKChvcHQgPT0gJ2hlYWQnIHx8IG9wdCA9PSBcImNvbG9yaGVhZFwiKSAmJiBwdHMubGVuZ3RoID4gNCkge1xyXG5cdCAgICBcdGxldCBsYXN0cHQgPSBwdHNbcHRzLmxlbmd0aC02XVxyXG5cdCAgICBcdGxldCBlbmRwdCA9IHB0c1twdHMubGVuZ3RoLTNdXHJcblx0ICAgIFx0bGV0IGhlYWQgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0ICAgIGhlYWQuZ3JhcGhpY3MuZih0aGlzLmNvbG9yKS5zZXRTdHJva2VTdHlsZSg0KS5iZWdpblN0cm9rZSh0aGlzLmNvbG9yKS5tdCg0LDApLmx0KC00LC00KS5sdCgtNCw0KS5sdCg0LDApXHJcblx0XHQgICAgaGVhZC54ID0gZW5kcHQueFxyXG5cdFx0ICAgIGhlYWQueSA9IGVuZHB0LnlcclxuXHRcdCAgICBoZWFkLnJvdGF0aW9uID0gYW5nbGUobGFzdHB0LGVuZHB0KVxyXG5cdFx0ICAgIHBhdGguYWRkQ2hpbGQoaGVhZClcclxuXHRcdFx0bGV0IGRlc2MgPSBuZXcgY3JlYXRlanMuVGV4dChqc29uLmRlc2MsXCIxNHB4IEFyaWFsXCIsXCIjMDAwXCIpXHJcblx0ICAgIFx0bGV0IG1pZCA9IE1hdGgudHJ1bmMocHRzLmxlbmd0aC8yKVxyXG5cdCAgICBcdGRlc2MueCA9IGpzb24ucHRzW21pZF0ueFxyXG5cdCAgICBcdGRlc2MueSA9IGpzb24ucHRzW21pZF0ueVxyXG5cdCAgICAgICAgdmFyIHJlY3QgPSBuZXcgY3JlYXRlanMuU2hhcGUoKTtcclxuXHQgICAgXHRyZWN0LmdyYXBoaWNzLmJlZ2luRmlsbChcIndoaXRlXCIpO1xyXG4gICAgICAgICAgICByZWN0LmdyYXBoaWNzLmRyYXdSZWN0KGRlc2MueCwgZGVzYy55LCBkZXNjLmdldE1lYXN1cmVkV2lkdGgoKSwgZGVzYy5nZXRNZWFzdXJlZEhlaWdodCgpKTtcclxuICAgICAgICAgICAgcmVjdC5ncmFwaGljcy5lbmRGaWxsKCk7XHJcbiAgICAgICAgICAgIHJlY3QuYWxwaGEgPSAwLjk7XHJcbiAgICAgICAgICAgIHBhdGguYWRkQ2hpbGQocmVjdCk7XHJcblx0ICAgIFx0cGF0aC5hZGRDaGlsZChkZXNjKTtcclxuXHQgICAgfVxyXG4gICAgXHRwYXRoLmN1cnNvciA9IFwibm90LWFsbG93ZWRcIlxyXG5cdFx0cGF0aC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgZSA9PiB7XHJcblx0XHRcdHJlbW92ZVN5bWJvbChqc29uKVxyXG5cdFx0XHRwYXRoLnN0YWdlLnJlbW92ZUNoaWxkKHBhdGgpXHJcblx0XHR9KVxyXG5cdFx0c3RhZ2UuYWRkQ2hpbGQocGF0aClcclxuXHR9XHJcblx0XHJcblx0c3RhdGljIGlzU2FtZShqc29uMSxqc29uMikge1xyXG5cdFx0aWYgKGpzb24xLnR5cGUgIT0ganNvbjIudHlwZSkgcmV0dXJuIGZhbHNlXHJcblx0XHRpZiAoanNvbjEucHRzWzBdLnggIT0ganNvbjIucHRzWzBdLngpIHJldHVybiBmYWxzZVxyXG5cdFx0aWYgKGpzb24xLnB0c1swXS55ICE9IGpzb24yLnB0c1swXS55KSByZXR1cm4gZmFsc2VcclxuXHRcdHJldHVybiB0cnVlXHJcblx0fVxyXG5cdFxyXG5cdGNvbnN0cnVjdG9yKGJhY2ssZHJhd3NpbSkge1xyXG5cdFx0Y3JlYXRlanMuVGlja2VyLmZyYW1lcmF0ZSA9IDVcclxuXHRcdHRoaXMuYmFjayA9IGJhY2tcclxuXHRcdHRoaXMubW91c2VEb3duID0gZmFsc2VcclxuXHRcdHRoaXMudyA9IDFcclxuXHRcdGRyYXdzaW0ubWFpbnN0YWdlLmFkZEV2ZW50TGlzdGVuZXIoXCJzdGFnZW1vdXNlZG93blwiLCBlID0+IHtcclxuXHRcdFx0dGhpcy5jdXJyZW50U2hhcGUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0ICAgIHRoaXMub2xkWCA9IHRoaXMub2xkTWlkWCA9IGUuc3RhZ2VYXHJcblx0XHQgICAgdGhpcy5vbGRZID0gdGhpcy5vbGRNaWRZID0gZS5zdGFnZVlcclxuXHRcdFx0dGhpcy5tb3VzZURvd24gPSB0cnVlXHJcblx0XHRcdHRoaXMucHRzID0gW11cclxuXHRcdFx0dGhpcy5jb2xvciA9IFwiIzAwMFwiXHJcblx0XHRcdGlmIChvcHQgPT0gXCJjb2xvcmhlYWRcIikge1xyXG5cdFx0XHRcdHZhciBjdHggPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1haW5jYW52YXNcIikuZ2V0Q29udGV4dChcIjJkXCIpXHJcblx0XHRcdCAgICB2YXIgZGF0YSA9IGN0eC5nZXRJbWFnZURhdGEodGhpcy5vbGRYLCB0aGlzLm9sZFksIDEsIDEpLmRhdGFcclxuXHRcdFx0ICAgIHRoaXMuY29sb3IgPSByZ2JUb0hleChkYXRhWzBdLCBkYXRhWzFdLCBkYXRhWzJdKVxyXG5cdFx0XHR9XHJcblx0XHQgICAgdGhpcy5jdXJyZW50U2hhcGUuZ3JhcGhpY3MuYmVnaW5TdHJva2UodGhpcy5jb2xvcilcclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UuYWRkQ2hpbGQodGhpcy5jdXJyZW50U2hhcGUpXHJcblx0XHR9KVxyXG5cdFx0ZHJhd3NpbS5tYWluc3RhZ2UuYWRkRXZlbnRMaXN0ZW5lcihcInN0YWdlbW91c2Vtb3ZlXCIsIGUgPT4ge1xyXG5cdFx0XHRpZiAodGhpcy5tb3VzZURvd24gPT0gZmFsc2UpIHJldHVyblxyXG5cdCAgICAgICAgdGhpcy5wdCA9IG5ldyBjcmVhdGVqcy5Qb2ludChlLnN0YWdlWCwgZS5zdGFnZVkpXHJcblx0XHRcdHRoaXMucHRzID0gdGhpcy5wdHMuY29uY2F0KHt4OmUuc3RhZ2VYLHk6ZS5zdGFnZVl9KVxyXG5cdFx0XHRsZXQgbWlkUG9pbnQgPSBuZXcgY3JlYXRlanMuUG9pbnQodGhpcy5vbGRYICsgdGhpcy5wdC54ID4+IDEsIHRoaXMub2xkWSt0aGlzLnB0LnkgPj4gMSlcclxuXHQgICAgICAgIHRoaXMuY3VycmVudFNoYXBlLmdyYXBoaWNzLnNldFN0cm9rZVN0eWxlKDQpLm1vdmVUbyhtaWRQb2ludC54LCBtaWRQb2ludC55KVxyXG5cdCAgICAgICAgdGhpcy5jdXJyZW50U2hhcGUuZ3JhcGhpY3MuY3VydmVUbyh0aGlzLm9sZFgsIHRoaXMub2xkWSwgdGhpcy5vbGRNaWRYLCB0aGlzLm9sZE1pZFkpXHJcblx0ICAgICAgICB0aGlzLm9sZFggPSB0aGlzLnB0LnhcclxuXHQgICAgICAgIHRoaXMub2xkWSA9IHRoaXMucHQueVxyXG5cdCAgICAgICAgdGhpcy5vbGRNaWRYID0gbWlkUG9pbnQueFxyXG5cdCAgICAgICAgdGhpcy5vbGRNaWRZID0gbWlkUG9pbnQueVxyXG5cdFx0fSlcclxuXHRcdGRyYXdzaW0ubWFpbnN0YWdlLmFkZEV2ZW50TGlzdGVuZXIoXCJzdGFnZW1vdXNldXBcIiwgZSA9PiB7XHJcblx0XHRcdHRoaXMubW91c2VEb3duID0gZmFsc2VcclxuXHRcdFx0aWYgKHRoaXMucHRzLmxlbmd0aCA9PSAwKSByZXR1cm5cclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UucmVtb3ZlQ2hpbGQodGhpcy5jdXJyZW50U2hhcGUpXHJcblx0XHRcdGxldCBzeW1ib2wgPSB7dHlwZTpcImZpZWxkXCIsIHB0czogdGhpcy5wdHMsIGNvbG9yOiB0aGlzLmNvbG9yLCBkZXNjOiBcIlwifVxyXG5cdFx0XHRGaWVsZC5zaG93U3ltYm9sKGRyYXdzaW0ubWFpbnN0YWdlLCBzeW1ib2wpXHJcblx0XHQgICAgaWYgKChvcHQgPT0gJ2hlYWQnIHx8IG9wdCA9PSBcImNvbG9yaGVhZFwiKSAmJiB0aGlzLnB0cy5sZW5ndGggPiA0KSB7XHJcblx0XHQgICAgXHRzeW1ib2wuZGVzYyA9IGdldERlc2ModGhpcy5wdHNbTWF0aC50cnVuYyh0aGlzLnB0cy5sZW5ndGgvMildLCBzeW1ib2wsIGZ1bmN0aW9uKCkge1xyXG5cdFx0XHRcdFx0RmllbGQuc2hvd1N5bWJvbChkcmF3c2ltLm1haW5zdGFnZSwgc3ltYm9sKVxyXG5cdFx0XHRcdFx0YWRkU3ltYm9sKHN5bWJvbClcdFx0ICAgIFx0XHRcclxuXHRcdCAgICBcdH0pO1xyXG5cdFx0ICAgIH1cclxuXHRcdH0pXHJcblx0fSBcclxuXHRcclxuXHRnZXRJbnN0KCkge1xyXG5cdFx0cmV0dXJuIG9wdD9cIjxwPlByZXNzIGFuZCBkcmFnIG1vdXNlIHRvIGRyYXcgYSBsaW5lLiBSZWxlYXNlIHdoZW4gZG9uZS4gQ2xpY2sgb24gbGluZSB3aGVuIHJlZCBjdXJzb3IgYXBwZWFycyB0byBkZWxldGUuXCI6XCI8cD5Kb2luIGhvcml6b250YWwgZmllbGQgbGluZXMgb24gbGVmdCBhbmQgcmlnaHQgYnkgZHJhd2luZyBvdmVyIHRvcCBvZiBpbWFnZS4gTGluZXMgc2hvdWxkIG5vdCBjcm9zcy4gPGJyLz5DbGljayBvbiBsaW5lIHdoZW4gcmVkIGN1cnNvciBhcHBlYXJzIHRvIGRlbGV0ZS48L3A+XCJcclxuXHR9XHJcbn1cclxuXHJcbmNsYXNzIFRyYW5zZm9ybSB7XHJcblx0Y29uc3RydWN0b3IoYmFjayxkcmF3c2ltKSB7XHJcblx0XHRjcmVhdGVqcy5UaWNrZXIuZnJhbWVyYXRlID0gNVxyXG5cdFx0dGhpcy5iYWNrID0gYmFja1xyXG5cdFx0aWYgKGVkaXQpIHtcclxuXHRcdFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0cmFuc2Zvcm1cIikuc3R5bGUudmlzaWJpbGl0eT1cInZpc2libGVcIjtcclxuXHRcdFx0ZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyb3RhdGVcIikuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4gdGhpcy5yb3RhdGUoYmFjaywgZSkpO1xyXG5cdFx0XHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZsaXBoXCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBlID0+IHRoaXMuZmxpcEgoYmFjaywgZSkpO1xyXG5cdFx0XHRkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZsaXB2XCIpLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBlID0+IHRoaXMuZmxpcFYoYmFjaywgZSkpO1xyXG5cdFx0fVxyXG5cdH1cclxuXHRyb3RhdGUoaW1nLCBlKSB7XHJcblx0XHRpbWcucm90YXRpb24gKz0gOTA7XHJcblx0fVxyXG5cdFxyXG5cdGZsaXBIKGltZywgZSkge1xyXG5cdFx0aW1nLnNjYWxlWCA9IGltZy5zY2FsZVggPT0gMSA/IC0xIDogMTtcclxuXHR9XHJcblxyXG5cdGZsaXBWKGltZywgZSkge1xyXG5cdFx0aW1nLnNjYWxlWSA9IGltZy5zY2FsZVkgPT0gMSA/IC0xIDogMTtcclxuXHR9XHRcclxufVxyXG5cclxuY2xhc3MgVG9vbGJhciBleHRlbmRzIGNyZWF0ZWpzLkNvbnRhaW5lciB7XHJcblx0Y29uc3RydWN0b3IodG9vbCxkcmF3c2ltKSB7XHJcblx0XHRzdXBlcigpXHJcblx0XHRjcmVhdGVqcy5UaWNrZXIuZnJhbWVyYXRlID0gMjBcclxuXHRcdGxldCBib3JkZXIgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0dGhpcy5hZGRDaGlsZChib3JkZXIpXHJcblx0XHRsZXQgdyA9IDJcclxuXHRcdHRoaXMuYWRkQ2hpbGQodG9vbClcclxuXHRcdHcgKz0gdG9vbC5nZXRMZW5ndGgoKVxyXG5cdFx0dGhpcy5jYW5jZWwgPSBuZXcgVmVjdG9yKHcsMCxcImFzc2V0cy9jcm9zcy5wbmdcIixkcmF3c2ltKVxyXG5cdFx0dGhpcy5jYW5jZWwueSA9IDJcclxuXHRcdHRoaXMuYWRkQ2hpbGQodGhpcy5jYW5jZWwpXHJcblx0XHR3ICs9IDMwXHJcblx0XHR0aGlzLnggPSAwXHJcblx0XHR0aGlzLnkgPSAtMTAwXHJcblx0XHR0aGlzLncgPSB3XHJcblx0XHRib3JkZXIuZ3JhcGhpY3MuYmVnaW5GaWxsKFwiI0ZGRlwiKS5iZWdpblN0cm9rZShcIiNBQUFcIikuZHJhd1JvdW5kUmVjdCgwLDAsdywzMCw1LDUsNSw1KS5lbmRTdHJva2UoKVxyXG5cdH1cclxuXHRcclxuXHRzZWxlY3Qob2JqKSB7XHJcblx0XHR0aGlzLnkgPSAtMTAwXHJcblx0XHRpZiAob2JqID09IHRoaXMuY2FuY2VsKSByZXR1cm5cclxuXHRcdGxldCBqc29uID0gbnVsbFxyXG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIFZlY3RvcikgeyBcclxuXHRcdFx0anNvbiA9IG9iai50b0pTT04odGhpcy5lLnN0YWdlWCx0aGlzLmUuc3RhZ2VZKVxyXG5cdFx0XHRWZWN0b3Iuc2hvd1N5bWJvbCh0aGlzLnN0YWdlLGpzb24pXHJcblx0XHR9XHJcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgQWlybWFzcykge1xyXG5cdFx0XHRqc29uID0gb2JqLnRvSlNPTih0aGlzLmUuc3RhZ2VYLTE0LHRoaXMuZS5zdGFnZVktMTQpXHJcblx0XHRcdEFpcm1hc3Muc2hvd1N5bWJvbCh0aGlzLnN0YWdlLGpzb24pXHJcblx0XHR9XHJcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgUHJlc3N1cmVSZWdpb24pIHtcclxuXHRcdFx0anNvbiA9IG9iai50b0pTT04odGhpcy5lLnN0YWdlWCx0aGlzLmUuc3RhZ2VZKVxyXG5cdFx0XHRQcmVzc3VyZVJlZ2lvbi5zaG93U3ltYm9sKHRoaXMuc3RhZ2UsanNvbilcclxuXHRcdH1cclxuXHRcdGFkZFN5bWJvbChqc29uKVxyXG5cdFx0dGhpcy5zdGFnZS5zZXRDaGlsZEluZGV4KCB0aGlzLCB0aGlzLnN0YWdlLmdldE51bUNoaWxkcmVuKCktMSlcclxuXHR9XHJcblx0XHJcblx0c2hvdyhlKSB7XHJcblx0XHRpZiAoIWUucmVsYXRlZFRhcmdldCAmJiB0aGlzLnkgPCAwKSB7XHJcblx0XHRcdHRoaXMueCA9IGUuc3RhZ2VYIC0gdGhpcy53LzJcclxuXHRcdFx0dGhpcy55ID0gZS5zdGFnZVkgLSAzMFxyXG5cdFx0XHR0aGlzLmUgPSBlXHJcblx0XHR9XHJcblx0fVxyXG59XHJcblxyXG5jbGFzcyBEcmF3U2ltIHtcclxuXHRjb25zdHJ1Y3RvcigpIHtcclxuXHRcdHRoaXMubWFpbnN0YWdlID0gbmV3IGNyZWF0ZWpzLlN0YWdlKFwibWFpbmNhbnZhc1wiKVxyXG5cdFx0Y3JlYXRlanMuVG91Y2guZW5hYmxlKHRoaXMubWFpbnN0YWdlKVxyXG5cdFx0bGV0IGJhY2sgPSBuZXcgY3JlYXRlanMuQml0bWFwKGltYWdlKVxyXG5cdFx0YmFjay5pbWFnZS5vbmxvYWQgPSBmdW5jdGlvbigpIHtcclxuXHRcdFx0bGV0IGJuZCA9IGJhY2suZ2V0Qm91bmRzKClcclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UuY2FudmFzLndpZHRoID0gYm5kLndpZHRoICsgNDBcclxuXHRcdFx0ZHJhd3NpbS5tYWluc3RhZ2UuY2FudmFzLmhlaWdodCA9IGJuZC5oZWlnaHQgKyA0MFxyXG5cdFx0XHRiYWNrLnggPSBibmQud2lkdGggLyAyICsgMjBcclxuXHRcdFx0YmFjay55ID0gYm5kLndpZHRoIC8gMiArIDIwXHJcblx0XHQgICAgYmFjay5yZWdYID0gYm5kLndpZHRoIC8gMjtcclxuXHRcdCAgICBiYWNrLnJlZ1kgPSBibmQuaGVpZ2h0IC8gMjtcclxuXHRcdH1cclxuXHRcdHRoaXMubWFpbnN0YWdlLmFkZENoaWxkKGJhY2spXHJcblx0XHR0aGlzLnNob3dTeW1ib2xzKClcclxuXHRcdGlmIChlZGl0KSB7XHJcblx0XHRcdHRoaXMubWFpbnN0YWdlLmVuYWJsZU1vdXNlT3ZlcigpXHJcblx0XHRcdC8vbGV0IGluc3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImluc3RydWN0XCIpXHJcblx0XHRcdHN3aXRjaCAodG9vbCkge1xyXG5cdFx0XHRjYXNlIFwicHJlc3N1cmVcIjpcclxuXHRcdFx0XHRsZXQgcHJlc3N1cmVzID0gbmV3IFByZXNzdXJlcygyLHRoaXMpXHJcblx0XHRcdFx0dGhpcy50b29sYmFyID0gbmV3IFRvb2xiYXIocHJlc3N1cmVzLHRoaXMpXHJcblx0XHRcdFx0Ly9pbnN0LmlubmVySFRNTCA9IHByZXNzdXJlcy5nZXRJbnN0KClcclxuXHRcdFx0XHRiYWNrLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgZSA9PiB0aGlzLnRvb2xiYXIuc2hvdyhlKSlcclxuXHRcdFx0XHR0aGlzLm1haW5zdGFnZS5hZGRDaGlsZCh0aGlzLnRvb2xiYXIpXHJcblx0XHRcdFx0YnJlYWtcclxuXHRcdFx0Y2FzZSBcImFpcm1hc3NcIjpcclxuXHRcdFx0XHRsZXQgYWlybWFzc2VzID0gbmV3IEFpcm1hc3NlcygyLHRoaXMpXHJcblx0XHRcdFx0dGhpcy50b29sYmFyID0gbmV3IFRvb2xiYXIoYWlybWFzc2VzLHRoaXMpXHJcblx0XHRcdFx0Ly9pbnN0LmlubmVySFRNTCA9IGFpcm1hc3Nlcy5nZXRJbnN0KClcclxuXHRcdFx0XHRiYWNrLmFkZEV2ZW50TGlzdGVuZXIoXCJtb3VzZWRvd25cIiwgZSA9PiB0aGlzLnRvb2xiYXIuc2hvdyhlKSlcclxuXHRcdFx0XHR0aGlzLm1haW5zdGFnZS5hZGRDaGlsZCh0aGlzLnRvb2xiYXIpXHJcblx0XHRcdFx0YnJlYWtcclxuXHRcdFx0Y2FzZSBcImlzb3BsZXRoXCI6XHJcblx0XHRcdFx0dGhpcy5pc29wbGV0aCA9IG5ldyBJc29QbGV0aChiYWNrLHRoaXMpXHJcblx0XHRcdFx0Ly9pbnN0LmlubmVySFRNTCA9IHRoaXMuaXNvcGxldGguZ2V0SW5zdCgpXHJcblx0XHRcdFx0YnJlYWtcclxuXHRcdFx0Y2FzZSBcImxpbmVcIjpcclxuXHRcdFx0XHR0aGlzLmxpbmUgPSBuZXcgTGluZShiYWNrLHRoaXMpXHJcblx0XHRcdFx0Ly9pbnN0LmlubmVySFRNTCA9IHRoaXMubGluZS5nZXRJbnN0KClcclxuXHRcdFx0XHRicmVha1xyXG5cdFx0XHRjYXNlIFwiZWxsaXBzZVwiOlxyXG5cdFx0XHRcdHRoaXMuZWxsaXBzZSA9IG5ldyBFbGxpcHNlKGJhY2ssdGhpcylcclxuXHRcdFx0XHQvL2luc3QuaW5uZXJIVE1MID0gdGhpcy5lbGxpcHNlLmdldEluc3QoKVxyXG5cdFx0XHRcdGJyZWFrXHJcblx0XHRcdGNhc2UgXCJmaWVsZFwiOlxyXG5cdFx0XHRcdHRoaXMuZmllbGQgPSBuZXcgRmllbGQoYmFjayx0aGlzKVxyXG5cdFx0XHRcdC8vaW5zdC5pbm5lckhUTUwgPSB0aGlzLmZpZWxkLmdldEluc3QoKVxyXG5cdFx0XHRcdGJyZWFrXHJcblx0XHRcdGNhc2UgXCJ0cmFuc2Zvcm1cIjpcclxuXHRcdFx0XHR0aGlzLmZpZWxkID0gbmV3IFRyYW5zZm9ybShiYWNrLHRoaXMpXHJcblx0XHRcdFx0YnJlYWtcclxuXHRcdFx0ZGVmYXVsdDoge1xyXG5cdFx0XHRcdFx0YWxlcnQoXCJQYXJhbWV0ZXIgdG9vbCBzaG91bGQgYmUgcHJlc3N1cmUsIGFpcm1hc3MsIGlzb3BsZXRoLCBsaW5lLCBlbGxpcHNlLCBmaWVsZCBvciB0cmFuc2Zvcm1cIilcclxuXHRcdFx0XHR9XHJcblx0XHRcdH1cclxuXHRcdH1cclxuXHRcdC8vIGhhbmRsZSBkb3dubG9hZFxyXG5cdFx0bGV0IGRsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJkb3dubG9hZFwiKVxyXG5cdFx0ZGwuYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGUgPT4ge1xyXG5cdFx0XHRsZXQgZHQgPSB0aGlzLm1haW5zdGFnZS5jYW52YXMudG9EYXRhVVJMKCdpbWFnZS9wbmcnKVxyXG5cdFx0XHQvKiBDaGFuZ2UgTUlNRSB0eXBlIHRvIHRyaWNrIHRoZSBicm93c2VyIHRvIGRvd25sb2FkIHRoZSBmaWxlIGluc3RlYWQgb2YgZGlzcGxheWluZyBpdCAqL1xyXG5cdFx0XHRkdCA9IGR0LnJlcGxhY2UoL15kYXRhOmltYWdlXFwvW147XSovLCAnZGF0YTphcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nKTtcclxuXHRcdFx0LyogSW4gYWRkaXRpb24gdG8gPGE+J3MgXCJkb3dubG9hZFwiIGF0dHJpYnV0ZSwgeW91IGNhbiBkZWZpbmUgSFRUUC1zdHlsZSBoZWFkZXJzICovXHJcblx0XHRcdGR0ID0gZHQucmVwbGFjZSgvXmRhdGE6YXBwbGljYXRpb25cXC9vY3RldC1zdHJlYW0vLCAnZGF0YTphcHBsaWNhdGlvbi9vY3RldC1zdHJlYW07aGVhZGVycz1Db250ZW50LURpc3Bvc2l0aW9uJTNBJTIwYXR0YWNobWVudCUzQiUyMGZpbGVuYW1lPW1hcC5wbmcnKTtcclxuXHRcdFx0ZGwuaHJlZiA9IGR0O1xyXG5cdFx0fSlcclxuXHR9XHJcblx0XHJcblx0c2hvd1N5bWJvbHMoKSB7XHJcblx0XHRsZXQgc3ltYm9scyA9IGdldFN5bWJvbHMoKVxyXG5cdFx0c3ltYm9scy5mb3JFYWNoKGpzb24gPT4ge1xyXG5cdFx0XHRzd2l0Y2ggKGpzb24udHlwZSkge1xyXG5cdFx0XHRjYXNlIFwidmVjdG9yXCI6XHJcblx0XHRcdFx0VmVjdG9yLnNob3dTeW1ib2wodGhpcy5tYWluc3RhZ2UsanNvbilcclxuXHRcdFx0XHRicmVha1xyXG5cdFx0XHRjYXNlIFwicmVnaW9uXCI6XHJcblx0XHRcdFx0UHJlc3N1cmVSZWdpb24uc2hvd1N5bWJvbCh0aGlzLm1haW5zdGFnZSxqc29uKVxyXG5cdFx0XHRcdGJyZWFrXHJcblx0XHRcdGNhc2UgXCJhaXJtYXNzXCI6XHJcblx0XHRcdFx0QWlybWFzcy5zaG93U3ltYm9sKHRoaXMubWFpbnN0YWdlLGpzb24pXHJcblx0XHRcdFx0YnJlYWtcclxuXHRcdFx0Y2FzZSBcImlzb3BsZXRoXCI6XHJcblx0XHRcdFx0SXNvUGxldGguc2hvd1N5bWJvbCh0aGlzLm1haW5zdGFnZSxqc29uKVxyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIFwibGluZVwiOlxyXG5cdFx0XHRcdExpbmUuc2hvd1N5bWJvbCh0aGlzLm1haW5zdGFnZSxqc29uKVxyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIFwiZWxsaXBzZVwiOlxyXG5cdFx0XHRcdEVsbGlwc2Uuc2hvd1N5bWJvbCh0aGlzLm1haW5zdGFnZSxqc29uKVxyXG5cdFx0XHRcdGJyZWFrO1xyXG5cdFx0XHRjYXNlIFwiZmllbGRcIjpcclxuXHRcdFx0XHRGaWVsZC5zaG93U3ltYm9sKHRoaXMubWFpbnN0YWdlLGpzb24pXHJcblx0XHRcdFx0YnJlYWs7XHJcblx0XHRcdH1cclxuXHRcdH0pXHJcblx0fVxyXG5cdFxyXG5cdHJ1bigpIHtcclxuXHRcdGxldCB0aWNrID0gMFxyXG5cdFx0Y3JlYXRlanMuVGlja2VyLmFkZEV2ZW50TGlzdGVuZXIoXCJ0aWNrXCIsIGUgPT4ge1xyXG5cdFx0XHR0aGlzLm1haW5zdGFnZS51cGRhdGUoKVxyXG5cdFx0XHR0aWNrKytcclxuXHRcdH0pXHJcblx0fVxyXG59XHJcblxyXG5sZXQgZHJhd3NpbSA9IG5ldyBEcmF3U2ltKClcclxuZHJhd3NpbS5ydW4oKSIsImNvbnN0IG1hcmdpblggPSA0MCwgbWFyZ2luWSA9IDMwLCBlbmRNYXJnaW4gPSA1XHJcblxyXG5leHBvcnQgY2xhc3MgQXhpcyB7XHJcblx0Y29uc3RydWN0b3Ioc3BlYykge1xyXG5cdFx0dGhpcy5zcGVjID0gc3BlY1xyXG5cdFx0dGhpcy5zdGFnZSA9IHNwZWMuc3RhZ2VcclxuXHRcdHRoaXMudyA9IHNwZWMuZGltLncgfHwgMTAwXHJcblx0XHR0aGlzLmggPSBzcGVjLmRpbS5oIHx8IDEwMFxyXG5cdFx0dGhpcy5taW4gPSBzcGVjLmRpbS5taW4gfHwgMFxyXG5cdFx0dGhpcy5tYXggPSBzcGVjLmRpbS5tYXggfHwgMTAwXHJcblx0XHR0aGlzLmZvbnQgPSBzcGVjLmZvbnQgfHwgXCIxMXB4IEFyaWFsXCJcclxuXHRcdHRoaXMuY29sb3IgPSBzcGVjLmNvbG9yIHx8IFwiIzAwMFwiXHJcblx0XHR0aGlzLmxhYmVsID0gc3BlYy5sYWJlbFxyXG5cdFx0dGhpcy5tYWpvciA9IHNwZWMubWFqb3IgfHwgMTBcclxuXHRcdHRoaXMubWlub3IgPSBzcGVjLm1pbm9yIHx8IHNwZWMubWFqb3JcclxuXHRcdHRoaXMucHJlY2lzaW9uID0gc3BlYy5wcmVjaXNpb24gfHwgMFxyXG5cdFx0dGhpcy52ZXJ0aWNhbCA9IHNwZWMub3JpZW50ICYmIHNwZWMub3JpZW50ID09IFwidmVydGljYWxcIiB8fCBmYWxzZVxyXG5cdFx0dGhpcy5saW5lYXIgPSBzcGVjLnNjYWxlICYmIHNwZWMuc2NhbGUgPT0gXCJsaW5lYXJcIiB8fCBmYWxzZVxyXG5cdFx0dGhpcy5pbnZlcnQgPSBzcGVjLmludmVydCB8fCBmYWxzZVxyXG5cdFx0aWYgKHNwZWMuZGltLngpIHtcclxuXHRcdFx0dGhpcy5vcmlnaW5YID0gc3BlYy5kaW0ueFxyXG5cdFx0XHR0aGlzLmVuZFggPSB0aGlzLm9yaWdpblggKyB0aGlzLndcclxuXHRcdH0gZWxzZSB7XHJcblx0XHRcdHRoaXMub3JpZ2luWCA9IG1hcmdpblhcclxuXHRcdFx0dGhpcy5lbmRYID0gdGhpcy53IC0gZW5kTWFyZ2luXHJcblx0XHR9XHJcblx0XHRpZiAoc3BlYy5kaW0ueSkge1xyXG5cdFx0XHR0aGlzLm9yaWdpblkgPSBzcGVjLmRpbS55XHJcblx0XHRcdHRoaXMuZW5kWSA9IHRoaXMub3JpZ2luWSAtIHRoaXMuaCArIGVuZE1hcmdpblxyXG5cdFx0fSBlbHNlIHtcclxuXHRcdFx0dGhpcy5vcmlnaW5ZID0gdGhpcy5oIC0gbWFyZ2luWVxyXG5cdFx0XHR0aGlzLmVuZFkgPSBlbmRNYXJnaW5cclxuXHRcdH1cclxuXHRcdHRoaXMuc2NhbGUgPSB0aGlzLnZlcnRpY2FsID8gTWF0aC5hYnModGhpcy5lbmRZIC0gdGhpcy5vcmlnaW5ZKS8odGhpcy5tYXggLSB0aGlzLm1pbik6IE1hdGguYWJzKHRoaXMuZW5kWCAtIHRoaXMub3JpZ2luWCkvKHRoaXMubWF4IC0gdGhpcy5taW4pXHJcblx0fVxyXG5cclxuXHRkcmF3TGluZSh4MSx5MSx4Mix5Mikge1xyXG5cdFx0bGV0IGxpbmUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0bGluZS5ncmFwaGljcy5zZXRTdHJva2VTdHlsZSgxKVxyXG5cdFx0bGluZS5ncmFwaGljcy5iZWdpblN0cm9rZSh0aGlzLmNvbG9yKVxyXG5cdFx0bGluZS5ncmFwaGljcy5tb3ZlVG8oeDEsIHkxKVxyXG5cdFx0bGluZS5ncmFwaGljcy5saW5lVG8oeDIsIHkyKVxyXG5cdFx0bGluZS5ncmFwaGljcy5lbmRTdHJva2UoKTtcclxuXHRcdHRoaXMuc3RhZ2UuYWRkQ2hpbGQobGluZSlcclxuXHR9XHJcblx0XHJcblx0ZHJhd1RleHQodGV4dCx4LHkpIHtcclxuXHRcdHRleHQueCA9IHhcclxuXHRcdHRleHQueSA9IHlcclxuXHRcdGlmICh0aGlzLnZlcnRpY2FsICYmIHRleHQudGV4dCA9PSB0aGlzLmxhYmVsKSB0ZXh0LnJvdGF0aW9uID0gMjcwXHJcblx0XHR0aGlzLnN0YWdlLmFkZENoaWxkKHRleHQpXHJcblx0XHRyZXR1cm4gdGV4dFxyXG5cdH1cclxuXHJcblx0Z2V0VGV4dChzKSB7IHJldHVybiBuZXcgY3JlYXRlanMuVGV4dChzLHRoaXMuZm9udCx0aGlzLmNvbG9yKSB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgXHRsZXQgbGFiZWwgPSB0aGlzLmdldFRleHQodGhpcy5sYWJlbClcclxuICAgIFx0bGV0IGxhYmVsX2JuZHMgPSBsYWJlbC5nZXRCb3VuZHMoKVxyXG4gICAgICAgIGlmICh0aGlzLnZlcnRpY2FsKSB7XHJcbiAgICAgICAgICAgIHRoaXMuZHJhd0xpbmUodGhpcy5vcmlnaW5YLHRoaXMub3JpZ2luWSx0aGlzLm9yaWdpblgsdGhpcy5lbmRZKVxyXG4gICAgICAgICAgICBsZXQgbWluWExhYmVsID0gdGhpcy5vcmlnaW5YXHJcbiAgICAgICAgICAgIGZvciAobGV0IHZhbCA9IHRoaXMubWluOyB2YWwgPD0gdGhpcy5tYXg7IHZhbCArPSB0aGlzLm1ham9yKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgdiA9IHRoaXMuZ2V0TG9jKHZhbClcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xpbmUodGhpcy5vcmlnaW5YLTQsdix0aGlzLm9yaWdpblgrNCx2KSAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGxldCB0ZXh0ID0gdGhpcy5nZXRUZXh0KHZhbC50b0ZpeGVkKHRoaXMucHJlY2lzaW9uKSlcclxuICAgICAgICAgICAgICAgIGxldCBibmRzID0gdGV4dC5nZXRCb3VuZHMoKVxyXG4gICAgICAgICAgICAgICAgbGV0IHggPSB0aGlzLm9yaWdpblgtNS1ibmRzLndpZHRoXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHQseCx2K2JuZHMuaGVpZ2h0LzItMTApXHJcbiAgICAgICAgICAgICAgICBpZiAoeCA8IG1pblhMYWJlbCkgbWluWExhYmVsID0geFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvciAobGV0IHZhbCA9IHRoaXMubWluOyB2YWwgPD0gdGhpcy5tYXg7IHZhbCArPSB0aGlzLm1pbm9yKSB7XHJcbiAgICAgICAgICAgICAgICBsZXQgdiA9IHRoaXMuZ2V0TG9jKHZhbClcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xpbmUodGhpcy5vcmlnaW5YLTIsdix0aGlzLm9yaWdpblgrMix2KSAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodGhpcy5zcGVjLmxhYmVsKSB7XHJcblx0ICAgICAgICAgICAgbGV0IHkgPSB0aGlzLm9yaWdpblkgLSAodGhpcy5vcmlnaW5ZIC0gbGFiZWxfYm5kcy53aWR0aCkvMlxyXG5cdCAgICAgICAgICAgIHRoaXMuZHJhd1RleHQobGFiZWwsIG1pblhMYWJlbCAtIGxhYmVsX2JuZHMuaGVpZ2h0LCB5KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGhpcy5kcmF3TGluZSh0aGlzLm9yaWdpblgsdGhpcy5vcmlnaW5ZLCB0aGlzLmVuZFgsdGhpcy5vcmlnaW5ZKSAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAodGhpcy5zcGVjLmxhYmVsKSB7XHJcblx0ICAgICAgICAgICAgbGV0IHggPSAodGhpcy53IC0gZW5kTWFyZ2luIC0gbGFiZWxfYm5kcy53aWR0aCkvMlxyXG5cdCAgICAgICAgICAgIHRoaXMuZHJhd1RleHQobGFiZWwsIHRoaXMub3JpZ2luWCArIHgsIHRoaXMub3JpZ2luWSArIDE1KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZvciAobGV0IHZhbCA9IHRoaXMubWluOyB2YWwgPD0gdGhpcy5tYXg7IHZhbCArPSB0aGlzLm1ham9yKSAge1xyXG4gICAgICAgICAgICAgICAgbGV0IHYgPSB0aGlzLmdldExvYyh2YWwpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdMaW5lKHYsdGhpcy5vcmlnaW5ZLTQsdix0aGlzLm9yaWdpblkrNCkgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgbGV0IHRleHQgPSB0aGlzLmdldFRleHQodmFsLnRvRml4ZWQodGhpcy5wcmVjaXNpb24pKVxyXG4gICAgICAgICAgICAgICAgbGV0IGJuZHMgPSB0ZXh0LmdldEJvdW5kcygpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRyYXdUZXh0KHRleHQsdi1ibmRzLndpZHRoLzIsdGhpcy5vcmlnaW5ZKzQpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZm9yIChsZXQgdmFsID0gdGhpcy5taW47IHZhbCA8PSB0aGlzLm1heDsgdmFsICs9IHRoaXMubWlub3IpIHtcclxuICAgICAgICAgICAgICAgIGxldCB2ID0gdGhpcy5nZXRMb2ModmFsKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5kcmF3TGluZSh2LHRoaXMub3JpZ2luWS0yLHYsdGhpcy5vcmlnaW5ZKzIpICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBnZXRMb2ModmFsKSB7XHJcbiAgICAgICAgbGV0IGl2YWwgPSB0aGlzLmxpbmVhcj8gTWF0aC5yb3VuZCh0aGlzLnNjYWxlKih2YWwtdGhpcy5taW4pKTogTWF0aC5yb3VuZChNYXRoLmxvZyh0aGlzLnNjYWxlKih2YWwtdGhpcy5taW4pKSlcclxuICAgICAgICByZXR1cm4gdGhpcy52ZXJ0aWNhbD90aGlzLm9yaWdpblkgLSBpdmFsOnRoaXMub3JpZ2luWCArIGl2YWxcclxuICAgIH1cclxuXHJcbiAgICBnZXRWYWx1ZSh2KSB7XHJcbiAgICBcdGxldCBmYWN0b3IgPSB0aGlzLnZlcnRpY2FsPyAodGhpcy5vcmlnaW5ZIC0gdikvdGhpcy5vcmlnaW5ZOih2IC0gdGhpcy5vcmlnaW5YKS8odGhpcy53IC0gdGhpcy5vcmlnaW5YKVxyXG4gICAgICAgIHJldHVybiB0aGlzLm1pbiArICh0aGlzLm1heCAtIHRoaXMubWluKSAqIGZhY3RvclxyXG4gICAgfVxyXG5cclxuICAgIGlzSW5zaWRlKHYpIHtcclxuICAgICAgICBpZiAodGhpcy52ZXJ0aWNhbClcclxuICAgICAgICAgICAgcmV0dXJuIHYgPj0gdGhpcy5vcmlnaW5ZICYmIHYgPD0gKHRoaXMub3JpZ2luWSArIHRoaXMuaClcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgIHJldHVybiB2ID49IHRoaXMub3JpZ2luWCAmJiB2IDw9ICh0aGlzLm9yaWdpblkgKyB0aGlzLncpXHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHtBeGlzfSBmcm9tIFwiLi9heGlzXCJcclxuZXhwb3J0IGNsYXNzIEdyYXBoIHtcclxuXHRjb25zdHJ1Y3RvcihzcGVjKSB7XHJcblx0XHR0aGlzLnN0YWdlID0gc3BlYy5zdGFnZVxyXG5cdFx0dGhpcy54YXhpcyA9IG5ldyBBeGlzKHtcclxuXHRcdFx0c3RhZ2U6IHRoaXMuc3RhZ2UsXHJcblx0XHRcdGxhYmVsOiBzcGVjLnhsYWJlbCxcclxuXHRcdFx0ZGltOiB7IHg6IHNwZWMueCwgeTogc3BlYy55LCB3OiBzcGVjLncsIGg6IHNwZWMuaCwgbWluOiBzcGVjLm1pblgsIG1heDogc3BlYy5tYXhYIH0sXHJcblx0XHRcdG9yaWVudDogXCJob3Jpem9udGFsXCIsXHJcblx0XHRcdHNjYWxlOiBzcGVjLnhzY2FsZSxcclxuXHRcdFx0bWFqb3I6IHNwZWMubWFqb3JYLFxyXG5cdFx0XHRtaW5vcjogc3BlYy5taW5vclgsXHJcblx0XHRcdHByZWNpc2lvbjogc3BlYy5wcmVjaXNpb25YLFxyXG5cdFx0XHRpbnZlcnQ6IHNwZWMueGludmVydFxyXG5cdFx0fSlcclxuXHRcdHRoaXMueWF4aXMgPSBuZXcgQXhpcyh7XHJcblx0XHRcdHN0YWdlOiB0aGlzLnN0YWdlLFxyXG5cdFx0XHRsYWJlbDogc3BlYy55bGFiZWwsXHJcblx0XHRcdGRpbTogeyB4OiBzcGVjLngsIHk6IHNwZWMueSwgdzogc3BlYy53LCBoOiBzcGVjLmgsIG1pbjogc3BlYy5taW5ZLCBtYXg6IHNwZWMubWF4WSB9LFxyXG5cdFx0XHRvcmllbnQ6IFwidmVydGljYWxcIixcclxuXHRcdFx0c2NhbGU6IHNwZWMueXNjYWxlLFxyXG5cdFx0XHRtYWpvcjogc3BlYy5tYWpvclksXHJcblx0XHRcdG1pbm9yOiBzcGVjLm1pbm9yWSxcclxuXHRcdFx0cHJlY2lzaW9uOiBzcGVjLnByZWNpc2lvblksXHJcblx0XHRcdGludmVydDogc3BlYy55aW52ZXJ0XHJcblx0XHR9KVxyXG5cdFx0dGhpcy53aWR0aCA9IDFcclxuXHRcdHRoaXMubGFzdCA9IG51bGxcclxuXHRcdHRoaXMubWFya2VyID0gbnVsbFxyXG5cdFx0dGhpcy5jb2xvciA9IFwiIzAwMFwiXHJcblx0XHR0aGlzLmRvdHRlZCA9IGZhbHNlXHJcblx0XHRpZiAoc3BlYy5iYWNrZ3JvdW5kKSB7XHJcblx0XHRcdGxldCBiID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuXHRcdFx0Yi5ncmFwaGljcy5iZWdpblN0cm9rZShcIiNBQUFcIikuYmVnaW5GaWxsKHNwZWMuYmFja2dyb3VuZCkuZHJhd1JlY3Qoc3BlYy54LHNwZWMueS1zcGVjLmgsc3BlYy53LHNwZWMuaCkuZW5kU3Ryb2tlKClcclxuXHRcdFx0Yi5hbHBoYSA9IDAuM1xyXG5cdFx0XHRzcGVjLnN0YWdlLmFkZENoaWxkKGIpXHJcblx0XHR9XHJcblx0fVxyXG5cdFxyXG5cdHNldFdpZHRoKHdpZHRoKSB7XHJcblx0XHR0aGlzLndpZHRoID0gd2lkdGhcclxuXHR9XHJcblx0XHJcblx0c2V0RG90dGVkKGRvdHRlZCkge1xyXG5cdFx0dGhpcy5kb3R0ZWQgPSBkb3R0ZWRcclxuXHR9XHJcblx0XHJcblx0c2V0Q29sb3IoY29sb3IpIHtcclxuXHRcdHRoaXMuY29sb3IgPSBjb2xvclxyXG5cdFx0dGhpcy5lbmRQbG90KClcclxuXHRcdHRoaXMubWFya2VyID0gbmV3IGNyZWF0ZWpzLlNoYXBlKClcclxuICAgIFx0dGhpcy5tYXJrZXIuZ3JhcGhpY3MuYmVnaW5TdHJva2UoY29sb3IpLmJlZ2luRmlsbChjb2xvcikuZHJhd1JlY3QoMCwwLDQsNClcclxuICAgIFx0dGhpcy5tYXJrZXIueCA9IC0xMFxyXG4gICAgXHR0aGlzLnN0YWdlLmFkZENoaWxkKHRoaXMubWFya2VyKVxyXG5cdH1cclxuXHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICBcdHRoaXMueGF4aXMucmVuZGVyKClcclxuICAgIFx0dGhpcy55YXhpcy5yZW5kZXIoKVxyXG4gICAgfVxyXG5cclxuICAgIGNsZWFyKCkge1xyXG4gICAgXHR0aGlzLnN0YWdlLnJlbW92ZUFsbENoaWxkcmVuKClcclxuICAgIFx0dGhpcy5lbmRQbG90KClcclxuICAgIH1cclxuXHJcbiAgICBtb3ZlTWFya2VyKHgseSkge1xyXG4gICAgXHRpZiAodGhpcy5tYXJrZXIpIHtcclxuICAgIFx0XHR0aGlzLm1hcmtlci54ID0geC0yXHJcbiAgICBcdFx0dGhpcy5tYXJrZXIueSA9IHktMlxyXG5cclxuICAgIFx0fVxyXG4gICAgfVxyXG5cclxuXHRkcmF3TGluZSh4MSx5MSx4Mix5Mikge1xyXG5cdFx0bGV0IGxpbmUgPSBuZXcgY3JlYXRlanMuU2hhcGUoKVxyXG5cdFx0aWYgKHRoaXMuZG90dGVkID09PSB0cnVlKVxyXG5cdFx0XHRsaW5lLmdyYXBoaWNzLnNldFN0cm9rZURhc2goWzIsMl0pLnNldFN0cm9rZVN0eWxlKHRoaXMud2lkdGgpLmJlZ2luU3Ryb2tlKHRoaXMuY29sb3IpLm1vdmVUbyh4MSwgeTEpLmxpbmVUbyh4MiwgeTIpLmVuZFN0cm9rZSgpXHJcblx0XHRlbHNlXHJcblx0XHRcdGxpbmUuZ3JhcGhpY3Muc2V0U3Ryb2tlU3R5bGUodGhpcy53aWR0aCkuYmVnaW5TdHJva2UodGhpcy5jb2xvcikubW92ZVRvKHgxLCB5MSkubGluZVRvKHgyLCB5MikuZW5kU3Ryb2tlKClcclxuXHRcdHRoaXMuc3RhZ2UuYWRkQ2hpbGQobGluZSlcclxuXHRcdHJldHVybiBsaW5lXHJcblx0fVxyXG5cdFxyXG4gICAgcGxvdCh4dix5dikge1xyXG4gICAgICAgIGlmICh4diA+PSB0aGlzLnhheGlzLm1pbiAmJiB4diA8PSB0aGlzLnhheGlzLm1heCAmJiB5diA+PSB0aGlzLnlheGlzLm1pbiAmJiB5diA8PSB0aGlzLnlheGlzLm1heCkgeyAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgbGV0IHggPSB0aGlzLnhheGlzLmdldExvYyh4dilcclxuICAgICAgICAgICAgbGV0IHkgPSB0aGlzLnlheGlzLmdldExvYyh5dilcclxuICAgICAgICAgICAgaWYgKHRoaXMubGFzdCkgIHtcclxuICAgICAgICAgICAgICAgIHRoaXMubW92ZU1hcmtlcih0aGlzLmxhc3QueCx0aGlzLmxhc3QueSlcclxuICAgICAgICAgICAgICAgIHRoaXMuZHJhd0xpbmUodGhpcy5sYXN0LngsdGhpcy5sYXN0LnkseCx5KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRoaXMubGFzdCA9IG5ldyBjcmVhdGVqcy5Qb2ludCh4LHkpXHJcbiAgICAgICAgICAgIHRoaXMubW92ZU1hcmtlcih4LHkpXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBlbmRQbG90KCkgeyB0aGlzLmxhc3QgPSBudWxsIH1cclxuICAgIFxyXG59XHJcbiIsImV4cG9ydCB7R3JhcGh9IGZyb20gXCIuL2dyYXBoXCJcclxuXHJcbmxldCBKU09OID0gcmVxdWlyZShcIi4vanNvbjJcIilcclxubGV0IHN0b3JlID0gcmVxdWlyZShcIi4vc3RvcmVcIilcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJhbXMoKSB7XHJcbiAgbGV0IHBhcmFtcyA9IHt9XHJcbiAgaWYgKGxvY2F0aW9uLnNlYXJjaCkge1xyXG4gICAgbG9jYXRpb24uc2VhcmNoLnNsaWNlKDEpLnNwbGl0KCcmJykuZm9yRWFjaChwYXJ0ID0+IHtcclxuICAgICAgbGV0IHBhaXIgPSBwYXJ0LnNwbGl0KCc9JylcclxuICAgICAgcGFpclswXSA9IGRlY29kZVVSSUNvbXBvbmVudChwYWlyWzBdKVxyXG4gICAgICBwYWlyWzFdID0gZGVjb2RlVVJJQ29tcG9uZW50KHBhaXJbMV0pXHJcbiAgICAgIHBhcmFtc1twYWlyWzBdXSA9IChwYWlyWzFdICE9PSAndW5kZWZpbmVkJykgPyBwYWlyWzFdIDogdHJ1ZVxyXG4gICAgfSlcclxuICB9XHJcbiAgcmV0dXJuIHBhcmFtc1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0U3RvcmUoKSB7XHJcbiAgICBpZiAoIXN0b3JlLmVuYWJsZWQpIHtcclxuICAgICAgICBhbGVydCgnTG9jYWwgc3RvcmFnZSBpcyBub3Qgc3VwcG9ydGVkIGJ5IHlvdXIgYnJvd3Nlci4gUGxlYXNlIGRpc2FibGUgXCJQcml2YXRlIE1vZGVcIiwgb3IgdXBncmFkZSB0byBhIG1vZGVybiBicm93c2VyLicpXHJcbiAgICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3RvcmVcclxufSIsIi8qXG4gICAganNvbjIuanNcbiAgICAyMDE1LTA1LTAzXG5cbiAgICBQdWJsaWMgRG9tYWluLlxuXG4gICAgTk8gV0FSUkFOVFkgRVhQUkVTU0VEIE9SIElNUExJRUQuIFVTRSBBVCBZT1VSIE9XTiBSSVNLLlxuXG4gICAgU2VlIGh0dHA6Ly93d3cuSlNPTi5vcmcvanMuaHRtbFxuXG5cbiAgICBUaGlzIGNvZGUgc2hvdWxkIGJlIG1pbmlmaWVkIGJlZm9yZSBkZXBsb3ltZW50LlxuICAgIFNlZSBodHRwOi8vamF2YXNjcmlwdC5jcm9ja2ZvcmQuY29tL2pzbWluLmh0bWxcblxuICAgIFVTRSBZT1VSIE9XTiBDT1BZLiBJVCBJUyBFWFRSRU1FTFkgVU5XSVNFIFRPIExPQUQgQ09ERSBGUk9NIFNFUlZFUlMgWU9VIERPXG4gICAgTk9UIENPTlRST0wuXG5cblxuICAgIFRoaXMgZmlsZSBjcmVhdGVzIGEgZ2xvYmFsIEpTT04gb2JqZWN0IGNvbnRhaW5pbmcgdHdvIG1ldGhvZHM6IHN0cmluZ2lmeVxuICAgIGFuZCBwYXJzZS4gVGhpcyBmaWxlIGlzIHByb3ZpZGVzIHRoZSBFUzUgSlNPTiBjYXBhYmlsaXR5IHRvIEVTMyBzeXN0ZW1zLlxuICAgIElmIGEgcHJvamVjdCBtaWdodCBydW4gb24gSUU4IG9yIGVhcmxpZXIsIHRoZW4gdGhpcyBmaWxlIHNob3VsZCBiZSBpbmNsdWRlZC5cbiAgICBUaGlzIGZpbGUgZG9lcyBub3RoaW5nIG9uIEVTNSBzeXN0ZW1zLlxuXG4gICAgICAgIEpTT04uc3RyaW5naWZ5KHZhbHVlLCByZXBsYWNlciwgc3BhY2UpXG4gICAgICAgICAgICB2YWx1ZSAgICAgICBhbnkgSmF2YVNjcmlwdCB2YWx1ZSwgdXN1YWxseSBhbiBvYmplY3Qgb3IgYXJyYXkuXG5cbiAgICAgICAgICAgIHJlcGxhY2VyICAgIGFuIG9wdGlvbmFsIHBhcmFtZXRlciB0aGF0IGRldGVybWluZXMgaG93IG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWVzIGFyZSBzdHJpbmdpZmllZCBmb3Igb2JqZWN0cy4gSXQgY2FuIGJlIGFcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MuXG5cbiAgICAgICAgICAgIHNwYWNlICAgICAgIGFuIG9wdGlvbmFsIHBhcmFtZXRlciB0aGF0IHNwZWNpZmllcyB0aGUgaW5kZW50YXRpb25cbiAgICAgICAgICAgICAgICAgICAgICAgIG9mIG5lc3RlZCBzdHJ1Y3R1cmVzLiBJZiBpdCBpcyBvbWl0dGVkLCB0aGUgdGV4dCB3aWxsXG4gICAgICAgICAgICAgICAgICAgICAgICBiZSBwYWNrZWQgd2l0aG91dCBleHRyYSB3aGl0ZXNwYWNlLiBJZiBpdCBpcyBhIG51bWJlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0IHdpbGwgc3BlY2lmeSB0aGUgbnVtYmVyIG9mIHNwYWNlcyB0byBpbmRlbnQgYXQgZWFjaFxuICAgICAgICAgICAgICAgICAgICAgICAgbGV2ZWwuIElmIGl0IGlzIGEgc3RyaW5nIChzdWNoIGFzICdcXHQnIG9yICcmbmJzcDsnKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0IGNvbnRhaW5zIHRoZSBjaGFyYWN0ZXJzIHVzZWQgdG8gaW5kZW50IGF0IGVhY2ggbGV2ZWwuXG5cbiAgICAgICAgICAgIFRoaXMgbWV0aG9kIHByb2R1Y2VzIGEgSlNPTiB0ZXh0IGZyb20gYSBKYXZhU2NyaXB0IHZhbHVlLlxuXG4gICAgICAgICAgICBXaGVuIGFuIG9iamVjdCB2YWx1ZSBpcyBmb3VuZCwgaWYgdGhlIG9iamVjdCBjb250YWlucyBhIHRvSlNPTlxuICAgICAgICAgICAgbWV0aG9kLCBpdHMgdG9KU09OIG1ldGhvZCB3aWxsIGJlIGNhbGxlZCBhbmQgdGhlIHJlc3VsdCB3aWxsIGJlXG4gICAgICAgICAgICBzdHJpbmdpZmllZC4gQSB0b0pTT04gbWV0aG9kIGRvZXMgbm90IHNlcmlhbGl6ZTogaXQgcmV0dXJucyB0aGVcbiAgICAgICAgICAgIHZhbHVlIHJlcHJlc2VudGVkIGJ5IHRoZSBuYW1lL3ZhbHVlIHBhaXIgdGhhdCBzaG91bGQgYmUgc2VyaWFsaXplZCxcbiAgICAgICAgICAgIG9yIHVuZGVmaW5lZCBpZiBub3RoaW5nIHNob3VsZCBiZSBzZXJpYWxpemVkLiBUaGUgdG9KU09OIG1ldGhvZFxuICAgICAgICAgICAgd2lsbCBiZSBwYXNzZWQgdGhlIGtleSBhc3NvY2lhdGVkIHdpdGggdGhlIHZhbHVlLCBhbmQgdGhpcyB3aWxsIGJlXG4gICAgICAgICAgICBib3VuZCB0byB0aGUgdmFsdWVcblxuICAgICAgICAgICAgRm9yIGV4YW1wbGUsIHRoaXMgd291bGQgc2VyaWFsaXplIERhdGVzIGFzIElTTyBzdHJpbmdzLlxuXG4gICAgICAgICAgICAgICAgRGF0ZS5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKGtleSkge1xuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBmKG4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvcm1hdCBpbnRlZ2VycyB0byBoYXZlIGF0IGxlYXN0IHR3byBkaWdpdHMuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbiA8IDEwIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gJzAnICsgbiBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IG47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRVVENGdWxsWWVhcigpICAgKyAnLScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNb250aCgpICsgMSkgKyAnLScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENEYXRlKCkpICAgICAgKyAnVCcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENIb3VycygpKSAgICAgKyAnOicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNaW51dGVzKCkpICAgKyAnOicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENTZWNvbmRzKCkpICAgKyAnWic7XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgWW91IGNhbiBwcm92aWRlIGFuIG9wdGlvbmFsIHJlcGxhY2VyIG1ldGhvZC4gSXQgd2lsbCBiZSBwYXNzZWQgdGhlXG4gICAgICAgICAgICBrZXkgYW5kIHZhbHVlIG9mIGVhY2ggbWVtYmVyLCB3aXRoIHRoaXMgYm91bmQgdG8gdGhlIGNvbnRhaW5pbmdcbiAgICAgICAgICAgIG9iamVjdC4gVGhlIHZhbHVlIHRoYXQgaXMgcmV0dXJuZWQgZnJvbSB5b3VyIG1ldGhvZCB3aWxsIGJlXG4gICAgICAgICAgICBzZXJpYWxpemVkLiBJZiB5b3VyIG1ldGhvZCByZXR1cm5zIHVuZGVmaW5lZCwgdGhlbiB0aGUgbWVtYmVyIHdpbGxcbiAgICAgICAgICAgIGJlIGV4Y2x1ZGVkIGZyb20gdGhlIHNlcmlhbGl6YXRpb24uXG5cbiAgICAgICAgICAgIElmIHRoZSByZXBsYWNlciBwYXJhbWV0ZXIgaXMgYW4gYXJyYXkgb2Ygc3RyaW5ncywgdGhlbiBpdCB3aWxsIGJlXG4gICAgICAgICAgICB1c2VkIHRvIHNlbGVjdCB0aGUgbWVtYmVycyB0byBiZSBzZXJpYWxpemVkLiBJdCBmaWx0ZXJzIHRoZSByZXN1bHRzXG4gICAgICAgICAgICBzdWNoIHRoYXQgb25seSBtZW1iZXJzIHdpdGgga2V5cyBsaXN0ZWQgaW4gdGhlIHJlcGxhY2VyIGFycmF5IGFyZVxuICAgICAgICAgICAgc3RyaW5naWZpZWQuXG5cbiAgICAgICAgICAgIFZhbHVlcyB0aGF0IGRvIG5vdCBoYXZlIEpTT04gcmVwcmVzZW50YXRpb25zLCBzdWNoIGFzIHVuZGVmaW5lZCBvclxuICAgICAgICAgICAgZnVuY3Rpb25zLCB3aWxsIG5vdCBiZSBzZXJpYWxpemVkLiBTdWNoIHZhbHVlcyBpbiBvYmplY3RzIHdpbGwgYmVcbiAgICAgICAgICAgIGRyb3BwZWQ7IGluIGFycmF5cyB0aGV5IHdpbGwgYmUgcmVwbGFjZWQgd2l0aCBudWxsLiBZb3UgY2FuIHVzZVxuICAgICAgICAgICAgYSByZXBsYWNlciBmdW5jdGlvbiB0byByZXBsYWNlIHRob3NlIHdpdGggSlNPTiB2YWx1ZXMuXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeSh1bmRlZmluZWQpIHJldHVybnMgdW5kZWZpbmVkLlxuXG4gICAgICAgICAgICBUaGUgb3B0aW9uYWwgc3BhY2UgcGFyYW1ldGVyIHByb2R1Y2VzIGEgc3RyaW5naWZpY2F0aW9uIG9mIHRoZVxuICAgICAgICAgICAgdmFsdWUgdGhhdCBpcyBmaWxsZWQgd2l0aCBsaW5lIGJyZWFrcyBhbmQgaW5kZW50YXRpb24gdG8gbWFrZSBpdFxuICAgICAgICAgICAgZWFzaWVyIHRvIHJlYWQuXG5cbiAgICAgICAgICAgIElmIHRoZSBzcGFjZSBwYXJhbWV0ZXIgaXMgYSBub24tZW1wdHkgc3RyaW5nLCB0aGVuIHRoYXQgc3RyaW5nIHdpbGxcbiAgICAgICAgICAgIGJlIHVzZWQgZm9yIGluZGVudGF0aW9uLiBJZiB0aGUgc3BhY2UgcGFyYW1ldGVyIGlzIGEgbnVtYmVyLCB0aGVuXG4gICAgICAgICAgICB0aGUgaW5kZW50YXRpb24gd2lsbCBiZSB0aGF0IG1hbnkgc3BhY2VzLlxuXG4gICAgICAgICAgICBFeGFtcGxlOlxuXG4gICAgICAgICAgICB0ZXh0ID0gSlNPTi5zdHJpbmdpZnkoWydlJywge3BsdXJpYnVzOiAndW51bSd9XSk7XG4gICAgICAgICAgICAvLyB0ZXh0IGlzICdbXCJlXCIse1wicGx1cmlidXNcIjpcInVudW1cIn1dJ1xuXG5cbiAgICAgICAgICAgIHRleHQgPSBKU09OLnN0cmluZ2lmeShbJ2UnLCB7cGx1cmlidXM6ICd1bnVtJ31dLCBudWxsLCAnXFx0Jyk7XG4gICAgICAgICAgICAvLyB0ZXh0IGlzICdbXFxuXFx0XCJlXCIsXFxuXFx0e1xcblxcdFxcdFwicGx1cmlidXNcIjogXCJ1bnVtXCJcXG5cXHR9XFxuXSdcblxuICAgICAgICAgICAgdGV4dCA9IEpTT04uc3RyaW5naWZ5KFtuZXcgRGF0ZSgpXSwgZnVuY3Rpb24gKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpc1trZXldIGluc3RhbmNlb2YgRGF0ZSBcbiAgICAgICAgICAgICAgICAgICAgPyAnRGF0ZSgnICsgdGhpc1trZXldICsgJyknIFxuICAgICAgICAgICAgICAgICAgICA6IHZhbHVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAvLyB0ZXh0IGlzICdbXCJEYXRlKC0tLWN1cnJlbnQgdGltZS0tLSlcIl0nXG5cblxuICAgICAgICBKU09OLnBhcnNlKHRleHQsIHJldml2ZXIpXG4gICAgICAgICAgICBUaGlzIG1ldGhvZCBwYXJzZXMgYSBKU09OIHRleHQgdG8gcHJvZHVjZSBhbiBvYmplY3Qgb3IgYXJyYXkuXG4gICAgICAgICAgICBJdCBjYW4gdGhyb3cgYSBTeW50YXhFcnJvciBleGNlcHRpb24uXG5cbiAgICAgICAgICAgIFRoZSBvcHRpb25hbCByZXZpdmVyIHBhcmFtZXRlciBpcyBhIGZ1bmN0aW9uIHRoYXQgY2FuIGZpbHRlciBhbmRcbiAgICAgICAgICAgIHRyYW5zZm9ybSB0aGUgcmVzdWx0cy4gSXQgcmVjZWl2ZXMgZWFjaCBvZiB0aGUga2V5cyBhbmQgdmFsdWVzLFxuICAgICAgICAgICAgYW5kIGl0cyByZXR1cm4gdmFsdWUgaXMgdXNlZCBpbnN0ZWFkIG9mIHRoZSBvcmlnaW5hbCB2YWx1ZS5cbiAgICAgICAgICAgIElmIGl0IHJldHVybnMgd2hhdCBpdCByZWNlaXZlZCwgdGhlbiB0aGUgc3RydWN0dXJlIGlzIG5vdCBtb2RpZmllZC5cbiAgICAgICAgICAgIElmIGl0IHJldHVybnMgdW5kZWZpbmVkIHRoZW4gdGhlIG1lbWJlciBpcyBkZWxldGVkLlxuXG4gICAgICAgICAgICBFeGFtcGxlOlxuXG4gICAgICAgICAgICAvLyBQYXJzZSB0aGUgdGV4dC4gVmFsdWVzIHRoYXQgbG9vayBsaWtlIElTTyBkYXRlIHN0cmluZ3Mgd2lsbFxuICAgICAgICAgICAgLy8gYmUgY29udmVydGVkIHRvIERhdGUgb2JqZWN0cy5cblxuICAgICAgICAgICAgbXlEYXRhID0gSlNPTi5wYXJzZSh0ZXh0LCBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBhO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGEgPVxuL14oXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KVQoXFxkezJ9KTooXFxkezJ9KTooXFxkezJ9KD86XFwuXFxkKik/KVokLy5leGVjKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZShEYXRlLlVUQygrYVsxXSwgK2FbMl0gLSAxLCArYVszXSwgK2FbNF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgK2FbNV0sICthWzZdKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIG15RGF0YSA9IEpTT04ucGFyc2UoJ1tcIkRhdGUoMDkvMDkvMjAwMSlcIl0nLCBmdW5jdGlvbiAoa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBkO1xuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZS5zbGljZSgwLCA1KSA9PT0gJ0RhdGUoJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUuc2xpY2UoLTEpID09PSAnKScpIHtcbiAgICAgICAgICAgICAgICAgICAgZCA9IG5ldyBEYXRlKHZhbHVlLnNsaWNlKDUsIC0xKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9KTtcblxuXG4gICAgVGhpcyBpcyBhIHJlZmVyZW5jZSBpbXBsZW1lbnRhdGlvbi4gWW91IGFyZSBmcmVlIHRvIGNvcHksIG1vZGlmeSwgb3JcbiAgICByZWRpc3RyaWJ1dGUuXG4qL1xuXG4vKmpzbGludCBcbiAgICBldmFsLCBmb3IsIHRoaXMgXG4qL1xuXG4vKnByb3BlcnR5XG4gICAgSlNPTiwgYXBwbHksIGNhbGwsIGNoYXJDb2RlQXQsIGdldFVUQ0RhdGUsIGdldFVUQ0Z1bGxZZWFyLCBnZXRVVENIb3VycyxcbiAgICBnZXRVVENNaW51dGVzLCBnZXRVVENNb250aCwgZ2V0VVRDU2Vjb25kcywgaGFzT3duUHJvcGVydHksIGpvaW4sXG4gICAgbGFzdEluZGV4LCBsZW5ndGgsIHBhcnNlLCBwcm90b3R5cGUsIHB1c2gsIHJlcGxhY2UsIHNsaWNlLCBzdHJpbmdpZnksXG4gICAgdGVzdCwgdG9KU09OLCB0b1N0cmluZywgdmFsdWVPZlxuKi9cblxuXG4vLyBDcmVhdGUgYSBKU09OIG9iamVjdCBvbmx5IGlmIG9uZSBkb2VzIG5vdCBhbHJlYWR5IGV4aXN0LiBXZSBjcmVhdGUgdGhlXG4vLyBtZXRob2RzIGluIGEgY2xvc3VyZSB0byBhdm9pZCBjcmVhdGluZyBnbG9iYWwgdmFyaWFibGVzLlxuXG5pZiAodHlwZW9mIEpTT04gIT09ICdvYmplY3QnKSB7XG4gICAgSlNPTiA9IHt9O1xufVxuXG4oZnVuY3Rpb24gKCkge1xuICAgICd1c2Ugc3RyaWN0JztcbiAgICBcbiAgICB2YXIgcnhfb25lID0gL15bXFxdLDp7fVxcc10qJC8sXG4gICAgICAgIHJ4X3R3byA9IC9cXFxcKD86W1wiXFxcXFxcL2JmbnJ0XXx1WzAtOWEtZkEtRl17NH0pL2csXG4gICAgICAgIHJ4X3RocmVlID0gL1wiW15cIlxcXFxcXG5cXHJdKlwifHRydWV8ZmFsc2V8bnVsbHwtP1xcZCsoPzpcXC5cXGQqKT8oPzpbZUVdWytcXC1dP1xcZCspPy9nLFxuICAgICAgICByeF9mb3VyID0gLyg/Ol58OnwsKSg/OlxccypcXFspKy9nLFxuICAgICAgICByeF9lc2NhcGFibGUgPSAvW1xcXFxcXFwiXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXFx1MDBhZFxcdTA2MDAtXFx1MDYwNFxcdTA3MGZcXHUxN2I0XFx1MTdiNVxcdTIwMGMtXFx1MjAwZlxcdTIwMjgtXFx1MjAyZlxcdTIwNjAtXFx1MjA2ZlxcdWZlZmZcXHVmZmYwLVxcdWZmZmZdL2csXG4gICAgICAgIHJ4X2Rhbmdlcm91cyA9IC9bXFx1MDAwMFxcdTAwYWRcXHUwNjAwLVxcdTA2MDRcXHUwNzBmXFx1MTdiNFxcdTE3YjVcXHUyMDBjLVxcdTIwMGZcXHUyMDI4LVxcdTIwMmZcXHUyMDYwLVxcdTIwNmZcXHVmZWZmXFx1ZmZmMC1cXHVmZmZmXS9nO1xuXG4gICAgZnVuY3Rpb24gZihuKSB7XG4gICAgICAgIC8vIEZvcm1hdCBpbnRlZ2VycyB0byBoYXZlIGF0IGxlYXN0IHR3byBkaWdpdHMuXG4gICAgICAgIHJldHVybiBuIDwgMTAgXG4gICAgICAgICAgICA/ICcwJyArIG4gXG4gICAgICAgICAgICA6IG47XG4gICAgfVxuICAgIFxuICAgIGZ1bmN0aW9uIHRoaXNfdmFsdWUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnZhbHVlT2YoKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIERhdGUucHJvdG90eXBlLnRvSlNPTiAhPT0gJ2Z1bmN0aW9uJykge1xuXG4gICAgICAgIERhdGUucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcblxuICAgICAgICAgICAgcmV0dXJuIGlzRmluaXRlKHRoaXMudmFsdWVPZigpKVxuICAgICAgICAgICAgICAgID8gdGhpcy5nZXRVVENGdWxsWWVhcigpICsgJy0nICtcbiAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNb250aCgpICsgMSkgKyAnLScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ0RhdGUoKSkgKyAnVCcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgZih0aGlzLmdldFVUQ0hvdXJzKCkpICsgJzonICtcbiAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENNaW51dGVzKCkpICsgJzonICtcbiAgICAgICAgICAgICAgICAgICAgICAgIGYodGhpcy5nZXRVVENTZWNvbmRzKCkpICsgJ1onXG4gICAgICAgICAgICAgICAgOiBudWxsO1xuICAgICAgICB9O1xuXG4gICAgICAgIEJvb2xlYW4ucHJvdG90eXBlLnRvSlNPTiA9IHRoaXNfdmFsdWU7XG4gICAgICAgIE51bWJlci5wcm90b3R5cGUudG9KU09OID0gdGhpc192YWx1ZTtcbiAgICAgICAgU3RyaW5nLnByb3RvdHlwZS50b0pTT04gPSB0aGlzX3ZhbHVlO1xuICAgIH1cblxuICAgIHZhciBnYXAsXG4gICAgICAgIGluZGVudCxcbiAgICAgICAgbWV0YSxcbiAgICAgICAgcmVwO1xuXG5cbiAgICBmdW5jdGlvbiBxdW90ZShzdHJpbmcpIHtcblxuLy8gSWYgdGhlIHN0cmluZyBjb250YWlucyBubyBjb250cm9sIGNoYXJhY3RlcnMsIG5vIHF1b3RlIGNoYXJhY3RlcnMsIGFuZCBub1xuLy8gYmFja3NsYXNoIGNoYXJhY3RlcnMsIHRoZW4gd2UgY2FuIHNhZmVseSBzbGFwIHNvbWUgcXVvdGVzIGFyb3VuZCBpdC5cbi8vIE90aGVyd2lzZSB3ZSBtdXN0IGFsc28gcmVwbGFjZSB0aGUgb2ZmZW5kaW5nIGNoYXJhY3RlcnMgd2l0aCBzYWZlIGVzY2FwZVxuLy8gc2VxdWVuY2VzLlxuXG4gICAgICAgIHJ4X2VzY2FwYWJsZS5sYXN0SW5kZXggPSAwO1xuICAgICAgICByZXR1cm4gcnhfZXNjYXBhYmxlLnRlc3Qoc3RyaW5nKSBcbiAgICAgICAgICAgID8gJ1wiJyArIHN0cmluZy5yZXBsYWNlKHJ4X2VzY2FwYWJsZSwgZnVuY3Rpb24gKGEpIHtcbiAgICAgICAgICAgICAgICB2YXIgYyA9IG1ldGFbYV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiBjID09PSAnc3RyaW5nJ1xuICAgICAgICAgICAgICAgICAgICA/IGNcbiAgICAgICAgICAgICAgICAgICAgOiAnXFxcXHUnICsgKCcwMDAwJyArIGEuY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikpLnNsaWNlKC00KTtcbiAgICAgICAgICAgIH0pICsgJ1wiJyBcbiAgICAgICAgICAgIDogJ1wiJyArIHN0cmluZyArICdcIic7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiBzdHIoa2V5LCBob2xkZXIpIHtcblxuLy8gUHJvZHVjZSBhIHN0cmluZyBmcm9tIGhvbGRlcltrZXldLlxuXG4gICAgICAgIHZhciBpLCAgICAgICAgICAvLyBUaGUgbG9vcCBjb3VudGVyLlxuICAgICAgICAgICAgaywgICAgICAgICAgLy8gVGhlIG1lbWJlciBrZXkuXG4gICAgICAgICAgICB2LCAgICAgICAgICAvLyBUaGUgbWVtYmVyIHZhbHVlLlxuICAgICAgICAgICAgbGVuZ3RoLFxuICAgICAgICAgICAgbWluZCA9IGdhcCxcbiAgICAgICAgICAgIHBhcnRpYWwsXG4gICAgICAgICAgICB2YWx1ZSA9IGhvbGRlcltrZXldO1xuXG4vLyBJZiB0aGUgdmFsdWUgaGFzIGEgdG9KU09OIG1ldGhvZCwgY2FsbCBpdCB0byBvYnRhaW4gYSByZXBsYWNlbWVudCB2YWx1ZS5cblxuICAgICAgICBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgIHR5cGVvZiB2YWx1ZS50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdmFsdWUudG9KU09OKGtleSk7XG4gICAgICAgIH1cblxuLy8gSWYgd2Ugd2VyZSBjYWxsZWQgd2l0aCBhIHJlcGxhY2VyIGZ1bmN0aW9uLCB0aGVuIGNhbGwgdGhlIHJlcGxhY2VyIHRvXG4vLyBvYnRhaW4gYSByZXBsYWNlbWVudCB2YWx1ZS5cblxuICAgICAgICBpZiAodHlwZW9mIHJlcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdmFsdWUgPSByZXAuY2FsbChob2xkZXIsIGtleSwgdmFsdWUpO1xuICAgICAgICB9XG5cbi8vIFdoYXQgaGFwcGVucyBuZXh0IGRlcGVuZHMgb24gdGhlIHZhbHVlJ3MgdHlwZS5cblxuICAgICAgICBzd2l0Y2ggKHR5cGVvZiB2YWx1ZSkge1xuICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgcmV0dXJuIHF1b3RlKHZhbHVlKTtcblxuICAgICAgICBjYXNlICdudW1iZXInOlxuXG4vLyBKU09OIG51bWJlcnMgbXVzdCBiZSBmaW5pdGUuIEVuY29kZSBub24tZmluaXRlIG51bWJlcnMgYXMgbnVsbC5cblxuICAgICAgICAgICAgcmV0dXJuIGlzRmluaXRlKHZhbHVlKSBcbiAgICAgICAgICAgICAgICA/IFN0cmluZyh2YWx1ZSkgXG4gICAgICAgICAgICAgICAgOiAnbnVsbCc7XG5cbiAgICAgICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAgIGNhc2UgJ251bGwnOlxuXG4vLyBJZiB0aGUgdmFsdWUgaXMgYSBib29sZWFuIG9yIG51bGwsIGNvbnZlcnQgaXQgdG8gYSBzdHJpbmcuIE5vdGU6XG4vLyB0eXBlb2YgbnVsbCBkb2VzIG5vdCBwcm9kdWNlICdudWxsJy4gVGhlIGNhc2UgaXMgaW5jbHVkZWQgaGVyZSBpblxuLy8gdGhlIHJlbW90ZSBjaGFuY2UgdGhhdCB0aGlzIGdldHMgZml4ZWQgc29tZWRheS5cblxuICAgICAgICAgICAgcmV0dXJuIFN0cmluZyh2YWx1ZSk7XG5cbi8vIElmIHRoZSB0eXBlIGlzICdvYmplY3QnLCB3ZSBtaWdodCBiZSBkZWFsaW5nIHdpdGggYW4gb2JqZWN0IG9yIGFuIGFycmF5IG9yXG4vLyBudWxsLlxuXG4gICAgICAgIGNhc2UgJ29iamVjdCc6XG5cbi8vIER1ZSB0byBhIHNwZWNpZmljYXRpb24gYmx1bmRlciBpbiBFQ01BU2NyaXB0LCB0eXBlb2YgbnVsbCBpcyAnb2JqZWN0Jyxcbi8vIHNvIHdhdGNoIG91dCBmb3IgdGhhdCBjYXNlLlxuXG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdudWxsJztcbiAgICAgICAgICAgIH1cblxuLy8gTWFrZSBhbiBhcnJheSB0byBob2xkIHRoZSBwYXJ0aWFsIHJlc3VsdHMgb2Ygc3RyaW5naWZ5aW5nIHRoaXMgb2JqZWN0IHZhbHVlLlxuXG4gICAgICAgICAgICBnYXAgKz0gaW5kZW50O1xuICAgICAgICAgICAgcGFydGlhbCA9IFtdO1xuXG4vLyBJcyB0aGUgdmFsdWUgYW4gYXJyYXk/XG5cbiAgICAgICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KHZhbHVlKSA9PT0gJ1tvYmplY3QgQXJyYXldJykge1xuXG4vLyBUaGUgdmFsdWUgaXMgYW4gYXJyYXkuIFN0cmluZ2lmeSBldmVyeSBlbGVtZW50LiBVc2UgbnVsbCBhcyBhIHBsYWNlaG9sZGVyXG4vLyBmb3Igbm9uLUpTT04gdmFsdWVzLlxuXG4gICAgICAgICAgICAgICAgbGVuZ3RoID0gdmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkgKz0gMSkge1xuICAgICAgICAgICAgICAgICAgICBwYXJ0aWFsW2ldID0gc3RyKGksIHZhbHVlKSB8fCAnbnVsbCc7XG4gICAgICAgICAgICAgICAgfVxuXG4vLyBKb2luIGFsbCBvZiB0aGUgZWxlbWVudHMgdG9nZXRoZXIsIHNlcGFyYXRlZCB3aXRoIGNvbW1hcywgYW5kIHdyYXAgdGhlbSBpblxuLy8gYnJhY2tldHMuXG5cbiAgICAgICAgICAgICAgICB2ID0gcGFydGlhbC5sZW5ndGggPT09IDBcbiAgICAgICAgICAgICAgICAgICAgPyAnW10nXG4gICAgICAgICAgICAgICAgICAgIDogZ2FwXG4gICAgICAgICAgICAgICAgICAgICAgICA/ICdbXFxuJyArIGdhcCArIHBhcnRpYWwuam9pbignLFxcbicgKyBnYXApICsgJ1xcbicgKyBtaW5kICsgJ10nXG4gICAgICAgICAgICAgICAgICAgICAgICA6ICdbJyArIHBhcnRpYWwuam9pbignLCcpICsgJ10nO1xuICAgICAgICAgICAgICAgIGdhcCA9IG1pbmQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHY7XG4gICAgICAgICAgICB9XG5cbi8vIElmIHRoZSByZXBsYWNlciBpcyBhbiBhcnJheSwgdXNlIGl0IHRvIHNlbGVjdCB0aGUgbWVtYmVycyB0byBiZSBzdHJpbmdpZmllZC5cblxuICAgICAgICAgICAgaWYgKHJlcCAmJiB0eXBlb2YgcmVwID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICAgIGxlbmd0aCA9IHJlcC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcmVwW2ldID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgayA9IHJlcFtpXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHYgPSBzdHIoaywgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJ0aWFsLnB1c2gocXVvdGUoaykgKyAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdhcCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gJzogJyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJzonXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSArIHYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcblxuLy8gT3RoZXJ3aXNlLCBpdGVyYXRlIHRocm91Z2ggYWxsIG9mIHRoZSBrZXlzIGluIHRoZSBvYmplY3QuXG5cbiAgICAgICAgICAgICAgICBmb3IgKGsgaW4gdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh2YWx1ZSwgaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHYgPSBzdHIoaywgdmFsdWUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJ0aWFsLnB1c2gocXVvdGUoaykgKyAoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGdhcCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gJzogJyBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJzonXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSArIHYpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4vLyBKb2luIGFsbCBvZiB0aGUgbWVtYmVyIHRleHRzIHRvZ2V0aGVyLCBzZXBhcmF0ZWQgd2l0aCBjb21tYXMsXG4vLyBhbmQgd3JhcCB0aGVtIGluIGJyYWNlcy5cblxuICAgICAgICAgICAgdiA9IHBhcnRpYWwubGVuZ3RoID09PSAwXG4gICAgICAgICAgICAgICAgPyAne30nXG4gICAgICAgICAgICAgICAgOiBnYXBcbiAgICAgICAgICAgICAgICAgICAgPyAne1xcbicgKyBnYXAgKyBwYXJ0aWFsLmpvaW4oJyxcXG4nICsgZ2FwKSArICdcXG4nICsgbWluZCArICd9J1xuICAgICAgICAgICAgICAgICAgICA6ICd7JyArIHBhcnRpYWwuam9pbignLCcpICsgJ30nO1xuICAgICAgICAgICAgZ2FwID0gbWluZDtcbiAgICAgICAgICAgIHJldHVybiB2O1xuICAgICAgICB9XG4gICAgfVxuXG4vLyBJZiB0aGUgSlNPTiBvYmplY3QgZG9lcyBub3QgeWV0IGhhdmUgYSBzdHJpbmdpZnkgbWV0aG9kLCBnaXZlIGl0IG9uZS5cblxuICAgIGlmICh0eXBlb2YgSlNPTi5zdHJpbmdpZnkgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgbWV0YSA9IHsgICAgLy8gdGFibGUgb2YgY2hhcmFjdGVyIHN1YnN0aXR1dGlvbnNcbiAgICAgICAgICAgICdcXGInOiAnXFxcXGInLFxuICAgICAgICAgICAgJ1xcdCc6ICdcXFxcdCcsXG4gICAgICAgICAgICAnXFxuJzogJ1xcXFxuJyxcbiAgICAgICAgICAgICdcXGYnOiAnXFxcXGYnLFxuICAgICAgICAgICAgJ1xccic6ICdcXFxccicsXG4gICAgICAgICAgICAnXCInOiAnXFxcXFwiJyxcbiAgICAgICAgICAgICdcXFxcJzogJ1xcXFxcXFxcJ1xuICAgICAgICB9O1xuICAgICAgICBKU09OLnN0cmluZ2lmeSA9IGZ1bmN0aW9uICh2YWx1ZSwgcmVwbGFjZXIsIHNwYWNlKSB7XG5cbi8vIFRoZSBzdHJpbmdpZnkgbWV0aG9kIHRha2VzIGEgdmFsdWUgYW5kIGFuIG9wdGlvbmFsIHJlcGxhY2VyLCBhbmQgYW4gb3B0aW9uYWxcbi8vIHNwYWNlIHBhcmFtZXRlciwgYW5kIHJldHVybnMgYSBKU09OIHRleHQuIFRoZSByZXBsYWNlciBjYW4gYmUgYSBmdW5jdGlvblxuLy8gdGhhdCBjYW4gcmVwbGFjZSB2YWx1ZXMsIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgdGhhdCB3aWxsIHNlbGVjdCB0aGUga2V5cy5cbi8vIEEgZGVmYXVsdCByZXBsYWNlciBtZXRob2QgY2FuIGJlIHByb3ZpZGVkLiBVc2Ugb2YgdGhlIHNwYWNlIHBhcmFtZXRlciBjYW5cbi8vIHByb2R1Y2UgdGV4dCB0aGF0IGlzIG1vcmUgZWFzaWx5IHJlYWRhYmxlLlxuXG4gICAgICAgICAgICB2YXIgaTtcbiAgICAgICAgICAgIGdhcCA9ICcnO1xuICAgICAgICAgICAgaW5kZW50ID0gJyc7XG5cbi8vIElmIHRoZSBzcGFjZSBwYXJhbWV0ZXIgaXMgYSBudW1iZXIsIG1ha2UgYW4gaW5kZW50IHN0cmluZyBjb250YWluaW5nIHRoYXRcbi8vIG1hbnkgc3BhY2VzLlxuXG4gICAgICAgICAgICBpZiAodHlwZW9mIHNwYWNlID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBzcGFjZTsgaSArPSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGVudCArPSAnICc7XG4gICAgICAgICAgICAgICAgfVxuXG4vLyBJZiB0aGUgc3BhY2UgcGFyYW1ldGVyIGlzIGEgc3RyaW5nLCBpdCB3aWxsIGJlIHVzZWQgYXMgdGhlIGluZGVudCBzdHJpbmcuXG5cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHNwYWNlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIGluZGVudCA9IHNwYWNlO1xuICAgICAgICAgICAgfVxuXG4vLyBJZiB0aGVyZSBpcyBhIHJlcGxhY2VyLCBpdCBtdXN0IGJlIGEgZnVuY3Rpb24gb3IgYW4gYXJyYXkuXG4vLyBPdGhlcndpc2UsIHRocm93IGFuIGVycm9yLlxuXG4gICAgICAgICAgICByZXAgPSByZXBsYWNlcjtcbiAgICAgICAgICAgIGlmIChyZXBsYWNlciAmJiB0eXBlb2YgcmVwbGFjZXIgIT09ICdmdW5jdGlvbicgJiZcbiAgICAgICAgICAgICAgICAgICAgKHR5cGVvZiByZXBsYWNlciAhPT0gJ29iamVjdCcgfHxcbiAgICAgICAgICAgICAgICAgICAgdHlwZW9mIHJlcGxhY2VyLmxlbmd0aCAhPT0gJ251bWJlcicpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdKU09OLnN0cmluZ2lmeScpO1xuICAgICAgICAgICAgfVxuXG4vLyBNYWtlIGEgZmFrZSByb290IG9iamVjdCBjb250YWluaW5nIG91ciB2YWx1ZSB1bmRlciB0aGUga2V5IG9mICcnLlxuLy8gUmV0dXJuIHRoZSByZXN1bHQgb2Ygc3RyaW5naWZ5aW5nIHRoZSB2YWx1ZS5cblxuICAgICAgICAgICAgcmV0dXJuIHN0cignJywgeycnOiB2YWx1ZX0pO1xuICAgICAgICB9O1xuICAgIH1cblxuXG4vLyBJZiB0aGUgSlNPTiBvYmplY3QgZG9lcyBub3QgeWV0IGhhdmUgYSBwYXJzZSBtZXRob2QsIGdpdmUgaXQgb25lLlxuXG4gICAgaWYgKHR5cGVvZiBKU09OLnBhcnNlICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIEpTT04ucGFyc2UgPSBmdW5jdGlvbiAodGV4dCwgcmV2aXZlcikge1xuXG4vLyBUaGUgcGFyc2UgbWV0aG9kIHRha2VzIGEgdGV4dCBhbmQgYW4gb3B0aW9uYWwgcmV2aXZlciBmdW5jdGlvbiwgYW5kIHJldHVybnNcbi8vIGEgSmF2YVNjcmlwdCB2YWx1ZSBpZiB0aGUgdGV4dCBpcyBhIHZhbGlkIEpTT04gdGV4dC5cblxuICAgICAgICAgICAgdmFyIGo7XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHdhbGsoaG9sZGVyLCBrZXkpIHtcblxuLy8gVGhlIHdhbGsgbWV0aG9kIGlzIHVzZWQgdG8gcmVjdXJzaXZlbHkgd2FsayB0aGUgcmVzdWx0aW5nIHN0cnVjdHVyZSBzb1xuLy8gdGhhdCBtb2RpZmljYXRpb25zIGNhbiBiZSBtYWRlLlxuXG4gICAgICAgICAgICAgICAgdmFyIGssIHYsIHZhbHVlID0gaG9sZGVyW2tleV07XG4gICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChrIGluIHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHZhbHVlLCBrKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYgPSB3YWxrKHZhbHVlLCBrKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodiAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlW2tdID0gdjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgdmFsdWVba107XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXZpdmVyLmNhbGwoaG9sZGVyLCBrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIH1cblxuXG4vLyBQYXJzaW5nIGhhcHBlbnMgaW4gZm91ciBzdGFnZXMuIEluIHRoZSBmaXJzdCBzdGFnZSwgd2UgcmVwbGFjZSBjZXJ0YWluXG4vLyBVbmljb2RlIGNoYXJhY3RlcnMgd2l0aCBlc2NhcGUgc2VxdWVuY2VzLiBKYXZhU2NyaXB0IGhhbmRsZXMgbWFueSBjaGFyYWN0ZXJzXG4vLyBpbmNvcnJlY3RseSwgZWl0aGVyIHNpbGVudGx5IGRlbGV0aW5nIHRoZW0sIG9yIHRyZWF0aW5nIHRoZW0gYXMgbGluZSBlbmRpbmdzLlxuXG4gICAgICAgICAgICB0ZXh0ID0gU3RyaW5nKHRleHQpO1xuICAgICAgICAgICAgcnhfZGFuZ2Vyb3VzLmxhc3RJbmRleCA9IDA7XG4gICAgICAgICAgICBpZiAocnhfZGFuZ2Vyb3VzLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICB0ZXh0ID0gdGV4dC5yZXBsYWNlKHJ4X2Rhbmdlcm91cywgZnVuY3Rpb24gKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuICdcXFxcdScgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICgnMDAwMCcgKyBhLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpKS5zbGljZSgtNCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbi8vIEluIHRoZSBzZWNvbmQgc3RhZ2UsIHdlIHJ1biB0aGUgdGV4dCBhZ2FpbnN0IHJlZ3VsYXIgZXhwcmVzc2lvbnMgdGhhdCBsb29rXG4vLyBmb3Igbm9uLUpTT04gcGF0dGVybnMuIFdlIGFyZSBlc3BlY2lhbGx5IGNvbmNlcm5lZCB3aXRoICcoKScgYW5kICduZXcnXG4vLyBiZWNhdXNlIHRoZXkgY2FuIGNhdXNlIGludm9jYXRpb24sIGFuZCAnPScgYmVjYXVzZSBpdCBjYW4gY2F1c2UgbXV0YXRpb24uXG4vLyBCdXQganVzdCB0byBiZSBzYWZlLCB3ZSB3YW50IHRvIHJlamVjdCBhbGwgdW5leHBlY3RlZCBmb3Jtcy5cblxuLy8gV2Ugc3BsaXQgdGhlIHNlY29uZCBzdGFnZSBpbnRvIDQgcmVnZXhwIG9wZXJhdGlvbnMgaW4gb3JkZXIgdG8gd29yayBhcm91bmRcbi8vIGNyaXBwbGluZyBpbmVmZmljaWVuY2llcyBpbiBJRSdzIGFuZCBTYWZhcmkncyByZWdleHAgZW5naW5lcy4gRmlyc3Qgd2Vcbi8vIHJlcGxhY2UgdGhlIEpTT04gYmFja3NsYXNoIHBhaXJzIHdpdGggJ0AnIChhIG5vbi1KU09OIGNoYXJhY3RlcikuIFNlY29uZCwgd2Vcbi8vIHJlcGxhY2UgYWxsIHNpbXBsZSB2YWx1ZSB0b2tlbnMgd2l0aCAnXScgY2hhcmFjdGVycy4gVGhpcmQsIHdlIGRlbGV0ZSBhbGxcbi8vIG9wZW4gYnJhY2tldHMgdGhhdCBmb2xsb3cgYSBjb2xvbiBvciBjb21tYSBvciB0aGF0IGJlZ2luIHRoZSB0ZXh0LiBGaW5hbGx5LFxuLy8gd2UgbG9vayB0byBzZWUgdGhhdCB0aGUgcmVtYWluaW5nIGNoYXJhY3RlcnMgYXJlIG9ubHkgd2hpdGVzcGFjZSBvciAnXScgb3Jcbi8vICcsJyBvciAnOicgb3IgJ3snIG9yICd9Jy4gSWYgdGhhdCBpcyBzbywgdGhlbiB0aGUgdGV4dCBpcyBzYWZlIGZvciBldmFsLlxuXG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgcnhfb25lLnRlc3QoXG4gICAgICAgICAgICAgICAgICAgIHRleHRcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKHJ4X3R3bywgJ0AnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UocnhfdGhyZWUsICddJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKHJ4X2ZvdXIsICcnKVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICkge1xuXG4vLyBJbiB0aGUgdGhpcmQgc3RhZ2Ugd2UgdXNlIHRoZSBldmFsIGZ1bmN0aW9uIHRvIGNvbXBpbGUgdGhlIHRleHQgaW50byBhXG4vLyBKYXZhU2NyaXB0IHN0cnVjdHVyZS4gVGhlICd7JyBvcGVyYXRvciBpcyBzdWJqZWN0IHRvIGEgc3ludGFjdGljIGFtYmlndWl0eVxuLy8gaW4gSmF2YVNjcmlwdDogaXQgY2FuIGJlZ2luIGEgYmxvY2sgb3IgYW4gb2JqZWN0IGxpdGVyYWwuIFdlIHdyYXAgdGhlIHRleHRcbi8vIGluIHBhcmVucyB0byBlbGltaW5hdGUgdGhlIGFtYmlndWl0eS5cblxuICAgICAgICAgICAgICAgIGogPSBldmFsKCcoJyArIHRleHQgKyAnKScpO1xuXG4vLyBJbiB0aGUgb3B0aW9uYWwgZm91cnRoIHN0YWdlLCB3ZSByZWN1cnNpdmVseSB3YWxrIHRoZSBuZXcgc3RydWN0dXJlLCBwYXNzaW5nXG4vLyBlYWNoIG5hbWUvdmFsdWUgcGFpciB0byBhIHJldml2ZXIgZnVuY3Rpb24gZm9yIHBvc3NpYmxlIHRyYW5zZm9ybWF0aW9uLlxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHR5cGVvZiByZXZpdmVyID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgICAgID8gd2Fsayh7Jyc6IGp9LCAnJylcbiAgICAgICAgICAgICAgICAgICAgOiBqO1xuICAgICAgICAgICAgfVxuXG4vLyBJZiB0aGUgdGV4dCBpcyBub3QgSlNPTiBwYXJzZWFibGUsIHRoZW4gYSBTeW50YXhFcnJvciBpcyB0aHJvd24uXG5cbiAgICAgICAgICAgIHRocm93IG5ldyBTeW50YXhFcnJvcignSlNPTi5wYXJzZScpO1xuICAgICAgICB9O1xuICAgIH1cbn0oKSk7XG4iLCJcInVzZSBzdHJpY3RcIlxuXG5tb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpIHtcblx0Ly8gU3RvcmUuanNcblx0dmFyIHN0b3JlID0ge30sXG5cdFx0d2luID0gKHR5cGVvZiB3aW5kb3cgIT0gJ3VuZGVmaW5lZCcgPyB3aW5kb3cgOiBnbG9iYWwpLFxuXHRcdGRvYyA9IHdpbi5kb2N1bWVudCxcblx0XHRsb2NhbFN0b3JhZ2VOYW1lID0gJ2xvY2FsU3RvcmFnZScsXG5cdFx0c2NyaXB0VGFnID0gJ3NjcmlwdCcsXG5cdFx0c3RvcmFnZVxuXG5cdHN0b3JlLmRpc2FibGVkID0gZmFsc2Vcblx0c3RvcmUudmVyc2lvbiA9ICcxLjMuMjAnXG5cdHN0b3JlLnNldCA9IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHt9XG5cdHN0b3JlLmdldCA9IGZ1bmN0aW9uKGtleSwgZGVmYXVsdFZhbCkge31cblx0c3RvcmUuaGFzID0gZnVuY3Rpb24oa2V5KSB7IHJldHVybiBzdG9yZS5nZXQoa2V5KSAhPT0gdW5kZWZpbmVkIH1cblx0c3RvcmUucmVtb3ZlID0gZnVuY3Rpb24oa2V5KSB7fVxuXHRzdG9yZS5jbGVhciA9IGZ1bmN0aW9uKCkge31cblx0c3RvcmUudHJhbnNhY3QgPSBmdW5jdGlvbihrZXksIGRlZmF1bHRWYWwsIHRyYW5zYWN0aW9uRm4pIHtcblx0XHRpZiAodHJhbnNhY3Rpb25GbiA9PSBudWxsKSB7XG5cdFx0XHR0cmFuc2FjdGlvbkZuID0gZGVmYXVsdFZhbFxuXHRcdFx0ZGVmYXVsdFZhbCA9IG51bGxcblx0XHR9XG5cdFx0aWYgKGRlZmF1bHRWYWwgPT0gbnVsbCkge1xuXHRcdFx0ZGVmYXVsdFZhbCA9IHt9XG5cdFx0fVxuXHRcdHZhciB2YWwgPSBzdG9yZS5nZXQoa2V5LCBkZWZhdWx0VmFsKVxuXHRcdHRyYW5zYWN0aW9uRm4odmFsKVxuXHRcdHN0b3JlLnNldChrZXksIHZhbClcblx0fVxuXHRzdG9yZS5nZXRBbGwgPSBmdW5jdGlvbigpIHtcblx0XHR2YXIgcmV0ID0ge31cblx0XHRzdG9yZS5mb3JFYWNoKGZ1bmN0aW9uKGtleSwgdmFsKSB7XG5cdFx0XHRyZXRba2V5XSA9IHZhbFxuXHRcdH0pXG5cdFx0cmV0dXJuIHJldFxuXHR9XG5cdHN0b3JlLmZvckVhY2ggPSBmdW5jdGlvbigpIHt9XG5cdHN0b3JlLnNlcmlhbGl6ZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKVxuXHR9XG5cdHN0b3JlLmRlc2VyaWFsaXplID0gZnVuY3Rpb24odmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9ICdzdHJpbmcnKSB7IHJldHVybiB1bmRlZmluZWQgfVxuXHRcdHRyeSB7IHJldHVybiBKU09OLnBhcnNlKHZhbHVlKSB9XG5cdFx0Y2F0Y2goZSkgeyByZXR1cm4gdmFsdWUgfHwgdW5kZWZpbmVkIH1cblx0fVxuXG5cdC8vIEZ1bmN0aW9ucyB0byBlbmNhcHN1bGF0ZSBxdWVzdGlvbmFibGUgRmlyZUZveCAzLjYuMTMgYmVoYXZpb3Jcblx0Ly8gd2hlbiBhYm91dC5jb25maWc6OmRvbS5zdG9yYWdlLmVuYWJsZWQgPT09IGZhbHNlXG5cdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWFyY3Vzd2VzdGluL3N0b3JlLmpzL2lzc3VlcyNpc3N1ZS8xM1xuXHRmdW5jdGlvbiBpc0xvY2FsU3RvcmFnZU5hbWVTdXBwb3J0ZWQoKSB7XG5cdFx0dHJ5IHsgcmV0dXJuIChsb2NhbFN0b3JhZ2VOYW1lIGluIHdpbiAmJiB3aW5bbG9jYWxTdG9yYWdlTmFtZV0pIH1cblx0XHRjYXRjaChlcnIpIHsgcmV0dXJuIGZhbHNlIH1cblx0fVxuXG5cdGlmIChpc0xvY2FsU3RvcmFnZU5hbWVTdXBwb3J0ZWQoKSkge1xuXHRcdHN0b3JhZ2UgPSB3aW5bbG9jYWxTdG9yYWdlTmFtZV1cblx0XHRzdG9yZS5zZXQgPSBmdW5jdGlvbihrZXksIHZhbCkge1xuXHRcdFx0aWYgKHZhbCA9PT0gdW5kZWZpbmVkKSB7IHJldHVybiBzdG9yZS5yZW1vdmUoa2V5KSB9XG5cdFx0XHRzdG9yYWdlLnNldEl0ZW0oa2V5LCBzdG9yZS5zZXJpYWxpemUodmFsKSlcblx0XHRcdHJldHVybiB2YWxcblx0XHR9XG5cdFx0c3RvcmUuZ2V0ID0gZnVuY3Rpb24oa2V5LCBkZWZhdWx0VmFsKSB7XG5cdFx0XHR2YXIgdmFsID0gc3RvcmUuZGVzZXJpYWxpemUoc3RvcmFnZS5nZXRJdGVtKGtleSkpXG5cdFx0XHRyZXR1cm4gKHZhbCA9PT0gdW5kZWZpbmVkID8gZGVmYXVsdFZhbCA6IHZhbClcblx0XHR9XG5cdFx0c3RvcmUucmVtb3ZlID0gZnVuY3Rpb24oa2V5KSB7IHN0b3JhZ2UucmVtb3ZlSXRlbShrZXkpIH1cblx0XHRzdG9yZS5jbGVhciA9IGZ1bmN0aW9uKCkgeyBzdG9yYWdlLmNsZWFyKCkgfVxuXHRcdHN0b3JlLmZvckVhY2ggPSBmdW5jdGlvbihjYWxsYmFjaykge1xuXHRcdFx0Zm9yICh2YXIgaT0wOyBpPHN0b3JhZ2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0dmFyIGtleSA9IHN0b3JhZ2Uua2V5KGkpXG5cdFx0XHRcdGNhbGxiYWNrKGtleSwgc3RvcmUuZ2V0KGtleSkpXG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGRvYyAmJiBkb2MuZG9jdW1lbnRFbGVtZW50LmFkZEJlaGF2aW9yKSB7XG5cdFx0dmFyIHN0b3JhZ2VPd25lcixcblx0XHRcdHN0b3JhZ2VDb250YWluZXJcblx0XHQvLyBTaW5jZSAjdXNlckRhdGEgc3RvcmFnZSBhcHBsaWVzIG9ubHkgdG8gc3BlY2lmaWMgcGF0aHMsIHdlIG5lZWQgdG9cblx0XHQvLyBzb21laG93IGxpbmsgb3VyIGRhdGEgdG8gYSBzcGVjaWZpYyBwYXRoLiAgV2UgY2hvb3NlIC9mYXZpY29uLmljb1xuXHRcdC8vIGFzIGEgcHJldHR5IHNhZmUgb3B0aW9uLCBzaW5jZSBhbGwgYnJvd3NlcnMgYWxyZWFkeSBtYWtlIGEgcmVxdWVzdCB0b1xuXHRcdC8vIHRoaXMgVVJMIGFueXdheSBhbmQgYmVpbmcgYSA0MDQgd2lsbCBub3QgaHVydCB1cyBoZXJlLiAgV2Ugd3JhcCBhblxuXHRcdC8vIGlmcmFtZSBwb2ludGluZyB0byB0aGUgZmF2aWNvbiBpbiBhbiBBY3RpdmVYT2JqZWN0KGh0bWxmaWxlKSBvYmplY3Rcblx0XHQvLyAoc2VlOiBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvYWE3NTI1NzQodj1WUy44NSkuYXNweClcblx0XHQvLyBzaW5jZSB0aGUgaWZyYW1lIGFjY2VzcyBydWxlcyBhcHBlYXIgdG8gYWxsb3cgZGlyZWN0IGFjY2VzcyBhbmRcblx0XHQvLyBtYW5pcHVsYXRpb24gb2YgdGhlIGRvY3VtZW50IGVsZW1lbnQsIGV2ZW4gZm9yIGEgNDA0IHBhZ2UuICBUaGlzXG5cdFx0Ly8gZG9jdW1lbnQgY2FuIGJlIHVzZWQgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBkb2N1bWVudCAod2hpY2ggd291bGRcblx0XHQvLyBoYXZlIGJlZW4gbGltaXRlZCB0byB0aGUgY3VycmVudCBwYXRoKSB0byBwZXJmb3JtICN1c2VyRGF0YSBzdG9yYWdlLlxuXHRcdHRyeSB7XG5cdFx0XHRzdG9yYWdlQ29udGFpbmVyID0gbmV3IEFjdGl2ZVhPYmplY3QoJ2h0bWxmaWxlJylcblx0XHRcdHN0b3JhZ2VDb250YWluZXIub3BlbigpXG5cdFx0XHRzdG9yYWdlQ29udGFpbmVyLndyaXRlKCc8JytzY3JpcHRUYWcrJz5kb2N1bWVudC53PXdpbmRvdzwvJytzY3JpcHRUYWcrJz48aWZyYW1lIHNyYz1cIi9mYXZpY29uLmljb1wiPjwvaWZyYW1lPicpXG5cdFx0XHRzdG9yYWdlQ29udGFpbmVyLmNsb3NlKClcblx0XHRcdHN0b3JhZ2VPd25lciA9IHN0b3JhZ2VDb250YWluZXIudy5mcmFtZXNbMF0uZG9jdW1lbnRcblx0XHRcdHN0b3JhZ2UgPSBzdG9yYWdlT3duZXIuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0XHR9IGNhdGNoKGUpIHtcblx0XHRcdC8vIHNvbWVob3cgQWN0aXZlWE9iamVjdCBpbnN0YW50aWF0aW9uIGZhaWxlZCAocGVyaGFwcyBzb21lIHNwZWNpYWxcblx0XHRcdC8vIHNlY3VyaXR5IHNldHRpbmdzIG9yIG90aGVyd3NlKSwgZmFsbCBiYWNrIHRvIHBlci1wYXRoIHN0b3JhZ2Vcblx0XHRcdHN0b3JhZ2UgPSBkb2MuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0XHRcdHN0b3JhZ2VPd25lciA9IGRvYy5ib2R5XG5cdFx0fVxuXHRcdHZhciB3aXRoSUVTdG9yYWdlID0gZnVuY3Rpb24oc3RvcmVGdW5jdGlvbikge1xuXHRcdFx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMClcblx0XHRcdFx0YXJncy51bnNoaWZ0KHN0b3JhZ2UpXG5cdFx0XHRcdC8vIFNlZSBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvbXM1MzEwODEodj1WUy44NSkuYXNweFxuXHRcdFx0XHQvLyBhbmQgaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L21zNTMxNDI0KHY9VlMuODUpLmFzcHhcblx0XHRcdFx0c3RvcmFnZU93bmVyLmFwcGVuZENoaWxkKHN0b3JhZ2UpXG5cdFx0XHRcdHN0b3JhZ2UuYWRkQmVoYXZpb3IoJyNkZWZhdWx0I3VzZXJEYXRhJylcblx0XHRcdFx0c3RvcmFnZS5sb2FkKGxvY2FsU3RvcmFnZU5hbWUpXG5cdFx0XHRcdHZhciByZXN1bHQgPSBzdG9yZUZ1bmN0aW9uLmFwcGx5KHN0b3JlLCBhcmdzKVxuXHRcdFx0XHRzdG9yYWdlT3duZXIucmVtb3ZlQ2hpbGQoc3RvcmFnZSlcblx0XHRcdFx0cmV0dXJuIHJlc3VsdFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEluIElFNywga2V5cyBjYW5ub3Qgc3RhcnQgd2l0aCBhIGRpZ2l0IG9yIGNvbnRhaW4gY2VydGFpbiBjaGFycy5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21hcmN1c3dlc3Rpbi9zdG9yZS5qcy9pc3N1ZXMvNDBcblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21hcmN1c3dlc3Rpbi9zdG9yZS5qcy9pc3N1ZXMvODNcblx0XHR2YXIgZm9yYmlkZGVuQ2hhcnNSZWdleCA9IG5ldyBSZWdFeHAoXCJbIVxcXCIjJCUmJygpKissL1xcXFxcXFxcOjs8PT4/QFtcXFxcXV5ge3x9fl1cIiwgXCJnXCIpXG5cdFx0dmFyIGllS2V5Rml4ID0gZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRyZXR1cm4ga2V5LnJlcGxhY2UoL15kLywgJ19fXyQmJykucmVwbGFjZShmb3JiaWRkZW5DaGFyc1JlZ2V4LCAnX19fJylcblx0XHR9XG5cdFx0c3RvcmUuc2V0ID0gd2l0aElFU3RvcmFnZShmdW5jdGlvbihzdG9yYWdlLCBrZXksIHZhbCkge1xuXHRcdFx0a2V5ID0gaWVLZXlGaXgoa2V5KVxuXHRcdFx0aWYgKHZhbCA9PT0gdW5kZWZpbmVkKSB7IHJldHVybiBzdG9yZS5yZW1vdmUoa2V5KSB9XG5cdFx0XHRzdG9yYWdlLnNldEF0dHJpYnV0ZShrZXksIHN0b3JlLnNlcmlhbGl6ZSh2YWwpKVxuXHRcdFx0c3RvcmFnZS5zYXZlKGxvY2FsU3RvcmFnZU5hbWUpXG5cdFx0XHRyZXR1cm4gdmFsXG5cdFx0fSlcblx0XHRzdG9yZS5nZXQgPSB3aXRoSUVTdG9yYWdlKGZ1bmN0aW9uKHN0b3JhZ2UsIGtleSwgZGVmYXVsdFZhbCkge1xuXHRcdFx0a2V5ID0gaWVLZXlGaXgoa2V5KVxuXHRcdFx0dmFyIHZhbCA9IHN0b3JlLmRlc2VyaWFsaXplKHN0b3JhZ2UuZ2V0QXR0cmlidXRlKGtleSkpXG5cdFx0XHRyZXR1cm4gKHZhbCA9PT0gdW5kZWZpbmVkID8gZGVmYXVsdFZhbCA6IHZhbClcblx0XHR9KVxuXHRcdHN0b3JlLnJlbW92ZSA9IHdpdGhJRVN0b3JhZ2UoZnVuY3Rpb24oc3RvcmFnZSwga2V5KSB7XG5cdFx0XHRrZXkgPSBpZUtleUZpeChrZXkpXG5cdFx0XHRzdG9yYWdlLnJlbW92ZUF0dHJpYnV0ZShrZXkpXG5cdFx0XHRzdG9yYWdlLnNhdmUobG9jYWxTdG9yYWdlTmFtZSlcblx0XHR9KVxuXHRcdHN0b3JlLmNsZWFyID0gd2l0aElFU3RvcmFnZShmdW5jdGlvbihzdG9yYWdlKSB7XG5cdFx0XHR2YXIgYXR0cmlidXRlcyA9IHN0b3JhZ2UuWE1MRG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmF0dHJpYnV0ZXNcblx0XHRcdHN0b3JhZ2UubG9hZChsb2NhbFN0b3JhZ2VOYW1lKVxuXHRcdFx0Zm9yICh2YXIgaT1hdHRyaWJ1dGVzLmxlbmd0aC0xOyBpPj0wOyBpLS0pIHtcblx0XHRcdFx0c3RvcmFnZS5yZW1vdmVBdHRyaWJ1dGUoYXR0cmlidXRlc1tpXS5uYW1lKVxuXHRcdFx0fVxuXHRcdFx0c3RvcmFnZS5zYXZlKGxvY2FsU3RvcmFnZU5hbWUpXG5cdFx0fSlcblx0XHRzdG9yZS5mb3JFYWNoID0gd2l0aElFU3RvcmFnZShmdW5jdGlvbihzdG9yYWdlLCBjYWxsYmFjaykge1xuXHRcdFx0dmFyIGF0dHJpYnV0ZXMgPSBzdG9yYWdlLlhNTERvY3VtZW50LmRvY3VtZW50RWxlbWVudC5hdHRyaWJ1dGVzXG5cdFx0XHRmb3IgKHZhciBpPTAsIGF0dHI7IGF0dHI9YXR0cmlidXRlc1tpXTsgKytpKSB7XG5cdFx0XHRcdGNhbGxiYWNrKGF0dHIubmFtZSwgc3RvcmUuZGVzZXJpYWxpemUoc3RvcmFnZS5nZXRBdHRyaWJ1dGUoYXR0ci5uYW1lKSkpXG5cdFx0XHR9XG5cdFx0fSlcblx0fVxuXG5cdHRyeSB7XG5cdFx0dmFyIHRlc3RLZXkgPSAnX19zdG9yZWpzX18nXG5cdFx0c3RvcmUuc2V0KHRlc3RLZXksIHRlc3RLZXkpXG5cdFx0aWYgKHN0b3JlLmdldCh0ZXN0S2V5KSAhPSB0ZXN0S2V5KSB7IHN0b3JlLmRpc2FibGVkID0gdHJ1ZSB9XG5cdFx0c3RvcmUucmVtb3ZlKHRlc3RLZXkpXG5cdH0gY2F0Y2goZSkge1xuXHRcdHN0b3JlLmRpc2FibGVkID0gdHJ1ZVxuXHR9XG5cdHN0b3JlLmVuYWJsZWQgPSAhc3RvcmUuZGlzYWJsZWRcblx0XG5cdHJldHVybiBzdG9yZVxufSgpKVxuIl19
