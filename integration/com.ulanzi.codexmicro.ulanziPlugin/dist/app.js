var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n2) {
        this._bufferedBytes -= n2;
        if (n2 === this._buffers[0].length) return this._buffers.shift();
        if (n2 < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n2,
            buf.length - n2
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n2);
        }
        const dst = Buffer.allocUnsafe(n2);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n2;
          if (n2 >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n2), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n2,
              buf.length - n2
            );
          }
          n2 -= buf.length;
        } while (n2 > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket2, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket2;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash: createHash2 } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address2, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address2 !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address2, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket2, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket2, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket2;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket2[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket2.setTimeout) socket2.setTimeout(0);
        if (socket2.setNoDelay) socket2.setNoDelay();
        if (head.length > 0) socket2.unshift(head);
        socket2.on("close", socketOnClose);
        socket2.on("data", socketOnData);
        socket2.on("end", socketOnEnd);
        socket2.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address2, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address2 instanceof URL) {
        parsedUrl = address2;
      } else {
        try {
          parsedUrl = new URL(address2);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address2}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL(location, address2);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket2, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket2, "Invalid Upgrade header");
          return;
        }
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket2, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket2, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket2, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket2, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket2, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket2, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket2, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open4() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open4() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash: createHash2 } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket2, head) => {
              this.handleUpgrade(req, socket2, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket2, head, cb) {
        socket2.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket2, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket2, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket2, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket2, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket2, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket2, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket2, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket2, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket2,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket2, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket2, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket2, head, cb) {
        if (!socket2.readable || !socket2.writable) return socket2.destroy();
        if (socket2[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket2, 503);
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket2.write(headers.concat("\r\n").join("\r\n"));
        socket2.removeListener("error", socketOnError);
        ws.setSocket(socket2, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket2, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket2.once("finish", socket2.destroy);
      socket2.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket2, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket2, req);
      } else {
        abortHandshake(socket2, code, message, headers);
      }
    }
  }
});

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// plugin/app.js
var import_node_fs3 = require("node:fs");
var import_node_path5 = require("node:path");

// plugin/bridge-installer.js
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var import_node_os = require("node:os");
var import_node_path = require("node:path");

// plugin/bridge-launcher.js
var codexBinary = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
var shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
var codexProcessPattern = `^${codexBinary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([[:space:]]|$)`;
var bridgeLauncher = `#!/bin/zsh
set -u
unsetopt BG_NICE

codex_binary=${shellQuote(codexBinary)}
codex_process_pattern=${shellQuote(codexProcessPattern)}
bridge_log="$HOME/Library/Logs/OpenCodexMicro-codex-bridge.log"

if [[ ! -x "$codex_binary" ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex was not found at /Applications/ChatGPT.app.\\n\u672A\u627E\u5230 /Applications/ChatGPT.app\u3002" as critical'
  exit 1
fi

# macOS pgrep otherwise excludes ancestors, including Codex when the wrapper
# is invoked from a terminal or automation hosted by that same application.
/usr/bin/pgrep -a -f "$codex_process_pattern" >/dev/null 2>&1
codex_process_status=$?
if [[ "$codex_process_status" -eq 0 ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex is already running. No action was taken. If Bridge is connected, keep using it. Otherwise finish active tasks, quit Codex yourself, then open Codex Bridge again.\\nCodex \u5DF2\u5728\u8FD0\u884C\uFF0C\u542F\u52A8\u5668\u672A\u8FDB\u884C\u4EFB\u4F55\u64CD\u4F5C\u3002\u5982\u679C Bridge \u5DF2\u8FDE\u63A5\uFF0C\u53EF\u7EE7\u7EED\u4F7F\u7528\uFF1B\u5426\u5219\u8BF7\u5B8C\u6210\u4EFB\u52A1\u540E\u624B\u52A8\u9000\u51FA Codex\uFF0C\u518D\u6253\u5F00 Codex Bridge\u3002"'
  exit 1
fi
if [[ "$codex_process_status" -ne 1 ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "The running Codex state could not be verified. No application was started or stopped.\\n\u65E0\u6CD5\u786E\u8BA4 Codex \u8FD0\u884C\u72B6\u6001\uFF0C\u672A\u542F\u52A8\u6216\u505C\u6B62\u4EFB\u4F55\u5E94\u7528\u3002" as critical'
  exit 1
fi

/usr/bin/nohup "$codex_binary" \\
  --remote-debugging-address=127.0.0.1 \\
  --remote-debugging-port=9222 \\
  --remote-allow-origins=http://127.0.0.1:9222 \\
  >>"$bridge_log" 2>&1 &

# A bounded readiness check only: failure never retries the application launch.
for attempt in {1..300}; do
  if /usr/bin/curl --noproxy '*' --silent --fail --max-time 0.2 \\
    http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
    exit 0
  fi
  if ! /usr/bin/pgrep -a -f "$codex_process_pattern" >/dev/null 2>&1; then
    break
  fi
  /bin/sleep 0.1
done

/usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex was launched once, but its Bridge endpoint is unavailable. No restart was attempted. Finish active tasks and quit Codex yourself before trying again.\\nCodex \u5DF2\u542F\u52A8\u4E00\u6B21\uFF0C\u4F46 Bridge \u8FDE\u63A5\u4E0D\u53EF\u7528\uFF0C\u672A\u5C1D\u8BD5\u91CD\u542F\u3002\u91CD\u8BD5\u524D\u8BF7\u5B8C\u6210\u4EFB\u52A1\u5E76\u624B\u52A8\u9000\u51FA Codex\u3002" as critical'
exit 1
`;

