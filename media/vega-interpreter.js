var vegaInterpreter = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key2 of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key2) && key2 !== except)
          __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/vega-interpreter/build/vega-interpreter.js
  var vega_interpreter_exports = {};
  __export(vega_interpreter_exports, {
    expressionInterpreter: () => expression
  });

  // node_modules/vega-util/build/accessor.js
  function accessor(fn, fields, name) {
    return Object.assign(fn, {
      fields: fields || [],
      fname: name
    });
  }

  // node_modules/vega-util/build/getter.js
  function getter(path) {
    return path.length === 1 ? get1(path[0]) : getN(path);
  }
  var get1 = (field2) => function(obj) {
    return obj[field2];
  };
  var getN = (path) => {
    const len = path.length;
    return function(obj) {
      for (let i = 0; i < len; ++i) {
        obj = obj[path[i]];
      }
      return obj;
    };
  };

  // node_modules/vega-util/build/error.js
  function error(message) {
    throw Error(message);
  }

  // node_modules/vega-util/build/splitAccessPath.js
  function splitAccessPath(p) {
    const path = [], n = p.length;
    let q = null, b = 0, s = "";
    let i;
    let j;
    let c;
    p = p + "";
    function push() {
      path.push(s + p.substring(i, j));
      s = "";
      i = j + 1;
    }
    for (i = j = 0; j < n; ++j) {
      c = p[j];
      if (c === "\\") {
        s += p.substring(i, j++);
        i = j;
      } else if (c === q) {
        push();
        q = null;
        b = -1;
      } else if (q) {
        continue;
      } else if (i === b && c === '"') {
        i = j + 1;
        q = c;
      } else if (i === b && c === "'") {
        i = j + 1;
        q = c;
      } else if (c === "." && !b) {
        if (j > i) {
          push();
        } else {
          i = j + 1;
        }
      } else if (c === "[") {
        if (j > i)
          push();
        b = i = j + 1;
      } else if (c === "]") {
        if (!b)
          error("Access path missing open bracket: " + p);
        if (b > 0)
          push();
        b = 0;
        i = j + 1;
      }
    }
    if (b)
      error("Access path missing closing bracket: " + p);
    if (q)
      error("Access path missing closing quote: " + p);
    if (j > i) {
      j++;
      push();
    }
    return path;
  }

  // node_modules/vega-util/build/field.js
  function field(field2, name, opt) {
    const path = splitAccessPath(field2);
    const fieldName = path.length === 1 ? path[0] : field2;
    return accessor((opt && opt.get || getter)(path), [fieldName], name || fieldName);
  }

  // node_modules/vega-util/build/accessors.js
  var id = field("id");
  var identity = accessor((_) => _, [], "identity");
  var zero = accessor(() => 0, [], "zero");
  var one = accessor(() => 1, [], "one");
  var truthy = accessor(() => true, [], "true");
  var falsy = accessor(() => false, [], "false");

  // node_modules/vega-util/build/interpreter.js
  var DisallowedObjectProperties = /* @__PURE__ */ new Set([
    ...Object.getOwnPropertyNames(Object.prototype).filter((name) => typeof Object.prototype[name] === "function"),
    "__proto__"
  ]);

  // node_modules/vega-util/build/compare.js
  var ascending = (_u, _v) => {
    let u = _u;
    let v = _v;
    return (u < v || u == null) && v != null ? -1 : (u > v || v == null) && u != null ? 1 : (v = v instanceof Date ? +v : v, u = u instanceof Date ? +u : u) !== u && v === v ? -1 : v !== v && u === u ? 1 : 0;
  };

  // node_modules/vega-util/build/isString.js
  function isString(_) {
    return typeof _ === "string";
  }

  // node_modules/vega-interpreter/build/vega-interpreter.js
  function adjustSpatial(item, encode, swap) {
    let t;
    if (encode.x2) {
      if (encode.x) {
        if (swap && item.x > item.x2) {
          t = item.x;
          item.x = item.x2;
          item.x2 = t;
        }
        item.width = item.x2 - item.x;
      } else {
        item.x = item.x2 - (item.width || 0);
      }
    }
    if (encode.xc) {
      item.x = item.xc - (item.width || 0) / 2;
    }
    if (encode.y2) {
      if (encode.y) {
        if (swap && item.y > item.y2) {
          t = item.y;
          item.y = item.y2;
          item.y2 = t;
        }
        item.height = item.y2 - item.y;
      } else {
        item.y = item.y2 - (item.height || 0);
      }
    }
    if (encode.yc) {
      item.y = item.yc - (item.height || 0) / 2;
    }
  }
  var Constants = {
    NaN: NaN,
    E: Math.E,
    LN2: Math.LN2,
    LN10: Math.LN10,
    LOG2E: Math.LOG2E,
    LOG10E: Math.LOG10E,
    PI: Math.PI,
    SQRT1_2: Math.SQRT1_2,
    SQRT2: Math.SQRT2,
    MIN_VALUE: Number.MIN_VALUE,
    MAX_VALUE: Number.MAX_VALUE
  };
  var Ops = {
    "*": (a, b) => a * b,
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "/": (a, b) => a / b,
    "%": (a, b) => a % b,
    ">": (a, b) => a > b,
    "<": (a, b) => a < b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b,
    "==": (a, b) => a == b,
    "!=": (a, b) => a != b,
    "===": (a, b) => a === b,
    "!==": (a, b) => a !== b,
    "&": (a, b) => a & b,
    "|": (a, b) => a | b,
    "^": (a, b) => a ^ b,
    "<<": (a, b) => a << b,
    ">>": (a, b) => a >> b,
    ">>>": (a, b) => a >>> b
  };
  var Unary = {
    "+": (a) => +a,
    "-": (a) => -a,
    "~": (a) => ~a,
    "!": (a) => !a
  };
  var slice = Array.prototype.slice;
  var apply = (m, args, cast) => {
    const obj = cast ? cast(args[0]) : args[0];
    return obj[m].apply(obj, slice.call(args, 1));
  };
  var datetime = (yearOrTimestring, m = 0, d = 1, H = 0, M = 0, S = 0, ms = 0) => isString(yearOrTimestring) ? new Date(yearOrTimestring) : new Date(yearOrTimestring, m, d, H, M, S, ms);
  var Functions = {
    // math functions
    isNaN: Number.isNaN,
    isFinite: Number.isFinite,
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    log: Math.log,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    random: Math.random,
    round: Math.round,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
    clamp: (a, b, c) => Math.max(b, Math.min(c, a)),
    // date functions
    now: Date.now,
    utc: Date.UTC,
    datetime,
    date: (d) => new Date(d).getDate(),
    day: (d) => new Date(d).getDay(),
    year: (d) => new Date(d).getFullYear(),
    month: (d) => new Date(d).getMonth(),
    hours: (d) => new Date(d).getHours(),
    minutes: (d) => new Date(d).getMinutes(),
    seconds: (d) => new Date(d).getSeconds(),
    milliseconds: (d) => new Date(d).getMilliseconds(),
    time: (d) => new Date(d).getTime(),
    timezoneoffset: (d) => new Date(d).getTimezoneOffset(),
    utcdate: (d) => new Date(d).getUTCDate(),
    utcday: (d) => new Date(d).getUTCDay(),
    utcyear: (d) => new Date(d).getUTCFullYear(),
    utcmonth: (d) => new Date(d).getUTCMonth(),
    utchours: (d) => new Date(d).getUTCHours(),
    utcminutes: (d) => new Date(d).getUTCMinutes(),
    utcseconds: (d) => new Date(d).getUTCSeconds(),
    utcmilliseconds: (d) => new Date(d).getUTCMilliseconds(),
    // sequence functions
    length: (x) => x.length,
    join: function() {
      return apply("join", arguments);
    },
    indexof: function() {
      return apply("indexOf", arguments);
    },
    lastindexof: function() {
      return apply("lastIndexOf", arguments);
    },
    slice: function() {
      return apply("slice", arguments);
    },
    reverse: (x) => x.slice().reverse(),
    sort: (x) => x.slice().sort(ascending),
    // string functions
    parseFloat,
    parseInt,
    upper: (x) => String(x).toUpperCase(),
    lower: (x) => String(x).toLowerCase(),
    substring: function() {
      return apply("substring", arguments, String);
    },
    split: function() {
      return apply("split", arguments, String);
    },
    replace: function() {
      return apply("replace", arguments, String);
    },
    trim: (x) => String(x).trim(),
    // Base64 encode/decode
    // Convert binary string to base64-encoded ascii
    btoa: (x) => btoa(x),
    // Convert base64-encoded ascii to binary string
    atob: (x) => atob(x),
    // regexp functions
    regexp: RegExp,
    test: (r, t) => RegExp(r).test(t)
  };
  var EventFunctions = ["view", "item", "group", "xy", "x", "y"];
  var DisallowedMethods = /* @__PURE__ */ new Set([Function, eval, setTimeout, setInterval]);
  if (typeof setImmediate === "function") DisallowedMethods.add(setImmediate);
  var Visitors = {
    Literal: ($, n) => n.value,
    Identifier: ($, n) => {
      const id2 = n.name;
      return $.memberDepth > 0 ? id2 : id2 === "datum" ? $.datum : id2 === "event" ? $.event : id2 === "item" ? $.item : Constants[id2] || $.params["$" + id2];
    },
    MemberExpression: ($, n) => {
      const d = !n.computed, o = $(n.object);
      if (d) $.memberDepth += 1;
      const p = $(n.property);
      if (d) $.memberDepth -= 1;
      if (DisallowedMethods.has(o[p])) {
        console.error(`Prevented interpretation of member "${p}" which could lead to insecure code execution`);
        return;
      }
      return o[p];
    },
    CallExpression: ($, n) => {
      const args = n.arguments;
      let name = n.callee.name;
      if (name.startsWith("_")) {
        name = name.slice(1);
      }
      return name === "if" ? $(args[0]) ? $(args[1]) : $(args[2]) : ($.fn[name] || Functions[name]).apply($.fn, args.map($));
    },
    ArrayExpression: ($, n) => n.elements.map($),
    BinaryExpression: ($, n) => Ops[n.operator]($(n.left), $(n.right)),
    UnaryExpression: ($, n) => Unary[n.operator]($(n.argument)),
    ConditionalExpression: ($, n) => $(n.test) ? $(n.consequent) : $(n.alternate),
    LogicalExpression: ($, n) => n.operator === "&&" ? $(n.left) && $(n.right) : $(n.left) || $(n.right),
    ObjectExpression: ($, n) => n.properties.reduce((o, p) => {
      $.memberDepth += 1;
      const k = $(p.key);
      $.memberDepth -= 1;
      const v = $(p.value);
      if (DisallowedObjectProperties.has(k)) {
        console.error(`Prevented interpretation of property "${k}" which could lead to insecure code execution`);
      } else if (DisallowedMethods.has(v)) {
        console.error(`Prevented interpretation of method "${k}" which could lead to insecure code execution`);
      } else {
        o[k] = v;
      }
      return o;
    }, {})
  };
  function interpret(ast, fn, params, datum, event, item) {
    const $ = (n) => Visitors[n.type]($, n);
    $.memberDepth = 0;
    $.fn = Object.create(fn);
    $.params = params;
    $.datum = datum;
    $.event = event;
    $.item = item;
    EventFunctions.forEach((f) => $.fn[f] = (...args) => event.vega[f](...args));
    return $(ast);
  }
  var expression = {
    /**
     * Parse an expression used to update an operator value.
     */
    operator(ctx, expr) {
      const ast = expr.ast, fn = ctx.functions;
      return (_) => interpret(ast, fn, _);
    },
    /**
     * Parse an expression provided as an operator parameter value.
     */
    parameter(ctx, expr) {
      const ast = expr.ast, fn = ctx.functions;
      return (datum, _) => interpret(ast, fn, _, datum);
    },
    /**
     * Parse an expression applied to an event stream.
     */
    event(ctx, expr) {
      const ast = expr.ast, fn = ctx.functions;
      return (event) => interpret(ast, fn, void 0, void 0, event);
    },
    /**
     * Parse an expression used to handle an event-driven operator update.
     */
    handler(ctx, expr) {
      const ast = expr.ast, fn = ctx.functions;
      return (_, event) => {
        const datum = event.item && event.item.datum;
        return interpret(ast, fn, _, datum, event);
      };
    },
    /**
     * Parse an expression that performs visual encoding.
     */
    encode(ctx, encode) {
      const {
        marktype,
        channels
      } = encode, fn = ctx.functions, swap = marktype === "group" || marktype === "image" || marktype === "rect";
      return (item, _) => {
        const datum = item.datum;
        let m = 0, v;
        for (const name in channels) {
          v = interpret(channels[name].ast, fn, _, datum, void 0, item);
          if (item[name] !== v) {
            item[name] = v;
            m = 1;
          }
        }
        if (marktype !== "rule") {
          adjustSpatial(item, channels, swap);
        }
        return m;
      };
    }
  };
  return __toCommonJS(vega_interpreter_exports);
})();