// plugin/bridge-installer.js
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
var DEFAULT_USAGE_REFRESH_SECONDS = "30";
var USAGE_REFRESH_VARIABLE = "CODEX_KEYBOARD_USAGE_REFRESH_SECONDS";
async function bridgeAgentEnvironment({
  agentPath,
  environment = process.env,
  execute = execFileAsync
}) {
  let previous = {};
  let handle;
  try {
    handle = await (0, import_promises.open)(agentPath, import_node_fs.constants.O_RDONLY | import_node_fs.constants.O_NOFOLLOW | import_node_fs.constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size <= 0 || info.size > 256 * 1024) {
      throw new Error("Existing Bridge LaunchAgent must be a regular plist of at most 256 KiB.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Existing Bridge LaunchAgent cannot be safely read; installation was not changed.");
  } finally {
    await handle?.close();
  }
  if (handle) {
    try {
      const { stdout = "" } = await execute("/usr/bin/plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        agentPath
      ], { timeout: 1200, maxBuffer: 256 * 1024 });
      const plist = JSON.parse(stdout);
      if (!plist || typeof plist !== "object" || Array.isArray(plist)) throw new Error();
      previous = plist.EnvironmentVariables ?? {};
    } catch {
      throw new Error("Existing Bridge LaunchAgent is invalid; installation was not changed.");
    }
  }
  if (!previous || typeof previous !== "object" || Array.isArray(previous) || Object.entries(previous).some(([key, value]) => !key || typeof value !== "string" || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(key + value))) {
    throw new Error("Existing Bridge LaunchAgent environment is invalid; installation was not changed.");
  }
  const override = environment[USAGE_REFRESH_VARIABLE];
  const seconds = override === void 0 ? previous[USAGE_REFRESH_VARIABLE] ?? DEFAULT_USAGE_REFRESH_SECONDS : override;
  if (typeof seconds !== "string" || !seconds.trim() || !Number.isFinite(Number(seconds)) || Number(seconds) < 15) {
    throw new Error("CODEX_KEYBOARD_USAGE_REFRESH_SECONDS must be a finite number of at least 15 seconds.");
  }
  return { ...previous, [USAGE_REFRESH_VARIABLE]: seconds };
}
function bridgeAgentEnvironmentXml(environment) {
  return `<key>EnvironmentVariables</key><dict>
${Object.entries(environment).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `    <key>${xml(key)}</key><string>${xml(value)}</string>`).join("\n")}
  </dict>`;
}
async function exists(path2, mode = import_node_fs.constants.F_OK) {
  try {
    await (0, import_promises.access)(path2, mode);
    return true;
  } catch {
    return false;
  }
}
async function readJson(path2) {
  try {
    return JSON.parse(await (0, import_promises.readFile)(path2, "utf8"));
  } catch {
    return null;
  }
}
async function nodeVersion(executable, execute) {
  try {
    const { stdout = "" } = await execute(executable, ["--version"]);
    const match = String(stdout).trim().match(/^v?(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return { text: String(stdout).trim().replace(/^v/, ""), major: Number(match[1]) };
  } catch {
    return null;
  }
}
async function selectBridgeNodeRuntime({
  home = (0, import_node_os.homedir)(),
  fallbackNodeExecutable = process.execPath,
  environmentPath = process.env.PATH || "",
  platform = process.platform,
  execute = execFileAsync
} = {}) {
  const candidates = [];
  if (platform === "darwin" && await exists("/bin/zsh", import_node_fs.constants.X_OK)) {
    try {
      const { stdout = "" } = await execute("/bin/zsh", ["-lic", "node -p process.execPath"]);
      const discovered = String(stdout).split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("/") && line.split("/").at(-1) === "node");
      if (discovered) candidates.push(await (0, import_promises.realpath)(discovered));
    } catch {
    }
  }
  for (const directory of environmentPath.split(import_node_path.delimiter).filter(Boolean)) {
    candidates.push((0, import_node_path.join)(directory, "node"));
  }
  candidates.push(
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
    (0, import_node_path.join)(home, ".local", "bin", "node")
  );
  let resolvedFallback = fallbackNodeExecutable;
  try {
    resolvedFallback = await (0, import_promises.realpath)(fallbackNodeExecutable);
  } catch {
  }
  for (const executable of [...new Set(candidates)]) {
    if (!executable.startsWith("/")) continue;
    if (!await exists(executable, import_node_fs.constants.X_OK)) continue;
    const resolvedExecutable = await (0, import_promises.realpath)(executable);
    if (resolvedExecutable === resolvedFallback) continue;
    const version = await nodeVersion(resolvedExecutable, execute);
    if (version?.major >= 20) {
      return { executable: resolvedExecutable, version: version.text, source: "system" };
    }
  }
  if (await exists(resolvedFallback, import_node_fs.constants.X_OK)) {
    const version = await nodeVersion(resolvedFallback, execute);
    if (version?.major >= 20) {
      return { executable: resolvedFallback, version: version.text, source: "ulanzi" };
    }
  }
  throw new Error("No compatible Node.js 20 or later runtime was found.");
}
function createBridgeInstaller({
  pluginRoot,
  bridgeUrl,
  version,
  home = (0, import_node_os.homedir)(),
  uid = process.getuid?.(),
  platform = process.platform,
  nodeExecutable = process.execPath,
  environmentPath = process.env.PATH || "",
  environment = process.env,
  execute = execFileAsync
}) {
  const appRoot = (0, import_node_path.join)(home, "Library", "Application Support", "OpenCodexMicro");
  const userApplications = (0, import_node_path.join)(home, "Applications");
  const bridgeApp = (0, import_node_path.join)(userApplications, "Codex Bridge.app");
  const bridgeContents = (0, import_node_path.join)(bridgeApp, "Contents");
  const bridgeMacOS = (0, import_node_path.join)(bridgeContents, "MacOS");
  const bridgeResources = (0, import_node_path.join)(bridgeContents, "Resources");
  const bridgeLicenses = (0, import_node_path.join)(bridgeResources, "licenses");
  const bridgeExecutable = (0, import_node_path.join)(bridgeMacOS, "Codex Bridge");
  const bridgeIcon = (0, import_node_path.join)(bridgeResources, "CodexBridge.icns");
  const bridgeRuntime = (0, import_node_path.join)(appRoot, "bridge.mjs");
  const installMetadata = (0, import_node_path.join)(appRoot, "install.json");
  const agentsRoot = (0, import_node_path.join)(home, "Library", "LaunchAgents");
  const bridgeAgent = (0, import_node_path.join)(agentsRoot, "io.opencodexmicro.bridge.plist");
  const installerRoot = (0, import_node_path.resolve)(pluginRoot, "installer");
  const bundledRuntime = (0, import_node_path.join)(installerRoot, "bridge.mjs");
  const bundledIcon = (0, import_node_path.join)(installerRoot, "CodexBridge.png");
  async function probeBridge() {
    try {
      const response = await fetch(`${bridgeUrl}/health`, {
        signal: AbortSignal.timeout(1200)
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Bridge HTTP ${response.status}`);
      return { serviceOnline: true, cdpConnected: Boolean(payload.codexConnected), serviceError: null };
    } catch (error) {
      return { serviceOnline: false, cdpConnected: false, serviceError: error.message };
    }
  }
  async function status() {
    const [appInstalled, runtimeInstalled, agentInstalled, metadata2, probe] = await Promise.all([
      exists(bridgeExecutable, import_node_fs.constants.X_OK),
      exists(bridgeRuntime),
      exists(bridgeAgent),
      readJson(installMetadata),
      probeBridge()
    ]);
    const installed = appInstalled && runtimeInstalled && agentInstalled;
    return {
      supported: platform === "darwin" && Number.isInteger(uid),
      installed,
      appInstalled,
      serviceInstalled: runtimeInstalled && agentInstalled,
      installedVersion: metadata2?.version || null,
      bundledVersion: version,
      needsUpdate: !installed || metadata2?.version !== version,
      appPath: bridgeApp,
      nodeExecutable: metadata2?.nodeExecutable || null,
      nodeVersion: metadata2?.nodeVersion || null,
      nodeSource: metadata2?.nodeSource || null,
      ...probe
    };
  }
  async function buildIcon() {
    const iconset = (0, import_node_path.join)(appRoot, "CodexBridge.iconset");
    await (0, import_promises.rm)(iconset, { recursive: true, force: true });
    await (0, import_promises.mkdir)(iconset, { recursive: true });
    try {
      for (const [name, size] of [
        ["icon_16x16.png", 16],
        ["icon_16x16@2x.png", 32],
        ["icon_32x32.png", 32],
        ["icon_32x32@2x.png", 64],
        ["icon_128x128.png", 128],
        ["icon_128x128@2x.png", 256],
        ["icon_256x256.png", 256],
        ["icon_256x256@2x.png", 512],
        ["icon_512x512.png", 512],
        ["icon_512x512@2x.png", 1024]
      ]) {
        await execute("/usr/bin/sips", [
          "-z",
          String(size),
          String(size),
          bundledIcon,
          "--out",
          (0, import_node_path.join)(iconset, name)
        ]);
      }
      await execute("/usr/bin/iconutil", ["-c", "icns", iconset, "-o", bridgeIcon]);
    } finally {
      await (0, import_promises.rm)(iconset, { recursive: true, force: true });
    }
  }
  async function install() {
    if (platform !== "darwin" || !Number.isInteger(uid)) {
      throw new Error("Codex Bridge installation is supported on macOS only.");
    }
    if (!await exists(bundledRuntime) || !await exists(bundledIcon)) {
      throw new Error("The plugin does not contain the Codex Bridge installation resources.");
    }
    const agentEnvironment = await bridgeAgentEnvironment({ agentPath: bridgeAgent, environment, execute });
    const nodeRuntime = await selectBridgeNodeRuntime({
      home,
      fallbackNodeExecutable: nodeExecutable,
      environmentPath,
      platform,
      execute
    });
    await (0, import_promises.mkdir)(appRoot, { recursive: true, mode: 448 });
    await (0, import_promises.chmod)(appRoot, 448);
    await (0, import_promises.mkdir)(userApplications, { recursive: true });
    await (0, import_promises.mkdir)(agentsRoot, { recursive: true });
    await (0, import_promises.copyFile)(bundledRuntime, bridgeRuntime);
    await (0, import_promises.rm)(bridgeApp, { recursive: true, force: true });
    await (0, import_promises.mkdir)(bridgeMacOS, { recursive: true });
    await (0, import_promises.mkdir)(bridgeLicenses, { recursive: true });
    for (const notice of ["LICENSE", "NOTICE.md", "THIRD_PARTY_NOTICES.md"]) {
      const source = (0, import_node_path.join)(installerRoot, notice);
      await (0, import_promises.copyFile)(source, (0, import_node_path.join)(bridgeLicenses, notice));
      await (0, import_promises.copyFile)(source, (0, import_node_path.join)(appRoot, notice));
    }
    await buildIcon();
    const info = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Codex Bridge</string>
  <key>CFBundleExecutable</key><string>Codex Bridge</string>
  <key>CFBundleIconFile</key><string>CodexBridge</string>
  <key>CFBundleIdentifier</key><string>io.opencodexmicro.bridge</string>
  <key>CFBundleName</key><string>Codex Bridge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${xml(version)}</string>
  <key>CFBundleVersion</key><string>${xml(version)}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
`;
    await (0, import_promises.writeFile)((0, import_node_path.join)(bridgeContents, "Info.plist"), info);
    await (0, import_promises.writeFile)(bridgeExecutable, bridgeLauncher, { mode: 493 });
    await (0, import_promises.chmod)(bridgeExecutable, 493);
    await execute("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", bridgeApp]);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>io.opencodexmicro.bridge</string>
  <key>ProgramArguments</key><array>
    <string>${xml(nodeRuntime.executable)}</string>
    <string>${xml(bridgeRuntime)}</string>
  </array>
  ${bridgeAgentEnvironmentXml(agentEnvironment)}
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>2</integer>
  <key>StandardOutPath</key><string>${xml((0, import_node_path.join)(appRoot, "bridge.log"))}</string>
  <key>StandardErrorPath</key><string>${xml((0, import_node_path.join)(appRoot, "bridge-error.log"))}</string>
</dict></plist>
`;
    await (0, import_promises.writeFile)(bridgeAgent, plist, { mode: 420 });
    await (0, import_promises.writeFile)(installMetadata, `${JSON.stringify({
      version,
      nodeExecutable: nodeRuntime.executable,
      nodeVersion: nodeRuntime.version,
      nodeSource: nodeRuntime.source,
      installedAt: (/* @__PURE__ */ new Date()).toISOString()
    }, null, 2)}
`, { mode: 384 });
    try {
      await execute("/bin/launchctl", ["bootout", `gui/${uid}`, bridgeAgent]);
    } catch {
    }
    await execute("/bin/launchctl", ["bootstrap", `gui/${uid}`, bridgeAgent]);
    return status();
  }
  async function launch() {
    if (!await exists(bridgeExecutable, import_node_fs.constants.X_OK)) {
      throw new Error("Codex Bridge.app is not installed.");
    }
    await execute("/usr/bin/open", [bridgeApp]);
    return status();
  }
  async function uninstall() {
    if (platform !== "darwin" || !Number.isInteger(uid)) {
      throw new Error("Codex Bridge uninstallation is supported on macOS only.");
    }
    try {
      await execute("/bin/launchctl", ["bootout", `gui/${uid}`, bridgeAgent]);
    } catch {
    }
    await (0, import_promises.rm)(bridgeAgent, { force: true });
    await (0, import_promises.rm)(appRoot, { recursive: true, force: true });
    await (0, import_promises.rm)(bridgeApp, { recursive: true, force: true });
    return status();
  }
  return { status, install, launch, uninstall };
}

// plugin/key-title.js
var segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function titleSource(value) {
  return String(value ?? "").trim();
}
var UNTITLED_LABELS = Object.freeze({
  en: "Untitled",
  zh: "\u672A\u547D\u540D",
  ja: "\u7121\u984C",
  de: "Unbenannt",
  ko: "\uC81C\uBAA9 \uC5C6\uC74C",
  pt: "Sem t\xEDtulo",
  es: "Sin t\xEDtulo"
});
function untitledTaskLabel(language2 = "en") {
  const languageCode = String(language2 ?? "en").trim().toLowerCase().split(/[-_]/u)[0];
  return UNTITLED_LABELS[languageCode] || UNTITLED_LABELS.en;
}
function widthOf(grapheme) {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\p{Regional_Indicator}\uFF01-\uFF60]/u.test(grapheme) ? 2 : 0.75;
}
function fitAliasLine(value) {
  const graphemes = [...segmenter.segment(value.trim())].map((item) => item.segment);
  const line = [];
  let used = 0;
  let end = 0;
  while (end < graphemes.length && used + widthOf(graphemes[end]) <= 6) {
    used += widthOf(graphemes[end]);
    line.push(graphemes[end++]);
  }
  if (end < graphemes.length) {
    while (line.length && used + 0.75 > 6) used -= widthOf(line.pop());
    line.push("\u2026");
  }
  return line.join("");
}
function formatTaskLabel(value, { preserveLines = false } = {}) {
  if (preserveLines && String(value ?? "").includes("\n")) {
    return String(value).split("\n").slice(0, 2).map(fitAliasLine).filter(Boolean).join("\n") || "?";
  }
  const text2 = titleSource(value).replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim();
  const remaining2 = [...segmenter.segment(text2)].map((item) => item.segment);
  if (!remaining2.length) return "?";
  const lines = [];
  while (remaining2.length && lines.length < 2) {
    let end = 0;
    let width = 0;
    while (end < remaining2.length && width + widthOf(remaining2[end]) <= 6) {
      width += widthOf(remaining2[end++]);
    }
    if (end < remaining2.length && lines.length === 0) {
      const space = remaining2.slice(0, end + 1).lastIndexOf(" ");
      if (space >= 2) end = space;
      else if (!remaining2.includes(" ")) {
        const totalWidth = remaining2.reduce((sum, part) => sum + widthOf(part), 0);
        if (totalWidth <= 12) {
          end = 0;
          width = 0;
          while (width < totalWidth / 2) width += widthOf(remaining2[end++]);
        }
      }
    }
    const line = remaining2.splice(0, end);
    while (line.at(-1) === " ") line.pop();
    while (remaining2[0] === " ") remaining2.shift();
    if (lines.length === 1 && remaining2.length) {
      const space = line.lastIndexOf(" ");
      if (space >= 2) line.splice(space);
      let used = line.reduce((sum, part) => sum + widthOf(part), 0);
      while (line.length && used + 0.75 > 6) used -= widthOf(line.pop());
      line.push("\u2026");
    }
    lines.push(line.join(""));
  }
  return lines.join("\n");
}

// plugin/conversation-labels.js
var import_promises2 = require("node:fs/promises");
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
var MAX_ALIAS_GRAPHEMES = 16;
var MAX_REGISTRY_BYTES = 2 * 1024 * 1024;
var segmenter2 = new Intl.Segmenter(void 0, { granularity: "grapheme" });
function invalid(message, code = "INVALID_CONVERSATION_LABEL") {
  return Object.assign(new Error(message), { code });
}
function validThreadKey(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 512 || /[\p{Cc}\u2028\u2029]/u.test(value)) {
    throw invalid("Invalid conversation identifier.");
  }
  return value;
}
function normalizeConversationAlias(value) {
  if (typeof value !== "string") throw invalid("The short name must be text.");
  const alias = value.replace(/\r\n?/g, "\n").trim();
  if (/[\p{Cc}\u2028\u2029]/u.test(alias.replace(/\n/g, ""))) {
    throw invalid("The short name cannot contain control characters.");
  }
  if (alias.split("\n").length > 2) throw invalid("Use at most two lines for the short name.");
  if ([...segmenter2.segment(alias)].length > MAX_ALIAS_GRAPHEMES) {
    throw invalid(`Use at most ${MAX_ALIAS_GRAPHEMES} characters for the short name.`);
  }
  return alias;
}
function metadata(entry) {
  return { identifier: String(entry.number).padStart(2, "0"), alias: entry.alias };
}
function createConversationLabels({
  filePath = import_node_path2.default.join(import_node_os2.default.homedir(), "Library/Application Support/OpenCodexMicro/conversation-labels.json"),
  maxEntries = 4096
} = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096) {
    throw invalid("Invalid conversation label capacity.");
  }
  const resolvedPath = import_node_path2.default.resolve(filePath);
  let entries = /* @__PURE__ */ new Map();
  let nextNumber = 1;
  let loadPromise;
  let queue = Promise.resolve();
  async function load() {
    if (!loadPromise) loadPromise = (async () => {
      let source;
      try {
        if ((await (0, import_promises2.stat)(resolvedPath)).size > MAX_REGISTRY_BYTES) throw invalid("Conversation label file is too large.", "INVALID_LABEL_REGISTRY");
        source = await (0, import_promises2.readFile)(resolvedPath, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") return;
        throw error;
      }
      let data;
      try {
        data = JSON.parse(source);
      } catch {
        throw invalid("Conversation label file is invalid.", "INVALID_LABEL_REGISTRY");
      }
      if (data?.version !== 1 || !Array.isArray(data.entries) || data.entries.length > maxEntries || !Number.isSafeInteger(data.nextNumber) || data.nextNumber < 1 || data.nextNumber > maxEntries + 1) {
        throw invalid("Conversation label file has an unsupported format.", "INVALID_LABEL_REGISTRY");
      }
      const loaded = /* @__PURE__ */ new Map();
      const numbers = /* @__PURE__ */ new Set();
      for (const entry of data.entries) {
        const key = validThreadKey(entry?.threadKey);
        const alias = normalizeConversationAlias(entry.alias ?? "");
        if (!Number.isSafeInteger(entry.number) || entry.number < 1 || entry.number >= data.nextNumber || loaded.has(key) || numbers.has(entry.number)) {
          throw invalid("Conversation label file contains conflicting identifiers.", "INVALID_LABEL_REGISTRY");
        }
        loaded.set(key, { number: entry.number, alias });
        numbers.add(entry.number);
      }
      entries = loaded;
      nextNumber = data.nextNumber;
    })();
    return loadPromise;
  }
  async function persist(updated, next) {
    const directory = import_node_path2.default.dirname(resolvedPath);
    await (0, import_promises2.mkdir)(directory, { recursive: true, mode: 448 });
    const directoryInfo = await (0, import_promises2.lstat)(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw invalid("Conversation labels need a local directory.");
    await (0, import_promises2.chmod)(directory, 448);
    const temporary = `${resolvedPath}.${process.pid}.${(0, import_node_crypto.randomBytes)(6).toString("hex")}.tmp`;
    let handle;
    try {
      handle = await (0, import_promises2.open)(temporary, "wx", 384);
      const source = JSON.stringify({ version: 1, nextNumber: next, entries: [...updated].map(([threadKey, entry]) => ({ threadKey, number: entry.number, ...entry.alias ? { alias: entry.alias } : {} })) }, null, 2);
      if (Buffer.byteLength(source) > MAX_REGISTRY_BYTES) throw invalid("Conversation label file is too large.", "LABEL_CAPACITY_REACHED");
      await handle.writeFile(`${source}
`, "utf8");
      await handle.sync();
      await handle.close();
      handle = void 0;
      await (0, import_promises2.rename)(temporary, resolvedPath);
    } finally {
      await handle?.close();
      await (0, import_promises2.unlink)(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
  function serialize(operation) {
    const pending = queue.then(async () => {
      await load();
      return operation();
    });
    queue = pending.catch(() => {
    });
    return pending;
  }
  function addMissing(updated, keys) {
    const missing = keys.filter((key) => !updated.has(key));
    if (updated.size + missing.length > maxEntries || nextNumber + missing.length > Number.MAX_SAFE_INTEGER) {
      throw invalid("Conversation label capacity was reached; existing identifiers were kept.", "LABEL_CAPACITY_REACHED");
    }
    let next = nextNumber;
    for (const key of missing) updated.set(key, { number: next++, alias: "" });
    return next;
  }
  return {
    filePath: resolvedPath,
    get(threadKey) {
      const entry = entries.get(validThreadKey(threadKey));
      return entry ? metadata(entry) : null;
    },
    async ensure(threadKeys) {
      if (!Array.isArray(threadKeys)) throw invalid("Conversation identifiers must be an array.");
      const keys = [...new Set(threadKeys.map(validThreadKey))];
      return serialize(async () => {
        const updated = new Map(entries);
        const next = addMissing(updated, keys);
        if (next !== nextNumber) {
          await persist(updated, next);
          entries = updated;
          nextNumber = next;
        }
        return new Map(keys.map((key) => [key, metadata(entries.get(key))]));
      });
    },
    async setAlias(threadKey, value) {
      const key = validThreadKey(threadKey);
      const alias = normalizeConversationAlias(value);
      return serialize(async () => {
        const updated = new Map(entries);
        const next = addMissing(updated, [key]);
        const previous = updated.get(key);
        if (next !== nextNumber || previous.alias !== alias) {
          updated.set(key, { ...previous, alias });
          await persist(updated, next);
          entries = updated;
          nextNumber = next;
        }
        return metadata(entries.get(key));
      });
    }
  };
}

// plugin/design-variants.js
var DESIGN_VARIANTS = Object.freeze([
  Object.freeze({
    id: "aurora",
    labelZh: "\u6781\u5149\u4E1D\u5E26",
    labelEn: "Aurora Silk",
    descriptionZh: "\u5BBD\u5E45\u5149\u7EF8\u6CBF\u8FB9\u7F18\u8212\u5C55\uFF0C\u660E\u6697\u6298\u9762\u7F13\u6162\u6D41\u52A8\uFF0C\u4E2D\u592E\u7559\u7ED9\u5BF9\u8BDD\u6807\u9898\u3002"
  }),
  Object.freeze({
    id: "plasma",
    labelZh: "\u7B49\u79BB\u5B50\u6F6E\u6C50",
    labelEn: "Plasma Tide",
    descriptionZh: "\u7EC6\u5BC6\u80FD\u91CF\u66F2\u7EBF\u4EA4\u7EC7\u6210\u6F6E\u6C50\uFF0C\u7535\u6D41\u6301\u7EED\u7A7F\u884C\uFF0C\u52A8\u611F\u66F4\u5F3A\u3002"
  }),
  Object.freeze({
    id: "prism",
    labelZh: "\u6298\u5C04\u6676\u9762",
    labelEn: "Prism Glass",
    descriptionZh: "\u6E05\u6670\u7684\u5207\u5272\u6676\u9762\u4E0E\u79FB\u52A8\u53CD\u5149\uFF0C\u50CF\u4E00\u5757\u6709\u6DF1\u5EA6\u7684\u5F69\u8272\u5149\u5B66\u73BB\u7483\u3002"
  }),
  Object.freeze({
    id: "circuit",
    labelZh: "\u5149\u8F68\u626B\u63CF",
    labelEn: "Circuit Scan",
    descriptionZh: "\u7B80\u6D01\u7684\u53D1\u5149\u8F68\u9053\u548C\u6D41\u52A8\u626B\u63CF\u5149\u70B9\uFF0C\u4F18\u5148\u4FDD\u8BC1\u6807\u9898\u6E05\u6670\u3002"
  })
]);
var SIZE = 196;
var FRAMES = 24;
var TAU = Math.PI * 2;
var ANIMATED = /* @__PURE__ */ new Set(["working", "attention", "error"]);
var PALETTE = Object.freeze({
  working: { deep: "#051D58", base: "#0754FF", bright: "#13E8FF", white: "#CEFCFF" },
  attention: { deep: "#4B1804", base: "#FF7106", bright: "#FFD31D", white: "#FFF2B7" },
  complete: { deep: "#053424", base: "#00BC74", bright: "#4DFFAD", white: "#C8FFE4" },
  error: { deep: "#420D16", base: "#F42D49", bright: "#FF6D64", white: "#FFE1DB" },
  idle: { deep: "#101B25", base: "#354A5B", bright: "#778C98", white: "#B8C9D0" },
  unknown: { deep: "#14212B", base: "#4C6575", bright: "#A1B6BF", white: "#D5E2E6" },
  offline: { deep: "#111B24", base: "#3A4E5D", bright: "#819AA8", white: "#B6CBD3" },
  empty: { deep: "#0E1820", base: "#263B49", bright: "#536D7A", white: "#8DA4AE" }
});
function n(value) {
  return Number(value.toFixed(2));
}
function frameAngle(status, phase) {
  if (!ANIMATED.has(status)) return 0;
  const value = Number(phase);
  const frame = Number.isFinite(value) ? (Math.floor(value) % FRAMES + FRAMES) % FRAMES : 0;
  return frame * TAU / FRAMES;
}
function motionStrength(status) {
  return status === "working" ? 1 : status === "attention" ? 0.3 : status === "error" ? 0.16 : 0;
}
function brightness(status, angle) {
  if (status === "attention") return 0.73 + 0.27 * (0.5 + 0.5 * Math.sin(angle));
  if (status === "error") return 0.72 + 0.28 * (0.5 + 0.5 * Math.cos(angle));
  return 1;
}
function sharedDefinitions(p) {
  return `<radialGradient id="ambience" cx=".85" cy=".97" r="1"><stop stop-color="${p.base}" stop-opacity=".2"/><stop offset="1" stop-color="${p.deep}" stop-opacity="0"/></radialGradient>
    <radialGradient id="title-shade" cx=".5" cy=".52" r=".61"><stop stop-color="#060B12" stop-opacity=".97"/><stop offset=".54" stop-color="#060B12" stop-opacity=".82"/><stop offset="1" stop-color="#060B12" stop-opacity="0"/></radialGradient>`;
}
function field() {
  return '<rect width="196" height="196" fill="#060B12"/><rect width="196" height="196" fill="url(#ambience)"/>';
}
function aurora(p, angle, status) {
  const strength = motionStrength(status);
  const sway = 19 * Math.sin(angle) * strength;
  const lift = 14 * Math.cos(angle) * strength;
  const fold = 12 * Math.sin(angle + 0.8) * strength;
  const ribbon = `M-28 ${n(125 + lift)} C${n(29 + sway)} ${n(206 + lift)} ${n(104 - fold)} ${n(67 - lift)} 224 109 L224 168 C${n(115 + sway)} ${n(115 + fold)} ${n(58 - sway)} 244 -28 172 Z`;
  const top = `M100 -24 C${n(120 - sway)} ${n(27 + lift)} ${n(162 + sway)} ${n(69 - fold)} 221 73 L224 19 C165 22 ${n(142 + fold)} -2 139 -24 Z`;
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="silk" x1=".11" y1=".13" x2=".65" y2="1"><stop stop-color="${p.deep}"/><stop offset=".36" stop-color="${p.base}"/><stop offset=".62" stop-color="${p.bright}"/><stop offset=".73" stop-color="${p.white}"/><stop offset=".8" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <linearGradient id="silk-top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.base}" stop-opacity=".1"/><stop offset=".64" stop-color="${p.bright}"/><stop offset=".78" stop-color="${p.white}" stop-opacity=".9"/><stop offset="1" stop-color="${p.base}"/></linearGradient>
    <linearGradient id="silk-rim" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${p.white}" stop-opacity="0"/><stop offset=".45" stop-color="${p.white}" stop-opacity=".9"/><stop offset="1" stop-color="${p.bright}" stop-opacity="0"/></linearGradient>
  </defs>${field()}
  <g opacity="${n(brightness(status, angle))}">
    <path d="${ribbon}" fill="url(#silk)"/>
    <path d="${top}" fill="url(#silk-top)"/>
    <path d="M-28 ${n(125 + lift)} C${n(29 + sway)} ${n(206 + lift)} ${n(104 - fold)} ${n(67 - lift)} 224 109" fill="none" stroke="url(#silk-rim)" stroke-width="1.5"/>
    <path d="M-12 ${n(153 + lift * 0.6)} C${n(49 + sway)} 203 ${n(130 - fold)} ${n(104 - lift * 0.3)} 217 136" fill="none" stroke="${p.deep}" stroke-opacity=".42" stroke-width="3"/>
  </g><rect width="196" height="196" fill="url(#title-shade)" opacity=".4"/>`;
}
function plasma(p, angle, status) {
  const strength = motionStrength(status);
  const sway = 17 * Math.sin(angle) * strength;
  const turn = 12 * Math.cos(angle) * strength;
  const currents = [];
  for (let line = 0; line < 11; line += 1) {
    const u = line / 10;
    const tilt = 10 * Math.sin(angle + line * 0.32) * strength;
    const path2 = `M${n(-37 + line * 3.6)} ${n(31 + line * 9.6)} C${n(45 + sway + line * 1.9)} ${n(-46 + turn + line * 2.4)} ${n(79 + tilt)} ${n(216 - line * 2)} ${n(232 - line * 2.4)} ${n(161 - line * 7.2)}`;
    currents.push(`<path d="${path2}" fill="none" stroke="url(#current)" stroke-width="${line % 4 === 0 ? 2.5 : 1.15}" opacity="${n(0.35 + 0.58 * Math.sin(u * Math.PI))}"/>`);
  }
  const returnCurrents = [];
  for (let line = 0; line < 5; line += 1) {
    returnCurrents.push(`<path d="M${n(149 + line * 12)} -18 C${n(238 - line * 7)} ${n(28 + turn)} ${n(102 + sway)} ${n(162 - line * 6)} ${n(45 - line * 14)} 218" fill="none" stroke="url(#return)" stroke-width="${line === 2 ? 2.3 : 1}" opacity="${n(0.3 + line % 3 * 0.16)}"/>`);
  }
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="current" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.base}" stop-opacity="0"/><stop offset=".18" stop-color="${p.base}"/><stop offset=".42" stop-color="${p.bright}"/><stop offset=".56" stop-color="${p.white}"/><stop offset=".78" stop-color="${p.base}"/><stop offset="1" stop-color="${p.bright}" stop-opacity="0"/></linearGradient>
    <linearGradient id="return" x1="1" y1="0" x2="0" y2="1"><stop stop-color="${p.bright}" stop-opacity="0"/><stop offset=".28" stop-color="${p.bright}"/><stop offset=".51" stop-color="${p.white}"/><stop offset=".84" stop-color="${p.base}"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></linearGradient>
    <radialGradient id="pool" cx=".14" cy=".24" r=".73"><stop stop-color="${p.base}" stop-opacity=".35"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></radialGradient>
  </defs>${field()}<rect width="196" height="196" fill="url(#pool)"/>
  <g opacity="${n(brightness(status, angle))}">${currents.join("")}${returnCurrents.join("")}</g>
  <rect width="196" height="196" fill="url(#title-shade)" opacity=".91"/>`;
}
function prism(p, angle, status) {
  const strength = motionStrength(status);
  const shineX = 0.18 + 0.26 * (1 + Math.cos(angle)) * strength;
  const shineY = 0.12 + 0.23 * (1 + Math.sin(angle)) * strength;
  const facetOpacity = 0.72 + 0.2 * Math.sin(angle + 0.3) * strength;
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="glass-top" x1="0" y1="0" x2=".9" y2="1"><stop stop-color="${p.base}"/><stop offset=".48" stop-color="${p.bright}"/><stop offset=".64" stop-color="${p.white}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <linearGradient id="glass-side" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${p.deep}"/><stop offset=".37" stop-color="${p.base}"/><stop offset=".73" stop-color="${p.bright}"/><stop offset="1" stop-color="${p.white}"/></linearGradient>
    <linearGradient id="glass-bottom" x1="0" y1="0" x2="1" y2=".6"><stop stop-color="${p.deep}"/><stop offset=".42" stop-color="${p.bright}"/><stop offset=".56" stop-color="${p.white}"/><stop offset=".7" stop-color="${p.base}"/><stop offset="1" stop-color="${p.deep}"/></linearGradient>
    <radialGradient id="glass-sheen" cx="${n(shineX)}" cy="${n(shineY)}" r=".66"><stop stop-color="${p.white}" stop-opacity=".74"/><stop offset=".34" stop-color="${p.bright}" stop-opacity=".14"/><stop offset="1" stop-color="${p.white}" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.deep}"/><stop offset=".48" stop-color="#07121D"/><stop offset="1" stop-color="${p.deep}" stop-opacity=".45"/></linearGradient>
  </defs>${field()}
  <g opacity="${n(brightness(status, angle))}">
    <path d="M-12 4 L148 -12 L193 28 L145 55 L33 42 Z" fill="url(#glass-top)" opacity="${n(facetOpacity)}"/>
    <path d="M193 28 L213 78 L189 202 L157 157 L145 55 Z" fill="url(#glass-side)"/>
    <path d="M-12 139 L31 155 L157 157 L189 202 L45 211 Z" fill="url(#glass-bottom)"/>
    <path d="M-12 4 L33 42 L31 155 L-12 139 Z" fill="url(#glass-side)" opacity=".65"/>
    <path d="M33 42 L145 55 L157 157 L31 155 Z" fill="url(#glass-face)"/>
    <path d="M-12 4 L148 -12 L193 28 L213 78 L189 202 L45 211 L-12 139 Z" fill="url(#glass-sheen)"/>
    <path d="M-12 4 L33 42 L145 55 L193 28 M145 55 L157 157 L189 202 M157 157 L31 155 L-12 139" fill="none" stroke="${p.white}" stroke-opacity=".38" stroke-width="1"/>
    <path d="M35 44 L143 57 M159 158 L184 193" fill="none" stroke="${p.bright}" stroke-opacity=".8" stroke-width="1.7"/>
  </g><rect width="196" height="196" fill="url(#title-shade)" opacity=".54"/>`;
}
var TRACK = "M32 15 H164 Q181 15 181 32 V164 Q181 181 164 181 H32 Q15 181 15 164 V32 Q15 15 32 15 Z";
function circuit(p, angle, status) {
  const strength = motionStrength(status);
  const progress = status === "working" ? angle / TAU : 0.17 + 0.04 * Math.sin(angle) * strength;
  const offset = n(-progress * 1e3);
  const bars = Array.from({ length: 17 }, (_, index) => {
    const wave = 0.5 + 0.5 * Math.cos(angle - index * 0.45);
    const opacity = status === "working" ? 0.16 + 0.72 * wave : 0.25;
    const height = status === "working" ? 3 + wave * 9 : 4;
    return `<rect x="${38 + index * 7}" y="${n(166 - height)}" width="3" height="${n(height)}" rx="1.5" fill="${p.bright}" opacity="${n(opacity)}"/>`;
  }).join("");
  return `<defs>${sharedDefinitions(p)}
    <linearGradient id="track" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p.bright}" stop-opacity=".52"/><stop offset=".45" stop-color="${p.base}" stop-opacity=".15"/><stop offset="1" stop-color="${p.bright}" stop-opacity=".48"/></linearGradient>
    <radialGradient id="scan-field" cx=".89" cy=".91" r=".73"><stop stop-color="${p.base}" stop-opacity=".18"/><stop offset="1" stop-color="${p.base}" stop-opacity="0"/></radialGradient>
  </defs>${field()}<rect width="196" height="196" fill="url(#scan-field)"/>
  <g opacity="${n(brightness(status, angle))}" fill="none" stroke-linecap="round">
    <path d="${TRACK}" stroke="url(#track)" stroke-width="1"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.base}" stroke-width="6" stroke-opacity=".24" stroke-dasharray="110 890" stroke-dashoffset="${offset}"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.bright}" stroke-width="2.1" stroke-dasharray="88 912" stroke-dashoffset="${offset}"/>
    <path d="${TRACK}" pathLength="1000" stroke="${p.white}" stroke-width="2.6" stroke-dasharray="3 997" stroke-dashoffset="${offset}"/>
    <path d="M24 48 V33 Q24 24 33 24 H48 M148 172 H163 Q172 172 172 163 V148" stroke="${p.bright}" stroke-width="1" stroke-opacity=".55"/>
  </g><g opacity="${n(brightness(status, angle))}">${bars}</g>`;
}
var RENDERERS = Object.freeze({ aurora, plasma, prism, circuit });
function designVariantSvg(id, status, phase = 0) {
  const state = Object.hasOwn(PALETTE, status) ? status : "unknown";
  const renderer = Object.hasOwn(RENDERERS, id) ? RENDERERS[id] : aurora;
  const art = renderer(PALETTE[state], frameAngle(state, phase), state);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${art}</svg>`;
}

// plugin/premium-art.js
var THEMES = Object.freeze(["solid", "orb", ...DESIGN_VARIANTS.map((variant) => variant.id)]);
var SIZE2 = 196;
var FRAMES2 = 24;
var FONT = "'Source Han Sans SC','PingFang SC','Heiti SC','Noto Sans CJK SC',Arial,sans-serif";
var ANIMATED2 = /* @__PURE__ */ new Set(["working", "attention", "error"]);
var COLORS = Object.freeze({
  working: { dark: "#06164F", base: "#0445FF", light: "#12EFFF", flat: "#1BDDFF" },
  attention: { dark: "#580E00", base: "#FF5B00", light: "#FFE112", flat: "#FFBD0C" },
  error: { dark: "#4F0B12", base: "#F72E35", light: "#FF7660", flat: "#FF5F57" },
  complete: { dark: "#043725", base: "#00BA66", light: "#5AFF9D", flat: "#5AFF9D" },
  idle: { dark: "#111923", base: "#36434F", light: "#85939B", flat: "#85939B" },
  unknown: { dark: "#18232D", base: "#6D8190", light: "#BECFD6", flat: "#A2B0B9" },
  offline: { dark: "#111A23", base: "#4B5C6B", light: "#8BA1AE", flat: "#798D9C" },
  empty: { dark: "#0B121B", base: "#344959", light: "#647C86", flat: "#8F9EA8" }
});
function number(value) {
  return Number(value.toFixed(2));
}
function xml2(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]);
}
function phaseAngle(status, phase) {
  if (!ANIMATED2.has(status)) return 0;
  const value = Number(phase);
  const frame = Number.isFinite(value) ? (Math.floor(value) % FRAMES2 + FRAMES2) % FRAMES2 : 0;
  return frame * Math.PI * 2 / FRAMES2;
}
function glyph(value, theme, identifier = "") {
  if (!value) return "";
  const color = theme === "solid" ? "#071D2E" : "#FFFFFF";
  const lines = String(value).split("\n").slice(0, 2);
  const legacy = !identifier && [...new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(value)].length === 1;
  const size = legacy ? 88 : 52;
  const firstBaseline = lines.length === 2 ? 106 : 132;
  const number3 = identifier ? `<text x="20" y="39" fill="${color}" opacity=".85" font-family="${FONT}" font-size="24" font-weight="600">${xml2(identifier)}</text>` : "";
  return number3 + lines.map((line, index) => {
    const width = [...line].reduce((sum, character) => sum + (/[^\x00-\x7f]/u.test(character) ? size : size * 0.6), 0);
    const fit = width > 156 ? ' textLength="156" lengthAdjust="spacingAndGlyphs"' : "";
    return `<text x="98" y="${legacy ? 128 : firstBaseline + index * 54}" fill="${color}" font-family="${FONT}" font-size="${size}" font-weight="600" text-anchor="middle"${fit}>${xml2(line)}</text>`;
  }).join("");
}
function outline(phase, scale = 1) {
  const points = [];
  for (let step = 0; step < 120; step += 1) {
    const angle = step * Math.PI * 2 / 120;
    const radius = 77 * scale * (1 + 0.065 * Math.sin(angle * 3 + phase) + 0.052 * Math.cos(angle * 2 - phase) + 0.018 * Math.sin(angle * 5 + phase));
    points.push(`${step ? "L" : "M"}${number(98 + radius * Math.cos(angle))} ${number(96 + radius * Math.sin(angle))}`);
  }
  return `${points.join(" ")} Z`;
}
function orb(palette, phase, status) {
  const breathe = status === "attention" ? 1 + 0.035 * Math.sin(phase) : 1;
  const shape = outline(phase, breathe);
  const bend = number(22 * Math.sin(phase));
  const lift = number(14 * Math.cos(phase));
  const shimmer = status === "error" ? 0.6 + 0.4 * Math.cos(phase * 2) ** 2 : 1;
  return `<defs>
    <radialGradient id="surface" cx=".32" cy=".24" r=".88"><stop stop-color="${palette.light}"/><stop offset=".36" stop-color="${palette.base}"/><stop offset="1" stop-color="${palette.dark}"/></radialGradient>
    <radialGradient id="fold"><stop stop-color="${palette.light}" stop-opacity=".96"/><stop offset=".48" stop-color="${palette.light}" stop-opacity=".66"/><stop offset="1" stop-color="${palette.light}" stop-opacity="0"/></radialGradient>
    <radialGradient id="gloss"><stop stop-color="#F4FFFF" stop-opacity=".76"/><stop offset="1" stop-color="#F4FFFF" stop-opacity="0"/></radialGradient>
    <clipPath id="silhouette"><path d="${shape}"/></clipPath>
  </defs>
  <rect width="196" height="196" fill="#04070F"/>
  <g><path d="${shape}" fill="url(#surface)"/>
    <g clip-path="url(#silhouette)" opacity="${number(shimmer)}">
      <ellipse cx="${number(108 + bend)}" cy="${number(117 + lift)}" rx="96" ry="36" fill="url(#fold)" transform="rotate(${number(-28 + bend * 0.45)} 98 98)"/>
      <ellipse cx="${number(74 + bend * 0.4)}" cy="${number(57 + lift * 0.35)}" rx="30" ry="18" fill="url(#gloss)" transform="rotate(-26 74 57)"/>
    </g>
  </g>`;
}
function solid(palette, phase, status) {
  const bend = number(24 * Math.sin(phase));
  const lift = number(15 * Math.cos(phase));
  const pulse = status === "error" ? 0.72 + 0.28 * Math.cos(phase * 2) ** 2 : 1;
  return `<defs>
    <linearGradient id="surface" x1="0" y1="0" x2=".28" y2="1"><stop stop-color="${palette.flat}"/><stop offset=".55" stop-color="${palette.flat}"/><stop offset="1" stop-color="${palette.base}" stop-opacity=".2"/></linearGradient>
    <linearGradient id="refraction" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="${palette.light}" stop-opacity="0"/><stop offset=".48" stop-color="${palette.light}" stop-opacity=".08"/><stop offset=".63" stop-color="#F4FFFF" stop-opacity=".22"/><stop offset="1" stop-color="#F4FFFF" stop-opacity="0"/></linearGradient>
    <linearGradient id="depth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.base}" stop-opacity="0"/><stop offset="1" stop-color="${palette.base}" stop-opacity=".14"/></linearGradient>
  </defs>
  <rect width="196" height="196" fill="${palette.flat}"/>
  <rect width="196" height="196" fill="url(#surface)" opacity="${number(pulse)}"/>
  <path d="M-40 ${number(118 + lift)} C${number(37 + bend)} ${number(178 - lift)} ${number(93 - bend)} ${number(27 + lift)} 236 66 L236 143 C${number(104 + bend)} 90 68 219 -40 170Z" fill="url(#refraction)"/>
  <path d="M-30 240 C12 ${number(118 - lift)} ${number(114 + bend)} ${number(158 + lift)} 224 72 L224 230Z" fill="url(#depth)"/>`;
}
function premiumTaskSvg(status, firstGlyph = "", phase = 0, theme = "solid", identifier = "") {
  const state = Object.hasOwn(COLORS, status) ? status : "unknown";
  const variant = THEMES.includes(theme) ? theme : "solid";
  if (DESIGN_VARIANTS.some((design) => design.id === variant)) {
    return designVariantSvg(variant, state, phase).replace("</svg>", `${glyph(firstGlyph, variant, identifier)}</svg>`);
  }
  const angle = phaseAngle(state, phase);
  const art = variant === "orb" ? orb(COLORS[state], angle, state) : solid(COLORS[state], angle, state);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE2}" height="${SIZE2}" viewBox="0 0 ${SIZE2} ${SIZE2}">${art}${glyph(firstGlyph, variant, identifier)}</svg>`;
}

// plugin/key-art.js
var DEFAULT_KEY_THEME = "aurora";
var FONT2 = "'Source Han Sans SC','PingFang SC','Noto Sans CJK SC',Arial,sans-serif";
var PALETTE2 = Object.freeze({
  working: { color: "#00E8FF", secondary: "#246BFF", tint: "#04203A" },
  complete: { color: "#24FF91", secondary: "#00CB9D", tint: "#052A21" },
  attention: { color: "#FFBE00", secondary: "#FF691F", tint: "#302007" },
  error: { color: "#FF348B", secondary: "#FF364C", tint: "#310E26" },
  idle: { color: "#B784FF", secondary: "#7646FF", tint: "#1D1535" },
  offline: { color: "#718299", secondary: "#3D4D64", tint: "#141D2B" },
  empty: { color: "#42546D", secondary: "#293B54", tint: "#0D1726" }
});
var STATUS_ALIASES = Object.freeze({
  idle: ["idle"],
  unknown: ["unknown"],
  working: ["working", "thinking", "running", "in_progress", "in-progress"],
  complete: ["unread", "complete", "completed", "done", "success"],
  attention: ["attention", "notification", "input", "approval", "waiting_input", "needs_input", "awaiting-approval", "awaiting-response"],
  error: ["error", "failed", "failure"],
  offline: ["offline", "disconnected", "unavailable"],
  empty: ["empty", "off", "unassigned"]
});
function normalizeStatus(status) {
  const value = String(status ?? "").toLowerCase().trim();
  for (const [normalized, aliases] of Object.entries(STATUS_ALIASES)) {
    if (aliases.includes(value)) return normalized;
  }
  return "unknown";
}
function isAnimatedStatus(status) {
  return ["working", "attention", "error"].includes(normalizeStatus(status));
}
function point(radius, angle) {
  const radians = angle * Math.PI / 180;
  return [98 + radius * Math.cos(radians), 98 + radius * Math.sin(radians)];
}
function number2(value) {
  return Number(value.toFixed(2));
}
function arc(radius, start, length, color, width, opacity = 1) {
  const a = point(radius, start);
  const b = point(radius, start + length);
  return `<path d="M${number2(a[0])} ${number2(a[1])} A${radius} ${radius} 0 ${length > 180 ? 1 : 0} 1 ${number2(b[0])} ${number2(b[1])}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${number2(opacity)}"/>`;
}
function document(palette, artwork) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="196" viewBox="0 0 196 196"><defs><radialGradient id="ambient" cx=".5" cy=".42" r=".72"><stop offset="0" stop-color="${palette.tint}"/><stop offset="1" stop-color="#060A13"/></radialGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.color}"/><stop offset="1" stop-color="${palette.secondary}"/></linearGradient></defs><rect width="196" height="196" fill="#060A13"/><rect width="196" height="196" fill="url(#ambient)"/>${artwork}</svg>`;
}
function ringTrack(palette) {
  return `<circle cx="98" cy="98" r="83" fill="none" stroke="${palette.color}" stroke-width="2" opacity=".15"/><circle cx="98" cy="98" r="66" fill="${palette.color}" opacity=".045"/>`;
}
function taskVisualSvg(status, firstGlyph = "", phase = 0, theme = DEFAULT_KEY_THEME, identifier = "") {
  return premiumTaskSvg(normalizeStatus(status), firstGlyph, phase, theme, identifier);
}
function dataURI(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
function taskVisual(status, firstGlyph = "", phase = 0, identifier = "") {
  return dataURI(taskVisualSvg(status, firstGlyph, phase, DEFAULT_KEY_THEME, identifier));
}
var ACTIONS = Object.freeze({
  fast: { color: "#FFCF00", secondary: "#FF801A", tint: "#2E2107", path: '<path d="m108 47-45 59h31l-6 43 45-62h-31z" fill="currentColor" stroke="none"/>' },
  new: { color: "#00E8FF", secondary: "#246BFF", tint: "#07243A", path: '<path d="M98 61v74M61 98h74"/>' },
  pin: { color: "#BB7AFF", secondary: "#8144FF", tint: "#201332", path: '<path d="m82 54 43 16-11 14-3 26 9 10-54-20 13-3 13-22zM90 111l-13 33"/>' },
  navigate: { color: "#65A0FF", secondary: "#486BFF", tint: "#0E1E36", path: '<path d="m66 98 31-31M66 98l31 31M69 98h46c16 0 24-11 24-27"/>' },
  fork: { color: "#00F3C1", secondary: "#00A4C7", tint: "#052A2B", path: '<path d="M75 132V66M77 109c31 0 47-16 47-43"/><circle cx="75" cy="60" r="10" fill="#071A22"/><circle cx="124" cy="60" r="10" fill="#071A22"/><circle cx="75" cy="138" r="10" fill="#071A22"/>' },
  steer: { color: "#FF9A26", secondary: "#FF582B", tint: "#2A1A0F", path: '<path d="M72 143V92c0-18 15-30 36-30h22m-18-18 18 18-18 18M101 143v-24c0-17 9-28 29-28"/>' },
  mic: { color: "#FF55CE", secondary: "#B942FF", tint: "#2E1230", path: '<rect x="82" y="48" width="32" height="66" rx="16"/><path d="M66 96v4a32 32 0 0 0 64 0v-4M98 132v17M81 149h34"/>' },
  submit: { color: "#A98AFF", secondary: "#566FFF", tint: "#191D3A", path: '<path d="M98 143V56m-30 30 30-30 30 30"/>' },
  usage: { color: "#24FF91", secondary: "#00CB9D", tint: "#052A21", path: '<path d="M98 54v44h44M81 57a44 44 0 1 0 58 58"/>' }
});
function actionVisual(action, phase = 0) {
  void phase;
  const palette = ACTIONS[String(action ?? "").toLowerCase()] ?? ACTIONS.new;
  return dataURI(document(palette, `${ringTrack(palette)}${arc(83, -70, 142, palette.color, 5, 0.8)}${arc(83, 112, 142, palette.secondary, 5, 0.65)}<g fill="none" color="${palette.color}" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">${palette.path}</g>`));
}
function usageVisual(remainingPercent, phase = 0) {
  void phase;
  const value = remainingPercent === null || remainingPercent === void 0 || remainingPercent === "" ? NaN : Number(remainingPercent);
  const remaining2 = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
  const palette = remaining2 === null ? PALETTE2.offline : remaining2 >= 50 ? PALETTE2.complete : remaining2 >= 20 ? PALETTE2.attention : PALETTE2.error;
  const text2 = remaining2 === null ? "\u2014" : String(remaining2);
  let artwork = `<circle cx="98" cy="98" r="80" fill="none" stroke="${palette.color}" stroke-width="10" opacity=".14"/>`;
  if (remaining2 > 0) artwork += arc(80, -90, Math.min(359.9, remaining2 * 3.6), palette.color, 10);
  artwork += `<text x="98" y="115" fill="#F5FCFF" font-family="${FONT2}" font-size="${text2.length > 2 ? 65 : 76}" font-weight="700" text-anchor="middle">${text2}</text>`;
  if (remaining2 !== null) artwork += `<text x="98" y="145" fill="${palette.color}" font-family="${FONT2}" font-size="24" font-weight="700" text-anchor="middle">%</text>`;
  return dataURI(document(palette, artwork));
}

// plugin/task-artwork.js
var import_node_child_process2 = require("node:child_process");
var import_node_crypto2 = require("node:crypto");
var import_promises3 = require("node:fs/promises");
var import_node_path3 = require("node:path");
var import_node_util2 = require("node:util");
var runFile = (0, import_node_util2.promisify)(import_node_child_process2.execFile);
var ARTWORK_VERSION = "state-coretext-v3-short-label";
var FILE_PREFIX = "task-v2-";
var OWN_ARTIFACT = /^task-v[12]-[a-f0-9]{64}\.(gif|png)$/;
var MAX_MEMORY_ENTRIES = 64;
var MAX_DISK_ARTIFACTS = 96;
var MAX_ARTIFACT_BYTES = 512 * 1024;
function shortLabel(value) {
  const text2 = String(value ?? "").slice(0, 512).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, "").normalize("NFC");
  const lines = text2.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 2);
  const label = lines.join("\n");
  return Buffer.byteLength(label, "utf8") <= 256 ? label : "";
}
function conversationIdentifier(value) {
  const identifier = String(value ?? "").trim();
  return /^\d{1,4}$/.test(identifier) && Number(identifier) <= 4096 ? identifier : "";
}
function createTaskArtwork({ pluginRoot, theme = DEFAULT_KEY_THEME } = {}) {
  if (!pluginRoot) throw new TypeError("Task artwork requires a plugin root");
  if (theme !== DEFAULT_KEY_THEME) throw new TypeError(`Only the installed ${DEFAULT_KEY_THEME} artwork theme is available`);
  const root = (0, import_node_path3.resolve)(pluginRoot);
  const cacheRoot = (0, import_node_path3.resolve)(root, ".key-cache");
  const helper = (0, import_node_path3.resolve)(root, "runtime", "key-glyph-renderer");
  const memory = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const sourceFingerprints = /* @__PURE__ */ new Map();
  let queue = Promise.resolve();
  let initialized;
  let temporarySequence = 0;
  async function initialize() {
    await (0, import_promises3.mkdir)(cacheRoot, { recursive: true, mode: 448 });
    const info = await (0, import_promises3.lstat)(cacheRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Task artwork cache must be a directory");
    await (0, import_promises3.chmod)(cacheRoot, 448);
  }
  function remember(key, artwork) {
    memory.delete(key);
    memory.set(key, artwork);
    while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value);
    return artwork;
  }
  async function cachedFileExists(file) {
    try {
      const info = await (0, import_promises3.lstat)(file);
      return info.isFile() && info.size > 0 && info.size <= MAX_ARTIFACT_BYTES;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
  async function prune() {
    const entries = (await (0, import_promises3.readdir)(cacheRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && OWN_ARTIFACT.test(entry.name));
    if (entries.length <= MAX_DISK_ARTIFACTS) return;
    const protectedFiles = new Set([...memory.values()].map((value) => (0, import_node_path3.basename)(value.gifpath ?? value.path)));
    const artifacts = [];
    for (const entry of entries) {
      if (protectedFiles.has(entry.name)) continue;
      try {
        const info = await (0, import_promises3.stat)((0, import_node_path3.resolve)(cacheRoot, entry.name));
        artifacts.push({ name: entry.name, modified: info.mtimeMs });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    artifacts.sort((left, right) => left.modified - right.modified || left.name.localeCompare(right.name));
    for (const artifact of artifacts.slice(0, entries.length - MAX_DISK_ARTIFACTS)) {
      await (0, import_promises3.rm)((0, import_node_path3.resolve)(cacheRoot, artifact.name), { force: true });
    }
  }
  async function renderOne(key, status, label, identifier) {
    initialized ??= initialize().catch((error) => {
      initialized = void 0;
      throw error;
    });
    await initialized;
    const animated = isAnimatedStatus(status);
    const extension2 = animated ? "gif" : "png";
    const background = (0, import_node_path3.resolve)(root, "assets", "neon", `task-${status}.${extension2}`);
    if (!sourceFingerprints.has(background)) {
      const fingerprint = (0, import_promises3.readFile)(background).then((bytes) => (0, import_node_crypto2.createHash)("sha256").update(bytes).digest("hex"));
      sourceFingerprints.set(background, fingerprint);
      fingerprint.catch(() => sourceFingerprints.delete(background));
    }
    const fileKey = (0, import_node_crypto2.createHash)("sha256").update(key).update(await sourceFingerprints.get(background)).digest("hex");
    const filename = `${FILE_PREFIX}${fileKey}.${extension2}`;
    const relative2 = `.key-cache/${filename}`;
    const artwork = Object.freeze(animated ? { type: 4, gifpath: relative2 } : { type: 2, path: relative2 });
    const destination = (0, import_node_path3.resolve)(cacheRoot, filename);
    if (!await cachedFileExists(destination)) {
      const temporary = (0, import_node_path3.resolve)(cacheRoot, `${filename}.${process.pid}.${temporarySequence++}.tmp`);
      try {
        await runFile(helper, [background, temporary, label, identifier], {
          timeout: 5e3,
          maxBuffer: 4096,
          windowsHide: true
        });
        if (!await cachedFileExists(temporary)) throw new Error("Task artwork renderer produced an invalid image");
        await (0, import_promises3.chmod)(temporary, 384);
        await (0, import_promises3.rename)(temporary, destination);
      } finally {
        await (0, import_promises3.rm)(temporary, { force: true });
      }
    }
    remember(key, artwork);
    await prune();
    return artwork;
  }
  function render(statusValue, labelValue = "", identifierValue = "") {
    const status = normalizeStatus(statusValue);
    const label = shortLabel(labelValue);
    const identifier = conversationIdentifier(identifierValue);
    const key = (0, import_node_crypto2.createHash)("sha256").update(JSON.stringify([ARTWORK_VERSION, theme, status, label, identifier])).digest("hex");
    if (memory.has(key)) return Promise.resolve(remember(key, memory.get(key)));
    if (pending.has(key)) return pending.get(key);
    const operation = queue.then(() => renderOne(key, status, label, identifier));
    queue = operation.catch(() => {
    });
    pending.set(key, operation);
    operation.then(() => pending.delete(key), () => pending.delete(key));
    return operation;
  }
  return Object.freeze({ render });
}

// plugin/task-display.js
function createTaskDisplay({ theme, artwork, send: send2, isCurrent }) {
  return function setTaskDisplay2(instance, status, text2, identifier = "") {
    const normalized = normalizeStatus(status);
    const digest = `task:${theme}:${normalized}:${identifier}:${text2}`;
    instance.desiredDisplay = digest;
    if (!instance.active || instance.lastDisplay === digest || instance.pendingDisplay === digest) return;
    instance.pendingDisplay = digest;
    return artwork.render(normalized, text2, identifier).catch((error) => {
      send2({
        cmd: "logMessage",
        uuid: instance.uuid,
        actionid: instance.actionid,
        key: instance.key,
        level: "error",
        message: `Task artwork: ${error.message}`
      });
      return { type: 1, data: taskVisual(normalized, text2, 0, identifier) };
    }).then((image) => {
      if (!instance.active || instance.desiredDisplay !== digest || instance.lastDisplay === digest || !isCurrent(instance)) return;
      instance.lastDisplay = digest;
      send2({
        cmd: "state",
        param: {
          statelist: [{
            uuid: instance.uuid,
            actionid: instance.actionid,
            key: instance.key,
            ...image,
            showtext: false,
            textdata: text2
          }]
        }
      });
    }).finally(() => {
      if (instance.pendingDisplay === digest) instance.pendingDisplay = null;
    });
  };
}

// plugin/overview-art.js
var OVERVIEW_SIZE = Object.freeze({ width: 460, height: 200 });
var OVERVIEW_MAX_USAGE_AGE_MS = 15 * 60 * 1e3;
var OVERVIEW_WINDOW_PAGE_MS = 6e3;
var FONT3 = "'PingFang SC','Source Han Sans SC','Noto Sans CJK SC',Arial,sans-serif";
var INK = "#F7FBFF";
var MUTED = "#A7B5C6";
var COLORS2 = Object.freeze({
  good: "#50FFA5",
  medium: "#FFBB32",
  low: "#FF4A64",
  unknown: MUTED,
  working: "#20DEFF",
  attention: "#FFBB32",
  error: "#FF4A64"
});
var WORDS = Object.freeze({
  en: { allowance: "ALLOWANCE", weekly: "WEEK LEFT", fiveHour: "5H LEFT", scope: "ON SCREEN", reset: "RESET", run: "RUN", wait: "WAIT", error: "ERR", live: "LIVE", offline: "OFFLINE", stale: "UPDATE NEEDED", unavailable: "UNAVAILABLE", now: "DUE" },
  zh: { allowance: "\u5269\u4F59\u989D\u5EA6", weekly: "\u672C\u5468\u5269\u4F59", fiveHour: "5\u5C0F\u65F6\u5269\u4F59", scope: "\u5C4F\u4E0A\u4F1A\u8BDD", reset: "\u91CD\u7F6E", run: "\u8FD0\u884C", wait: "\u7B49\u5F85", error: "\u5F02\u5E38", live: "\u5DF2\u8FDE\u63A5", offline: "\u672A\u8FDE\u63A5", stale: "\u7B49\u5F85\u66F4\u65B0", unavailable: "\u6682\u65E0\u6570\u636E", now: "\u5F85\u5237\u65B0" },
  zh_HK: { allowance: "\u5269\u9918\u984D\u5EA6", weekly: "\u672C\u9031\u5269\u9918", fiveHour: "5\u5C0F\u6642\u5269\u9918", scope: "\u87A2\u5E55\u5C0D\u8A71", reset: "\u91CD\u8A2D", run: "\u904B\u884C", wait: "\u7B49\u5F85", error: "\u7570\u5E38", live: "\u5DF2\u9023\u63A5", offline: "\u672A\u9023\u63A5", stale: "\u7B49\u5F85\u66F4\u65B0", unavailable: "\u66AB\u7121\u8CC7\u6599", now: "\u5F85\u66F4\u65B0" },
  ja: { allowance: "\u4F7F\u7528\u53EF\u80FD\u91CF", weekly: "\u9031\u9593\u6B8B\u91CF", fiveHour: "5\u6642\u9593\u6B8B\u91CF", scope: "\u753B\u9762\u306E\u4F1A\u8A71", reset: "\u30EA\u30BB\u30C3\u30C8", run: "\u5B9F\u884C", wait: "\u5F85\u6A5F", error: "\u7570\u5E38", live: "\u63A5\u7D9A\u4E2D", offline: "\u672A\u63A5\u7D9A", stale: "\u8981\u66F4\u65B0", unavailable: "\u30C7\u30FC\u30BF\u306A\u3057", now: "\u8981\u66F4\u65B0" },
  de: { allowance: "KONTINGENT", weekly: "WOCHE \xDCBRIG", fiveHour: "5H \xDCBRIG", scope: "AM BILDSCHIRM", reset: "RESET", run: "AKT", wait: "WART", error: "FEHL", live: "LIVE", offline: "OFFLINE", stale: "UPDATE N\xD6TIG", unavailable: "KEINE DATEN", now: "F\xC4LLIG" },
  es: { allowance: "DISPONIBLE", weekly: "SEM. LIBRE", fiveHour: "5H LIBRES", scope: "EN PANTALLA", reset: "REIN.", run: "ACT", wait: "ESP", error: "ERR", live: "EN L\xCDNEA", offline: "SIN RED", stale: "ACTUALIZAR", unavailable: "SIN DATOS", now: "PEND" },
  ko: { allowance: "\uC794\uC5EC \uD55C\uB3C4", weekly: "\uC8FC\uAC04 \uC794\uC5EC", fiveHour: "5\uC2DC\uAC04 \uC794\uC5EC", scope: "\uD654\uBA74 \uB300\uD654", reset: "\uCD08\uAE30\uD654", run: "\uC2E4\uD589", wait: "\uB300\uAE30", error: "\uC624\uB958", live: "\uC5F0\uACB0\uB428", offline: "\uC5F0\uACB0 \uC548 \uB428", stale: "\uC5C5\uB370\uC774\uD2B8 \uD544\uC694", unavailable: "\uB370\uC774\uD130 \uC5C6\uC74C", now: "\uAC31\uC2E0 \uD544\uC694" },
  pt: { allowance: "DISPON\xCDVEL", weekly: "SEM. LIVRE", fiveHour: "5H LIVRES", scope: "NA TELA", reset: "RENOVA", run: "ATIV", wait: "ESP", error: "ERR", live: "ONLINE", offline: "OFFLINE", stale: "ATUALIZAR", unavailable: "SEM DADOS", now: "AGORA" }
});
function escape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}
function numeric(value) {
  return value !== null && value !== void 0 && value !== "" && typeof value !== "boolean" && Number.isFinite(Number(value)) ? Number(value) : null;
}
function observedMillis(value) {
  const result = numeric(value);
  if (result === null || result <= 0) return null;
  return result < 1e11 ? result * 1e3 : result;
}
function remaining(window, usage, connected, now) {
  const value = numeric(window?.remainingPercent);
  const observed = observedMillis(window?.observedAt ?? usage?.observedAt);
  const stale = observed === null || now - observed > OVERVIEW_MAX_USAGE_AGE_MS || observed > now + 6e4;
  return { value: connected && !stale && value !== null ? Math.round(Math.max(0, Math.min(100, value))) : null, stale };
}
function resetDuration(window, now, words) {
  const resetsAt = numeric(window?.resetsAt);
  if (resetsAt === null || resetsAt <= 0) return "\u2014";
  const minutes = Math.ceil((resetsAt * 1e3 - now) / 6e4);
  if (minutes <= 0) return words.now;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  const remainingMinutes = minutes % 60;
  return days ? `${days}d${hours}h` : hours ? `${hours}h${remainingMinutes}m` : `${remainingMinutes}m`;
}
function resetText(window, now, words) {
  return `${words.reset} ${resetDuration(window, now, words)}`;
}
function text(x, y, value, size, color = INK, weight = 600, anchor = "start") {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${escape(value)}</text>`;
}
function allowanceColor(value) {
  return value === null ? COLORS2.unknown : value < 20 ? COLORS2.low : value < 50 ? COLORS2.medium : COLORS2.good;
}
function renderOverviewSvg(state = {}, { now = Date.now(), language: language2 = "en" } = {}) {
  const nowMs = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  const languageTag = String(language2).toLowerCase().replaceAll("_", "-");
  const languageKey = ["zh-hk", "zh-tw", "zh-hant"].some((tag) => languageTag.startsWith(tag)) ? "zh_HK" : languageTag.split("-")[0];
  const words = WORDS[languageKey] ?? WORDS.en;
  const connected = state?.connected === true;
  const usage = state?.usage;
  const windows = Array.isArray(usage?.windows) ? usage.windows : [];
  const weekly = windows.find((window) => window?.kind === "weekly");
  const fiveHour = windows.find((window) => ["five_hour", "five-hour", "fiveHour", "5h"].includes(window?.kind));
  const shown = [{ window: fiveHour, label: words.fiveHour }, { window: weekly, label: words.weekly }].filter((item2) => item2.window);
  if (shown.length === 0) shown.push({ window: null, label: words.allowance });
  const counts = { working: 0, attention: 0, error: 0 };
  const seen = /* @__PURE__ */ new Set();
  for (const slot of Array.isArray(state?.slots) ? state.slots : []) {
    if (!slot?.threadKey || seen.has(slot.threadKey)) continue;
    seen.add(slot.threadKey);
    const status = normalizeStatus(slot.status);
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  const page = Math.floor(Math.max(0, nowMs) / OVERVIEW_WINDOW_PAGE_MS) % shown.length;
  const item = shown[page];
  const { value, stale } = remaining(item.window, usage, connected, nowMs);
  const color = allowanceColor(value);
  const detail = !connected ? words.offline : !item.window ? words.unavailable : stale ? words.stale : resetText(item.window, nowMs, words);
  let art = `<title>${escape(words.scope)}</title><rect width="460" height="200" fill="#070B10"/>`;
  art += text(20, 39, item.label, 28, INK, 600);
  const digits = value === null ? "\u2014" : String(value);
  art += `<text x="18" y="143" fill="${color}" font-family="Arial,sans-serif" font-size="${digits.length > 2 ? 98 : 128}" font-weight="700" font-variant-numeric="tabular-nums">${digits}${value === null ? "" : '<tspan dx="5" font-size="42" font-weight="600">%</tspan>'}</text>`;
  art += text(20, 184, detail, 28, MUTED, 500);
  art += '<rect x="20" y="193" width="206" height="5" rx="2.5" fill="#24303D"/>';
  if (value !== null && value > 0) art += `<rect x="20" y="193" width="${(206 * value / 100).toFixed(2)}" height="5" rx="2.5" fill="${color}"/>`;
  if (shown.length > 1) {
    for (let index = 0; index < shown.length; index++) {
      art += `<rect x="${181 + index * 24}" y="12" width="17" height="4" rx="2" fill="${index === page ? INK : "#364454"}"/>`;
    }
  }
  for (const [index, [key, label]] of [["working", words.run], ["attention", words.wait], ["error", words.error]].entries()) {
    const x = 240 + index * 72;
    const center = x + 34;
    const count = connected ? String(counts[key]) : "\u2014";
    const active = connected && counts[key] > 0;
    const accent = connected ? COLORS2[key] : MUTED;
    art += `<rect x="${x}" y="16" width="68" height="172" rx="13" fill="${accent}" fill-opacity="${active ? ".13" : ".055"}"/>`;
    art += text(center, 56, label, 26, INK, 600, "middle");
    art += `<text x="${center}" y="143" fill="${active || !connected ? accent : MUTED}" font-family="Arial,sans-serif" font-size="${count === "\u2014" ? 54 : count.length > 1 ? 58 : 76}" font-weight="700" font-variant-numeric="tabular-nums" text-anchor="middle">${count}</text>`;
    art += `<rect x="${center - 18}" y="164" width="36" height="4" rx="2" fill="${accent}" opacity="${active ? ".9" : ".3"}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="200" viewBox="0 0 460 200"><g font-family="${FONT3}">${art}</g></svg>`;
}

// plugin/overview-display.js
function svgImage(svg) {
  return { type: 1, data: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}
function imagePayload(image) {
  const field2 = { 1: "data", 2: "path", 4: "gifpath" }[image?.type];
  if (!field2 || typeof image[field2] !== "string" || !image[field2]) {
    throw new TypeError("Overview renderer must return an SVG, PNG or GIF state image");
  }
  return { type: image.type, [field2]: image[field2] };
}
function createOverviewDisplay({
  send: send2,
  target,
  renderImage = svgImage,
  language: language2 = "en",
  now = Date.now,
  minUpdateMs = 1e3,
  isCurrent = () => true,
  onError = () => {
  },
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  if (typeof send2 !== "function" || typeof renderImage !== "function") {
    throw new TypeError("Overview display requires send and renderImage functions");
  }
  if (!["uuid", "actionid", "key"].every((field2) => typeof target?.[field2] === "string" && target[field2])) {
    throw new TypeError("Overview display requires a verified native window target");
  }
  const destination = Object.freeze({ uuid: target.uuid, actionid: target.actionid, key: target.key });
  const displayLanguage = typeof language2 === "string" ? language2.slice(0, 64) : "en";
  const interval = Math.max(1e3, Number.isFinite(Number(minUpdateMs)) ? Number(minUpdateMs) : 1e3);
  let latestState2;
  let desiredSvg;
  let displayedSvg;
  let lastActivityAt = -Infinity;
  let generation = 0;
  let timer = null;
  let inFlight = false;
  let disposed = false;
  let reportedError = null;
  let invalidStateReported = false;
  function clock() {
    try {
      const value = Number(now());
      if (Number.isFinite(value)) return value;
    } catch {
    }
    return Date.now();
  }
  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  function pump() {
    if (disposed || !isCurrent() || inFlight || desiredSvg === void 0 || desiredSvg === displayedSvg) return;
    const instant = clock();
    if (instant < lastActivityAt) lastActivityAt = instant - interval;
    const delay = Math.max(0, lastActivityAt + interval - instant);
    if (delay > 0) {
      if (timer === null) {
        timer = setTimer(() => {
          timer = null;
          pump();
        }, delay);
        timer?.unref?.();
      }
      return;
    }
    cancelTimer();
    const svg = desiredSvg;
    const ticket = generation;
    inFlight = true;
    lastActivityAt = instant;
    Promise.resolve().then(() => renderImage(svg)).then(imagePayload).then(async (image) => {
      if (disposed || !isCurrent() || ticket !== generation || desiredSvg !== svg || displayedSvg === svg) return;
      await send2({ cmd: "state", param: { statelist: [{ ...image, ...destination, showtext: false, textdata: "" }] } });
      displayedSvg = svg;
      lastActivityAt = clock();
      reportedError = null;
    }).catch((error) => {
      const message = String(error?.message ?? error);
      if (!disposed && ticket === generation && message !== reportedError) {
        reportedError = message;
        try {
          onError(error);
        } catch {
        }
      }
    }).finally(() => {
      inFlight = false;
      if (!disposed && (desiredSvg !== svg || ticket !== generation)) pump();
    });
  }
  function refresh() {
    if (disposed || latestState2 === void 0) return;
    try {
      desiredSvg = renderOverviewSvg(latestState2, { now: clock(), language: displayLanguage });
      invalidStateReported = false;
    } catch {
      desiredSvg = renderOverviewSvg({ connected: false }, { now: clock(), language: displayLanguage });
      if (!invalidStateReported) {
        invalidStateReported = true;
        const error = Object.assign(new Error("Overview display: Bridge state could not be rendered"), {
          code: "OVERVIEW_INVALID_STATE"
        });
        try {
          onError(error);
        } catch {
        }
      }
    }
    if (desiredSvg === displayedSvg) cancelTimer();
    pump();
  }
  return Object.freeze({
    update(state) {
      if (disposed) return;
      latestState2 = state ?? {};
      refresh();
    },
    refresh,
    invalidate() {
      if (disposed) return;
      generation += 1;
      displayedSvg = void 0;
      cancelTimer();
      refresh();
    },
    dispose() {
      disposed = true;
      generation += 1;
      latestState2 = void 0;
      desiredSvg = void 0;
      cancelTimer();
    }
  });
}

// plugin/native-overview-target.js
var import_node_fs2 = require("node:fs");
var import_promises4 = require("node:fs/promises");
var import_node_os3 = require("node:os");
var import_node_path4 = require("node:path");
var DEFAULT_OVERVIEW_CONFIG_PATH = (0, import_node_path4.resolve)((0, import_node_os3.homedir)(), "Library/Application Support/OpenCodexMicro/deck-overview.json");
var DEFAULT_STUDIO_PROFILES_ROOT = (0, import_node_path4.resolve)((0, import_node_os3.homedir)(), "Library/Application Support/Ulanzi/UlanziDeck/ProfilesV2");
var SUPPORTED_OVERVIEW_STUDIO_VERSION = "3.4.4";
var OVERVIEW_PLUGIN_UUID = "com.ulanzi.ulanzistudio.codexmicro";
var NATIVE_WINDOW_ACTION = "com.ulanzi.ulanzideck.smallwindow.window";
var MAX_JSON_BYTES = 1024 * 1024;
var UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function invalid2(message, code = "NATIVE_OVERVIEW_CONFIG") {
  return Object.assign(new Error(`Native overview: ${message}`), { code });
}
async function readBoundedJson(path2, kind, { optional = false } = {}) {
  let file;
  try {
    file = await (0, import_promises4.open)(path2, import_node_fs2.constants.O_RDONLY | import_node_fs2.constants.O_NOFOLLOW | import_node_fs2.constants.O_NONBLOCK);
  } catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw invalid2(`${kind} cannot be opened`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size <= 0 || info.size > MAX_JSON_BYTES) {
      throw invalid2(`${kind} must be a nonempty JSON file of at most 1 MiB`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    }
    const bytes = Buffer.alloc(info.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await file.read(bytes, count, bytes.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count !== info.size) throw invalid2(`${kind} changed while being read`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    let value;
    try {
      value = JSON.parse(bytes.subarray(0, count).toString("utf8"));
    } catch {
      throw invalid2(`${kind} is not valid JSON`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalid2(`${kind} must contain a JSON object`, `NATIVE_OVERVIEW_${kind.toUpperCase()}`);
    }
    return value;
  } finally {
    await file.close();
  }
}
async function resolveNativeOverviewTarget({
  configPath = process.env.CODEX_MICRO_OVERVIEW_FILE || DEFAULT_OVERVIEW_CONFIG_PATH,
  profilesRoot = DEFAULT_STUDIO_PROFILES_ROOT,
  studioVersion: studioVersion2
} = {}) {
  const config = await readBoundedJson(configPath, "config", { optional: true });
  if (config === null || config.enabled === false) return null;
  if (config.enabled !== true) throw invalid2("enabled must be a boolean");
  if (config.studioVersion !== SUPPORTED_OVERVIEW_STUDIO_VERSION || studioVersion2 !== config.studioVersion) {
    throw invalid2("Studio version is not the explicitly supported version", "NATIVE_OVERVIEW_VERSION");
  }
  if (typeof config.actionid !== "string" || !UUID.test(config.actionid)) throw invalid2("actionid must be a UUID");
  if (typeof config.profilePath !== "string" || !(0, import_node_path4.isAbsolute)(config.profilePath) || (0, import_node_path4.extname)(config.profilePath).toLowerCase() !== ".json") {
    throw invalid2("profilePath must be an absolute JSON path");
  }
  let root;
  let profilePath;
  try {
    [root, profilePath] = await Promise.all([(0, import_promises4.realpath)(profilesRoot), (0, import_promises4.realpath)(config.profilePath)]);
  } catch {
    throw invalid2("profile or ProfilesV2 directory is unavailable", "NATIVE_OVERVIEW_PROFILE");
  }
  const location = (0, import_node_path4.relative)(root, profilePath);
  if (!location || location === ".." || location.startsWith(`..${import_node_path4.sep}`) || (0, import_node_path4.isAbsolute)(location) || (0, import_node_path4.extname)(profilePath).toLowerCase() !== ".json") {
    throw invalid2("profile must remain inside Studio ProfilesV2", "NATIVE_OVERVIEW_PROFILE");
  }
  const profile = await readBoundedJson(profilePath, "profile");
  const controllers = Array.isArray(profile.Controllers) ? profile.Controllers.filter((controller) => controller?.Type === "Keypad") : [];
  if (controllers.length !== 1) throw invalid2("profile must have one Keypad controller", "NATIVE_OVERVIEW_PROFILE");
  const window = controllers[0].Actions?.["3_2"];
  if (window?.Action !== NATIVE_WINDOW_ACTION || window.ActionID !== config.actionid) {
    throw invalid2("native window assignment no longer matches", "NATIVE_OVERVIEW_PROFILE");
  }
  if (window.ActionParam?.SmallViewMode !== 2) {
    throw invalid2("native window is not in background-only mode", "NATIVE_OVERVIEW_PROFILE");
  }
  if (!Array.isArray(window.ViewParam) || window.ViewParam.length !== 1 || window.ViewParam[0]?.Icon !== "" || window.ViewParam[0]?.IconRel !== "") {
    throw invalid2("native window has a user-selected background", "NATIVE_OVERVIEW_PROFILE");
  }
  return Object.freeze({ uuid: OVERVIEW_PLUGIN_UUID, actionid: window.ActionID, key: "3_2" });
}

// plugin/app.js
var PLUGIN_UUID = "com.ulanzi.ulanzistudio.codexmicro";
var BRIDGE_URL = process.env.CODEX_BRIDGE_URL || "http://127.0.0.1:17373";
var [address = "127.0.0.1", port = "3906", language = "en-US", studioVersion = ""] = process.argv.slice(2);
var UNTITLED = untitledTaskLabel(language);
var HOST_URL = `ws://${address}:${port}`;
var instances = /* @__PURE__ */ new Map();
var PLUGIN_ROOT = (0, import_node_path5.resolve)((0, import_node_path5.dirname)((0, import_node_path5.resolve)(process.argv[1])), "..");
var MANIFEST = JSON.parse((0, import_node_fs3.readFileSync)((0, import_node_path5.resolve)(PLUGIN_ROOT, "manifest.json"), "utf8"));
var taskArtwork = createTaskArtwork({ pluginRoot: PLUGIN_ROOT, theme: DEFAULT_KEY_THEME });
var conversationLabels = createConversationLabels({ filePath: process.env.CODEX_MICRO_LABELS_FILE });
var setTaskDisplay = createTaskDisplay({
  theme: DEFAULT_KEY_THEME,
  artwork: taskArtwork,
  send,
  isCurrent: (instance) => instances.get(contextOf(instance)) === instance
});
var bridgeSetup = createBridgeInstaller({
  pluginRoot: PLUGIN_ROOT,
  bridgeUrl: BRIDGE_URL,
  version: MANIFEST.Version
});
var ACTION_LABELS = Object.freeze({
  fast: "FAST",
  usage: "USAGE",
  pin: "PIN",
  new: "NEW",
  navigate: "LATEST",
  fork: "FORK",
  steer: "STEER",
  mic: "MIC",
  submit: "SUBMIT"
});
var socket;
var reconnectTimer;
var pollTimer;
var pollInFlight = false;
var latestState = null;
var setupOperation = null;
var labelStorageError = null;
var overviewDisplay = null;
var overviewTargetKey = null;
var overviewCheckedAt = -Infinity;
var overviewSetupError = null;
var overviewRuntimeError = null;
function contextOf(message) {
  return String(message.actionid || `${message.uuid}___${message.key}`);
}
function taskSlot(uuid) {
  const match = String(uuid || "").match(/\.task([1-9]|1[0-3])$/);
  return match ? Number(match[1]) - 1 : null;
}
function actionName(uuid) {
  const name = String(uuid || "").split(".").at(-1);
  return Object.hasOwn(ACTION_LABELS, name) ? name : null;
}
function usageRemaining(usage) {
  const windows = Array.isArray(usage?.windows) ? usage.windows : [];
  const window = windows.find((item) => item?.kind === "weekly") ?? windows[0];
  const remaining2 = Number(window?.remainingPercent);
  return Number.isFinite(remaining2) ? Math.max(0, Math.min(100, Math.round(remaining2))) : null;
}
function send(message) {
  if (socket?.readyState === wrapper_default.OPEN) {
    socket.send(JSON.stringify(message));
  }
}
function ack(message) {
  send({
    code: 0,
    cmd: message.cmd,
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    active: message.active,
    param: message.param || {}
  });
}
function sendToInspector(message, payload) {
  send({
    cmd: "sendToPropertyInspector",
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    payload
  });
}
function inspectorTask(message) {
  const slot = taskSlot(message.uuid) ?? (actionName(message.uuid) === "navigate" ? 0 : null);
  return slot === null ? null : latestState?.slots?.[slot];
}
async function syncConversationLabels(state) {
  try {
    await conversationLabels.ensure((state?.slots || []).map((task) => task?.threadKey).filter(Boolean));
    labelStorageError = null;
  } catch (error) {
    if (labelStorageError !== error.message) send({
      cmd: "logMessage",
      uuid: PLUGIN_UUID,
      level: "error",
      message: `Conversation labels: ${error.message}`
    });
    labelStorageError = error.message;
  }
}
async function handleConversationLabelMessage(message) {
  let error = null;
  let errorCode = null;
  try {
    const action = message.payload?.action || "status";
    if (!["status", "save", "reset"].includes(action)) throw new Error("Unknown label action");
    if (action !== "status") {
      const task2 = inspectorTask(message);
      if (!task2?.threadKey || message.payload?.threadKey !== task2.threadKey) {
        throw Object.assign(new Error("The conversation on this key changed. Check its name and try again."), { code: "STALE_CONVERSATION" });
      }
      await conversationLabels.setAlias(task2.threadKey, action === "reset" ? "" : message.payload.alias);
      renderAll();
    }
  } catch (failure) {
    error = failure.message;
    errorCode = ["STALE_CONVERSATION", "INVALID_CONVERSATION_LABEL", "LABEL_CAPACITY_REACHED"].includes(failure.code) ? failure.code : "LABEL_STORAGE_ERROR";
  }
  const task = inspectorTask(message);
  const label = task?.threadKey ? conversationLabels.get(task.threadKey) : null;
  sendToInspector(message, {
    type: "conversationLabelStatus",
    threadKey: task?.threadKey || null,
    title: task?.threadKey ? task.title || UNTITLED : "",
    identifier: label?.identifier || "",
    alias: label?.alias || "",
    error: error || labelStorageError,
    errorCode: errorCode || (labelStorageError ? "LABEL_STORAGE_ERROR" : null)
  });
}
async function sendBridgeSetupStatus(message, extra = {}) {
  const status = await bridgeSetup.status();
  sendToInspector(message, {
    type: "bridgeSetupStatus",
    status,
    busy: Boolean(setupOperation),
    operation: setupOperation,
    ...extra
  });
}
async function handleBridgeSetupMessage(message) {
  const action = message.payload?.action;
  if (action === "openGuide") {
    send({
      cmd: "openurl",
      url: "https://github.com/RickeyRen/OpenCodexMicro-Aurora#1-llm--agent-installation",
      local: false
    });
    await sendBridgeSetupStatus(message);
    return;
  }
  if (action === "status" || !action) {
    await sendBridgeSetupStatus(message);
    return;
  }
  if (!["install", "launch", "uninstall"].includes(action)) {
    await sendBridgeSetupStatus(message, { error: `Unknown setup action: ${action}` });
    return;
  }
  if (setupOperation) {
    await sendBridgeSetupStatus(message);
    return;
  }
  setupOperation = action;
  await sendBridgeSetupStatus(message);
  let result = null;
  let failure = null;
  try {
    if (action === "install") await bridgeSetup.install();
    if (action === "launch") await bridgeSetup.launch();
    if (action === "uninstall") await bridgeSetup.uninstall();
    result = action;
  } catch (error) {
    failure = error.message;
    send({
      cmd: "logMessage",
      uuid: message.uuid,
      actionid: message.actionid,
      key: message.key,
      level: "error",
      message: `Codex Bridge ${action} failed: ${error.message}`
    });
  } finally {
    setupOperation = null;
  }
  await sendBridgeSetupStatus(message, { result, error: failure });
}
function setArtworkDisplay(instance, data, digest) {
  if (!instance.active || instance.lastDisplay === digest) return;
  instance.lastDisplay = digest;
  send({
    cmd: "state",
    param: {
      statelist: [{
        uuid: instance.uuid,
        actionid: instance.actionid,
        key: instance.key,
        type: 1,
        data,
        showtext: false,
        textdata: ""
      }]
    }
  });
}
function shortTaskLabel(task, label) {
  if (label?.alias) return formatTaskLabel(label.alias, { preserveLines: true });
  return formatTaskLabel(task.title || UNTITLED);
}
function renderInstance(instance) {
  const slot = taskSlot(instance.uuid);
  if (slot === null) {
    const action = actionName(instance.uuid);
    if (!latestState?.connected) {
      setArtworkDisplay(instance, taskVisual("offline", "\xD7"), "offline");
      return;
    }
    if (action === "usage") {
      const remaining2 = usageRemaining(latestState.usage);
      setArtworkDisplay(instance, usageVisual(remaining2), `usage:${remaining2 ?? "unknown"}`);
      return;
    }
    if (action === "navigate") {
      const task2 = latestState.slots?.[0];
      const label2 = task2?.threadKey ? conversationLabels.get(task2.threadKey) : null;
      setTaskDisplay(
        instance,
        task2?.threadKey ? task2.status : "empty",
        task2?.threadKey ? shortTaskLabel(task2, label2) : "\xB7",
        label2?.identifier || ""
      );
      return;
    }
    setArtworkDisplay(instance, actionVisual(action), `action:${action}`);
    return;
  }
  if (!latestState?.connected) {
    setTaskDisplay(instance, "offline", "\xD7");
    return;
  }
  const task = latestState.slots?.[slot];
  if (!task?.threadKey) {
    setTaskDisplay(instance, "empty", "\xB7");
    return;
  }
  const label = conversationLabels.get(task.threadKey);
  setTaskDisplay(instance, task.status, shortTaskLabel(task, label), label?.identifier || "");
}
function renderAll() {
  for (const instance of instances.values()) renderInstance(instance);
}
async function syncOverview() {
  const now = Date.now();
  if (now < overviewCheckedAt || now - overviewCheckedAt >= 5e3) {
    overviewCheckedAt = now;
    try {
      const target = await resolveNativeOverviewTarget({ studioVersion });
      const targetKey = target ? JSON.stringify(target) : null;
      if (targetKey !== overviewTargetKey) {
        overviewDisplay?.dispose();
        overviewDisplay = null;
        overviewTargetKey = targetKey;
        if (target) {
          const display = createOverviewDisplay({
            send,
            target,
            language,
            isCurrent: () => overviewDisplay === display && socket?.readyState === wrapper_default.OPEN,
            onError: (error) => send({
              cmd: "logMessage",
              uuid: PLUGIN_UUID,
              level: "error",
              message: `Native overview: ${error.message}`
            })
          });
          overviewDisplay = display;
        }
      }
      overviewSetupError = null;
    } catch (error) {
      overviewDisplay?.dispose();
      overviewDisplay = null;
      overviewTargetKey = null;
      if (overviewSetupError !== error.message) send({
        cmd: "logMessage",
        uuid: PLUGIN_UUID,
        level: "error",
        message: `Native overview setup: ${error.message}`
      });
      overviewSetupError = error.message;
    }
  }
  overviewDisplay?.update(latestState);
}
async function bridgeRequest(path2, method = "GET") {
  const response = await fetch(`${BRIDGE_URL}${path2}`, {
    method,
    signal: AbortSignal.timeout(1200)
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Bridge HTTP ${response.status}`);
  }
  return payload;
}
async function openTaskSlot(slot) {
  if (!latestState?.connected) throw new Error("Codex Bridge is offline");
  const task = latestState?.slots?.[slot];
  if (!task?.threadKey) throw new Error(`Codex task slot ${slot + 1} is empty`);
  await bridgeRequest(`/thread/${encodeURIComponent(task.threadKey)}/click?slot=${slot}`, "POST");
}
async function pollBridge() {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    latestState = await bridgeRequest("/state");
    await syncConversationLabels(latestState);
  } catch (error) {
    latestState = { connected: false, error: error.message, slots: [] };
  } finally {
    renderAll();
    try {
      await syncOverview();
      overviewRuntimeError = null;
    } catch (error) {
      if (overviewRuntimeError !== error.message) send({
        cmd: "logMessage",
        uuid: PLUGIN_UUID,
        level: "error",
        message: `Native overview refresh: ${error.message}`
      });
      overviewRuntimeError = error.message;
    } finally {
      pollInFlight = false;
    }
  }
}
async function invoke(instance, pressed) {
  const slot = taskSlot(instance.uuid);
  try {
    if (slot !== null) {
      if (!pressed) return;
      await openTaskSlot(slot);
      return;
    }
    const action = actionName(instance.uuid);
    if (!action) throw new Error(`Unknown Codex action: ${instance.uuid}`);
    if (action === "usage") {
      if (pressed) await bridgeRequest("/focus", "POST");
      return;
    }
    await bridgeRequest(`/action/${action}/${pressed ? "down" : "up"}`, "POST");
  } catch (error) {
    send({ cmd: "logMessage", uuid: instance.uuid, actionid: instance.actionid, key: instance.key, level: "error", message: error.message });
    send({ cmd: "showAlert", uuid: instance.uuid, actionid: instance.actionid, key: instance.key });
  }
}
async function invokeEncoder(instance, message) {
  try {
    if (message.cmd === "dialdown") {
      await openTaskSlot(0);
      return;
    }
    if (message.cmd !== "dialrotate") return;
    const keylist = {
      left: "SCROLL UP",
      "hold-left": "SCROLL UP",
      right: "SCROLL DOWN",
      "hold-right": "SCROLL DOWN"
    }[message.rotateEvent];
    if (keylist) send({ cmd: "hotkey", keylist });
  } catch (error) {
    send({ cmd: "logMessage", uuid: instance.uuid, actionid: instance.actionid, key: instance.key, level: "error", message: error.message });
    send({ cmd: "showAlert", uuid: instance.uuid, actionid: instance.actionid, key: instance.key });
  }
}
function addInstance(message) {
  const context = contextOf(message);
  const existing = instances.get(context);
  const instance = existing || {
    uuid: message.uuid,
    actionid: message.actionid,
    key: message.key,
    active: true,
    lastDisplay: null
  };
  instance.active = true;
  instances.set(context, instance);
  renderInstance(instance);
  return instance;
}
function handleMessage(raw) {
  let message;
  try {
    message = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (message.cmd === "add" || message.cmd === "paramfromapp") {
    addInstance(message);
    ack(message);
    return;
  }
  if (message.cmd === "setactive") {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    instance.active = Boolean(message.active);
    if (instance.active) {
      instance.lastDisplay = null;
      instance.pendingDisplay = null;
      renderInstance(instance);
    }
    ack(message);
    return;
  }
  if (message.cmd === "clear") {
    for (const item of message.param || []) instances.delete(contextOf(item));
    ack(message);
    return;
  }
  if (message.cmd === "sendToPlugin") {
    ack(message);
    if (message.payload?.type === "bridgeSetup") {
      void handleBridgeSetupMessage(message);
    }
    if (message.payload?.type === "conversationLabel") {
      void handleConversationLabelMessage(message);
    }
    return;
  }
  if (message.cmd === "run") {
    ack(message);
    return;
  }
  if (["dialdown", "dialup", "dialrotate"].includes(message.cmd)) {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    if (actionName(instance.uuid) === "navigate") void invokeEncoder(instance, message);
    ack(message);
    return;
  }
  if (["keydown", "keyup"].includes(message.cmd)) {
    const instance = instances.get(contextOf(message)) || addInstance(message);
    void invoke(instance, message.cmd !== "keyup");
    ack(message);
  }
}
function connect() {
  clearTimeout(reconnectTimer);
  socket = new wrapper_default(HOST_URL);
  socket.on("open", () => {
    send({ code: 0, cmd: "connected", uuid: PLUGIN_UUID });
    overviewDisplay?.invalidate();
    for (const instance of instances.values()) {
      instance.lastDisplay = null;
      instance.pendingDisplay = null;
    }
    clearInterval(pollTimer);
    pollTimer = setInterval(() => void pollBridge(), 500);
    pollTimer.unref();
    void pollBridge();
  });
  socket.on("message", handleMessage);
  socket.on("close", () => {
    clearInterval(pollTimer);
    reconnectTimer = setTimeout(connect, 1e3);
    reconnectTimer.unref();
  });
  socket.on("error", () => socket.close());
}
connect();
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    overviewDisplay?.dispose();
    socket?.close();
    process.exit(0);
  });
}
