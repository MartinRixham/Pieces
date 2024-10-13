/**
 * @license almond 0.3.3 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name) {
            name = name.split('/');
            lastIndex = name.length - 1;

            // If wanting node ID compatibility, strip .js from end
            // of IDs. Have to do this here, and not in nameToUrl
            // because node allows either .js or non .js to map
            // to same file.
            if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
            }

            // Starts with a '.' so need the baseName
            if (name[0].charAt(0) === '.' && baseParts) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that 'directory' and not name of the baseName's
                //module. For instance, baseName of 'one/two/three', maps to
                //'one/two/three.js', but we want the directory, 'one/two' for
                //this normalization.
                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                name = normalizedBaseParts.concat(name);
            }

            //start trimDots
            for (i = 0; i < name.length; i++) {
                part = name[i];
                if (part === '.') {
                    name.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        name.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
            //end trimDots

            name = name.join('/');
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    //Creates a parts array for a relName where first part is plugin ID,
    //second part is resource ID. Assumes relName has already been normalized.
    function makeRelParts(relName) {
        return relName ? splitPrefix(relName) : [];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relParts) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0],
            relResourceName = relParts[1];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relResourceName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relResourceName));
            } else {
                name = normalize(name, relResourceName);
            }
        } else {
            name = normalize(name, relResourceName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i, relParts,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;
        relParts = makeRelParts(relName);

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relParts);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, makeRelParts(callback)).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("node_modules/almond/almond.js", function(){});

/*! jQuery v3.6.4 | (c) OpenJS Foundation and other contributors | jquery.org/license */
!function(e,t){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)}("undefined"!=typeof window?window:this,function(C,e){"use strict";var t=[],r=Object.getPrototypeOf,s=t.slice,g=t.flat?function(e){return t.flat.call(e)}:function(e){return t.concat.apply([],e)},u=t.push,i=t.indexOf,n={},o=n.toString,y=n.hasOwnProperty,a=y.toString,l=a.call(Object),v={},m=function(e){return"function"==typeof e&&"number"!=typeof e.nodeType&&"function"!=typeof e.item},x=function(e){return null!=e&&e===e.window},E=C.document,c={type:!0,src:!0,nonce:!0,noModule:!0};function b(e,t,n){var r,i,o=(n=n||E).createElement("script");if(o.text=e,t)for(r in c)(i=t[r]||t.getAttribute&&t.getAttribute(r))&&o.setAttribute(r,i);n.head.appendChild(o).parentNode.removeChild(o)}function w(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?n[o.call(e)]||"object":typeof e}var f="3.6.4",S=function(e,t){return new S.fn.init(e,t)};function p(e){var t=!!e&&"length"in e&&e.length,n=w(e);return!m(e)&&!x(e)&&("array"===n||0===t||"number"==typeof t&&0<t&&t-1 in e)}S.fn=S.prototype={jquery:f,constructor:S,length:0,toArray:function(){return s.call(this)},get:function(e){return null==e?s.call(this):e<0?this[e+this.length]:this[e]},pushStack:function(e){var t=S.merge(this.constructor(),e);return t.prevObject=this,t},each:function(e){return S.each(this,e)},map:function(n){return this.pushStack(S.map(this,function(e,t){return n.call(e,t,e)}))},slice:function(){return this.pushStack(s.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},even:function(){return this.pushStack(S.grep(this,function(e,t){return(t+1)%2}))},odd:function(){return this.pushStack(S.grep(this,function(e,t){return t%2}))},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(0<=n&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor()},push:u,sort:t.sort,splice:t.splice},S.extend=S.fn.extend=function(){var e,t,n,r,i,o,a=arguments[0]||{},s=1,u=arguments.length,l=!1;for("boolean"==typeof a&&(l=a,a=arguments[s]||{},s++),"object"==typeof a||m(a)||(a={}),s===u&&(a=this,s--);s<u;s++)if(null!=(e=arguments[s]))for(t in e)r=e[t],"__proto__"!==t&&a!==r&&(l&&r&&(S.isPlainObject(r)||(i=Array.isArray(r)))?(n=a[t],o=i&&!Array.isArray(n)?[]:i||S.isPlainObject(n)?n:{},i=!1,a[t]=S.extend(l,o,r)):void 0!==r&&(a[t]=r));return a},S.extend({expando:"jQuery"+(f+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isPlainObject:function(e){var t,n;return!(!e||"[object Object]"!==o.call(e))&&(!(t=r(e))||"function"==typeof(n=y.call(t,"constructor")&&t.constructor)&&a.call(n)===l)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},globalEval:function(e,t,n){b(e,{nonce:t&&t.nonce},n)},each:function(e,t){var n,r=0;if(p(e)){for(n=e.length;r<n;r++)if(!1===t.call(e[r],r,e[r]))break}else for(r in e)if(!1===t.call(e[r],r,e[r]))break;return e},makeArray:function(e,t){var n=t||[];return null!=e&&(p(Object(e))?S.merge(n,"string"==typeof e?[e]:e):u.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:i.call(t,e,n)},merge:function(e,t){for(var n=+t.length,r=0,i=e.length;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){for(var r=[],i=0,o=e.length,a=!n;i<o;i++)!t(e[i],i)!==a&&r.push(e[i]);return r},map:function(e,t,n){var r,i,o=0,a=[];if(p(e))for(r=e.length;o<r;o++)null!=(i=t(e[o],o,n))&&a.push(i);else for(o in e)null!=(i=t(e[o],o,n))&&a.push(i);return g(a)},guid:1,support:v}),"function"==typeof Symbol&&(S.fn[Symbol.iterator]=t[Symbol.iterator]),S.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(e,t){n["[object "+t+"]"]=t.toLowerCase()});var d=function(n){var e,d,b,o,i,h,f,g,w,u,l,T,C,a,E,y,s,c,v,S="sizzle"+1*new Date,p=n.document,k=0,r=0,m=ue(),x=ue(),A=ue(),N=ue(),j=function(e,t){return e===t&&(l=!0),0},D={}.hasOwnProperty,t=[],q=t.pop,L=t.push,H=t.push,O=t.slice,P=function(e,t){for(var n=0,r=e.length;n<r;n++)if(e[n]===t)return n;return-1},R="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",I="(?:\\\\[\\da-fA-F]{1,6}"+M+"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",W="\\["+M+"*("+I+")(?:"+M+"*([*^$|!~]?=)"+M+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+I+"))|)"+M+"*\\]",F=":("+I+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+W+")*)|.*)\\)|)",$=new RegExp(M+"+","g"),B=new RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),_=new RegExp("^"+M+"*,"+M+"*"),z=new RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=new RegExp(M+"|>"),X=new RegExp(F),V=new RegExp("^"+I+"$"),G={ID:new RegExp("^#("+I+")"),CLASS:new RegExp("^\\.("+I+")"),TAG:new RegExp("^("+I+"|[*])"),ATTR:new RegExp("^"+W),PSEUDO:new RegExp("^"+F),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:new RegExp("^(?:"+R+")$","i"),needsContext:new RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Y=/HTML$/i,Q=/^(?:input|select|textarea|button)$/i,J=/^h\d$/i,K=/^[^{]+\{\s*\[native \w/,Z=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ee=/[+~]/,te=new RegExp("\\\\[\\da-fA-F]{1,6}"+M+"?|\\\\([^\\r\\n\\f])","g"),ne=function(e,t){var n="0x"+e.slice(1)-65536;return t||(n<0?String.fromCharCode(n+65536):String.fromCharCode(n>>10|55296,1023&n|56320))},re=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,ie=function(e,t){return t?"\0"===e?"\ufffd":e.slice(0,-1)+"\\"+e.charCodeAt(e.length-1).toString(16)+" ":"\\"+e},oe=function(){T()},ae=be(function(e){return!0===e.disabled&&"fieldset"===e.nodeName.toLowerCase()},{dir:"parentNode",next:"legend"});try{H.apply(t=O.call(p.childNodes),p.childNodes),t[p.childNodes.length].nodeType}catch(e){H={apply:t.length?function(e,t){L.apply(e,O.call(t))}:function(e,t){var n=e.length,r=0;while(e[n++]=t[r++]);e.length=n-1}}}function se(t,e,n,r){var i,o,a,s,u,l,c,f=e&&e.ownerDocument,p=e?e.nodeType:9;if(n=n||[],"string"!=typeof t||!t||1!==p&&9!==p&&11!==p)return n;if(!r&&(T(e),e=e||C,E)){if(11!==p&&(u=Z.exec(t)))if(i=u[1]){if(9===p){if(!(a=e.getElementById(i)))return n;if(a.id===i)return n.push(a),n}else if(f&&(a=f.getElementById(i))&&v(e,a)&&a.id===i)return n.push(a),n}else{if(u[2])return H.apply(n,e.getElementsByTagName(t)),n;if((i=u[3])&&d.getElementsByClassName&&e.getElementsByClassName)return H.apply(n,e.getElementsByClassName(i)),n}if(d.qsa&&!N[t+" "]&&(!y||!y.test(t))&&(1!==p||"object"!==e.nodeName.toLowerCase())){if(c=t,f=e,1===p&&(U.test(t)||z.test(t))){(f=ee.test(t)&&ve(e.parentNode)||e)===e&&d.scope||((s=e.getAttribute("id"))?s=s.replace(re,ie):e.setAttribute("id",s=S)),o=(l=h(t)).length;while(o--)l[o]=(s?"#"+s:":scope")+" "+xe(l[o]);c=l.join(",")}try{return H.apply(n,f.querySelectorAll(c)),n}catch(e){N(t,!0)}finally{s===S&&e.removeAttribute("id")}}}return g(t.replace(B,"$1"),e,n,r)}function ue(){var r=[];return function e(t,n){return r.push(t+" ")>b.cacheLength&&delete e[r.shift()],e[t+" "]=n}}function le(e){return e[S]=!0,e}function ce(e){var t=C.createElement("fieldset");try{return!!e(t)}catch(e){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function fe(e,t){var n=e.split("|"),r=n.length;while(r--)b.attrHandle[n[r]]=t}function pe(e,t){var n=t&&e,r=n&&1===e.nodeType&&1===t.nodeType&&e.sourceIndex-t.sourceIndex;if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function de(t){return function(e){return"input"===e.nodeName.toLowerCase()&&e.type===t}}function he(n){return function(e){var t=e.nodeName.toLowerCase();return("input"===t||"button"===t)&&e.type===n}}function ge(t){return function(e){return"form"in e?e.parentNode&&!1===e.disabled?"label"in e?"label"in e.parentNode?e.parentNode.disabled===t:e.disabled===t:e.isDisabled===t||e.isDisabled!==!t&&ae(e)===t:e.disabled===t:"label"in e&&e.disabled===t}}function ye(a){return le(function(o){return o=+o,le(function(e,t){var n,r=a([],e.length,o),i=r.length;while(i--)e[n=r[i]]&&(e[n]=!(t[n]=e[n]))})})}function ve(e){return e&&"undefined"!=typeof e.getElementsByTagName&&e}for(e in d=se.support={},i=se.isXML=function(e){var t=e&&e.namespaceURI,n=e&&(e.ownerDocument||e).documentElement;return!Y.test(t||n&&n.nodeName||"HTML")},T=se.setDocument=function(e){var t,n,r=e?e.ownerDocument||e:p;return r!=C&&9===r.nodeType&&r.documentElement&&(a=(C=r).documentElement,E=!i(C),p!=C&&(n=C.defaultView)&&n.top!==n&&(n.addEventListener?n.addEventListener("unload",oe,!1):n.attachEvent&&n.attachEvent("onunload",oe)),d.scope=ce(function(e){return a.appendChild(e).appendChild(C.createElement("div")),"undefined"!=typeof e.querySelectorAll&&!e.querySelectorAll(":scope fieldset div").length}),d.cssHas=ce(function(){try{return C.querySelector(":has(*,:jqfake)"),!1}catch(e){return!0}}),d.attributes=ce(function(e){return e.className="i",!e.getAttribute("className")}),d.getElementsByTagName=ce(function(e){return e.appendChild(C.createComment("")),!e.getElementsByTagName("*").length}),d.getElementsByClassName=K.test(C.getElementsByClassName),d.getById=ce(function(e){return a.appendChild(e).id=S,!C.getElementsByName||!C.getElementsByName(S).length}),d.getById?(b.filter.ID=function(e){var t=e.replace(te,ne);return function(e){return e.getAttribute("id")===t}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n=t.getElementById(e);return n?[n]:[]}}):(b.filter.ID=function(e){var n=e.replace(te,ne);return function(e){var t="undefined"!=typeof e.getAttributeNode&&e.getAttributeNode("id");return t&&t.value===n}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n,r,i,o=t.getElementById(e);if(o){if((n=o.getAttributeNode("id"))&&n.value===e)return[o];i=t.getElementsByName(e),r=0;while(o=i[r++])if((n=o.getAttributeNode("id"))&&n.value===e)return[o]}return[]}}),b.find.TAG=d.getElementsByTagName?function(e,t){return"undefined"!=typeof t.getElementsByTagName?t.getElementsByTagName(e):d.qsa?t.querySelectorAll(e):void 0}:function(e,t){var n,r=[],i=0,o=t.getElementsByTagName(e);if("*"===e){while(n=o[i++])1===n.nodeType&&r.push(n);return r}return o},b.find.CLASS=d.getElementsByClassName&&function(e,t){if("undefined"!=typeof t.getElementsByClassName&&E)return t.getElementsByClassName(e)},s=[],y=[],(d.qsa=K.test(C.querySelectorAll))&&(ce(function(e){var t;a.appendChild(e).innerHTML="<a id='"+S+"'></a><select id='"+S+"-\r\\' msallowcapture=''><option selected=''></option></select>",e.querySelectorAll("[msallowcapture^='']").length&&y.push("[*^$]="+M+"*(?:''|\"\")"),e.querySelectorAll("[selected]").length||y.push("\\["+M+"*(?:value|"+R+")"),e.querySelectorAll("[id~="+S+"-]").length||y.push("~="),(t=C.createElement("input")).setAttribute("name",""),e.appendChild(t),e.querySelectorAll("[name='']").length||y.push("\\["+M+"*name"+M+"*="+M+"*(?:''|\"\")"),e.querySelectorAll(":checked").length||y.push(":checked"),e.querySelectorAll("a#"+S+"+*").length||y.push(".#.+[+~]"),e.querySelectorAll("\\\f"),y.push("[\\r\\n\\f]")}),ce(function(e){e.innerHTML="<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";var t=C.createElement("input");t.setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),e.querySelectorAll("[name=d]").length&&y.push("name"+M+"*[*^$|!~]?="),2!==e.querySelectorAll(":enabled").length&&y.push(":enabled",":disabled"),a.appendChild(e).disabled=!0,2!==e.querySelectorAll(":disabled").length&&y.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),y.push(",.*:")})),(d.matchesSelector=K.test(c=a.matches||a.webkitMatchesSelector||a.mozMatchesSelector||a.oMatchesSelector||a.msMatchesSelector))&&ce(function(e){d.disconnectedMatch=c.call(e,"*"),c.call(e,"[s!='']:x"),s.push("!=",F)}),d.cssHas||y.push(":has"),y=y.length&&new RegExp(y.join("|")),s=s.length&&new RegExp(s.join("|")),t=K.test(a.compareDocumentPosition),v=t||K.test(a.contains)?function(e,t){var n=9===e.nodeType&&e.documentElement||e,r=t&&t.parentNode;return e===r||!(!r||1!==r.nodeType||!(n.contains?n.contains(r):e.compareDocumentPosition&&16&e.compareDocumentPosition(r)))}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},j=t?function(e,t){if(e===t)return l=!0,0;var n=!e.compareDocumentPosition-!t.compareDocumentPosition;return n||(1&(n=(e.ownerDocument||e)==(t.ownerDocument||t)?e.compareDocumentPosition(t):1)||!d.sortDetached&&t.compareDocumentPosition(e)===n?e==C||e.ownerDocument==p&&v(p,e)?-1:t==C||t.ownerDocument==p&&v(p,t)?1:u?P(u,e)-P(u,t):0:4&n?-1:1)}:function(e,t){if(e===t)return l=!0,0;var n,r=0,i=e.parentNode,o=t.parentNode,a=[e],s=[t];if(!i||!o)return e==C?-1:t==C?1:i?-1:o?1:u?P(u,e)-P(u,t):0;if(i===o)return pe(e,t);n=e;while(n=n.parentNode)a.unshift(n);n=t;while(n=n.parentNode)s.unshift(n);while(a[r]===s[r])r++;return r?pe(a[r],s[r]):a[r]==p?-1:s[r]==p?1:0}),C},se.matches=function(e,t){return se(e,null,null,t)},se.matchesSelector=function(e,t){if(T(e),d.matchesSelector&&E&&!N[t+" "]&&(!s||!s.test(t))&&(!y||!y.test(t)))try{var n=c.call(e,t);if(n||d.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(e){N(t,!0)}return 0<se(t,C,null,[e]).length},se.contains=function(e,t){return(e.ownerDocument||e)!=C&&T(e),v(e,t)},se.attr=function(e,t){(e.ownerDocument||e)!=C&&T(e);var n=b.attrHandle[t.toLowerCase()],r=n&&D.call(b.attrHandle,t.toLowerCase())?n(e,t,!E):void 0;return void 0!==r?r:d.attributes||!E?e.getAttribute(t):(r=e.getAttributeNode(t))&&r.specified?r.value:null},se.escape=function(e){return(e+"").replace(re,ie)},se.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},se.uniqueSort=function(e){var t,n=[],r=0,i=0;if(l=!d.detectDuplicates,u=!d.sortStable&&e.slice(0),e.sort(j),l){while(t=e[i++])t===e[i]&&(r=n.push(i));while(r--)e.splice(n[r],1)}return u=null,e},o=se.getText=function(e){var t,n="",r=0,i=e.nodeType;if(i){if(1===i||9===i||11===i){if("string"==typeof e.textContent)return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=o(e)}else if(3===i||4===i)return e.nodeValue}else while(t=e[r++])n+=o(t);return n},(b=se.selectors={cacheLength:50,createPseudo:le,match:G,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(te,ne),e[3]=(e[3]||e[4]||e[5]||"").replace(te,ne),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||se.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&se.error(e[0]),e},PSEUDO:function(e){var t,n=!e[6]&&e[2];return G.CHILD.test(e[0])?null:(e[3]?e[2]=e[4]||e[5]||"":n&&X.test(n)&&(t=h(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(te,ne).toLowerCase();return"*"===e?function(){return!0}:function(e){return e.nodeName&&e.nodeName.toLowerCase()===t}},CLASS:function(e){var t=m[e+" "];return t||(t=new RegExp("(^|"+M+")"+e+"("+M+"|$)"))&&m(e,function(e){return t.test("string"==typeof e.className&&e.className||"undefined"!=typeof e.getAttribute&&e.getAttribute("class")||"")})},ATTR:function(n,r,i){return function(e){var t=se.attr(e,n);return null==t?"!="===r:!r||(t+="","="===r?t===i:"!="===r?t!==i:"^="===r?i&&0===t.indexOf(i):"*="===r?i&&-1<t.indexOf(i):"$="===r?i&&t.slice(-i.length)===i:"~="===r?-1<(" "+t.replace($," ")+" ").indexOf(i):"|="===r&&(t===i||t.slice(0,i.length+1)===i+"-"))}},CHILD:function(h,e,t,g,y){var v="nth"!==h.slice(0,3),m="last"!==h.slice(-4),x="of-type"===e;return 1===g&&0===y?function(e){return!!e.parentNode}:function(e,t,n){var r,i,o,a,s,u,l=v!==m?"nextSibling":"previousSibling",c=e.parentNode,f=x&&e.nodeName.toLowerCase(),p=!n&&!x,d=!1;if(c){if(v){while(l){a=e;while(a=a[l])if(x?a.nodeName.toLowerCase()===f:1===a.nodeType)return!1;u=l="only"===h&&!u&&"nextSibling"}return!0}if(u=[m?c.firstChild:c.lastChild],m&&p){d=(s=(r=(i=(o=(a=c)[S]||(a[S]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===k&&r[1])&&r[2],a=s&&c.childNodes[s];while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if(1===a.nodeType&&++d&&a===e){i[h]=[k,s,d];break}}else if(p&&(d=s=(r=(i=(o=(a=e)[S]||(a[S]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===k&&r[1]),!1===d)while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if((x?a.nodeName.toLowerCase()===f:1===a.nodeType)&&++d&&(p&&((i=(o=a[S]||(a[S]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]=[k,d]),a===e))break;return(d-=y)===g||d%g==0&&0<=d/g}}},PSEUDO:function(e,o){var t,a=b.pseudos[e]||b.setFilters[e.toLowerCase()]||se.error("unsupported pseudo: "+e);return a[S]?a(o):1<a.length?(t=[e,e,"",o],b.setFilters.hasOwnProperty(e.toLowerCase())?le(function(e,t){var n,r=a(e,o),i=r.length;while(i--)e[n=P(e,r[i])]=!(t[n]=r[i])}):function(e){return a(e,0,t)}):a}},pseudos:{not:le(function(e){var r=[],i=[],s=f(e.replace(B,"$1"));return s[S]?le(function(e,t,n,r){var i,o=s(e,null,r,[]),a=e.length;while(a--)(i=o[a])&&(e[a]=!(t[a]=i))}):function(e,t,n){return r[0]=e,s(r,null,n,i),r[0]=null,!i.pop()}}),has:le(function(t){return function(e){return 0<se(t,e).length}}),contains:le(function(t){return t=t.replace(te,ne),function(e){return-1<(e.textContent||o(e)).indexOf(t)}}),lang:le(function(n){return V.test(n||"")||se.error("unsupported lang: "+n),n=n.replace(te,ne).toLowerCase(),function(e){var t;do{if(t=E?e.lang:e.getAttribute("xml:lang")||e.getAttribute("lang"))return(t=t.toLowerCase())===n||0===t.indexOf(n+"-")}while((e=e.parentNode)&&1===e.nodeType);return!1}}),target:function(e){var t=n.location&&n.location.hash;return t&&t.slice(1)===e.id},root:function(e){return e===a},focus:function(e){return e===C.activeElement&&(!C.hasFocus||C.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:ge(!1),disabled:ge(!0),checked:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&!!e.checked||"option"===t&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,!0===e.selected},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!b.pseudos.empty(e)},header:function(e){return J.test(e.nodeName)},input:function(e){return Q.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&"button"===e.type||"button"===t},text:function(e){var t;return"input"===e.nodeName.toLowerCase()&&"text"===e.type&&(null==(t=e.getAttribute("type"))||"text"===t.toLowerCase())},first:ye(function(){return[0]}),last:ye(function(e,t){return[t-1]}),eq:ye(function(e,t,n){return[n<0?n+t:n]}),even:ye(function(e,t){for(var n=0;n<t;n+=2)e.push(n);return e}),odd:ye(function(e,t){for(var n=1;n<t;n+=2)e.push(n);return e}),lt:ye(function(e,t,n){for(var r=n<0?n+t:t<n?t:n;0<=--r;)e.push(r);return e}),gt:ye(function(e,t,n){for(var r=n<0?n+t:n;++r<t;)e.push(r);return e})}}).pseudos.nth=b.pseudos.eq,{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})b.pseudos[e]=de(e);for(e in{submit:!0,reset:!0})b.pseudos[e]=he(e);function me(){}function xe(e){for(var t=0,n=e.length,r="";t<n;t++)r+=e[t].value;return r}function be(s,e,t){var u=e.dir,l=e.next,c=l||u,f=t&&"parentNode"===c,p=r++;return e.first?function(e,t,n){while(e=e[u])if(1===e.nodeType||f)return s(e,t,n);return!1}:function(e,t,n){var r,i,o,a=[k,p];if(n){while(e=e[u])if((1===e.nodeType||f)&&s(e,t,n))return!0}else while(e=e[u])if(1===e.nodeType||f)if(i=(o=e[S]||(e[S]={}))[e.uniqueID]||(o[e.uniqueID]={}),l&&l===e.nodeName.toLowerCase())e=e[u]||e;else{if((r=i[c])&&r[0]===k&&r[1]===p)return a[2]=r[2];if((i[c]=a)[2]=s(e,t,n))return!0}return!1}}function we(i){return 1<i.length?function(e,t,n){var r=i.length;while(r--)if(!i[r](e,t,n))return!1;return!0}:i[0]}function Te(e,t,n,r,i){for(var o,a=[],s=0,u=e.length,l=null!=t;s<u;s++)(o=e[s])&&(n&&!n(o,r,i)||(a.push(o),l&&t.push(s)));return a}function Ce(d,h,g,y,v,e){return y&&!y[S]&&(y=Ce(y)),v&&!v[S]&&(v=Ce(v,e)),le(function(e,t,n,r){var i,o,a,s=[],u=[],l=t.length,c=e||function(e,t,n){for(var r=0,i=t.length;r<i;r++)se(e,t[r],n);return n}(h||"*",n.nodeType?[n]:n,[]),f=!d||!e&&h?c:Te(c,s,d,n,r),p=g?v||(e?d:l||y)?[]:t:f;if(g&&g(f,p,n,r),y){i=Te(p,u),y(i,[],n,r),o=i.length;while(o--)(a=i[o])&&(p[u[o]]=!(f[u[o]]=a))}if(e){if(v||d){if(v){i=[],o=p.length;while(o--)(a=p[o])&&i.push(f[o]=a);v(null,p=[],i,r)}o=p.length;while(o--)(a=p[o])&&-1<(i=v?P(e,a):s[o])&&(e[i]=!(t[i]=a))}}else p=Te(p===t?p.splice(l,p.length):p),v?v(null,t,p,r):H.apply(t,p)})}function Ee(e){for(var i,t,n,r=e.length,o=b.relative[e[0].type],a=o||b.relative[" "],s=o?1:0,u=be(function(e){return e===i},a,!0),l=be(function(e){return-1<P(i,e)},a,!0),c=[function(e,t,n){var r=!o&&(n||t!==w)||((i=t).nodeType?u(e,t,n):l(e,t,n));return i=null,r}];s<r;s++)if(t=b.relative[e[s].type])c=[be(we(c),t)];else{if((t=b.filter[e[s].type].apply(null,e[s].matches))[S]){for(n=++s;n<r;n++)if(b.relative[e[n].type])break;return Ce(1<s&&we(c),1<s&&xe(e.slice(0,s-1).concat({value:" "===e[s-2].type?"*":""})).replace(B,"$1"),t,s<n&&Ee(e.slice(s,n)),n<r&&Ee(e=e.slice(n)),n<r&&xe(e))}c.push(t)}return we(c)}return me.prototype=b.filters=b.pseudos,b.setFilters=new me,h=se.tokenize=function(e,t){var n,r,i,o,a,s,u,l=x[e+" "];if(l)return t?0:l.slice(0);a=e,s=[],u=b.preFilter;while(a){for(o in n&&!(r=_.exec(a))||(r&&(a=a.slice(r[0].length)||a),s.push(i=[])),n=!1,(r=z.exec(a))&&(n=r.shift(),i.push({value:n,type:r[0].replace(B," ")}),a=a.slice(n.length)),b.filter)!(r=G[o].exec(a))||u[o]&&!(r=u[o](r))||(n=r.shift(),i.push({value:n,type:o,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?se.error(e):x(e,s).slice(0)},f=se.compile=function(e,t){var n,y,v,m,x,r,i=[],o=[],a=A[e+" "];if(!a){t||(t=h(e)),n=t.length;while(n--)(a=Ee(t[n]))[S]?i.push(a):o.push(a);(a=A(e,(y=o,m=0<(v=i).length,x=0<y.length,r=function(e,t,n,r,i){var o,a,s,u=0,l="0",c=e&&[],f=[],p=w,d=e||x&&b.find.TAG("*",i),h=k+=null==p?1:Math.random()||.1,g=d.length;for(i&&(w=t==C||t||i);l!==g&&null!=(o=d[l]);l++){if(x&&o){a=0,t||o.ownerDocument==C||(T(o),n=!E);while(s=y[a++])if(s(o,t||C,n)){r.push(o);break}i&&(k=h)}m&&((o=!s&&o)&&u--,e&&c.push(o))}if(u+=l,m&&l!==u){a=0;while(s=v[a++])s(c,f,t,n);if(e){if(0<u)while(l--)c[l]||f[l]||(f[l]=q.call(r));f=Te(f)}H.apply(r,f),i&&!e&&0<f.length&&1<u+v.length&&se.uniqueSort(r)}return i&&(k=h,w=p),c},m?le(r):r))).selector=e}return a},g=se.select=function(e,t,n,r){var i,o,a,s,u,l="function"==typeof e&&e,c=!r&&h(e=l.selector||e);if(n=n||[],1===c.length){if(2<(o=c[0]=c[0].slice(0)).length&&"ID"===(a=o[0]).type&&9===t.nodeType&&E&&b.relative[o[1].type]){if(!(t=(b.find.ID(a.matches[0].replace(te,ne),t)||[])[0]))return n;l&&(t=t.parentNode),e=e.slice(o.shift().value.length)}i=G.needsContext.test(e)?0:o.length;while(i--){if(a=o[i],b.relative[s=a.type])break;if((u=b.find[s])&&(r=u(a.matches[0].replace(te,ne),ee.test(o[0].type)&&ve(t.parentNode)||t))){if(o.splice(i,1),!(e=r.length&&xe(o)))return H.apply(n,r),n;break}}}return(l||f(e,c))(r,t,!E,n,!t||ee.test(e)&&ve(t.parentNode)||t),n},d.sortStable=S.split("").sort(j).join("")===S,d.detectDuplicates=!!l,T(),d.sortDetached=ce(function(e){return 1&e.compareDocumentPosition(C.createElement("fieldset"))}),ce(function(e){return e.innerHTML="<a href='#'></a>","#"===e.firstChild.getAttribute("href")})||fe("type|href|height|width",function(e,t,n){if(!n)return e.getAttribute(t,"type"===t.toLowerCase()?1:2)}),d.attributes&&ce(function(e){return e.innerHTML="<input/>",e.firstChild.setAttribute("value",""),""===e.firstChild.getAttribute("value")})||fe("value",function(e,t,n){if(!n&&"input"===e.nodeName.toLowerCase())return e.defaultValue}),ce(function(e){return null==e.getAttribute("disabled")})||fe(R,function(e,t,n){var r;if(!n)return!0===e[t]?t.toLowerCase():(r=e.getAttributeNode(t))&&r.specified?r.value:null}),se}(C);S.find=d,S.expr=d.selectors,S.expr[":"]=S.expr.pseudos,S.uniqueSort=S.unique=d.uniqueSort,S.text=d.getText,S.isXMLDoc=d.isXML,S.contains=d.contains,S.escapeSelector=d.escape;var h=function(e,t,n){var r=[],i=void 0!==n;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&S(e).is(n))break;r.push(e)}return r},T=function(e,t){for(var n=[];e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n},k=S.expr.match.needsContext;function A(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()}var N=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;function j(e,n,r){return m(n)?S.grep(e,function(e,t){return!!n.call(e,t,e)!==r}):n.nodeType?S.grep(e,function(e){return e===n!==r}):"string"!=typeof n?S.grep(e,function(e){return-1<i.call(n,e)!==r}):S.filter(n,e,r)}S.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?S.find.matchesSelector(r,e)?[r]:[]:S.find.matches(e,S.grep(t,function(e){return 1===e.nodeType}))},S.fn.extend({find:function(e){var t,n,r=this.length,i=this;if("string"!=typeof e)return this.pushStack(S(e).filter(function(){for(t=0;t<r;t++)if(S.contains(i[t],this))return!0}));for(n=this.pushStack([]),t=0;t<r;t++)S.find(e,i[t],n);return 1<r?S.uniqueSort(n):n},filter:function(e){return this.pushStack(j(this,e||[],!1))},not:function(e){return this.pushStack(j(this,e||[],!0))},is:function(e){return!!j(this,"string"==typeof e&&k.test(e)?S(e):e||[],!1).length}});var D,q=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;(S.fn.init=function(e,t,n){var r,i;if(!e)return this;if(n=n||D,"string"==typeof e){if(!(r="<"===e[0]&&">"===e[e.length-1]&&3<=e.length?[null,e,null]:q.exec(e))||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof S?t[0]:t,S.merge(this,S.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:E,!0)),N.test(r[1])&&S.isPlainObject(t))for(r in t)m(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return(i=E.getElementById(r[2]))&&(this[0]=i,this.length=1),this}return e.nodeType?(this[0]=e,this.length=1,this):m(e)?void 0!==n.ready?n.ready(e):e(S):S.makeArray(e,this)}).prototype=S.fn,D=S(E);var L=/^(?:parents|prev(?:Until|All))/,H={children:!0,contents:!0,next:!0,prev:!0};function O(e,t){while((e=e[t])&&1!==e.nodeType);return e}S.fn.extend({has:function(e){var t=S(e,this),n=t.length;return this.filter(function(){for(var e=0;e<n;e++)if(S.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,o=[],a="string"!=typeof e&&S(e);if(!k.test(e))for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(a?-1<a.index(n):1===n.nodeType&&S.find.matchesSelector(n,e))){o.push(n);break}return this.pushStack(1<o.length?S.uniqueSort(o):o)},index:function(e){return e?"string"==typeof e?i.call(S(e),this[0]):i.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(S.uniqueSort(S.merge(this.get(),S(e,t))))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),S.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return h(e,"parentNode")},parentsUntil:function(e,t,n){return h(e,"parentNode",n)},next:function(e){return O(e,"nextSibling")},prev:function(e){return O(e,"previousSibling")},nextAll:function(e){return h(e,"nextSibling")},prevAll:function(e){return h(e,"previousSibling")},nextUntil:function(e,t,n){return h(e,"nextSibling",n)},prevUntil:function(e,t,n){return h(e,"previousSibling",n)},siblings:function(e){return T((e.parentNode||{}).firstChild,e)},children:function(e){return T(e.firstChild)},contents:function(e){return null!=e.contentDocument&&r(e.contentDocument)?e.contentDocument:(A(e,"template")&&(e=e.content||e),S.merge([],e.childNodes))}},function(r,i){S.fn[r]=function(e,t){var n=S.map(this,i,e);return"Until"!==r.slice(-5)&&(t=e),t&&"string"==typeof t&&(n=S.filter(t,n)),1<this.length&&(H[r]||S.uniqueSort(n),L.test(r)&&n.reverse()),this.pushStack(n)}});var P=/[^\x20\t\r\n\f]+/g;function R(e){return e}function M(e){throw e}function I(e,t,n,r){var i;try{e&&m(i=e.promise)?i.call(e).done(t).fail(n):e&&m(i=e.then)?i.call(e,t,n):t.apply(void 0,[e].slice(r))}catch(e){n.apply(void 0,[e])}}S.Callbacks=function(r){var e,n;r="string"==typeof r?(e=r,n={},S.each(e.match(P)||[],function(e,t){n[t]=!0}),n):S.extend({},r);var i,t,o,a,s=[],u=[],l=-1,c=function(){for(a=a||r.once,o=i=!0;u.length;l=-1){t=u.shift();while(++l<s.length)!1===s[l].apply(t[0],t[1])&&r.stopOnFalse&&(l=s.length,t=!1)}r.memory||(t=!1),i=!1,a&&(s=t?[]:"")},f={add:function(){return s&&(t&&!i&&(l=s.length-1,u.push(t)),function n(e){S.each(e,function(e,t){m(t)?r.unique&&f.has(t)||s.push(t):t&&t.length&&"string"!==w(t)&&n(t)})}(arguments),t&&!i&&c()),this},remove:function(){return S.each(arguments,function(e,t){var n;while(-1<(n=S.inArray(t,s,n)))s.splice(n,1),n<=l&&l--}),this},has:function(e){return e?-1<S.inArray(e,s):0<s.length},empty:function(){return s&&(s=[]),this},disable:function(){return a=u=[],s=t="",this},disabled:function(){return!s},lock:function(){return a=u=[],t||i||(s=t=""),this},locked:function(){return!!a},fireWith:function(e,t){return a||(t=[e,(t=t||[]).slice?t.slice():t],u.push(t),i||c()),this},fire:function(){return f.fireWith(this,arguments),this},fired:function(){return!!o}};return f},S.extend({Deferred:function(e){var o=[["notify","progress",S.Callbacks("memory"),S.Callbacks("memory"),2],["resolve","done",S.Callbacks("once memory"),S.Callbacks("once memory"),0,"resolved"],["reject","fail",S.Callbacks("once memory"),S.Callbacks("once memory"),1,"rejected"]],i="pending",a={state:function(){return i},always:function(){return s.done(arguments).fail(arguments),this},"catch":function(e){return a.then(null,e)},pipe:function(){var i=arguments;return S.Deferred(function(r){S.each(o,function(e,t){var n=m(i[t[4]])&&i[t[4]];s[t[1]](function(){var e=n&&n.apply(this,arguments);e&&m(e.promise)?e.promise().progress(r.notify).done(r.resolve).fail(r.reject):r[t[0]+"With"](this,n?[e]:arguments)})}),i=null}).promise()},then:function(t,n,r){var u=0;function l(i,o,a,s){return function(){var n=this,r=arguments,e=function(){var e,t;if(!(i<u)){if((e=a.apply(n,r))===o.promise())throw new TypeError("Thenable self-resolution");t=e&&("object"==typeof e||"function"==typeof e)&&e.then,m(t)?s?t.call(e,l(u,o,R,s),l(u,o,M,s)):(u++,t.call(e,l(u,o,R,s),l(u,o,M,s),l(u,o,R,o.notifyWith))):(a!==R&&(n=void 0,r=[e]),(s||o.resolveWith)(n,r))}},t=s?e:function(){try{e()}catch(e){S.Deferred.exceptionHook&&S.Deferred.exceptionHook(e,t.stackTrace),u<=i+1&&(a!==M&&(n=void 0,r=[e]),o.rejectWith(n,r))}};i?t():(S.Deferred.getStackHook&&(t.stackTrace=S.Deferred.getStackHook()),C.setTimeout(t))}}return S.Deferred(function(e){o[0][3].add(l(0,e,m(r)?r:R,e.notifyWith)),o[1][3].add(l(0,e,m(t)?t:R)),o[2][3].add(l(0,e,m(n)?n:M))}).promise()},promise:function(e){return null!=e?S.extend(e,a):a}},s={};return S.each(o,function(e,t){var n=t[2],r=t[5];a[t[1]]=n.add,r&&n.add(function(){i=r},o[3-e][2].disable,o[3-e][3].disable,o[0][2].lock,o[0][3].lock),n.add(t[3].fire),s[t[0]]=function(){return s[t[0]+"With"](this===s?void 0:this,arguments),this},s[t[0]+"With"]=n.fireWith}),a.promise(s),e&&e.call(s,s),s},when:function(e){var n=arguments.length,t=n,r=Array(t),i=s.call(arguments),o=S.Deferred(),a=function(t){return function(e){r[t]=this,i[t]=1<arguments.length?s.call(arguments):e,--n||o.resolveWith(r,i)}};if(n<=1&&(I(e,o.done(a(t)).resolve,o.reject,!n),"pending"===o.state()||m(i[t]&&i[t].then)))return o.then();while(t--)I(i[t],a(t),o.reject);return o.promise()}});var W=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;S.Deferred.exceptionHook=function(e,t){C.console&&C.console.warn&&e&&W.test(e.name)&&C.console.warn("jQuery.Deferred exception: "+e.message,e.stack,t)},S.readyException=function(e){C.setTimeout(function(){throw e})};var F=S.Deferred();function $(){E.removeEventListener("DOMContentLoaded",$),C.removeEventListener("load",$),S.ready()}S.fn.ready=function(e){return F.then(e)["catch"](function(e){S.readyException(e)}),this},S.extend({isReady:!1,readyWait:1,ready:function(e){(!0===e?--S.readyWait:S.isReady)||(S.isReady=!0)!==e&&0<--S.readyWait||F.resolveWith(E,[S])}}),S.ready.then=F.then,"complete"===E.readyState||"loading"!==E.readyState&&!E.documentElement.doScroll?C.setTimeout(S.ready):(E.addEventListener("DOMContentLoaded",$),C.addEventListener("load",$));var B=function(e,t,n,r,i,o,a){var s=0,u=e.length,l=null==n;if("object"===w(n))for(s in i=!0,n)B(e,t,s,n[s],!0,o,a);else if(void 0!==r&&(i=!0,m(r)||(a=!0),l&&(a?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(S(e),n)})),t))for(;s<u;s++)t(e[s],n,a?r:r.call(e[s],s,t(e[s],n)));return i?e:l?t.call(e):u?t(e[0],n):o},_=/^-ms-/,z=/-([a-z])/g;function U(e,t){return t.toUpperCase()}function X(e){return e.replace(_,"ms-").replace(z,U)}var V=function(e){return 1===e.nodeType||9===e.nodeType||!+e.nodeType};function G(){this.expando=S.expando+G.uid++}G.uid=1,G.prototype={cache:function(e){var t=e[this.expando];return t||(t={},V(e)&&(e.nodeType?e[this.expando]=t:Object.defineProperty(e,this.expando,{value:t,configurable:!0}))),t},set:function(e,t,n){var r,i=this.cache(e);if("string"==typeof t)i[X(t)]=n;else for(r in t)i[X(r)]=t[r];return i},get:function(e,t){return void 0===t?this.cache(e):e[this.expando]&&e[this.expando][X(t)]},access:function(e,t,n){return void 0===t||t&&"string"==typeof t&&void 0===n?this.get(e,t):(this.set(e,t,n),void 0!==n?n:t)},remove:function(e,t){var n,r=e[this.expando];if(void 0!==r){if(void 0!==t){n=(t=Array.isArray(t)?t.map(X):(t=X(t))in r?[t]:t.match(P)||[]).length;while(n--)delete r[t[n]]}(void 0===t||S.isEmptyObject(r))&&(e.nodeType?e[this.expando]=void 0:delete e[this.expando])}},hasData:function(e){var t=e[this.expando];return void 0!==t&&!S.isEmptyObject(t)}};var Y=new G,Q=new G,J=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,K=/[A-Z]/g;function Z(e,t,n){var r,i;if(void 0===n&&1===e.nodeType)if(r="data-"+t.replace(K,"-$&").toLowerCase(),"string"==typeof(n=e.getAttribute(r))){try{n="true"===(i=n)||"false"!==i&&("null"===i?null:i===+i+""?+i:J.test(i)?JSON.parse(i):i)}catch(e){}Q.set(e,t,n)}else n=void 0;return n}S.extend({hasData:function(e){return Q.hasData(e)||Y.hasData(e)},data:function(e,t,n){return Q.access(e,t,n)},removeData:function(e,t){Q.remove(e,t)},_data:function(e,t,n){return Y.access(e,t,n)},_removeData:function(e,t){Y.remove(e,t)}}),S.fn.extend({data:function(n,e){var t,r,i,o=this[0],a=o&&o.attributes;if(void 0===n){if(this.length&&(i=Q.get(o),1===o.nodeType&&!Y.get(o,"hasDataAttrs"))){t=a.length;while(t--)a[t]&&0===(r=a[t].name).indexOf("data-")&&(r=X(r.slice(5)),Z(o,r,i[r]));Y.set(o,"hasDataAttrs",!0)}return i}return"object"==typeof n?this.each(function(){Q.set(this,n)}):B(this,function(e){var t;if(o&&void 0===e)return void 0!==(t=Q.get(o,n))?t:void 0!==(t=Z(o,n))?t:void 0;this.each(function(){Q.set(this,n,e)})},null,e,1<arguments.length,null,!0)},removeData:function(e){return this.each(function(){Q.remove(this,e)})}}),S.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=Y.get(e,t),n&&(!r||Array.isArray(n)?r=Y.access(e,t,S.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=S.queue(e,t),r=n.length,i=n.shift(),o=S._queueHooks(e,t);"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,function(){S.dequeue(e,t)},o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return Y.get(e,n)||Y.access(e,n,{empty:S.Callbacks("once memory").add(function(){Y.remove(e,[t+"queue",n])})})}}),S.fn.extend({queue:function(t,n){var e=2;return"string"!=typeof t&&(n=t,t="fx",e--),arguments.length<e?S.queue(this[0],t):void 0===n?this:this.each(function(){var e=S.queue(this,t,n);S._queueHooks(this,t),"fx"===t&&"inprogress"!==e[0]&&S.dequeue(this,t)})},dequeue:function(e){return this.each(function(){S.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=S.Deferred(),o=this,a=this.length,s=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=void 0),e=e||"fx";while(a--)(n=Y.get(o[a],e+"queueHooks"))&&n.empty&&(r++,n.empty.add(s));return s(),i.promise(t)}});var ee=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,te=new RegExp("^(?:([+-])=|)("+ee+")([a-z%]*)$","i"),ne=["Top","Right","Bottom","Left"],re=E.documentElement,ie=function(e){return S.contains(e.ownerDocument,e)},oe={composed:!0};re.getRootNode&&(ie=function(e){return S.contains(e.ownerDocument,e)||e.getRootNode(oe)===e.ownerDocument});var ae=function(e,t){return"none"===(e=t||e).style.display||""===e.style.display&&ie(e)&&"none"===S.css(e,"display")};function se(e,t,n,r){var i,o,a=20,s=r?function(){return r.cur()}:function(){return S.css(e,t,"")},u=s(),l=n&&n[3]||(S.cssNumber[t]?"":"px"),c=e.nodeType&&(S.cssNumber[t]||"px"!==l&&+u)&&te.exec(S.css(e,t));if(c&&c[3]!==l){u/=2,l=l||c[3],c=+u||1;while(a--)S.style(e,t,c+l),(1-o)*(1-(o=s()/u||.5))<=0&&(a=0),c/=o;c*=2,S.style(e,t,c+l),n=n||[]}return n&&(c=+c||+u||0,i=n[1]?c+(n[1]+1)*n[2]:+n[2],r&&(r.unit=l,r.start=c,r.end=i)),i}var ue={};function le(e,t){for(var n,r,i,o,a,s,u,l=[],c=0,f=e.length;c<f;c++)(r=e[c]).style&&(n=r.style.display,t?("none"===n&&(l[c]=Y.get(r,"display")||null,l[c]||(r.style.display="")),""===r.style.display&&ae(r)&&(l[c]=(u=a=o=void 0,a=(i=r).ownerDocument,s=i.nodeName,(u=ue[s])||(o=a.body.appendChild(a.createElement(s)),u=S.css(o,"display"),o.parentNode.removeChild(o),"none"===u&&(u="block"),ue[s]=u)))):"none"!==n&&(l[c]="none",Y.set(r,"display",n)));for(c=0;c<f;c++)null!=l[c]&&(e[c].style.display=l[c]);return e}S.fn.extend({show:function(){return le(this,!0)},hide:function(){return le(this)},toggle:function(e){return"boolean"==typeof e?e?this.show():this.hide():this.each(function(){ae(this)?S(this).show():S(this).hide()})}});var ce,fe,pe=/^(?:checkbox|radio)$/i,de=/<([a-z][^\/\0>\x20\t\r\n\f]*)/i,he=/^$|^module$|\/(?:java|ecma)script/i;ce=E.createDocumentFragment().appendChild(E.createElement("div")),(fe=E.createElement("input")).setAttribute("type","radio"),fe.setAttribute("checked","checked"),fe.setAttribute("name","t"),ce.appendChild(fe),v.checkClone=ce.cloneNode(!0).cloneNode(!0).lastChild.checked,ce.innerHTML="<textarea>x</textarea>",v.noCloneChecked=!!ce.cloneNode(!0).lastChild.defaultValue,ce.innerHTML="<option></option>",v.option=!!ce.lastChild;var ge={thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};function ye(e,t){var n;return n="undefined"!=typeof e.getElementsByTagName?e.getElementsByTagName(t||"*"):"undefined"!=typeof e.querySelectorAll?e.querySelectorAll(t||"*"):[],void 0===t||t&&A(e,t)?S.merge([e],n):n}function ve(e,t){for(var n=0,r=e.length;n<r;n++)Y.set(e[n],"globalEval",!t||Y.get(t[n],"globalEval"))}ge.tbody=ge.tfoot=ge.colgroup=ge.caption=ge.thead,ge.th=ge.td,v.option||(ge.optgroup=ge.option=[1,"<select multiple='multiple'>","</select>"]);var me=/<|&#?\w+;/;function xe(e,t,n,r,i){for(var o,a,s,u,l,c,f=t.createDocumentFragment(),p=[],d=0,h=e.length;d<h;d++)if((o=e[d])||0===o)if("object"===w(o))S.merge(p,o.nodeType?[o]:o);else if(me.test(o)){a=a||f.appendChild(t.createElement("div")),s=(de.exec(o)||["",""])[1].toLowerCase(),u=ge[s]||ge._default,a.innerHTML=u[1]+S.htmlPrefilter(o)+u[2],c=u[0];while(c--)a=a.lastChild;S.merge(p,a.childNodes),(a=f.firstChild).textContent=""}else p.push(t.createTextNode(o));f.textContent="",d=0;while(o=p[d++])if(r&&-1<S.inArray(o,r))i&&i.push(o);else if(l=ie(o),a=ye(f.appendChild(o),"script"),l&&ve(a),n){c=0;while(o=a[c++])he.test(o.type||"")&&n.push(o)}return f}var be=/^([^.]*)(?:\.(.+)|)/;function we(){return!0}function Te(){return!1}function Ce(e,t){return e===function(){try{return E.activeElement}catch(e){}}()==("focus"===t)}function Ee(e,t,n,r,i,o){var a,s;if("object"==typeof t){for(s in"string"!=typeof n&&(r=r||n,n=void 0),t)Ee(e,s,n,r,t[s],o);return e}if(null==r&&null==i?(i=n,r=n=void 0):null==i&&("string"==typeof n?(i=r,r=void 0):(i=r,r=n,n=void 0)),!1===i)i=Te;else if(!i)return e;return 1===o&&(a=i,(i=function(e){return S().off(e),a.apply(this,arguments)}).guid=a.guid||(a.guid=S.guid++)),e.each(function(){S.event.add(this,t,i,r,n)})}function Se(e,i,o){o?(Y.set(e,i,!1),S.event.add(e,i,{namespace:!1,handler:function(e){var t,n,r=Y.get(this,i);if(1&e.isTrigger&&this[i]){if(r.length)(S.event.special[i]||{}).delegateType&&e.stopPropagation();else if(r=s.call(arguments),Y.set(this,i,r),t=o(this,i),this[i](),r!==(n=Y.get(this,i))||t?Y.set(this,i,!1):n={},r!==n)return e.stopImmediatePropagation(),e.preventDefault(),n&&n.value}else r.length&&(Y.set(this,i,{value:S.event.trigger(S.extend(r[0],S.Event.prototype),r.slice(1),this)}),e.stopImmediatePropagation())}})):void 0===Y.get(e,i)&&S.event.add(e,i,we)}S.event={global:{},add:function(t,e,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,y=Y.get(t);if(V(t)){n.handler&&(n=(o=n).handler,i=o.selector),i&&S.find.matchesSelector(re,i),n.guid||(n.guid=S.guid++),(u=y.events)||(u=y.events=Object.create(null)),(a=y.handle)||(a=y.handle=function(e){return"undefined"!=typeof S&&S.event.triggered!==e.type?S.event.dispatch.apply(t,arguments):void 0}),l=(e=(e||"").match(P)||[""]).length;while(l--)d=g=(s=be.exec(e[l])||[])[1],h=(s[2]||"").split(".").sort(),d&&(f=S.event.special[d]||{},d=(i?f.delegateType:f.bindType)||d,f=S.event.special[d]||{},c=S.extend({type:d,origType:g,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&S.expr.match.needsContext.test(i),namespace:h.join(".")},o),(p=u[d])||((p=u[d]=[]).delegateCount=0,f.setup&&!1!==f.setup.call(t,r,h,a)||t.addEventListener&&t.addEventListener(d,a)),f.add&&(f.add.call(t,c),c.handler.guid||(c.handler.guid=n.guid)),i?p.splice(p.delegateCount++,0,c):p.push(c),S.event.global[d]=!0)}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,y=Y.hasData(e)&&Y.get(e);if(y&&(u=y.events)){l=(t=(t||"").match(P)||[""]).length;while(l--)if(d=g=(s=be.exec(t[l])||[])[1],h=(s[2]||"").split(".").sort(),d){f=S.event.special[d]||{},p=u[d=(r?f.delegateType:f.bindType)||d]||[],s=s[2]&&new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),a=o=p.length;while(o--)c=p[o],!i&&g!==c.origType||n&&n.guid!==c.guid||s&&!s.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(p.splice(o,1),c.selector&&p.delegateCount--,f.remove&&f.remove.call(e,c));a&&!p.length&&(f.teardown&&!1!==f.teardown.call(e,h,y.handle)||S.removeEvent(e,d,y.handle),delete u[d])}else for(d in u)S.event.remove(e,d+t[l],n,r,!0);S.isEmptyObject(u)&&Y.remove(e,"handle events")}},dispatch:function(e){var t,n,r,i,o,a,s=new Array(arguments.length),u=S.event.fix(e),l=(Y.get(this,"events")||Object.create(null))[u.type]||[],c=S.event.special[u.type]||{};for(s[0]=u,t=1;t<arguments.length;t++)s[t]=arguments[t];if(u.delegateTarget=this,!c.preDispatch||!1!==c.preDispatch.call(this,u)){a=S.event.handlers.call(this,u,l),t=0;while((i=a[t++])&&!u.isPropagationStopped()){u.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!u.isImmediatePropagationStopped())u.rnamespace&&!1!==o.namespace&&!u.rnamespace.test(o.namespace)||(u.handleObj=o,u.data=o.data,void 0!==(r=((S.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,s))&&!1===(u.result=r)&&(u.preventDefault(),u.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,u),u.result}},handlers:function(e,t){var n,r,i,o,a,s=[],u=t.delegateCount,l=e.target;if(u&&l.nodeType&&!("click"===e.type&&1<=e.button))for(;l!==this;l=l.parentNode||this)if(1===l.nodeType&&("click"!==e.type||!0!==l.disabled)){for(o=[],a={},n=0;n<u;n++)void 0===a[i=(r=t[n]).selector+" "]&&(a[i]=r.needsContext?-1<S(i,this).index(l):S.find(i,this,null,[l]).length),a[i]&&o.push(r);o.length&&s.push({elem:l,handlers:o})}return l=this,u<t.length&&s.push({elem:l,handlers:t.slice(u)}),s},addProp:function(t,e){Object.defineProperty(S.Event.prototype,t,{enumerable:!0,configurable:!0,get:m(e)?function(){if(this.originalEvent)return e(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[t]},set:function(e){Object.defineProperty(this,t,{enumerable:!0,configurable:!0,writable:!0,value:e})}})},fix:function(e){return e[S.expando]?e:new S.Event(e)},special:{load:{noBubble:!0},click:{setup:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&Se(t,"click",we),!1},trigger:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&Se(t,"click"),!0},_default:function(e){var t=e.target;return pe.test(t.type)&&t.click&&A(t,"input")&&Y.get(t,"click")||A(t,"a")}},beforeunload:{postDispatch:function(e){void 0!==e.result&&e.originalEvent&&(e.originalEvent.returnValue=e.result)}}}},S.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n)},S.Event=function(e,t){if(!(this instanceof S.Event))return new S.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||void 0===e.defaultPrevented&&!1===e.returnValue?we:Te,this.target=e.target&&3===e.target.nodeType?e.target.parentNode:e.target,this.currentTarget=e.currentTarget,this.relatedTarget=e.relatedTarget):this.type=e,t&&S.extend(this,t),this.timeStamp=e&&e.timeStamp||Date.now(),this[S.expando]=!0},S.Event.prototype={constructor:S.Event,isDefaultPrevented:Te,isPropagationStopped:Te,isImmediatePropagationStopped:Te,isSimulated:!1,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=we,e&&!this.isSimulated&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=we,e&&!this.isSimulated&&e.stopPropagation()},stopImmediatePropagation:function(){var e=this.originalEvent;this.isImmediatePropagationStopped=we,e&&!this.isSimulated&&e.stopImmediatePropagation(),this.stopPropagation()}},S.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,code:!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:!0},S.event.addProp),S.each({focus:"focusin",blur:"focusout"},function(t,e){S.event.special[t]={setup:function(){return Se(this,t,Ce),!1},trigger:function(){return Se(this,t),!0},_default:function(e){return Y.get(e.target,t)},delegateType:e}}),S.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(e,i){S.event.special[e]={delegateType:i,bindType:i,handle:function(e){var t,n=e.relatedTarget,r=e.handleObj;return n&&(n===this||S.contains(this,n))||(e.type=r.origType,t=r.handler.apply(this,arguments),e.type=i),t}}}),S.fn.extend({on:function(e,t,n,r){return Ee(this,e,t,n,r)},one:function(e,t,n,r){return Ee(this,e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,S(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return!1!==t&&"function"!=typeof t||(n=t,t=void 0),!1===n&&(n=Te),this.each(function(){S.event.remove(this,e,n,t)})}});var ke=/<script|<style|<link/i,Ae=/checked\s*(?:[^=]|=\s*.checked.)/i,Ne=/^\s*<!\[CDATA\[|\]\]>\s*$/g;function je(e,t){return A(e,"table")&&A(11!==t.nodeType?t:t.firstChild,"tr")&&S(e).children("tbody")[0]||e}function De(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function qe(e){return"true/"===(e.type||"").slice(0,5)?e.type=e.type.slice(5):e.removeAttribute("type"),e}function Le(e,t){var n,r,i,o,a,s;if(1===t.nodeType){if(Y.hasData(e)&&(s=Y.get(e).events))for(i in Y.remove(t,"handle events"),s)for(n=0,r=s[i].length;n<r;n++)S.event.add(t,i,s[i][n]);Q.hasData(e)&&(o=Q.access(e),a=S.extend({},o),Q.set(t,a))}}function He(n,r,i,o){r=g(r);var e,t,a,s,u,l,c=0,f=n.length,p=f-1,d=r[0],h=m(d);if(h||1<f&&"string"==typeof d&&!v.checkClone&&Ae.test(d))return n.each(function(e){var t=n.eq(e);h&&(r[0]=d.call(this,e,t.html())),He(t,r,i,o)});if(f&&(t=(e=xe(r,n[0].ownerDocument,!1,n,o)).firstChild,1===e.childNodes.length&&(e=t),t||o)){for(s=(a=S.map(ye(e,"script"),De)).length;c<f;c++)u=e,c!==p&&(u=S.clone(u,!0,!0),s&&S.merge(a,ye(u,"script"))),i.call(n[c],u,c);if(s)for(l=a[a.length-1].ownerDocument,S.map(a,qe),c=0;c<s;c++)u=a[c],he.test(u.type||"")&&!Y.access(u,"globalEval")&&S.contains(l,u)&&(u.src&&"module"!==(u.type||"").toLowerCase()?S._evalUrl&&!u.noModule&&S._evalUrl(u.src,{nonce:u.nonce||u.getAttribute("nonce")},l):b(u.textContent.replace(Ne,""),u,l))}return n}function Oe(e,t,n){for(var r,i=t?S.filter(t,e):e,o=0;null!=(r=i[o]);o++)n||1!==r.nodeType||S.cleanData(ye(r)),r.parentNode&&(n&&ie(r)&&ve(ye(r,"script")),r.parentNode.removeChild(r));return e}S.extend({htmlPrefilter:function(e){return e},clone:function(e,t,n){var r,i,o,a,s,u,l,c=e.cloneNode(!0),f=ie(e);if(!(v.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||S.isXMLDoc(e)))for(a=ye(c),r=0,i=(o=ye(e)).length;r<i;r++)s=o[r],u=a[r],void 0,"input"===(l=u.nodeName.toLowerCase())&&pe.test(s.type)?u.checked=s.checked:"input"!==l&&"textarea"!==l||(u.defaultValue=s.defaultValue);if(t)if(n)for(o=o||ye(e),a=a||ye(c),r=0,i=o.length;r<i;r++)Le(o[r],a[r]);else Le(e,c);return 0<(a=ye(c,"script")).length&&ve(a,!f&&ye(e,"script")),c},cleanData:function(e){for(var t,n,r,i=S.event.special,o=0;void 0!==(n=e[o]);o++)if(V(n)){if(t=n[Y.expando]){if(t.events)for(r in t.events)i[r]?S.event.remove(n,r):S.removeEvent(n,r,t.handle);n[Y.expando]=void 0}n[Q.expando]&&(n[Q.expando]=void 0)}}}),S.fn.extend({detach:function(e){return Oe(this,e,!0)},remove:function(e){return Oe(this,e)},text:function(e){return B(this,function(e){return void 0===e?S.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=e)})},null,e,arguments.length)},append:function(){return He(this,arguments,function(e){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||je(this,e).appendChild(e)})},prepend:function(){return He(this,arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=je(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return He(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return He(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},empty:function(){for(var e,t=0;null!=(e=this[t]);t++)1===e.nodeType&&(S.cleanData(ye(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null!=e&&e,t=null==t?e:t,this.map(function(){return S.clone(this,e,t)})},html:function(e){return B(this,function(e){var t=this[0]||{},n=0,r=this.length;if(void 0===e&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!ke.test(e)&&!ge[(de.exec(e)||["",""])[1].toLowerCase()]){e=S.htmlPrefilter(e);try{for(;n<r;n++)1===(t=this[n]||{}).nodeType&&(S.cleanData(ye(t,!1)),t.innerHTML=e);t=0}catch(e){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var n=[];return He(this,arguments,function(e){var t=this.parentNode;S.inArray(this,n)<0&&(S.cleanData(ye(this)),t&&t.replaceChild(e,this))},n)}}),S.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,a){S.fn[e]=function(e){for(var t,n=[],r=S(e),i=r.length-1,o=0;o<=i;o++)t=o===i?this:this.clone(!0),S(r[o])[a](t),u.apply(n,t.get());return this.pushStack(n)}});var Pe=new RegExp("^("+ee+")(?!px)[a-z%]+$","i"),Re=/^--/,Me=function(e){var t=e.ownerDocument.defaultView;return t&&t.opener||(t=C),t.getComputedStyle(e)},Ie=function(e,t,n){var r,i,o={};for(i in t)o[i]=e.style[i],e.style[i]=t[i];for(i in r=n.call(e),t)e.style[i]=o[i];return r},We=new RegExp(ne.join("|"),"i"),Fe="[\\x20\\t\\r\\n\\f]",$e=new RegExp("^"+Fe+"+|((?:^|[^\\\\])(?:\\\\.)*)"+Fe+"+$","g");function Be(e,t,n){var r,i,o,a,s=Re.test(t),u=e.style;return(n=n||Me(e))&&(a=n.getPropertyValue(t)||n[t],s&&a&&(a=a.replace($e,"$1")||void 0),""!==a||ie(e)||(a=S.style(e,t)),!v.pixelBoxStyles()&&Pe.test(a)&&We.test(t)&&(r=u.width,i=u.minWidth,o=u.maxWidth,u.minWidth=u.maxWidth=u.width=a,a=n.width,u.width=r,u.minWidth=i,u.maxWidth=o)),void 0!==a?a+"":a}function _e(e,t){return{get:function(){if(!e())return(this.get=t).apply(this,arguments);delete this.get}}}!function(){function e(){if(l){u.style.cssText="position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0",l.style.cssText="position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%",re.appendChild(u).appendChild(l);var e=C.getComputedStyle(l);n="1%"!==e.top,s=12===t(e.marginLeft),l.style.right="60%",o=36===t(e.right),r=36===t(e.width),l.style.position="absolute",i=12===t(l.offsetWidth/3),re.removeChild(u),l=null}}function t(e){return Math.round(parseFloat(e))}var n,r,i,o,a,s,u=E.createElement("div"),l=E.createElement("div");l.style&&(l.style.backgroundClip="content-box",l.cloneNode(!0).style.backgroundClip="",v.clearCloneStyle="content-box"===l.style.backgroundClip,S.extend(v,{boxSizingReliable:function(){return e(),r},pixelBoxStyles:function(){return e(),o},pixelPosition:function(){return e(),n},reliableMarginLeft:function(){return e(),s},scrollboxSize:function(){return e(),i},reliableTrDimensions:function(){var e,t,n,r;return null==a&&(e=E.createElement("table"),t=E.createElement("tr"),n=E.createElement("div"),e.style.cssText="position:absolute;left:-11111px;border-collapse:separate",t.style.cssText="border:1px solid",t.style.height="1px",n.style.height="9px",n.style.display="block",re.appendChild(e).appendChild(t).appendChild(n),r=C.getComputedStyle(t),a=parseInt(r.height,10)+parseInt(r.borderTopWidth,10)+parseInt(r.borderBottomWidth,10)===t.offsetHeight,re.removeChild(e)),a}}))}();var ze=["Webkit","Moz","ms"],Ue=E.createElement("div").style,Xe={};function Ve(e){var t=S.cssProps[e]||Xe[e];return t||(e in Ue?e:Xe[e]=function(e){var t=e[0].toUpperCase()+e.slice(1),n=ze.length;while(n--)if((e=ze[n]+t)in Ue)return e}(e)||e)}var Ge=/^(none|table(?!-c[ea]).+)/,Ye={position:"absolute",visibility:"hidden",display:"block"},Qe={letterSpacing:"0",fontWeight:"400"};function Je(e,t,n){var r=te.exec(t);return r?Math.max(0,r[2]-(n||0))+(r[3]||"px"):t}function Ke(e,t,n,r,i,o){var a="width"===t?1:0,s=0,u=0;if(n===(r?"border":"content"))return 0;for(;a<4;a+=2)"margin"===n&&(u+=S.css(e,n+ne[a],!0,i)),r?("content"===n&&(u-=S.css(e,"padding"+ne[a],!0,i)),"margin"!==n&&(u-=S.css(e,"border"+ne[a]+"Width",!0,i))):(u+=S.css(e,"padding"+ne[a],!0,i),"padding"!==n?u+=S.css(e,"border"+ne[a]+"Width",!0,i):s+=S.css(e,"border"+ne[a]+"Width",!0,i));return!r&&0<=o&&(u+=Math.max(0,Math.ceil(e["offset"+t[0].toUpperCase()+t.slice(1)]-o-u-s-.5))||0),u}function Ze(e,t,n){var r=Me(e),i=(!v.boxSizingReliable()||n)&&"border-box"===S.css(e,"boxSizing",!1,r),o=i,a=Be(e,t,r),s="offset"+t[0].toUpperCase()+t.slice(1);if(Pe.test(a)){if(!n)return a;a="auto"}return(!v.boxSizingReliable()&&i||!v.reliableTrDimensions()&&A(e,"tr")||"auto"===a||!parseFloat(a)&&"inline"===S.css(e,"display",!1,r))&&e.getClientRects().length&&(i="border-box"===S.css(e,"boxSizing",!1,r),(o=s in e)&&(a=e[s])),(a=parseFloat(a)||0)+Ke(e,t,n||(i?"border":"content"),o,r,a)+"px"}function et(e,t,n,r,i){return new et.prototype.init(e,t,n,r,i)}S.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=Be(e,"opacity");return""===n?"1":n}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,gridArea:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnStart:!0,gridRow:!0,gridRowEnd:!0,gridRowStart:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,a,s=X(t),u=Re.test(t),l=e.style;if(u||(t=Ve(s)),a=S.cssHooks[t]||S.cssHooks[s],void 0===n)return a&&"get"in a&&void 0!==(i=a.get(e,!1,r))?i:l[t];"string"===(o=typeof n)&&(i=te.exec(n))&&i[1]&&(n=se(e,t,i),o="number"),null!=n&&n==n&&("number"!==o||u||(n+=i&&i[3]||(S.cssNumber[s]?"":"px")),v.clearCloneStyle||""!==n||0!==t.indexOf("background")||(l[t]="inherit"),a&&"set"in a&&void 0===(n=a.set(e,n,r))||(u?l.setProperty(t,n):l[t]=n))}},css:function(e,t,n,r){var i,o,a,s=X(t);return Re.test(t)||(t=Ve(s)),(a=S.cssHooks[t]||S.cssHooks[s])&&"get"in a&&(i=a.get(e,!0,n)),void 0===i&&(i=Be(e,t,r)),"normal"===i&&t in Qe&&(i=Qe[t]),""===n||n?(o=parseFloat(i),!0===n||isFinite(o)?o||0:i):i}}),S.each(["height","width"],function(e,u){S.cssHooks[u]={get:function(e,t,n){if(t)return!Ge.test(S.css(e,"display"))||e.getClientRects().length&&e.getBoundingClientRect().width?Ze(e,u,n):Ie(e,Ye,function(){return Ze(e,u,n)})},set:function(e,t,n){var r,i=Me(e),o=!v.scrollboxSize()&&"absolute"===i.position,a=(o||n)&&"border-box"===S.css(e,"boxSizing",!1,i),s=n?Ke(e,u,n,a,i):0;return a&&o&&(s-=Math.ceil(e["offset"+u[0].toUpperCase()+u.slice(1)]-parseFloat(i[u])-Ke(e,u,"border",!1,i)-.5)),s&&(r=te.exec(t))&&"px"!==(r[3]||"px")&&(e.style[u]=t,t=S.css(e,u)),Je(0,t,s)}}}),S.cssHooks.marginLeft=_e(v.reliableMarginLeft,function(e,t){if(t)return(parseFloat(Be(e,"marginLeft"))||e.getBoundingClientRect().left-Ie(e,{marginLeft:0},function(){return e.getBoundingClientRect().left}))+"px"}),S.each({margin:"",padding:"",border:"Width"},function(i,o){S.cssHooks[i+o]={expand:function(e){for(var t=0,n={},r="string"==typeof e?e.split(" "):[e];t<4;t++)n[i+ne[t]+o]=r[t]||r[t-2]||r[0];return n}},"margin"!==i&&(S.cssHooks[i+o].set=Je)}),S.fn.extend({css:function(e,t){return B(this,function(e,t,n){var r,i,o={},a=0;if(Array.isArray(t)){for(r=Me(e),i=t.length;a<i;a++)o[t[a]]=S.css(e,t[a],!1,r);return o}return void 0!==n?S.style(e,t,n):S.css(e,t)},e,t,1<arguments.length)}}),((S.Tween=et).prototype={constructor:et,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||S.easing._default,this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(S.cssNumber[n]?"":"px")},cur:function(){var e=et.propHooks[this.prop];return e&&e.get?e.get(this):et.propHooks._default.get(this)},run:function(e){var t,n=et.propHooks[this.prop];return this.options.duration?this.pos=t=S.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):et.propHooks._default.set(this),this}}).init.prototype=et.prototype,(et.propHooks={_default:{get:function(e){var t;return 1!==e.elem.nodeType||null!=e.elem[e.prop]&&null==e.elem.style[e.prop]?e.elem[e.prop]:(t=S.css(e.elem,e.prop,""))&&"auto"!==t?t:0},set:function(e){S.fx.step[e.prop]?S.fx.step[e.prop](e):1!==e.elem.nodeType||!S.cssHooks[e.prop]&&null==e.elem.style[Ve(e.prop)]?e.elem[e.prop]=e.now:S.style(e.elem,e.prop,e.now+e.unit)}}}).scrollTop=et.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},S.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2},_default:"swing"},S.fx=et.prototype.init,S.fx.step={};var tt,nt,rt,it,ot=/^(?:toggle|show|hide)$/,at=/queueHooks$/;function st(){nt&&(!1===E.hidden&&C.requestAnimationFrame?C.requestAnimationFrame(st):C.setTimeout(st,S.fx.interval),S.fx.tick())}function ut(){return C.setTimeout(function(){tt=void 0}),tt=Date.now()}function lt(e,t){var n,r=0,i={height:e};for(t=t?1:0;r<4;r+=2-t)i["margin"+(n=ne[r])]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function ct(e,t,n){for(var r,i=(ft.tweeners[t]||[]).concat(ft.tweeners["*"]),o=0,a=i.length;o<a;o++)if(r=i[o].call(n,t,e))return r}function ft(o,e,t){var n,a,r=0,i=ft.prefilters.length,s=S.Deferred().always(function(){delete u.elem}),u=function(){if(a)return!1;for(var e=tt||ut(),t=Math.max(0,l.startTime+l.duration-e),n=1-(t/l.duration||0),r=0,i=l.tweens.length;r<i;r++)l.tweens[r].run(n);return s.notifyWith(o,[l,n,t]),n<1&&i?t:(i||s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l]),!1)},l=s.promise({elem:o,props:S.extend({},e),opts:S.extend(!0,{specialEasing:{},easing:S.easing._default},t),originalProperties:e,originalOptions:t,startTime:tt||ut(),duration:t.duration,tweens:[],createTween:function(e,t){var n=S.Tween(o,l.opts,e,t,l.opts.specialEasing[e]||l.opts.easing);return l.tweens.push(n),n},stop:function(e){var t=0,n=e?l.tweens.length:0;if(a)return this;for(a=!0;t<n;t++)l.tweens[t].run(1);return e?(s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l,e])):s.rejectWith(o,[l,e]),this}}),c=l.props;for(!function(e,t){var n,r,i,o,a;for(n in e)if(i=t[r=X(n)],o=e[n],Array.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),(a=S.cssHooks[r])&&"expand"in a)for(n in o=a.expand(o),delete e[r],o)n in e||(e[n]=o[n],t[n]=i);else t[r]=i}(c,l.opts.specialEasing);r<i;r++)if(n=ft.prefilters[r].call(l,o,c,l.opts))return m(n.stop)&&(S._queueHooks(l.elem,l.opts.queue).stop=n.stop.bind(n)),n;return S.map(c,ct,l),m(l.opts.start)&&l.opts.start.call(o,l),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always),S.fx.timer(S.extend(u,{elem:o,anim:l,queue:l.opts.queue})),l}S.Animation=S.extend(ft,{tweeners:{"*":[function(e,t){var n=this.createTween(e,t);return se(n.elem,e,te.exec(t),n),n}]},tweener:function(e,t){m(e)?(t=e,e=["*"]):e=e.match(P);for(var n,r=0,i=e.length;r<i;r++)n=e[r],ft.tweeners[n]=ft.tweeners[n]||[],ft.tweeners[n].unshift(t)},prefilters:[function(e,t,n){var r,i,o,a,s,u,l,c,f="width"in t||"height"in t,p=this,d={},h=e.style,g=e.nodeType&&ae(e),y=Y.get(e,"fxshow");for(r in n.queue||(null==(a=S._queueHooks(e,"fx")).unqueued&&(a.unqueued=0,s=a.empty.fire,a.empty.fire=function(){a.unqueued||s()}),a.unqueued++,p.always(function(){p.always(function(){a.unqueued--,S.queue(e,"fx").length||a.empty.fire()})})),t)if(i=t[r],ot.test(i)){if(delete t[r],o=o||"toggle"===i,i===(g?"hide":"show")){if("show"!==i||!y||void 0===y[r])continue;g=!0}d[r]=y&&y[r]||S.style(e,r)}if((u=!S.isEmptyObject(t))||!S.isEmptyObject(d))for(r in f&&1===e.nodeType&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],null==(l=y&&y.display)&&(l=Y.get(e,"display")),"none"===(c=S.css(e,"display"))&&(l?c=l:(le([e],!0),l=e.style.display||l,c=S.css(e,"display"),le([e]))),("inline"===c||"inline-block"===c&&null!=l)&&"none"===S.css(e,"float")&&(u||(p.done(function(){h.display=l}),null==l&&(c=h.display,l="none"===c?"":c)),h.display="inline-block")),n.overflow&&(h.overflow="hidden",p.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]})),u=!1,d)u||(y?"hidden"in y&&(g=y.hidden):y=Y.access(e,"fxshow",{display:l}),o&&(y.hidden=!g),g&&le([e],!0),p.done(function(){for(r in g||le([e]),Y.remove(e,"fxshow"),d)S.style(e,r,d[r])})),u=ct(g?y[r]:0,r,p),r in y||(y[r]=u.start,g&&(u.end=u.start,u.start=0))}],prefilter:function(e,t){t?ft.prefilters.unshift(e):ft.prefilters.push(e)}}),S.speed=function(e,t,n){var r=e&&"object"==typeof e?S.extend({},e):{complete:n||!n&&t||m(e)&&e,duration:e,easing:n&&t||t&&!m(t)&&t};return S.fx.off?r.duration=0:"number"!=typeof r.duration&&(r.duration in S.fx.speeds?r.duration=S.fx.speeds[r.duration]:r.duration=S.fx.speeds._default),null!=r.queue&&!0!==r.queue||(r.queue="fx"),r.old=r.complete,r.complete=function(){m(r.old)&&r.old.call(this),r.queue&&S.dequeue(this,r.queue)},r},S.fn.extend({fadeTo:function(e,t,n,r){return this.filter(ae).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(t,e,n,r){var i=S.isEmptyObject(t),o=S.speed(e,n,r),a=function(){var e=ft(this,S.extend({},t),o);(i||Y.get(this,"finish"))&&e.stop(!0)};return a.finish=a,i||!1===o.queue?this.each(a):this.queue(o.queue,a)},stop:function(i,e,o){var a=function(e){var t=e.stop;delete e.stop,t(o)};return"string"!=typeof i&&(o=e,e=i,i=void 0),e&&this.queue(i||"fx",[]),this.each(function(){var e=!0,t=null!=i&&i+"queueHooks",n=S.timers,r=Y.get(this);if(t)r[t]&&r[t].stop&&a(r[t]);else for(t in r)r[t]&&r[t].stop&&at.test(t)&&a(r[t]);for(t=n.length;t--;)n[t].elem!==this||null!=i&&n[t].queue!==i||(n[t].anim.stop(o),e=!1,n.splice(t,1));!e&&o||S.dequeue(this,i)})},finish:function(a){return!1!==a&&(a=a||"fx"),this.each(function(){var e,t=Y.get(this),n=t[a+"queue"],r=t[a+"queueHooks"],i=S.timers,o=n?n.length:0;for(t.finish=!0,S.queue(this,a,[]),r&&r.stop&&r.stop.call(this,!0),e=i.length;e--;)i[e].elem===this&&i[e].queue===a&&(i[e].anim.stop(!0),i.splice(e,1));for(e=0;e<o;e++)n[e]&&n[e].finish&&n[e].finish.call(this);delete t.finish})}}),S.each(["toggle","show","hide"],function(e,r){var i=S.fn[r];S.fn[r]=function(e,t,n){return null==e||"boolean"==typeof e?i.apply(this,arguments):this.animate(lt(r,!0),e,t,n)}}),S.each({slideDown:lt("show"),slideUp:lt("hide"),slideToggle:lt("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,r){S.fn[e]=function(e,t,n){return this.animate(r,e,t,n)}}),S.timers=[],S.fx.tick=function(){var e,t=0,n=S.timers;for(tt=Date.now();t<n.length;t++)(e=n[t])()||n[t]!==e||n.splice(t--,1);n.length||S.fx.stop(),tt=void 0},S.fx.timer=function(e){S.timers.push(e),S.fx.start()},S.fx.interval=13,S.fx.start=function(){nt||(nt=!0,st())},S.fx.stop=function(){nt=null},S.fx.speeds={slow:600,fast:200,_default:400},S.fn.delay=function(r,e){return r=S.fx&&S.fx.speeds[r]||r,e=e||"fx",this.queue(e,function(e,t){var n=C.setTimeout(e,r);t.stop=function(){C.clearTimeout(n)}})},rt=E.createElement("input"),it=E.createElement("select").appendChild(E.createElement("option")),rt.type="checkbox",v.checkOn=""!==rt.value,v.optSelected=it.selected,(rt=E.createElement("input")).value="t",rt.type="radio",v.radioValue="t"===rt.value;var pt,dt=S.expr.attrHandle;S.fn.extend({attr:function(e,t){return B(this,S.attr,e,t,1<arguments.length)},removeAttr:function(e){return this.each(function(){S.removeAttr(this,e)})}}),S.extend({attr:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return"undefined"==typeof e.getAttribute?S.prop(e,t,n):(1===o&&S.isXMLDoc(e)||(i=S.attrHooks[t.toLowerCase()]||(S.expr.match.bool.test(t)?pt:void 0)),void 0!==n?null===n?void S.removeAttr(e,t):i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:(e.setAttribute(t,n+""),n):i&&"get"in i&&null!==(r=i.get(e,t))?r:null==(r=S.find.attr(e,t))?void 0:r)},attrHooks:{type:{set:function(e,t){if(!v.radioValue&&"radio"===t&&A(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},removeAttr:function(e,t){var n,r=0,i=t&&t.match(P);if(i&&1===e.nodeType)while(n=i[r++])e.removeAttribute(n)}}),pt={set:function(e,t,n){return!1===t?S.removeAttr(e,n):e.setAttribute(n,n),n}},S.each(S.expr.match.bool.source.match(/\w+/g),function(e,t){var a=dt[t]||S.find.attr;dt[t]=function(e,t,n){var r,i,o=t.toLowerCase();return n||(i=dt[o],dt[o]=r,r=null!=a(e,t,n)?o:null,dt[o]=i),r}});var ht=/^(?:input|select|textarea|button)$/i,gt=/^(?:a|area)$/i;function yt(e){return(e.match(P)||[]).join(" ")}function vt(e){return e.getAttribute&&e.getAttribute("class")||""}function mt(e){return Array.isArray(e)?e:"string"==typeof e&&e.match(P)||[]}S.fn.extend({prop:function(e,t){return B(this,S.prop,e,t,1<arguments.length)},removeProp:function(e){return this.each(function(){delete this[S.propFix[e]||e]})}}),S.extend({prop:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return 1===o&&S.isXMLDoc(e)||(t=S.propFix[t]||t,i=S.propHooks[t]),void 0!==n?i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){var t=S.find.attr(e,"tabindex");return t?parseInt(t,10):ht.test(e.nodeName)||gt.test(e.nodeName)&&e.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),v.optSelected||(S.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null},set:function(e){var t=e.parentNode;t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex)}}),S.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){S.propFix[this.toLowerCase()]=this}),S.fn.extend({addClass:function(t){var e,n,r,i,o,a;return m(t)?this.each(function(e){S(this).addClass(t.call(this,e,vt(this)))}):(e=mt(t)).length?this.each(function(){if(r=vt(this),n=1===this.nodeType&&" "+yt(r)+" "){for(o=0;o<e.length;o++)i=e[o],n.indexOf(" "+i+" ")<0&&(n+=i+" ");a=yt(n),r!==a&&this.setAttribute("class",a)}}):this},removeClass:function(t){var e,n,r,i,o,a;return m(t)?this.each(function(e){S(this).removeClass(t.call(this,e,vt(this)))}):arguments.length?(e=mt(t)).length?this.each(function(){if(r=vt(this),n=1===this.nodeType&&" "+yt(r)+" "){for(o=0;o<e.length;o++){i=e[o];while(-1<n.indexOf(" "+i+" "))n=n.replace(" "+i+" "," ")}a=yt(n),r!==a&&this.setAttribute("class",a)}}):this:this.attr("class","")},toggleClass:function(t,n){var e,r,i,o,a=typeof t,s="string"===a||Array.isArray(t);return m(t)?this.each(function(e){S(this).toggleClass(t.call(this,e,vt(this),n),n)}):"boolean"==typeof n&&s?n?this.addClass(t):this.removeClass(t):(e=mt(t),this.each(function(){if(s)for(o=S(this),i=0;i<e.length;i++)r=e[i],o.hasClass(r)?o.removeClass(r):o.addClass(r);else void 0!==t&&"boolean"!==a||((r=vt(this))&&Y.set(this,"__className__",r),this.setAttribute&&this.setAttribute("class",r||!1===t?"":Y.get(this,"__className__")||""))}))},hasClass:function(e){var t,n,r=0;t=" "+e+" ";while(n=this[r++])if(1===n.nodeType&&-1<(" "+yt(vt(n))+" ").indexOf(t))return!0;return!1}});var xt=/\r/g;S.fn.extend({val:function(n){var r,e,i,t=this[0];return arguments.length?(i=m(n),this.each(function(e){var t;1===this.nodeType&&(null==(t=i?n.call(this,e,S(this).val()):n)?t="":"number"==typeof t?t+="":Array.isArray(t)&&(t=S.map(t,function(e){return null==e?"":e+""})),(r=S.valHooks[this.type]||S.valHooks[this.nodeName.toLowerCase()])&&"set"in r&&void 0!==r.set(this,t,"value")||(this.value=t))})):t?(r=S.valHooks[t.type]||S.valHooks[t.nodeName.toLowerCase()])&&"get"in r&&void 0!==(e=r.get(t,"value"))?e:"string"==typeof(e=t.value)?e.replace(xt,""):null==e?"":e:void 0}}),S.extend({valHooks:{option:{get:function(e){var t=S.find.attr(e,"value");return null!=t?t:yt(S.text(e))}},select:{get:function(e){var t,n,r,i=e.options,o=e.selectedIndex,a="select-one"===e.type,s=a?null:[],u=a?o+1:i.length;for(r=o<0?u:a?o:0;r<u;r++)if(((n=i[r]).selected||r===o)&&!n.disabled&&(!n.parentNode.disabled||!A(n.parentNode,"optgroup"))){if(t=S(n).val(),a)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=S.makeArray(t),a=i.length;while(a--)((r=i[a]).selected=-1<S.inArray(S.valHooks.option.get(r),o))&&(n=!0);return n||(e.selectedIndex=-1),o}}}}),S.each(["radio","checkbox"],function(){S.valHooks[this]={set:function(e,t){if(Array.isArray(t))return e.checked=-1<S.inArray(S(e).val(),t)}},v.checkOn||(S.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})}),v.focusin="onfocusin"in C;var bt=/^(?:focusinfocus|focusoutblur)$/,wt=function(e){e.stopPropagation()};S.extend(S.event,{trigger:function(e,t,n,r){var i,o,a,s,u,l,c,f,p=[n||E],d=y.call(e,"type")?e.type:e,h=y.call(e,"namespace")?e.namespace.split("."):[];if(o=f=a=n=n||E,3!==n.nodeType&&8!==n.nodeType&&!bt.test(d+S.event.triggered)&&(-1<d.indexOf(".")&&(d=(h=d.split(".")).shift(),h.sort()),u=d.indexOf(":")<0&&"on"+d,(e=e[S.expando]?e:new S.Event(d,"object"==typeof e&&e)).isTrigger=r?2:3,e.namespace=h.join("."),e.rnamespace=e.namespace?new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=void 0,e.target||(e.target=n),t=null==t?[e]:S.makeArray(t,[e]),c=S.event.special[d]||{},r||!c.trigger||!1!==c.trigger.apply(n,t))){if(!r&&!c.noBubble&&!x(n)){for(s=c.delegateType||d,bt.test(s+d)||(o=o.parentNode);o;o=o.parentNode)p.push(o),a=o;a===(n.ownerDocument||E)&&p.push(a.defaultView||a.parentWindow||C)}i=0;while((o=p[i++])&&!e.isPropagationStopped())f=o,e.type=1<i?s:c.bindType||d,(l=(Y.get(o,"events")||Object.create(null))[e.type]&&Y.get(o,"handle"))&&l.apply(o,t),(l=u&&o[u])&&l.apply&&V(o)&&(e.result=l.apply(o,t),!1===e.result&&e.preventDefault());return e.type=d,r||e.isDefaultPrevented()||c._default&&!1!==c._default.apply(p.pop(),t)||!V(n)||u&&m(n[d])&&!x(n)&&((a=n[u])&&(n[u]=null),S.event.triggered=d,e.isPropagationStopped()&&f.addEventListener(d,wt),n[d](),e.isPropagationStopped()&&f.removeEventListener(d,wt),S.event.triggered=void 0,a&&(n[u]=a)),e.result}},simulate:function(e,t,n){var r=S.extend(new S.Event,n,{type:e,isSimulated:!0});S.event.trigger(r,null,t)}}),S.fn.extend({trigger:function(e,t){return this.each(function(){S.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return S.event.trigger(e,t,n,!0)}}),v.focusin||S.each({focus:"focusin",blur:"focusout"},function(n,r){var i=function(e){S.event.simulate(r,e.target,S.event.fix(e))};S.event.special[r]={setup:function(){var e=this.ownerDocument||this.document||this,t=Y.access(e,r);t||e.addEventListener(n,i,!0),Y.access(e,r,(t||0)+1)},teardown:function(){var e=this.ownerDocument||this.document||this,t=Y.access(e,r)-1;t?Y.access(e,r,t):(e.removeEventListener(n,i,!0),Y.remove(e,r))}}});var Tt=C.location,Ct={guid:Date.now()},Et=/\?/;S.parseXML=function(e){var t,n;if(!e||"string"!=typeof e)return null;try{t=(new C.DOMParser).parseFromString(e,"text/xml")}catch(e){}return n=t&&t.getElementsByTagName("parsererror")[0],t&&!n||S.error("Invalid XML: "+(n?S.map(n.childNodes,function(e){return e.textContent}).join("\n"):e)),t};var St=/\[\]$/,kt=/\r?\n/g,At=/^(?:submit|button|image|reset|file)$/i,Nt=/^(?:input|select|textarea|keygen)/i;function jt(n,e,r,i){var t;if(Array.isArray(e))S.each(e,function(e,t){r||St.test(n)?i(n,t):jt(n+"["+("object"==typeof t&&null!=t?e:"")+"]",t,r,i)});else if(r||"object"!==w(e))i(n,e);else for(t in e)jt(n+"["+t+"]",e[t],r,i)}S.param=function(e,t){var n,r=[],i=function(e,t){var n=m(t)?t():t;r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(null==n?"":n)};if(null==e)return"";if(Array.isArray(e)||e.jquery&&!S.isPlainObject(e))S.each(e,function(){i(this.name,this.value)});else for(n in e)jt(n,e[n],t,i);return r.join("&")},S.fn.extend({serialize:function(){return S.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=S.prop(this,"elements");return e?S.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!S(this).is(":disabled")&&Nt.test(this.nodeName)&&!At.test(e)&&(this.checked||!pe.test(e))}).map(function(e,t){var n=S(this).val();return null==n?null:Array.isArray(n)?S.map(n,function(e){return{name:t.name,value:e.replace(kt,"\r\n")}}):{name:t.name,value:n.replace(kt,"\r\n")}}).get()}});var Dt=/%20/g,qt=/#.*$/,Lt=/([?&])_=[^&]*/,Ht=/^(.*?):[ \t]*([^\r\n]*)$/gm,Ot=/^(?:GET|HEAD)$/,Pt=/^\/\//,Rt={},Mt={},It="*/".concat("*"),Wt=E.createElement("a");function Ft(o){return function(e,t){"string"!=typeof e&&(t=e,e="*");var n,r=0,i=e.toLowerCase().match(P)||[];if(m(t))while(n=i[r++])"+"===n[0]?(n=n.slice(1)||"*",(o[n]=o[n]||[]).unshift(t)):(o[n]=o[n]||[]).push(t)}}function $t(t,i,o,a){var s={},u=t===Mt;function l(e){var r;return s[e]=!0,S.each(t[e]||[],function(e,t){var n=t(i,o,a);return"string"!=typeof n||u||s[n]?u?!(r=n):void 0:(i.dataTypes.unshift(n),l(n),!1)}),r}return l(i.dataTypes[0])||!s["*"]&&l("*")}function Bt(e,t){var n,r,i=S.ajaxSettings.flatOptions||{};for(n in t)void 0!==t[n]&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&S.extend(!0,e,r),e}Wt.href=Tt.href,S.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Tt.href,type:"GET",isLocal:/^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(Tt.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":It,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":S.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?Bt(Bt(e,S.ajaxSettings),t):Bt(S.ajaxSettings,e)},ajaxPrefilter:Ft(Rt),ajaxTransport:Ft(Mt),ajax:function(e,t){"object"==typeof e&&(t=e,e=void 0),t=t||{};var c,f,p,n,d,r,h,g,i,o,y=S.ajaxSetup({},t),v=y.context||y,m=y.context&&(v.nodeType||v.jquery)?S(v):S.event,x=S.Deferred(),b=S.Callbacks("once memory"),w=y.statusCode||{},a={},s={},u="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(h){if(!n){n={};while(t=Ht.exec(p))n[t[1].toLowerCase()+" "]=(n[t[1].toLowerCase()+" "]||[]).concat(t[2])}t=n[e.toLowerCase()+" "]}return null==t?null:t.join(", ")},getAllResponseHeaders:function(){return h?p:null},setRequestHeader:function(e,t){return null==h&&(e=s[e.toLowerCase()]=s[e.toLowerCase()]||e,a[e]=t),this},overrideMimeType:function(e){return null==h&&(y.mimeType=e),this},statusCode:function(e){var t;if(e)if(h)T.always(e[T.status]);else for(t in e)w[t]=[w[t],e[t]];return this},abort:function(e){var t=e||u;return c&&c.abort(t),l(0,t),this}};if(x.promise(T),y.url=((e||y.url||Tt.href)+"").replace(Pt,Tt.protocol+"//"),y.type=t.method||t.type||y.method||y.type,y.dataTypes=(y.dataType||"*").toLowerCase().match(P)||[""],null==y.crossDomain){r=E.createElement("a");try{r.href=y.url,r.href=r.href,y.crossDomain=Wt.protocol+"//"+Wt.host!=r.protocol+"//"+r.host}catch(e){y.crossDomain=!0}}if(y.data&&y.processData&&"string"!=typeof y.data&&(y.data=S.param(y.data,y.traditional)),$t(Rt,y,t,T),h)return T;for(i in(g=S.event&&y.global)&&0==S.active++&&S.event.trigger("ajaxStart"),y.type=y.type.toUpperCase(),y.hasContent=!Ot.test(y.type),f=y.url.replace(qt,""),y.hasContent?y.data&&y.processData&&0===(y.contentType||"").indexOf("application/x-www-form-urlencoded")&&(y.data=y.data.replace(Dt,"+")):(o=y.url.slice(f.length),y.data&&(y.processData||"string"==typeof y.data)&&(f+=(Et.test(f)?"&":"?")+y.data,delete y.data),!1===y.cache&&(f=f.replace(Lt,"$1"),o=(Et.test(f)?"&":"?")+"_="+Ct.guid+++o),y.url=f+o),y.ifModified&&(S.lastModified[f]&&T.setRequestHeader("If-Modified-Since",S.lastModified[f]),S.etag[f]&&T.setRequestHeader("If-None-Match",S.etag[f])),(y.data&&y.hasContent&&!1!==y.contentType||t.contentType)&&T.setRequestHeader("Content-Type",y.contentType),T.setRequestHeader("Accept",y.dataTypes[0]&&y.accepts[y.dataTypes[0]]?y.accepts[y.dataTypes[0]]+("*"!==y.dataTypes[0]?", "+It+"; q=0.01":""):y.accepts["*"]),y.headers)T.setRequestHeader(i,y.headers[i]);if(y.beforeSend&&(!1===y.beforeSend.call(v,T,y)||h))return T.abort();if(u="abort",b.add(y.complete),T.done(y.success),T.fail(y.error),c=$t(Mt,y,t,T)){if(T.readyState=1,g&&m.trigger("ajaxSend",[T,y]),h)return T;y.async&&0<y.timeout&&(d=C.setTimeout(function(){T.abort("timeout")},y.timeout));try{h=!1,c.send(a,l)}catch(e){if(h)throw e;l(-1,e)}}else l(-1,"No Transport");function l(e,t,n,r){var i,o,a,s,u,l=t;h||(h=!0,d&&C.clearTimeout(d),c=void 0,p=r||"",T.readyState=0<e?4:0,i=200<=e&&e<300||304===e,n&&(s=function(e,t,n){var r,i,o,a,s=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),void 0===r&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in s)if(s[i]&&s[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}a||(a=i)}o=o||a}if(o)return o!==u[0]&&u.unshift(o),n[o]}(y,T,n)),!i&&-1<S.inArray("script",y.dataTypes)&&S.inArray("json",y.dataTypes)<0&&(y.converters["text script"]=function(){}),s=function(e,t,n,r){var i,o,a,s,u,l={},c=e.dataTypes.slice();if(c[1])for(a in e.converters)l[a.toLowerCase()]=e.converters[a];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(!(a=l[u+" "+o]||l["* "+o]))for(i in l)if((s=i.split(" "))[1]===o&&(a=l[u+" "+s[0]]||l["* "+s[0]])){!0===a?a=l[i]:!0!==l[i]&&(o=s[0],c.unshift(s[1]));break}if(!0!==a)if(a&&e["throws"])t=a(t);else try{t=a(t)}catch(e){return{state:"parsererror",error:a?e:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}(y,s,T,i),i?(y.ifModified&&((u=T.getResponseHeader("Last-Modified"))&&(S.lastModified[f]=u),(u=T.getResponseHeader("etag"))&&(S.etag[f]=u)),204===e||"HEAD"===y.type?l="nocontent":304===e?l="notmodified":(l=s.state,o=s.data,i=!(a=s.error))):(a=l,!e&&l||(l="error",e<0&&(e=0))),T.status=e,T.statusText=(t||l)+"",i?x.resolveWith(v,[o,l,T]):x.rejectWith(v,[T,l,a]),T.statusCode(w),w=void 0,g&&m.trigger(i?"ajaxSuccess":"ajaxError",[T,y,i?o:a]),b.fireWith(v,[T,l]),g&&(m.trigger("ajaxComplete",[T,y]),--S.active||S.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return S.get(e,t,n,"json")},getScript:function(e,t){return S.get(e,void 0,t,"script")}}),S.each(["get","post"],function(e,i){S[i]=function(e,t,n,r){return m(t)&&(r=r||n,n=t,t=void 0),S.ajax(S.extend({url:e,type:i,dataType:r,data:t,success:n},S.isPlainObject(e)&&e))}}),S.ajaxPrefilter(function(e){var t;for(t in e.headers)"content-type"===t.toLowerCase()&&(e.contentType=e.headers[t]||"")}),S._evalUrl=function(e,t,n){return S.ajax({url:e,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,converters:{"text script":function(){}},dataFilter:function(e){S.globalEval(e,t,n)}})},S.fn.extend({wrapAll:function(e){var t;return this[0]&&(m(e)&&(e=e.call(this[0])),t=S(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this},wrapInner:function(n){return m(n)?this.each(function(e){S(this).wrapInner(n.call(this,e))}):this.each(function(){var e=S(this),t=e.contents();t.length?t.wrapAll(n):e.append(n)})},wrap:function(t){var n=m(t);return this.each(function(e){S(this).wrapAll(n?t.call(this,e):t)})},unwrap:function(e){return this.parent(e).not("body").each(function(){S(this).replaceWith(this.childNodes)}),this}}),S.expr.pseudos.hidden=function(e){return!S.expr.pseudos.visible(e)},S.expr.pseudos.visible=function(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},S.ajaxSettings.xhr=function(){try{return new C.XMLHttpRequest}catch(e){}};var _t={0:200,1223:204},zt=S.ajaxSettings.xhr();v.cors=!!zt&&"withCredentials"in zt,v.ajax=zt=!!zt,S.ajaxTransport(function(i){var o,a;if(v.cors||zt&&!i.crossDomain)return{send:function(e,t){var n,r=i.xhr();if(r.open(i.type,i.url,i.async,i.username,i.password),i.xhrFields)for(n in i.xhrFields)r[n]=i.xhrFields[n];for(n in i.mimeType&&r.overrideMimeType&&r.overrideMimeType(i.mimeType),i.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest"),e)r.setRequestHeader(n,e[n]);o=function(e){return function(){o&&(o=a=r.onload=r.onerror=r.onabort=r.ontimeout=r.onreadystatechange=null,"abort"===e?r.abort():"error"===e?"number"!=typeof r.status?t(0,"error"):t(r.status,r.statusText):t(_t[r.status]||r.status,r.statusText,"text"!==(r.responseType||"text")||"string"!=typeof r.responseText?{binary:r.response}:{text:r.responseText},r.getAllResponseHeaders()))}},r.onload=o(),a=r.onerror=r.ontimeout=o("error"),void 0!==r.onabort?r.onabort=a:r.onreadystatechange=function(){4===r.readyState&&C.setTimeout(function(){o&&a()})},o=o("abort");try{r.send(i.hasContent&&i.data||null)}catch(e){if(o)throw e}},abort:function(){o&&o()}}}),S.ajaxPrefilter(function(e){e.crossDomain&&(e.contents.script=!1)}),S.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(e){return S.globalEval(e),e}}}),S.ajaxPrefilter("script",function(e){void 0===e.cache&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),S.ajaxTransport("script",function(n){var r,i;if(n.crossDomain||n.scriptAttrs)return{send:function(e,t){r=S("<script>").attr(n.scriptAttrs||{}).prop({charset:n.scriptCharset,src:n.url}).on("load error",i=function(e){r.remove(),i=null,e&&t("error"===e.type?404:200,e.type)}),E.head.appendChild(r[0])},abort:function(){i&&i()}}});var Ut,Xt=[],Vt=/(=)\?(?=&|$)|\?\?/;S.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=Xt.pop()||S.expando+"_"+Ct.guid++;return this[e]=!0,e}}),S.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,o,a=!1!==e.jsonp&&(Vt.test(e.url)?"url":"string"==typeof e.data&&0===(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&Vt.test(e.data)&&"data");if(a||"jsonp"===e.dataTypes[0])return r=e.jsonpCallback=m(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,a?e[a]=e[a].replace(Vt,"$1"+r):!1!==e.jsonp&&(e.url+=(Et.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return o||S.error(r+" was not called"),o[0]},e.dataTypes[0]="json",i=C[r],C[r]=function(){o=arguments},n.always(function(){void 0===i?S(C).removeProp(r):C[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,Xt.push(r)),o&&m(i)&&i(o[0]),o=i=void 0}),"script"}),v.createHTMLDocument=((Ut=E.implementation.createHTMLDocument("").body).innerHTML="<form></form><form></form>",2===Ut.childNodes.length),S.parseHTML=function(e,t,n){return"string"!=typeof e?[]:("boolean"==typeof t&&(n=t,t=!1),t||(v.createHTMLDocument?((r=(t=E.implementation.createHTMLDocument("")).createElement("base")).href=E.location.href,t.head.appendChild(r)):t=E),o=!n&&[],(i=N.exec(e))?[t.createElement(i[1])]:(i=xe([e],t,o),o&&o.length&&S(o).remove(),S.merge([],i.childNodes)));var r,i,o},S.fn.load=function(e,t,n){var r,i,o,a=this,s=e.indexOf(" ");return-1<s&&(r=yt(e.slice(s)),e=e.slice(0,s)),m(t)?(n=t,t=void 0):t&&"object"==typeof t&&(i="POST"),0<a.length&&S.ajax({url:e,type:i||"GET",dataType:"html",data:t}).done(function(e){o=arguments,a.html(r?S("<div>").append(S.parseHTML(e)).find(r):e)}).always(n&&function(e,t){a.each(function(){n.apply(this,o||[e.responseText,t,e])})}),this},S.expr.pseudos.animated=function(t){return S.grep(S.timers,function(e){return t===e.elem}).length},S.offset={setOffset:function(e,t,n){var r,i,o,a,s,u,l=S.css(e,"position"),c=S(e),f={};"static"===l&&(e.style.position="relative"),s=c.offset(),o=S.css(e,"top"),u=S.css(e,"left"),("absolute"===l||"fixed"===l)&&-1<(o+u).indexOf("auto")?(a=(r=c.position()).top,i=r.left):(a=parseFloat(o)||0,i=parseFloat(u)||0),m(t)&&(t=t.call(e,n,S.extend({},s))),null!=t.top&&(f.top=t.top-s.top+a),null!=t.left&&(f.left=t.left-s.left+i),"using"in t?t.using.call(e,f):c.css(f)}},S.fn.extend({offset:function(t){if(arguments.length)return void 0===t?this:this.each(function(e){S.offset.setOffset(this,t,e)});var e,n,r=this[0];return r?r.getClientRects().length?(e=r.getBoundingClientRect(),n=r.ownerDocument.defaultView,{top:e.top+n.pageYOffset,left:e.left+n.pageXOffset}):{top:0,left:0}:void 0},position:function(){if(this[0]){var e,t,n,r=this[0],i={top:0,left:0};if("fixed"===S.css(r,"position"))t=r.getBoundingClientRect();else{t=this.offset(),n=r.ownerDocument,e=r.offsetParent||n.documentElement;while(e&&(e===n.body||e===n.documentElement)&&"static"===S.css(e,"position"))e=e.parentNode;e&&e!==r&&1===e.nodeType&&((i=S(e).offset()).top+=S.css(e,"borderTopWidth",!0),i.left+=S.css(e,"borderLeftWidth",!0))}return{top:t.top-i.top-S.css(r,"marginTop",!0),left:t.left-i.left-S.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent;while(e&&"static"===S.css(e,"position"))e=e.offsetParent;return e||re})}}),S.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,i){var o="pageYOffset"===i;S.fn[t]=function(e){return B(this,function(e,t,n){var r;if(x(e)?r=e:9===e.nodeType&&(r=e.defaultView),void 0===n)return r?r[i]:e[t];r?r.scrollTo(o?r.pageXOffset:n,o?n:r.pageYOffset):e[t]=n},t,e,arguments.length)}}),S.each(["top","left"],function(e,n){S.cssHooks[n]=_e(v.pixelPosition,function(e,t){if(t)return t=Be(e,n),Pe.test(t)?S(e).position()[n]+"px":t})}),S.each({Height:"height",Width:"width"},function(a,s){S.each({padding:"inner"+a,content:s,"":"outer"+a},function(r,o){S.fn[o]=function(e,t){var n=arguments.length&&(r||"boolean"!=typeof e),i=r||(!0===e||!0===t?"margin":"border");return B(this,function(e,t,n){var r;return x(e)?0===o.indexOf("outer")?e["inner"+a]:e.document.documentElement["client"+a]:9===e.nodeType?(r=e.documentElement,Math.max(e.body["scroll"+a],r["scroll"+a],e.body["offset"+a],r["offset"+a],r["client"+a])):void 0===n?S.css(e,t,i):S.style(e,t,n,i)},s,n?e:void 0,n)}})}),S.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){S.fn[t]=function(e){return this.on(t,e)}}),S.fn.extend({bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)},hover:function(e,t){return this.mouseenter(e).mouseleave(t||e)}}),S.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(e,n){S.fn[n]=function(e,t){return 0<arguments.length?this.on(n,null,e,t):this.trigger(n)}});var Gt=/^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;S.proxy=function(e,t){var n,r,i;if("string"==typeof t&&(n=e[t],t=e,e=n),m(e))return r=s.call(arguments,2),(i=function(){return e.apply(t||this,r.concat(s.call(arguments)))}).guid=e.guid=e.guid||S.guid++,i},S.holdReady=function(e){e?S.readyWait++:S.ready(!0)},S.isArray=Array.isArray,S.parseJSON=JSON.parse,S.nodeName=A,S.isFunction=m,S.isWindow=x,S.camelCase=X,S.type=w,S.now=Date.now,S.isNumeric=function(e){var t=S.type(e);return("number"===t||"string"===t)&&!isNaN(e-parseFloat(e))},S.trim=function(e){return null==e?"":(e+"").replace(Gt,"$1")},"function"==typeof define&&define.amd&&define("jquery",[],function(){return S});var Yt=C.jQuery,Qt=C.$;return S.noConflict=function(e){return C.$===S&&(C.$=Qt),e&&C.jQuery===S&&(C.jQuery=Yt),S},"undefined"==typeof e&&(C.jQuery=C.$=S),S});

define('js/pieces/Library',["Datum"], function(Datum) {

	return {

		Datum: Datum,
		Binding: Datum.Binding || Binding
	};
});

define('js/pieces/Placeholder',[], function() {

	function Placeholder(page) {

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			for (var i = 0; i < page.length; i++) {

				element.appendChild(page[i]);
			}
		};
	}

	return Placeholder;
});

define('js/pieces/AddEventListener',[], function() {

	if (typeof addEventListener == "undefined") {

		return function() {};
	}
	else {

		return addEventListener;
	}
});

define('js/pieces/Location',[], function() {

	if (typeof location == "undefined") {

		return {

			hash: ""
		};
	}
	else {

		return location;
	}
});

define('js/pieces/History',[], function() {

	if (typeof history == "undefined") {

		return {

			pushState: function() {}
		};
	}
	else {

		return history;
	}
});

define('js/pieces/Route',[
	"./AddEventListener",
	"./Location",
	"./History"
], function(
	addEventListener,
	location,
	history) {

	var routes = [];

	var words = location.hash.substring(1).split("/");

	var updating = 0;

	var route = new Route();

	addEventListener("hashchange", function() {

		words = location.hash.substring(1).split("/");

		for (var i = 0; i < words.length; i++) {

			if (!routes[i]) {

				return;
			}

			updating++;

			routes[i].set(words[i], i, function() {

				routes.splice(i + 1);
			});
		}
	});

	function Route() {

		var self = this;

		this.setUpdating = function() {

			updating++;
		};

		this.addRoute = function(word) {

			var index = routes.length;

			routes.push(word);

			updating++;

			word.set(words[index], index, function() {});

			return {

				setUpdating: function() {

					self.setUpdating(index);
				},
				changePage: function() {

					self.changePage(index);
				},
				update: function(reference) {

					self.update(index, reference);
				},
				getIndex: function() {

					return index;
				},
				getWord: function() {

					return words[index];
				},
				get: function() {

					return this;
				}
			};
		};

		this.update = function(index, reference) {

			var wordList = [];
			var maxIndex = Math.min(routes.length, index + 1);
			var nonBlank = false;

			for (var i = maxIndex - 1; i >= 0; i--) {

				wordList[i] = routes[i].get(nonBlank, reference);

				nonBlank = nonBlank || !!wordList[i];
			}

			if (updating > 0) {

				updating--;

				return;
			}

			if (words[index] == wordList[index]) {

				return;
			}

			var hash = wordList.join("/");

			// remove trailing slashes.
			hash = "#" + hash.replace(/\/+$/, "");

			words = wordList;
			history.pushState(null, "", hash);
		};

		this.changePage = function(index) {

			for (var i = 0; i < routes.length; i++) {

				routes[i].dispose = true;
			}

			routes.splice(index + 1);
			words.splice(index + 1);
		};

		this.getWord = function(index) {

			return words[index];
		};
	}

	return {

		get: function() { return route; },
		set: function(newRoute) { route = newRoute; },
		reset: function() {

			routes = [];
			words = location.hash.substring(1).split("/");
			updating = 0;
			route = new Route();
		}
	};
});

define('js/pieces/SlideNavPiece',[
	"./Library",
	"./Placeholder",
	"./Route"
],
function SlideNavPiece(
	Library,
	Placeholder,
	Route) {

	function SlideNavPiece(pages) {

		var self = this;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container = null;

		var right = true;

		var slideRef = {};

		var router;

		this.datumPiecesFirstPage = null;

		this.datumPiecesSecondPage = null;

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.overflow = "hidden";
			element.style.paddingTop = "1px";

			container = document.createElement("DIV");
			container.style.width = "200%";
			container.style.position = "relative";
			container.style.left = this.datumPiecesSecondPage ? "-100%" : "0";

			var firstElement = document.createElement("DIV");
			firstElement.dataset.bind = "datumPiecesFirstPage";
			firstElement.style.display = "inline-block";
			firstElement.style.width = "50%";
			firstElement.style.verticalAlign = "top";

			var secondElement = document.createElement("DIV");
			secondElement.dataset.bind = "datumPiecesSecondPage";
			secondElement.style.display = "inline-block";
			secondElement.style.width = "50%";

			container.appendChild(firstElement);
			container.appendChild(secondElement);

			element.appendChild(container);

			router =
				route.addRoute({

					set: function(word, routeIndex, callback) {

						routePage(word, callback);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					showPage(i, callback);

					return;
				}
			}

			if (right && !self.datumPiecesFirstPage) {

				showPage(0, callback);
			}
		}

		function showPage(index, callback) {

			if ((right && self.datumPiecesFirstPage == pages[index].page) ||
				(!right && self.datumPiecesSecondPage == pages[index].page)) {

				return;
			}

			callback();

			right = true;

			self.datumPiecesFirstPage = pages[index].page;
			self.datumPiecesSecondPage = null;

			if (container) {

				container.style.removeProperty("transition");
				container.style.left = "0";
			}
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var oldIndex = Math.max(currentIndex, 0);

			currentIndex = index;
			activeIndex(index);

			if (oldIndex != index) {

				router.changePage();
			}

			router.update();

			var ref = {};
			slideRef = ref;

			var oldPage;

			if (index > oldIndex) {

				container.style.removeProperty("transition");
				container.style.left = "0";

				oldPage = getOldPage(right ? 0 : 1);

				this.datumPiecesFirstPage = new Placeholder(oldPage);
				this.datumPiecesSecondPage = pages[index].page;

				right = false;

				setTimeout(function() {

					container.style.transition = "left 0.5s ease-out";
					container.style.left = "-100%";

					setTimeout(function() {

						if (slideRef == ref) {

							self.datumPiecesFirstPage = null;
						}
					}, 500);
				}, 10);
			}
			else if (index < oldIndex) {

				container.style.removeProperty("transition");
				container.style.left = "-100%";

				oldPage = getOldPage(right ? 0 : 1);

				this.datumPiecesSecondPage = new Placeholder(oldPage);
				this.datumPiecesFirstPage = pages[index].page;

				right = true;

				setTimeout(function() {

					container.style.transition = "left 0.5s ease-out";
					container.style.left = "0";

					setTimeout(function() {

						if (slideRef == ref) {

							self.datumPiecesSecondPage = null;
						}
					}, 500);
				}, 10);
			}
		};

		function getOldPage(index) {

			var children = container.children[index].children;
			var oldPage = new Array(children.length);

			for (var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				container.children[index].removeChild(children[i]);
			}

			return oldPage;
		}

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SlideNavPiece;
});

define('js/pieces/NavButton',["./Library"], function NavButton(Library) {

	function NavButton(index, nav) {

		return new Library.Binding({

			click: function() {

				nav.showPage(index);
			},
			classes: {

				active: function() {

					return index == nav.getCurrentIndex();
				}
			}
		});
	}

	return NavButton;
});

/*
Syntax highlighting with language autodetection.
https://highlightjs.org/
*/

(function(factory) {

  // Setup highlight.js for different environments. First is Node.js or
  // CommonJS.
  if(typeof exports !== 'undefined') {
    factory(exports);
  } else {
    // Export hljs globally even when using AMD for cases when this script
    // is loaded with others that may still expect a global hljs.
    self.hljs = factory({});

    // Finally register the global hljs with AMD.
    if(typeof define === 'function' && define.amd) {
      define('hljs', [], function() {
        return self.hljs;
      });
    }
  }

}(function(hljs) {

  /* Utility functions */

  function escape(value) {
    return value.replace(/&/gm, '&amp;').replace(/</gm, '&lt;').replace(/>/gm, '&gt;');
  }

  function tag(node) {
    return node.nodeName.toLowerCase();
  }

  function testRe(re, lexeme) {
    var match = re && re.exec(lexeme);
    return match && match.index == 0;
  }

  function isNotHighlighted(language) {
    return (/^(no-?highlight|plain|text)$/i).test(language);
  }

  function blockLanguage(block) {
    var i, match, length,
        classes = block.className + ' ';

    classes += block.parentNode ? block.parentNode.className : '';

    // language-* takes precedence over non-prefixed class names
    match = (/\blang(?:uage)?-([\w-]+)\b/i).exec(classes);
    if (match) {
      return getLanguage(match[1]) ? match[1] : 'no-highlight';
    }

    classes = classes.split(/\s+/);
    for (i = 0, length = classes.length; i < length; i++) {
      if (getLanguage(classes[i]) || isNotHighlighted(classes[i])) {
        return classes[i];
      }
    }
  }

  function inherit(parent, obj) {
    var result = {}, key;
    for (key in parent)
      result[key] = parent[key];
    if (obj)
      for (key in obj)
        result[key] = obj[key];
    return result;
  }

  /* Stream merging */

  function nodeStream(node) {
    var result = [];
    (function _nodeStream(node, offset) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType == 3)
          offset += child.nodeValue.length;
        else if (child.nodeType == 1) {
          result.push({
            event: 'start',
            offset: offset,
            node: child
          });
          offset = _nodeStream(child, offset);
          // Prevent void elements from having an end tag that would actually
          // double them in the output. There are more void elements in HTML
          // but we list only those realistically expected in code display.
          if (!tag(child).match(/br|hr|img|input/)) {
            result.push({
              event: 'stop',
              offset: offset,
              node: child
            });
          }
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  function mergeStreams(original, highlighted, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted;
      }
      if (original[0].offset != highlighted[0].offset) {
        return (original[0].offset < highlighted[0].offset) ? original : highlighted;
      }

      /*
      To avoid starting the stream just before it should stop the order is
      ensured that original always starts first and closes last:

      if (event1 == 'start' && event2 == 'start')
        return original;
      if (event1 == 'start' && event2 == 'stop')
        return highlighted;
      if (event1 == 'stop' && event2 == 'start')
        return original;
      if (event1 == 'stop' && event2 == 'stop')
        return highlighted;

      ... which is collapsed to:
      */
      return highlighted[0].event == 'start' ? original : highlighted;
    }

    function open(node) {
      function attr_str(a) {return ' ' + a.nodeName + '="' + escape(a.value) + '"';}
      result += '<' + tag(node) + Array.prototype.map.call(node.attributes, attr_str).join('') + '>';
    }

    function close(node) {
      result += '</' + tag(node) + '>';
    }

    function render(event) {
      (event.event == 'start' ? open : close)(event.node);
    }

    while (original.length || highlighted.length) {
      var stream = selectStream();
      result += escape(value.substr(processed, stream[0].offset - processed));
      processed = stream[0].offset;
      if (stream == original) {
        /*
        On any opening or closing tag of the original markup we first close
        the entire highlighted node stack, then render the original tag along
        with all the following original tags at the same offset and then
        reopen all the tags on the highlighted stack.
        */
        nodeStack.reverse().forEach(close);
        do {
          render(stream.splice(0, 1)[0]);
          stream = selectStream();
        } while (stream == original && stream.length && stream[0].offset == processed);
        nodeStack.reverse().forEach(open);
      } else {
        if (stream[0].event == 'start') {
          nodeStack.push(stream[0].node);
        } else {
          nodeStack.pop();
        }
        render(stream.splice(0, 1)[0]);
      }
    }
    return result + escape(value.substr(processed));
  }

  /* Initialization */

  function compileLanguage(language) {

    function reStr(re) {
        return (re && re.source) || re;
    }

    function langRe(value, global) {
      return new RegExp(
        reStr(value),
        'm' + (language.case_insensitive ? 'i' : '') + (global ? 'g' : '')
      );
    }

    function compileMode(mode, parent) {
      if (mode.compiled)
        return;
      mode.compiled = true;

      mode.keywords = mode.keywords || mode.beginKeywords;
      if (mode.keywords) {
        var compiled_keywords = {};

        var flatten = function(className, str) {
          if (language.case_insensitive) {
            str = str.toLowerCase();
          }
          str.split(' ').forEach(function(kw) {
            var pair = kw.split('|');
            compiled_keywords[pair[0]] = [className, pair[1] ? Number(pair[1]) : 1];
          });
        };

        if (typeof mode.keywords == 'string') { // string
          flatten('keyword', mode.keywords);
        } else {
          Object.keys(mode.keywords).forEach(function (className) {
            flatten(className, mode.keywords[className]);
          });
        }
        mode.keywords = compiled_keywords;
      }
      mode.lexemesRe = langRe(mode.lexemes || /\b\w+\b/, true);

      if (parent) {
        if (mode.beginKeywords) {
          mode.begin = '\\b(' + mode.beginKeywords.split(' ').join('|') + ')\\b';
        }
        if (!mode.begin)
          mode.begin = /\B|\b/;
        mode.beginRe = langRe(mode.begin);
        if (!mode.end && !mode.endsWithParent)
          mode.end = /\B|\b/;
        if (mode.end)
          mode.endRe = langRe(mode.end);
        mode.terminator_end = reStr(mode.end) || '';
        if (mode.endsWithParent && parent.terminator_end)
          mode.terminator_end += (mode.end ? '|' : '') + parent.terminator_end;
      }
      if (mode.illegal)
        mode.illegalRe = langRe(mode.illegal);
      if (mode.relevance === undefined)
        mode.relevance = 1;
      if (!mode.contains) {
        mode.contains = [];
      }
      var expanded_contains = [];
      mode.contains.forEach(function(c) {
        if (c.variants) {
          c.variants.forEach(function(v) {expanded_contains.push(inherit(c, v));});
        } else {
          expanded_contains.push(c == 'self' ? mode : c);
        }
      });
      mode.contains = expanded_contains;
      mode.contains.forEach(function(c) {compileMode(c, mode);});

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      var terminators =
        mode.contains.map(function(c) {
          return c.beginKeywords ? '\\.?(' + c.begin + ')\\.?' : c.begin;
        })
        .concat([mode.terminator_end, mode.illegal])
        .map(reStr)
        .filter(Boolean);
      mode.terminators = terminators.length ? langRe(terminators.join('|'), true) : {exec: function(/*s*/) {return null;}};
    }

    compileMode(language);
  }

  /*
  Core highlighting function. Accepts a language name, or an alias, and a
  string with the code to highlight. Returns an object with the following
  properties:

  - relevance (int)
  - value (an HTML string with highlighting markup)

  */
  function highlight(name, value, ignore_illegals, continuation) {

    function subMode(lexeme, mode) {
      for (var i = 0; i < mode.contains.length; i++) {
        if (testRe(mode.contains[i].beginRe, lexeme)) {
          return mode.contains[i];
        }
      }
    }

    function endOfMode(mode, lexeme) {
      if (testRe(mode.endRe, lexeme)) {
        while (mode.endsParent && mode.parent) {
          mode = mode.parent;
        }
        return mode;
      }
      if (mode.endsWithParent) {
        return endOfMode(mode.parent, lexeme);
      }
    }

    function isIllegal(lexeme, mode) {
      return !ignore_illegals && testRe(mode.illegalRe, lexeme);
    }

    function keywordMatch(mode, match) {
      var match_str = language.case_insensitive ? match[0].toLowerCase() : match[0];
      return mode.keywords.hasOwnProperty(match_str) && mode.keywords[match_str];
    }

    function buildSpan(classname, insideSpan, leaveOpen, noPrefix) {
      var classPrefix = noPrefix ? '' : options.classPrefix,
          openSpan    = '<span class="' + classPrefix,
          closeSpan   = leaveOpen ? '' : '</span>';

      openSpan += classname + '">';

      return openSpan + insideSpan + closeSpan;
    }

    function processKeywords() {
      if (!top.keywords)
        return escape(mode_buffer);
      var result = '';
      var last_index = 0;
      top.lexemesRe.lastIndex = 0;
      var match = top.lexemesRe.exec(mode_buffer);
      while (match) {
        result += escape(mode_buffer.substr(last_index, match.index - last_index));
        var keyword_match = keywordMatch(top, match);
        if (keyword_match) {
          relevance += keyword_match[1];
          result += buildSpan(keyword_match[0], escape(match[0]));
        } else {
          result += escape(match[0]);
        }
        last_index = top.lexemesRe.lastIndex;
        match = top.lexemesRe.exec(mode_buffer);
      }
      return result + escape(mode_buffer.substr(last_index));
    }

    function processSubLanguage() {
      var explicit = typeof top.subLanguage == 'string';
      if (explicit && !languages[top.subLanguage]) {
        return escape(mode_buffer);
      }

      var result = explicit ?
                   highlight(top.subLanguage, mode_buffer, true, continuations[top.subLanguage]) :
                   highlightAuto(mode_buffer, top.subLanguage.length ? top.subLanguage : undefined);

      // Counting embedded language score towards the host language may be disabled
      // with zeroing the containing mode relevance. Usecase in point is Markdown that
      // allows XML everywhere and makes every XML snippet to have a much larger Markdown
      // score.
      if (top.relevance > 0) {
        relevance += result.relevance;
      }
      if (explicit) {
        continuations[top.subLanguage] = result.top;
      }
      return buildSpan(result.language, result.value, false, true);
    }

    function processBuffer() {
      return top.subLanguage !== undefined ? processSubLanguage() : processKeywords();
    }

    function startNewMode(mode, lexeme) {
      var markup = mode.className? buildSpan(mode.className, '', true): '';
      if (mode.returnBegin) {
        result += markup;
        mode_buffer = '';
      } else if (mode.excludeBegin) {
        result += escape(lexeme) + markup;
        mode_buffer = '';
      } else {
        result += markup;
        mode_buffer = lexeme;
      }
      top = Object.create(mode, {parent: {value: top}});
    }

    function processLexeme(buffer, lexeme) {

      mode_buffer += buffer;
      if (lexeme === undefined) {
        result += processBuffer();
        return 0;
      }

      var new_mode = subMode(lexeme, top);
      if (new_mode) {
        result += processBuffer();
        startNewMode(new_mode, lexeme);
        return new_mode.returnBegin ? 0 : lexeme.length;
      }

      var end_mode = endOfMode(top, lexeme);
      if (end_mode) {
        var origin = top;
        if (!(origin.returnEnd || origin.excludeEnd)) {
          mode_buffer += lexeme;
        }
        result += processBuffer();
        do {
          if (top.className) {
            result += '</span>';
          }
          relevance += top.relevance;
          top = top.parent;
        } while (top != end_mode.parent);
        if (origin.excludeEnd) {
          result += escape(lexeme);
        }
        mode_buffer = '';
        if (end_mode.starts) {
          startNewMode(end_mode.starts, '');
        }
        return origin.returnEnd ? 0 : lexeme.length;
      }

      if (isIllegal(lexeme, top))
        throw new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.className || '<unnamed>') + '"');

      /*
      Parser should not reach this point as all types of lexemes should be caught
      earlier, but if it does due to some bug make sure it advances at least one
      character forward to prevent infinite looping.
      */
      mode_buffer += lexeme;
      return lexeme.length || 1;
    }

    var language = getLanguage(name);
    if (!language) {
      throw new Error('Unknown language: "' + name + '"');
    }

    compileLanguage(language);
    var top = continuation || language;
    var continuations = {}; // keep continuations for sub-languages
    var result = '', current;
    for(current = top; current != language; current = current.parent) {
      if (current.className) {
        result = buildSpan(current.className, '', true) + result;
      }
    }
    var mode_buffer = '';
    var relevance = 0;
    try {
      var match, count, index = 0;
      while (true) {
        top.terminators.lastIndex = index;
        match = top.terminators.exec(value);
        if (!match)
          break;
        count = processLexeme(value.substr(index, match.index - index), match[0]);
        index = match.index + count;
      }
      processLexeme(value.substr(index));
      for(current = top; current.parent; current = current.parent) { // close dangling modes
        if (current.className) {
          result += '</span>';
        }
      }
      return {
        relevance: relevance,
        value: result,
        language: name,
        top: top
      };
    } catch (e) {
      if (e.message.indexOf('Illegal') != -1) {
        return {
          relevance: 0,
          value: escape(value)
        };
      } else {
        throw e;
      }
    }
  }

  /*
  Highlighting with language detection. Accepts a string with the code to
  highlight. Returns an object with the following properties:

  - language (detected language)
  - relevance (int)
  - value (an HTML string with highlighting markup)
  - second_best (object with the same structure for second-best heuristically
    detected language, may be absent)

  */
  function highlightAuto(text, languageSubset) {
    languageSubset = languageSubset || options.languages || Object.keys(languages);
    var result = {
      relevance: 0,
      value: escape(text)
    };
    var second_best = result;
    languageSubset.forEach(function(name) {
      if (!getLanguage(name)) {
        return;
      }
      var current = highlight(name, text, false);
      current.language = name;
      if (current.relevance > second_best.relevance) {
        second_best = current;
      }
      if (current.relevance > result.relevance) {
        second_best = result;
        result = current;
      }
    });
    if (second_best.language) {
      result.second_best = second_best;
    }
    return result;
  }

  /*
  Post-processing of the highlighted markup:

  - replace TABs with something more useful
  - replace real line-breaks with '<br>' for non-pre containers

  */
  function fixMarkup(value) {
    if (options.tabReplace) {
      value = value.replace(/^((<[^>]+>|\t)+)/gm, function(match, p1 /*..., offset, s*/) {
        return p1.replace(/\t/g, options.tabReplace);
      });
    }
    if (options.useBR) {
      value = value.replace(/\n/g, '<br>');
    }
    return value;
  }

  function buildClassName(prevClassName, currentLang, resultLang) {
    var language = currentLang ? aliases[currentLang] : resultLang,
        result   = [prevClassName.trim()];

    if (!prevClassName.match(/\bhljs\b/)) {
      result.push('hljs');
    }

    if (prevClassName.indexOf(language) === -1) {
      result.push(language);
    }

    return result.join(' ').trim();
  }

  /*
  Applies highlighting to a DOM node containing code. Accepts a DOM node and
  two optional parameters for fixMarkup.
  */
  function highlightBlock(block) {
    var language = blockLanguage(block);
    if (isNotHighlighted(language))
        return;

    var node;
    if (options.useBR) {
      node = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      node.innerHTML = block.innerHTML.replace(/\n/g, '').replace(/<br[ \/]*>/g, '\n');
    } else {
      node = block;
    }
    var text = node.textContent;
    var result = language ? highlight(language, text, true) : highlightAuto(text);

    var originalStream = nodeStream(node);
    if (originalStream.length) {
      var resultNode = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
      resultNode.innerHTML = result.value;
      result.value = mergeStreams(originalStream, nodeStream(resultNode), text);
    }
    result.value = fixMarkup(result.value);

    block.innerHTML = result.value;
    block.className = buildClassName(block.className, language, result.language);
    block.result = {
      language: result.language,
      re: result.relevance
    };
    if (result.second_best) {
      block.second_best = {
        language: result.second_best.language,
        re: result.second_best.relevance
      };
    }
  }

  var options = {
    classPrefix: 'hljs-',
    tabReplace: null,
    useBR: false,
    languages: undefined
  };

  /*
  Updates highlight.js global options with values passed in the form of an object
  */
  function configure(user_options) {
    options = inherit(options, user_options);
  }

  /*
  Applies highlighting to all <pre><code>..</code></pre> blocks on a page.
  */
  function initHighlighting() {
    if (initHighlighting.called)
      return;
    initHighlighting.called = true;

    var blocks = document.querySelectorAll('pre code');
    Array.prototype.forEach.call(blocks, highlightBlock);
  }

  /*
  Attaches highlighting to the page load event.
  */
  function initHighlightingOnLoad() {
    addEventListener('DOMContentLoaded', initHighlighting, false);
    addEventListener('load', initHighlighting, false);
  }

  var languages = {};
  var aliases = {};

  function registerLanguage(name, language) {
    var lang = languages[name] = language(hljs);
    if (lang.aliases) {
      lang.aliases.forEach(function(alias) {aliases[alias] = name;});
    }
  }

  function listLanguages() {
    return Object.keys(languages);
  }

  function getLanguage(name) {
    name = (name || '').toLowerCase();
    return languages[name] || languages[aliases[name]];
  }

  /* Interface definition */

  hljs.highlight = highlight;
  hljs.highlightAuto = highlightAuto;
  hljs.fixMarkup = fixMarkup;
  hljs.highlightBlock = highlightBlock;
  hljs.configure = configure;
  hljs.initHighlighting = initHighlighting;
  hljs.initHighlightingOnLoad = initHighlightingOnLoad;
  hljs.registerLanguage = registerLanguage;
  hljs.listLanguages = listLanguages;
  hljs.getLanguage = getLanguage;
  hljs.inherit = inherit;

  // Common regexps
  hljs.IDENT_RE = '[a-zA-Z]\\w*';
  hljs.UNDERSCORE_IDENT_RE = '[a-zA-Z_]\\w*';
  hljs.NUMBER_RE = '\\b\\d+(\\.\\d+)?';
  hljs.C_NUMBER_RE = '(-?)(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  hljs.BINARY_NUMBER_RE = '\\b(0b[01]+)'; // 0b...
  hljs.RE_STARTERS_RE = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  // Common modes
  hljs.BACKSLASH_ESCAPE = {
    begin: '\\\\[\\s\\S]', relevance: 0
  };
  hljs.APOS_STRING_MODE = {
    className: 'string',
    begin: '\'', end: '\'',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.QUOTE_STRING_MODE = {
    className: 'string',
    begin: '"', end: '"',
    illegal: '\\n',
    contains: [hljs.BACKSLASH_ESCAPE]
  };
  hljs.PHRASAL_WORDS_MODE = {
    begin: /\b(a|an|the|are|I|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such|will|you|your|like)\b/
  };
  hljs.COMMENT = function (begin, end, inherits) {
    var mode = hljs.inherit(
      {
        className: 'comment',
        begin: begin, end: end,
        contains: []
      },
      inherits || {}
    );
    mode.contains.push(hljs.PHRASAL_WORDS_MODE);
    mode.contains.push({
      className: 'doctag',
      begin: "(?:TODO|FIXME|NOTE|BUG|XXX):",
      relevance: 0
    });
    return mode;
  };
  hljs.C_LINE_COMMENT_MODE = hljs.COMMENT('//', '$');
  hljs.C_BLOCK_COMMENT_MODE = hljs.COMMENT('/\\*', '\\*/');
  hljs.HASH_COMMENT_MODE = hljs.COMMENT('#', '$');
  hljs.NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE,
    relevance: 0
  };
  hljs.C_NUMBER_MODE = {
    className: 'number',
    begin: hljs.C_NUMBER_RE,
    relevance: 0
  };
  hljs.BINARY_NUMBER_MODE = {
    className: 'number',
    begin: hljs.BINARY_NUMBER_RE,
    relevance: 0
  };
  hljs.CSS_NUMBER_MODE = {
    className: 'number',
    begin: hljs.NUMBER_RE + '(' +
      '%|em|ex|ch|rem'  +
      '|vw|vh|vmin|vmax' +
      '|cm|mm|in|pt|pc|px' +
      '|deg|grad|rad|turn' +
      '|s|ms' +
      '|Hz|kHz' +
      '|dpi|dpcm|dppx' +
      ')?',
    relevance: 0
  };
  hljs.REGEXP_MODE = {
    className: 'regexp',
    begin: /\//, end: /\/[gimuy]*/,
    illegal: /\n/,
    contains: [
      hljs.BACKSLASH_ESCAPE,
      {
        begin: /\[/, end: /\]/,
        relevance: 0,
        contains: [hljs.BACKSLASH_ESCAPE]
      }
    ]
  };
  hljs.TITLE_MODE = {
    className: 'title',
    begin: hljs.IDENT_RE,
    relevance: 0
  };
  hljs.UNDERSCORE_TITLE_MODE = {
    className: 'title',
    begin: hljs.UNDERSCORE_IDENT_RE,
    relevance: 0
  };

  /*
Language: JavaScript
Category: common, scripting
*/

hljs.registerLanguage("javascript", function(hljs) {
  return {
    aliases: ['js'],
    keywords: {
      keyword:
        'in of if for while finally var new function do return void else break catch ' +
        'instanceof with throw case default try this switch continue typeof delete ' +
        'let yield const export super debugger as async await ' +
        // ECMAScript 6 modules import
        'import from as'
      ,
      literal:
        'true false null undefined NaN Infinity',
      built_in:
        'eval isFinite isNaN parseFloat parseInt decodeURI decodeURIComponent ' +
        'encodeURI encodeURIComponent escape unescape Object Function Boolean Error ' +
        'EvalError InternalError RangeError ReferenceError StopIteration SyntaxError ' +
        'TypeError URIError Number Math Date String RegExp Array Float32Array ' +
        'Float64Array Int16Array Int32Array Int8Array Uint16Array Uint32Array ' +
        'Uint8Array Uint8ClampedArray ArrayBuffer DataView JSON Intl arguments require ' +
        'module console window document Symbol Set Map WeakSet WeakMap Proxy Reflect ' +
        'Promise'
    },
    contains: [
      {
        className: 'meta',
        relevance: 10,
        begin: /^\s*['"]use (strict|asm)['"]/
      },
      {
        className: 'meta',
        begin: /^#!/, end: /$/
      },
      hljs.APOS_STRING_MODE,
      hljs.QUOTE_STRING_MODE,
      { // template string
        className: 'string',
        begin: '`', end: '`',
        contains: [
          hljs.BACKSLASH_ESCAPE,
          {
            className: 'subst',
            begin: '\\$\\{', end: '\\}'
          }
        ]
      },
      hljs.C_LINE_COMMENT_MODE,
      hljs.C_BLOCK_COMMENT_MODE,
      {
        className: 'number',
        variants: [
          { begin: '\\b(0[bB][01]+)' },
          { begin: '\\b(0[oO][0-7]+)' },
          { begin: hljs.C_NUMBER_RE }
        ],
        relevance: 0
      },
      { // "value" container
        begin: '(' + hljs.RE_STARTERS_RE + '|\\b(case|return|throw)\\b)\\s*',
        keywords: 'return throw case',
        contains: [
          hljs.C_LINE_COMMENT_MODE,
          hljs.C_BLOCK_COMMENT_MODE,
          hljs.REGEXP_MODE,
          { // E4X / JSX
            begin: /</, end: />\s*[);\]]/,
            relevance: 0,
            subLanguage: 'xml'
          }
        ],
        relevance: 0
      },
      {
        className: 'function',
        beginKeywords: 'function', end: /\{/, excludeEnd: true,
        contains: [
          hljs.inherit(hljs.TITLE_MODE, {begin: /[A-Za-z$_][0-9A-Za-z$_]*/}),
          {
            className: 'params',
            begin: /\(/, end: /\)/,
            excludeBegin: true,
            excludeEnd: true,
            contains: [
              hljs.C_LINE_COMMENT_MODE,
              hljs.C_BLOCK_COMMENT_MODE
            ]
          }
        ],
        illegal: /\[|%/
      },
      {
        begin: /\$[(.]/ // relevance booster for a pattern common to JS libs: `$(something)` and `$.something`
      },
      {
        begin: '\\.' + hljs.IDENT_RE, relevance: 0 // hack: prevents detection of keywords after dots
      },
      { // ES6 class
        className: 'class',
        beginKeywords: 'class', end: /[{;=]/, excludeEnd: true,
        illegal: /[:"\[\]]/,
        contains: [
          {beginKeywords: 'extends'},
          hljs.UNDERSCORE_TITLE_MODE
        ]
      },
      {
        beginKeywords: 'constructor', end: /\{/, excludeEnd: true
      }
    ],
    illegal: /#(?!!)/
  };
});
return hljs;
}));

define('js/Code',["jquery", "hljs"], function($, hljs) {

	function Code(file) {

		var dialog = null;

		this.onBind = function(element) {

			$(element).load("html/code.html", function() {

				dialog = element.firstChild;
			});
		};

		this.title =
			new Text(function() { return file; });

		this.code =
			new Click(function() {

				$(dialog).modal("show");
			});

		this.text =
			new Init(function(element) {

				$(element).load("js/" + file, function() {

					hljs.highlightBlock(element);
				});
			});
	}

	return Code;
});

define('js/pieces/RouterPiece',["./Library", "./Route"], function RouterPiece(Library, Route) {

	function RouterPiece(page) {

		var self = this;

		this.datumPiecesPage = page;

		var router;

		var initialised;

		this.onBind = function(element) {

			initialised = false;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			var container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPage";

			element.appendChild(hidden);
			element.appendChild(container);

			router = registerRoute(route);
		};

		this.route =
			new Library.Binding({

				init: function() {

					router.setUpdating();
				},
				update: function() {

					router.update(this);
					initialised = true;
				}
			});

		function registerRoute(route) {

			var word;

			if (typeof page.route == "function") {

				word = getWord(
					function() { return page.route(); },
					function(value) { page.route(value); },
					route);
			}
			else {

				word = getWord(
					function() { return page.route; },
					function(value) { page.route = value; },
					route);
			}

			return route.addRoute(word);
		}

		function getWord(get, set, route) {

			return {

				set: function(word, routeIndex, callback) {

					callback();
					set(word && decodeURIComponent(word));

					if (!initialised) {

						route.update(routeIndex);
					}
				},
				get: function(nonBlank, reference) {

					if (reference == self) {

						return encodeURIComponent(get());
					}
				}
			};
		}
	}

	return RouterPiece;
});

define('js/Router',[
	"jquery",
	"js/Code",
	"js/pieces/RouterPiece"
], function(
	$,
	Code,
	RouterPiece) {

	function Router() {

		// Animal name property.
		var animal = new Datum("");

		// The router piece looks for a property named route.
		this.route = animal;

		// Datum calls this method when the object is bound to an element.
		this.onBind = function(element) {

			// Load the template.
			$(element).load("html/router.html");
		};

		// Property that binds to the animal input.
		this.animal = new Value(animal);

		// The update callback is called whenever the animal is updated.
		this.image =
			new Update(function(element) {

				// Display the image.
				element.src =
					"images/animals/" + animal().toLowerCase() + ".jpg";
			});

		this.code = new Code("Router.js");

		// Wrap the object in the router piece.
		return new RouterPiece(this);
	}

	return Router;
});

define('js/Links',["jquery"], function($) {

	function Links() {

		this.onBind = function(element) {

			$(element).load("html/links.html");
		};
	}

	return Links;
});

define('js/pieces/FadeNavPiece',[
	"./Library",
	"./Route",
	"./Placeholder"
],
function FadeNavPiece(
	Library,
	Route,
	Placeholder) {

	function FadeNavPiece(pages) {

		var self = this;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var router;

		var currentElement = null;

		var oldElement = null;

		this.datumPiecesNewPage = null;

		this.datumPiecesOldPage = null;

		this.onBind = function(element) {

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			var route = Route.get();

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			currentElement = document.createElement("DIV");
			currentElement.dataset.bind = "datumPiecesNewPage";

			oldElement = document.createElement("DIV");
			oldElement.dataset.bind = "datumPiecesOldPage";
			oldElement.style.position = "absolute";

			element.appendChild(oldElement);
			element.appendChild(currentElement);
			element.style.position = "relative";
			element.style.paddingTop = "1px";

			router =
				route.addRoute({

					set: function(word, routeIndex, callback) {

						routePage(word, callback);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					setPage(i, callback);

					return;
				}
			}

			if (!self.datumPiecesNewPage) {

				setPage(0, callback);
			}
		}

		function setPage(index, callback) {

			if (self.datumPiecesNewPage == pages[index].page) {

				return;
			}

			callback();
			self.datumPiecesNewPage = pages[index].page;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var oldIndex = Math.max(currentIndex, 0);

			currentIndex = index;
			activeIndex(index);

			if (oldIndex != index) {

				router.changePage();
			}

			router.update();

			oldElement.style.opacity = "1";
			oldElement.style.removeProperty("transition");

			oldElement.style.width =
				oldElement.parentElement.offsetWidth + "px";

			currentElement.style.opacity = "0";
			currentElement.style.removeProperty("transition");

			this.datumPiecesNewPage = {};

			var oldPage = getOldPage(currentElement);

			this.datumPiecesOldPage = new Placeholder(oldPage);
			this.datumPiecesNewPage = pages[index].page;

			setTimeout(function() {

				oldElement.style.opacity = "0";
				oldElement.style.transition = "opacity 0.5s";

				currentElement.style.opacity = "1";
				currentElement.style.transition = "opacity 0.5s";

				setTimeout(function() {

					self.datumPiecesOldPage = null;
				}, 500);
			}, 10);
		};

		function getOldPage(element) {

			var children = element.children;
			var oldPage = new Array(children.length);

			for (var i = children.length - 1; i >= 0; i--) {

				oldPage[i] = children[i];
				element.removeChild(children[i]);
			}

			return oldPage;
		}

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return FadeNavPiece;
});

define('js/fade/Options',["jquery"], function($) {

	function Options(showPage) {

		this.onBind = function(element) {

			$(element).load("html/fade/options.html");
		};

		this.routing = new Click(function() {

			showPage(1);
		});

		this.modular = new Click(function() {

			showPage(2);
		});

		this.animation = new Click(function() {

			showPage(3);
		});

		this.blue = new Click(function() {

			showPage(4);
		});
	}

	return Options;
});

define('js/fade/Routing',["jquery"], function($) {

	function Routing(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/routing.html");
		};

		this.back = new Click(back);
	}

	return Routing;
});

define('js/fade/Modular',["jquery"], function($) {

	function Modular(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/modular.html");
		};

		this.back = new Click(back);
	}

	return Modular;
});

define('js/fade/Animation',["jquery"], function($) {

	function Animation(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/animation.html");
		};

		this.back = new Click(back);
	}

	return Animation;
});

define('js/fade/Blue',[], function() {

	function Blue(back) {

		this.onBind = function(element) {

			$(element).load("html/fade/blue.html");
		};

		this.back = new Click(back);
	}

	return Blue;
});

define('js/fade/Fade',[
	"jquery",
	"js/pieces/FadeNavPiece",
	"js/fade/Options",
	"js/fade/Routing",
	"js/fade/Modular",
	"js/fade/Animation",
	"js/fade/Blue",
	"js/Code"
],
function(
	$,
	FadeNavPiece,
	Options,
	Routing,
	Modular,
	Animation,
	Blue,
	Code) {

	function Fade() {

		var self = this;

		this.onBind = function(element) {

			$(element).load("html/fade/fade.html");
		};

		function showPage(index) {

			self.fade.showPage(index);
		}

		function back() {

			self.fade.showPage(0);
		}

		this.fade =
			new FadeNavPiece([

				{ route: "", page: new Options(showPage) },
				{ route: "routing", page: new Routing(back) },
				{ route: "modular", page: new Modular(back) },
				{ route: "animation", page: new Animation(back) },
				{ route: "blue", page: new Blue(back) }
			]);

		this.code = new Code("fade/Fade.js");
	}

	return Fade;
});

define('js/pieces/CompoundWord',["./Library"], function() {

	function CompoundWord(getCurrentIndex) {

		var words = [];

		var router;

		this.get = function(nonBlank, reference) {

			var word = "";

			for (var i = 0; i < words.length; i++) {

				if (words[i]) {

					var got = words[i].get(nonBlank, reference);

					if (getCurrentIndex() == i) {

						word = got;
					}
				}
			}

			return word;
		};

		this.set = function(word, routeIndex, callback) {

			if (words[getCurrentIndex()]) {

				words[getCurrentIndex()].set(word, routeIndex, callback);
			}
		};

		this.add = function(i, word) {

			words[i] = word;
		};

		this.remove = function(i) {

			words.splice(i, 1);
		};

		this.hasIndex = function(i) {

			return !!words[i];
		};

		this.setRouter = function(r) {

			router = r;
		};

		this.getRouter = function() {

			return router;
		};
	}

	return CompoundWord;
});

define('js/pieces/Subroute',["./CompoundWord"], function(CompoundWord) {

	function Subroute(route, getCurrentIndex, showPage) {

		var words = [];

		var scrollIndex = -1;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word, simple) {

			dispose();

			if (scrollIndex == -1) {

				return route.addRoute(word);
			}

			var index = scrollIndex;

			scrollIndex = -1;

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					var subrouter = getRouter(words[i].getRouter().get(), index, simple);

					subrouter.setUpdating();
					words[i].add(index, word);
					word.set(subrouter.getWord(), subrouter.getIndex(), function() {});

					return subrouter;
				}
			}

			var newWord = new CompoundWord(getCurrentIndex);
			var newIndex = words.length;
			var router = getRouter(route.addRoute(newWord), index, simple);

			words[newIndex] = newWord;
			words[newIndex].setRouter(router);
			words[newIndex].add(index, word);
			word.set(router.getWord(), router.getIndex(), function() {});

			return router;
		};

		function dispose() {

			for (var i = 0; i < words.length; i++) {

				if (words[i].dispose) {

					words.splice(i, 1);
				}
			}
		}

		function getRouter(router, index, simple) {

			if (simple) {

				return router;
			}

			return {

				setUpdating: function() {

					router.setUpdating();
				},
				changePage: function() {

					for (var i = index + 1; i < words.length; i++) {

						words[i].remove(getCurrentIndex());
					}
				},
				update: function(reference) {

					if (getCurrentIndex() != index) {

						router.setUpdating();

						showPage(index);

						eventuallyUpdate(router, index, 100, reference);
					}

					router.update(reference);
				},
				getIndex: function() {

					return router.getIndex();
				},
				getWord: function() {

					if (getCurrentIndex() == index) {

						return router.getWord();
					}
					else {

						return "";
					}
				},
				get: function() {

					return router;
				}
			};
		}

		function eventuallyUpdate(router, index, retry, reference) {

			if (getCurrentIndex() == index) {

				setTimeout(function() {

					router.update(reference);
				}, 50);
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyUpdate(router, index, --retry, reference);
				}, 10);
			}
			else {

				router.update(reference);
			}
		}

		this.update = function(index) {

			route.update(index);
		};

		this.callHome = function(index) {

			scrollIndex = index;
		};
	}

	return Subroute;
});

define('js/pieces/Page',["./Library"], function Page(Library) {

	function Page(index, page, parent) {

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var page = document.createElement("DIV");
			page.dataset.bind = "content";

			var update = document.createElement("DIV");
			update.dataset.bind = "update";

			update.appendChild(page);
			element.appendChild(update);
		};

		this.update = new Library.Binding({

			events: {

				__PIECES_BIND__: function(event) {

					event.stopPropagation();
					parent.callHome(index);
				}
			}
		});

		this.content = page;
	}

	return Page;
});

define('js/pieces/ScrollNavPiece',[
	"./AddEventListener",
	"./Library",
	"./Route",
	"./Subroute",
	"./Page"
], function ScrollNavPiece(
	addEventListener,
	Library,
	Route,
	Subroute,
	Page) {

	var moved = false;

	var scrolls = [];

	var highestIndex = -1;

	function scroll() {

		if (moved) {

			moved = false;

			return;
		}

		for (var i = 0; i < scrolls.length; i++) {

			scrolls[i]();
		}
	}

	addEventListener("scroll", scroll);

	function ScrollNavPiece(pages) {

		var initialised = false;

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		var router;

		var subroute;

		this.datumPiecesPages = [];

		this.onBind = function(element) {

			var self = this;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			route = Route.get();

			subroute = subroute ||
				new Subroute(
					route,
					function() { return currentIndex; },
					function(index) { self.showPage(index); });

			Route.set(subroute);

			this.datumPiecesPages = [];

			for (var i = 0; i < pages.length; i++) {

				this.datumPiecesPages.push(new Page(i, pages[i].page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";
			container.appendChild(page);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "hidden";
			hidden.style.display = "none";

			element.appendChild(container);
			element.appendChild(hidden);

			router =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word, routeIndex);
						route.update(routeIndex);
					},
					get: function(nonBlank) {

						if (nonBlank && currentIndex < 0) {

							return pages[0].route;
						}
						else if (pages[currentIndex]) {

							return pages[currentIndex].route;
						}
						else {

							return "";
						}
					}
				}, true);
		};

		function routePage(hash, routeIndex) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					highestIndex = Math.max(highestIndex, routeIndex);

					eventuallyScroll(i, routeIndex, 100);

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			initialised = true;
			currentIndex = -1;
			activeIndex(-1);
		}

		function eventuallyScroll(index, routeIndex, retry) {

			var child = container.children[index];

			if (highestIndex > routeIndex) {

				initialise(index);
			}
			else if (child && child.getBoundingClientRect().height) {

				initialise(index);

				highestIndex = -1;
				moved = true;

				child.scrollIntoView();
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyScroll(index, routeIndex, --retry);
				}, 10);
			}
			else if (child) {

				initialise(index);

				highestIndex = -1;
				moved = true;

				child.scrollIntoView();
			}
			else {

				initialise(index);

				highestIndex = -1;
			}
		}

		function initialise(index) {

			initialised = true;

			currentIndex = index;
			activeIndex(index);
		}

		this.hidden =
			new Library.Binding({

				init: function() {

					scrolls.push(scroll);
				},
				destroy: function() {

					scrolls.splice(scrolls.indexOf(scroll), 1);

					Route.set(route);
				}
			});

		function scroll() {

			if (!initialised) {

				return;
			}

			var children = container.children;

			var index = 0;
			var bestTop = Number.MIN_SAFE_INTEGER;
			var found = false;

			for (var i = 0; i < children.length; i++) {

				var child = children[i];
				var top = child.getBoundingClientRect().top - 50;

				if (top <= 0 && top >= bestTop) {

					bestTop = top;
					index = i;
					found = true;
				}
			}

			var oldIndex = currentIndex;

			if (found) {

				currentIndex = index;
				activeIndex(index);
			}
			else {

				currentIndex = -1;
				activeIndex(-1);
			}

			if (oldIndex != currentIndex) {

				router.update();
			}
		}

		this.showPage = function(index) {

			if (!initialised) {

				return;
			}

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});

define('js/Picture',["jquery"], function($) {

	// Load a smaller picture on smaller screens.
	var width = new Datum(innerWidth);

	var url = "https://images.unsplash.com/";

	var params = "?auto=format&fit=crop&q=80&w=";

	function Picture(id) {

		this.onBind = function(element) {

			$(element).load("html/picture.html");
		};

		// The update callback is called when the width changes.
		this.image = new Update(function(element) {

			element.src = url + id + params + Math.min(720, width());
		});
	}

	addEventListener("resize", function() {

		width(innerWidth);
	});

	return Picture;
});

define('js/Cities',[
	"jquery",
	"js/pieces/SlideNavPiece",
	"js/Picture",
	"js/Code"
], function(
	$,
	SlideNavPiece,
	Picture,
	Code) {

	function Cities() {

		this.onBind = function(element) {

			$(element).load("html/cities.html");
		};

		this.cities =
			new SlideNavPiece([
				{
					route: "london",
					page: new Picture("photo-1513635269975-59663e0ac1ad")
				},
				{
					route: "berlin",
					page: new Picture("photo-1559564484-e48b3e040ff4")
				},
				{
					route: "delhi",
					page: new Picture("photo-1513014576558-921f00d80b77")
				}
			]);

		// Click on the left to go back.
		this.left = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index > 0) {

					this.cities.showPage(--index);
				}
			},
			visible: function() {

				// Hide the back button when at the beginning.
				return this.cities.getCurrentIndex() > 0;
			}
		});

		// Click on the right to go forward.
		this.right = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index < 2) {

					this.cities.showPage(++index || 1);
				}
			},
			visible: function() {

				// Hide the forward button when at the end.
				return this.cities.getCurrentIndex() < 2;
			}
		});

		this.code = new Code("Cities.js");
	}

	return Cities;
});

define('js/Rainbow',[
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	Code) {

	function Rainbow() {

		var self = this;

		this.onBind = function(element) {

			$(element).load("html/rainbow.html");
		};

		// A rainbow has six colours right?
		this.container =
			new ScrollNavPiece([

				{ route: "red", page: stripe(0, "red") },
				{ route: "orange", page: stripe(1, "orange") },
				{ route: "yellow", page: stripe(2, "yellow") },
				{ route: "green", page: stripe(3, "green") },
				{ route: "blue", page: stripe(4, "blue") },
				{ route: "purple", page: stripe(5, "purple") }
			]);

		// Make a stripe by setting CSS classes
		// on the element to which it binds.
		function stripe(index, colour) {

			var classes = {

				stripe: function() { return true; }
			};

			classes[colour] = function() { return true; };

			return new Binding({

				click: function() {

					self.container.showPage(index);
				},
				classes: classes
			});
		}

		this.code = new Code("Rainbow.js");
	}

	return Rainbow;
});

define('js/Space',[
	"jquery",
	"js/Picture",
	"js/Code"
], function(
	$,
	Picture,
	Code) {

	function Space() {

		this.onBind = function(element) {

			$(element).load("html/space.html");
		};

		this.picture = new Picture("photo-1531306728370-e2ebd9d7bb99");

		this.code = new Code("Picture.js");
	}

	return Space;
});

define('js/Vegetables',[
	"jquery",
	"js/pieces/FadeNavPiece",
	"js/Picture",
	"js/Code"
], function(
	$,
	FadeNavPiece,
	Picture,
	Code) {

	function Vegetables() {

		var index = 0;

		this.onBind = function(element) {

			$(element).load("html/vegetables.html");
		};

		this.vegetables =
			new FadeNavPiece([
				{
					route: "carrot",
					page: new Picture("photo-1447175008436-054170c2e979")
				},
				{
					route: "cabbage",
					page: new Picture("photo-1550177564-5cf7f9279d8b")
				},
				{
					route: "squash",
					page: new Picture("photo-1507919181268-0a42063f9704")
				}
			]);

		// Click to cycle between pictures.
		this.change = new Binding({

			init: function() {

				index = Math.max(this.vegetables.getCurrentIndex(), 0);
			},
			click: function() {

				this.vegetables.showPage(++index % 3);
			}
		});

		this.code = new Code("Vegetables.js");
	}

	return Vegetables;
});

define('js/pieces/SelectNavPiece',[
	"./Library",
	"./Route"
], function SelectNavPiece(
	Library,
	Route) {

	function SelectNavPiece(pages) {

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		this.datumPiecesPages = [];

		this.onBind = function(element) {

			route = Route.get();

			this.datumPiecesPages = [];

			for (var i = 0; i < pages.length; i++) {

				this.datumPiecesPages.push(pages[i].page);
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";

			element.appendChild(container);

			route.addRoute({

				set: function(word, routeIndex) {

					routePage(word);
					route.update(routeIndex);
				},
				get: function(nonBlank) {

					if (nonBlank && currentIndex < 0) {

						return pages[0].route;
					}
					else if (pages[currentIndex]) {

						return pages[currentIndex].route;
					}
					else {

						return "";
					}
				}
			}, true);
		};

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			currentIndex = -1;
			activeIndex(-1);
		}

		this.showPage = function(index) {

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SelectNavPiece;
});

define('js/select/One',["jquery"], function($) {

	function One() {

		this.onBind = function(element) {

			$(element).load("html/select/one.html");
		};
	}

	return One;
});

define('js/select/Two',["jquery"], function($) {

	function Two() {

		this.onBind = function(element) {

			$(element).load("html/select/two.html");
		};
	}

	return Two;
});

define('js/select/Three',["jquery"], function($) {

	function Three() {

		this.onBind = function(element) {

			$(element).load("html/select/three.html");
		};
	}

	return Three;
});

define('js/select/Four',["jquery"], function($) {

	function Four() {

		this.onBind = function(element) {

			$(element).load("html/select/four.html");
		};
	}

	return Four;
});

define('js/select/Select',[
	"jquery",
	"js/pieces/SelectNavPiece",
	"js/select/One",
	"js/select/Two",
	"js/select/Three",
	"js/select/Four"
],
function(
	$,
	SelectNavPiece,
	One,
	Two,
	Three,
	Four) {

	function Select() {

		this.onBind = function(element) {

			$(element).load("html/select/select.html");
		};

		this.container =
			new SelectNavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() },
				{ route: "three", page: new Three() },
				{ route: "four", page: new Four() }
			]);
	}

	return Select;
});

define('js/Scroll',[
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/Cities",
	"js/Rainbow",
	"js/Space",
	"js/Vegetables",
	"js/select/Select",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	NavButton,
	Cities,
	Rainbow,
	Space,
	Vegetables,
	Select,
	Code) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll.html");
		};

		// Create scroll navigation container.
		this.container =
			new ScrollNavPiece([

				{ route: "cities", page: new Cities() },
				{ route: "rainbow", page: new Rainbow() },
				{ route: "vegetables", page: new Vegetables() },
				{ route: "select", page: new Select() },
				{ route: "space", page: new Space() }
			]);

		// Menu buttons.
		this.one = new NavButton(0, this.container);
		this.two = new NavButton(1, this.container);
		this.three = new NavButton(2, this.container);
		this.four = new NavButton(3, this.container);
		this.five = new NavButton(4, this.container);

		// The init callback is called to set up an element.
		this.menu =
			new Init(function(element) {

				// Use semantic UI to make the menu sticky.
				$(element).sticky();
			});

		this.code = new Code("Scroll.js");
	}

	return Scroll;
});

define('js/App',[
	"js/pieces/SlideNavPiece",
	"js/pieces/NavButton",
	"js/Router",
	"js/Links",
	"js/fade/Fade",
	"js/Scroll",
	"js/Code"
], function(
	SlideNavPiece,
	NavButton,
	Router,
	Links,
	Fade,
	Scroll,
	Code) {

	function App() {

		// Create navigation container with pages and routes.
		this.content =
			new SlideNavPiece([

				{ route: "router", page: new Router() },
				{ route: "fade", page: new Fade() },
				{ route: "scroll", page: new Scroll() },
				{ route: "code", page: new Links() }
			]);

		// Navigation buttons.
		this.router = new NavButton(0, this.content);
		this.three = new NavButton(1, this.content);
		this.scroll = new NavButton(2, this.content);
		this.links = new NavButton(3, this.content);

		// Modal dialog for showing this code (whoa meta!).
		this.code = new Code("App.js");
	}

	return App;
});

 /*
 * # Semantic UI - 2.5.0
 * https://github.com/Semantic-Org/Semantic-UI
 * http://www.semantic-ui.com/
 *
 * Copyright 2022 Contributors
 * Released under the MIT license
 * http://opensource.org/licenses/MIT
 *
 */
!function(p,h,v,b){p.site=p.fn.site=function(e){var s,i=(new Date).getTime(),o=[],t=e,n="string"==typeof t,l=[].slice.call(arguments,1),c=p.isPlainObject(e)?p.extend(!0,{},p.site.settings,e):p.extend({},p.site.settings),a=c.namespace,u=c.error,r="module-"+a,d=p(v),f=this,m=d.data(r),g={initialize:function(){g.instantiate()},instantiate:function(){g.verbose("Storing instance of site",g),m=g,d.data(r,g)},normalize:function(){g.fix.console(),g.fix.requestAnimationFrame()},fix:{console:function(){g.debug("Normalizing window.console"),console!==b&&console.log!==b||(g.verbose("Console not available, normalizing events"),g.disable.console()),void 0!==console.group&&void 0!==console.groupEnd&&void 0!==console.groupCollapsed||(g.verbose("Console group not available, normalizing events"),h.console.group=function(){},h.console.groupEnd=function(){},h.console.groupCollapsed=function(){}),void 0===console.markTimeline&&(g.verbose("Mark timeline not available, normalizing events"),h.console.markTimeline=function(){})},consoleClear:function(){g.debug("Disabling programmatic console clearing"),h.console.clear=function(){}},requestAnimationFrame:function(){g.debug("Normalizing requestAnimationFrame"),h.requestAnimationFrame===b&&(g.debug("RequestAnimationFrame not available, normalizing event"),h.requestAnimationFrame=h.requestAnimationFrame||h.mozRequestAnimationFrame||h.webkitRequestAnimationFrame||h.msRequestAnimationFrame||function(e){setTimeout(e,0)})}},moduleExists:function(e){return p.fn[e]!==b&&p.fn[e].settings!==b},enabled:{modules:function(e){var n=[];return e=e||c.modules,p.each(e,function(e,t){g.moduleExists(t)&&n.push(t)}),n}},disabled:{modules:function(e){var n=[];return e=e||c.modules,p.each(e,function(e,t){g.moduleExists(t)||n.push(t)}),n}},change:{setting:function(o,a,e,r){e="string"==typeof e?"all"===e?c.modules:[e]:e||c.modules,r=r===b||r,p.each(e,function(e,t){var n,i=!g.moduleExists(t)||(p.fn[t].settings.namespace||!1);g.moduleExists(t)&&(g.verbose("Changing default setting",o,a,t),p.fn[t].settings[o]=a,r&&i&&0<(n=p(":data(module-"+i+")")).length&&(g.verbose("Modifying existing settings",n),n[t]("setting",o,a)))})},settings:function(i,e,o){e="string"==typeof e?[e]:e||c.modules,o=o===b||o,p.each(e,function(e,t){var n;g.moduleExists(t)&&(g.verbose("Changing default setting",i,t),p.extend(!0,p.fn[t].settings,i),o&&a&&0<(n=p(":data(module-"+a+")")).length&&(g.verbose("Modifying existing settings",n),n[t]("setting",i)))})}},enable:{console:function(){g.console(!0)},debug:function(e,t){e=e||c.modules,g.debug("Enabling debug for modules",e),g.change.setting("debug",!0,e,t)},verbose:function(e,t){e=e||c.modules,g.debug("Enabling verbose debug for modules",e),g.change.setting("verbose",!0,e,t)}},disable:{console:function(){g.console(!1)},debug:function(e,t){e=e||c.modules,g.debug("Disabling debug for modules",e),g.change.setting("debug",!1,e,t)},verbose:function(e,t){e=e||c.modules,g.debug("Disabling verbose debug for modules",e),g.change.setting("verbose",!1,e,t)}},console:function(e){if(e){if(m.cache.console===b)return void g.error(u.console);g.debug("Restoring console function"),h.console=m.cache.console}else g.debug("Disabling console function"),m.cache.console=h.console,h.console={clear:function(){},error:function(){},group:function(){},groupCollapsed:function(){},groupEnd:function(){},info:function(){},log:function(){},markTimeline:function(){},warn:function(){}}},destroy:function(){g.verbose("Destroying previous site for",d),d.removeData(r)},cache:{},setting:function(e,t){if(p.isPlainObject(e))p.extend(!0,c,e);else{if(t===b)return c[e];c[e]=t}},internal:function(e,t){if(p.isPlainObject(e))p.extend(!0,g,e);else{if(t===b)return g[e];g[e]=t}},debug:function(){c.debug&&(c.performance?g.performance.log(arguments):(g.debug=Function.prototype.bind.call(console.info,console,c.name+":"),g.debug.apply(console,arguments)))},verbose:function(){c.verbose&&c.debug&&(c.performance?g.performance.log(arguments):(g.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),g.verbose.apply(console,arguments)))},error:function(){g.error=Function.prototype.bind.call(console.error,console,c.name+":"),g.error.apply(console,arguments)},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(i||t),i=t,o.push({Element:f,Name:e[0],Arguments:[].slice.call(e,1)||"","Execution Time":n})),clearTimeout(g.performance.timer),g.performance.timer=setTimeout(g.performance.display,500)},display:function(){var e=c.name+":",n=0;i=!1,clearTimeout(g.performance.timer),p.each(o,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",(console.group!==b||console.table!==b)&&0<o.length&&(console.groupCollapsed(e),console.table?console.table(o):p.each(o,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),o=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||l,t=f||t,"string"==typeof i&&r!==b&&(i=i.split(/[\. ]/),o=i.length-1,p.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(p.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==b)return a=r[n],!1;if(!p.isPlainObject(r[t])||e==o)return r[t]!==b?a=r[t]:g.error(u.method,i),!1;r=r[t]}})),p.isFunction(a)?n=a.apply(t,e):a!==b&&(n=a),p.isArray(s)?s.push(n):s!==b?s=[s,n]:n!==b&&(s=n),a}};return n?(m===b&&g.initialize(),g.invoke(t)):(m!==b&&g.destroy(),g.initialize()),s!==b?s:this},p.site.settings={name:"Site",namespace:"site",error:{console:"Console cannot be restored, most likely it was overwritten outside of module",method:"The method you called is not defined."},debug:!1,verbose:!1,performance:!0,modules:["accordion","api","checkbox","dimmer","dropdown","embed","form","modal","nag","popup","rating","shape","sidebar","state","sticky","tab","transition","visit","visibility"],siteNamespace:"site",namespaceStub:{cache:{},config:{},sections:{},section:{},utilities:{}}},p.extend(p.expr[":"],{data:p.expr.createPseudo?p.expr.createPseudo(function(t){return function(e){return!!p.data(e,t)}}):function(e,t,n){return!!p.data(e,n[3])}})}(jQuery,window,document),function(F,e,O,D){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),F.fn.form=function(x){var C,w=F(this),S=w.selector||"",k=(new Date).getTime(),T=[],A=x,R=arguments[1],P="string"==typeof A,E=[].slice.call(arguments,1);return w.each(function(){var n,l,t,e,d,c,u,f,m,i,s,o,a,g,p,r=F(this),h=this,v=[],b=!1,y={initialize:function(){y.get.settings(),P?(p===D&&y.instantiate(),y.invoke(A)):(p!==D&&p.invoke("destroy"),y.verbose("Initializing form validation",r,d),y.bindEvents(),y.set.defaults(),y.instantiate())},instantiate:function(){y.verbose("Storing instance of module",y),p=y,r.data(a,y)},destroy:function(){y.verbose("Destroying previous module",p),y.removeEvents(),r.removeData(a)},refresh:function(){y.verbose("Refreshing selector cache"),n=r.find(f.field),l=r.find(f.group),t=r.find(f.message),r.find(f.prompt),e=r.find(f.submit),r.find(f.clear),r.find(f.reset)},submit:function(){y.verbose("Submitting form",r),r.submit()},attachEvents:function(e,t){t=t||"submit",F(e).on("click"+g,function(e){y[t](),e.preventDefault()})},bindEvents:function(){y.verbose("Attaching form events"),r.on("submit"+g,y.validate.form).on("blur"+g,f.field,y.event.field.blur).on("click"+g,f.submit,y.submit).on("click"+g,f.reset,y.reset).on("click"+g,f.clear,y.clear),d.keyboardShortcuts&&r.on("keydown"+g,f.field,y.event.field.keydown),n.each(function(){var e=F(this),t=e.prop("type"),n=y.get.changeEvent(t,e);F(this).on(n+g,y.event.field.change)})},clear:function(){n.each(function(){var e=F(this),t=e.parent(),n=e.closest(l),i=n.find(f.prompt),o=e.data(u.defaultValue)||"",a=t.is(f.uiCheckbox),r=t.is(f.uiDropdown);n.hasClass(m.error)&&(y.verbose("Resetting error on field",n),n.removeClass(m.error),i.remove()),r?(y.verbose("Resetting dropdown value",t,o),t.dropdown("clear")):a?e.prop("checked",!1):(y.verbose("Resetting field value",e,o),e.val(""))})},reset:function(){n.each(function(){var e=F(this),t=e.parent(),n=e.closest(l),i=n.find(f.prompt),o=e.data(u.defaultValue),a=t.is(f.uiCheckbox),r=t.is(f.uiDropdown),s=n.hasClass(m.error);o!==D&&(s&&(y.verbose("Resetting error on field",n),n.removeClass(m.error),i.remove()),r?(y.verbose("Resetting dropdown value",t,o),t.dropdown("restore defaults")):a?(y.verbose("Resetting checkbox value",t,o),e.prop("checked",o)):(y.verbose("Resetting field value",e,o),e.val(o)))})},determine:{isValid:function(){var n=!0;return F.each(c,function(e,t){y.validate.field(t,e,!0)||(n=!1)}),n}},is:{bracketedRule:function(e){return e.type&&e.type.match(d.regExp.bracket)},shorthandFields:function(e){var t=e[Object.keys(e)[0]];return y.is.shorthandRules(t)},shorthandRules:function(e){return"string"==typeof e||F.isArray(e)},empty:function(e){return!e||0===e.length||(e.is('input[type="checkbox"]')?!e.is(":checked"):y.is.blank(e))},blank:function(e){return""===F.trim(e.val())},valid:function(e){var n=!0;return e?(y.verbose("Checking if field is valid",e),y.validate.field(c[e],e,!1)):(y.verbose("Checking if form is valid"),F.each(c,function(e,t){y.is.valid(e)||(n=!1)}),n)}},removeEvents:function(){r.off(g),n.off(g),e.off(g),n.off(g)},event:{field:{keydown:function(e){var t=F(this),n=e.which,i=t.is(f.input),o=t.is(f.checkbox),a=0<t.closest(f.uiDropdown).length,r=13;n==27&&(y.verbose("Escape key pressed blurring field"),t.blur()),e.ctrlKey||n!=r||!i||a||o||(b||(t.one("keyup"+g,y.event.field.keyup),y.submit(),y.debug("Enter pressed on input submitting form")),b=!0)},keyup:function(){b=!1},blur:function(e){var t=F(this),n=t.closest(l),i=y.get.validation(t);n.hasClass(m.error)?(y.debug("Revalidating field",t,i),i&&y.validate.field(i)):"blur"==d.on&&i&&y.validate.field(i)},change:function(e){var t=F(this),n=t.closest(l),i=y.get.validation(t);i&&("change"==d.on||n.hasClass(m.error)&&d.revalidate)&&(clearTimeout(y.timer),y.timer=setTimeout(function(){y.debug("Revalidating field",t,y.get.validation(t)),y.validate.field(i)},d.delay))}}},get:{ancillaryValue:function(e){return!(!e.type||!e.value&&!y.is.bracketedRule(e))&&(e.value!==D?e.value:e.type.match(d.regExp.bracket)[1]+"")},ruleName:function(e){return y.is.bracketedRule(e)?e.type.replace(e.type.match(d.regExp.bracket)[0],""):e.type},changeEvent:function(e,t){return"checkbox"==e||"radio"==e||"hidden"==e||t.is("select")?"change":y.get.inputEvent()},inputEvent:function(){return O.createElement("input").oninput!==D?"input":O.createElement("input").onpropertychange!==D?"propertychange":"keyup"},fieldsFromShorthand:function(e){var i={};return F.each(e,function(n,e){"string"==typeof e&&(e=[e]),i[n]={rules:[]},F.each(e,function(e,t){i[n].rules.push({type:t})})}),i},prompt:function(e,t){var n,i,o=y.get.ruleName(e),a=y.get.ancillaryValue(e),r=y.get.field(t.identifier),s=r.val(),l=F.isFunction(e.prompt)?e.prompt(s):e.prompt||d.prompt[o]||d.text.unspecifiedRule,c=-1!==l.search("{value}"),u=-1!==l.search("{name}");return c&&(l=l.replace("{value}",r.val())),u&&(i=1==(n=r.closest(f.group).find("label").eq(0)).length?n.text():r.prop("placeholder")||d.text.unspecifiedField,l=l.replace("{name}",i)),l=(l=l.replace("{identifier}",t.identifier)).replace("{ruleValue}",a),e.prompt||y.verbose("Using default validation prompt for type",l,o),l},settings:function(){var e;F.isPlainObject(x)?0<(e=Object.keys(x)).length&&(x[e[0]].identifier!==D&&x[e[0]].rules!==D)?(d=F.extend(!0,{},F.fn.form.settings,R),c=F.extend({},F.fn.form.settings.defaults,x),y.error(d.error.oldSyntax,h),y.verbose("Extending settings from legacy parameters",c,d)):(x.fields&&y.is.shorthandFields(x.fields)&&(x.fields=y.get.fieldsFromShorthand(x.fields)),d=F.extend(!0,{},F.fn.form.settings,x),c=F.extend({},F.fn.form.settings.defaults,d.fields),y.verbose("Extending settings",c,d)):(d=F.fn.form.settings,c=F.fn.form.settings.defaults,y.verbose("Using default form validation",c,d)),o=d.namespace,u=d.metadata,f=d.selector,m=d.className,i=d.regExp,s=d.error,a="module-"+o,g="."+o,p=r.data(a),y.refresh()},field:function(e){return y.verbose("Finding field with identifier",e),e=y.escape.string(e),0<n.filter("#"+e).length?n.filter("#"+e):0<n.filter('[name="'+e+'"]').length?n.filter('[name="'+e+'"]'):0<n.filter('[name="'+e+'[]"]').length?n.filter('[name="'+e+'[]"]'):0<n.filter("[data-"+u.validate+'="'+e+'"]').length?n.filter("[data-"+u.validate+'="'+e+'"]'):F("<input/>")},fields:function(e){var n=F();return F.each(e,function(e,t){n=n.add(y.get.field(t))}),n},validation:function(n){var i,o;return!!c&&(F.each(c,function(e,t){o=t.identifier||e,y.get.field(o)[0]==n[0]&&(t.identifier=o,i=t)}),i||!1)},value:function(e){var t=[];return t.push(e),y.get.values.call(h,t)[e]},values:function(e){var t=F.isArray(e)?y.get.fields(e):n,c={};return t.each(function(e,t){var n=F(t),i=(n.prop("type"),n.prop("name")),o=n.val(),a=n.is(f.checkbox),r=n.is(f.radio),s=-1!==i.indexOf("[]"),l=!!a&&n.is(":checked");i&&(s?(i=i.replace("[]",""),c[i]||(c[i]=[]),a?l?c[i].push(o||!0):c[i].push(!1):c[i].push(o)):r?c[i]!==D&&0!=c[i]||(c[i]=!!l&&(o||!0)):c[i]=a?!!l&&(o||!0):o)}),c}},has:{field:function(e){return y.verbose("Checking for existence of a field with identifier",e),"string"!=typeof(e=y.escape.string(e))&&y.error(s.identifier,e),0<n.filter("#"+e).length||(0<n.filter('[name="'+e+'"]').length||0<n.filter("[data-"+u.validate+'="'+e+'"]').length)}},escape:{string:function(e){return(e=String(e)).replace(i.escape,"\\$&")}},add:{rule:function(e,t){y.add.field(e,t)},field:function(n,e){var i={};y.is.shorthandRules(e)?(e=F.isArray(e)?e:[e],i[n]={rules:[]},F.each(e,function(e,t){i[n].rules.push({type:t})})):i[n]=e,c=F.extend({},c,i),y.debug("Adding rules",i,c)},fields:function(e){var t=e&&y.is.shorthandFields(e)?y.get.fieldsFromShorthand(e):e;c=F.extend({},c,t)},prompt:function(e,t){var n=y.get.field(e).closest(l),i=n.children(f.prompt),o=0!==i.length;t="string"==typeof t?[t]:t,y.verbose("Adding field error state",e),n.addClass(m.error),d.inline&&(o||(i=d.templates.prompt(t)).appendTo(n),i.html(t[0]),o?y.verbose("Inline errors are disabled, no inline error added",e):d.transition&&F.fn.transition!==D&&r.transition("is supported")?(y.verbose("Displaying error with css transition",d.transition),i.transition(d.transition+" in",d.duration)):(y.verbose("Displaying error with fallback javascript animation"),i.fadeIn(d.duration)))},errors:function(e){y.debug("Adding form error messages",e),y.set.error(),t.html(d.templates.error(e))}},remove:{rule:function(n,e){var i=F.isArray(e)?e:[e];if(e==D)return y.debug("Removed all rules"),void(c[n].rules=[]);c[n]!=D&&F.isArray(c[n].rules)&&F.each(c[n].rules,function(e,t){-1!==i.indexOf(t.type)&&(y.debug("Removed rule",t.type),c[n].rules.splice(e,1))})},field:function(e){var t=F.isArray(e)?e:[e];F.each(t,function(e,t){y.remove.rule(t)})},rules:function(e,n){F.isArray(e)?F.each(fields,function(e,t){y.remove.rule(t,n)}):y.remove.rule(e,n)},fields:function(e){y.remove.field(e)},prompt:function(e){var t=y.get.field(e).closest(l),n=t.children(f.prompt);t.removeClass(m.error),d.inline&&n.is(":visible")&&(y.verbose("Removing prompt for field",e),d.transition&&F.fn.transition!==D&&r.transition("is supported")?n.transition(d.transition+" out",d.duration,function(){n.remove()}):n.fadeOut(d.duration,function(){n.remove()}))}},set:{success:function(){r.removeClass(m.error).addClass(m.success)},defaults:function(){n.each(function(){var e=F(this),t=0<e.filter(f.checkbox).length?e.is(":checked"):e.val();e.data(u.defaultValue,t)})},error:function(){r.removeClass(m.success).addClass(m.error)},value:function(e,t){var n={};return n[e]=t,y.set.values.call(h,n)},values:function(e){F.isEmptyObject(e)||F.each(e,function(e,t){var n,i=y.get.field(e),o=i.parent(),a=F.isArray(t),r=o.is(f.uiCheckbox),s=o.is(f.uiDropdown),l=i.is(f.radio)&&r;0<i.length&&(a&&r?(y.verbose("Selecting multiple",t,i),o.checkbox("uncheck"),F.each(t,function(e,t){n=i.filter('[value="'+t+'"]'),o=n.parent(),0<n.length&&o.checkbox("check")})):l?(y.verbose("Selecting radio value",t,i),i.filter('[value="'+t+'"]').parent(f.uiCheckbox).checkbox("check")):r?(y.verbose("Setting checkbox value",t,o),!0===t?o.checkbox("check"):o.checkbox("uncheck")):s?(y.verbose("Setting dropdown value",t,o),o.dropdown("set selected",t)):(y.verbose("Setting field value",t,i),i.val(t)))})}},validate:{form:function(e,t){var n=y.get.values();if(b)return!1;if(v=[],y.determine.isValid()){if(y.debug("Form has no validation errors, submitting"),y.set.success(),!0!==t)return d.onSuccess.call(h,e,n)}else if(y.debug("Form has errors"),y.set.error(),d.inline||y.add.errors(v),r.data("moduleApi")!==D&&e.stopImmediatePropagation(),!0!==t)return d.onFailure.call(h,v,n)},field:function(n,e,t){t=t===D||t,"string"==typeof n&&(y.verbose("Validating field",n),n=c[e=n]);var i=n.identifier||e,o=y.get.field(i),a=!!n.depends&&y.get.field(n.depends),r=!0,s=[];return n.identifier||(y.debug("Using field name as identifier",i),n.identifier=i),o.prop("disabled")?(y.debug("Field is disabled. Skipping",i),r=!0):n.optional&&y.is.blank(o)?(y.debug("Field is optional and blank. Skipping",i),r=!0):n.depends&&y.is.empty(a)?(y.debug("Field depends on another value that is not present or empty. Skipping",a),r=!0):n.rules!==D&&F.each(n.rules,function(e,t){y.has.field(i)&&!y.validate.rule(n,t)&&(y.debug("Field is invalid",i,t.type),s.push(y.get.prompt(t,n)),r=!1)}),r?(t&&(y.remove.prompt(i,s),d.onValid.call(o)),!0):(t&&(v=v.concat(s),y.add.prompt(i,s),d.onInvalid.call(o,s)),!1)},rule:function(e,t){var n=y.get.field(e.identifier),i=(t.type,n.val()),o=y.get.ancillaryValue(t),a=y.get.ruleName(t),r=d.rules[a];if(F.isFunction(r))return i=i===D||""===i||null===i?"":F.trim(i+""),r.call(n,i,o);y.error(s.noRule,a)}},setting:function(e,t){if(F.isPlainObject(e))F.extend(!0,d,e);else{if(t===D)return d[e];d[e]=t}},internal:function(e,t){if(F.isPlainObject(e))F.extend(!0,y,e);else{if(t===D)return y[e];y[e]=t}},debug:function(){!d.silent&&d.debug&&(d.performance?y.performance.log(arguments):(y.debug=Function.prototype.bind.call(console.info,console,d.name+":"),y.debug.apply(console,arguments)))},verbose:function(){!d.silent&&d.verbose&&d.debug&&(d.performance?y.performance.log(arguments):(y.verbose=Function.prototype.bind.call(console.info,console,d.name+":"),y.verbose.apply(console,arguments)))},error:function(){d.silent||(y.error=Function.prototype.bind.call(console.error,console,d.name+":"),y.error.apply(console,arguments))},performance:{log:function(e){var t,n;d.performance&&(n=(t=(new Date).getTime())-(k||t),k=t,T.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:h,"Execution Time":n})),clearTimeout(y.performance.timer),y.performance.timer=setTimeout(y.performance.display,500)},display:function(){var e=d.name+":",n=0;k=!1,clearTimeout(y.performance.timer),F.each(T,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",S&&(e+=" '"+S+"'"),1<w.length&&(e+=" ("+w.length+")"),(console.group!==D||console.table!==D)&&0<T.length&&(console.groupCollapsed(e),console.table?console.table(T):F.each(T,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),T=[]}},invoke:function(i,e,t){var o,a,n,r=p;return e=e||E,t=h||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,F.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(F.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!F.isPlainObject(r[t])||e==o)return r[t]!==D&&(a=r[t]),!1;r=r[t]}})),F.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),F.isArray(C)?C.push(n):C!==D?C=[C,n]:n!==D&&(C=n),a}};y.initialize()}),C!==D?C:this},F.fn.form.settings={name:"Form",namespace:"form",debug:!1,verbose:!1,performance:!0,fields:!1,keyboardShortcuts:!0,on:"submit",inline:!1,delay:200,revalidate:!0,transition:"scale",duration:200,onValid:function(){},onInvalid:function(){},onSuccess:function(){return!0},onFailure:function(){return!1},metadata:{defaultValue:"default",validate:"validate"},regExp:{htmlID:/^[a-zA-Z][\w:.-]*$/g,bracket:/\[(.*)\]/i,decimal:/^\d+\.?\d*$/,email:/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,escape:/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,flags:/^\/(.*)\/(.*)?/,integer:/^\-?\d+$/,number:/^\-?\d*(\.\d+)?$/,url:/(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i},text:{unspecifiedRule:"Please enter a valid value",unspecifiedField:"This field"},prompt:{empty:"{name} must have a value",checked:"{name} must be checked",email:"{name} must be a valid e-mail",url:"{name} must be a valid url",regExp:"{name} is not formatted correctly",integer:"{name} must be an integer",decimal:"{name} must be a decimal number",number:"{name} must be set to a number",is:'{name} must be "{ruleValue}"',isExactly:'{name} must be exactly "{ruleValue}"',not:'{name} cannot be set to "{ruleValue}"',notExactly:'{name} cannot be set to exactly "{ruleValue}"',contain:'{name} must contain "{ruleValue}"',containExactly:'{name} must contain exactly "{ruleValue}"',doesntContain:'{name} cannot contain  "{ruleValue}"',doesntContainExactly:'{name} cannot contain exactly "{ruleValue}"',minLength:"{name} must be at least {ruleValue} characters",length:"{name} must be at least {ruleValue} characters",exactLength:"{name} must be exactly {ruleValue} characters",maxLength:"{name} cannot be longer than {ruleValue} characters",match:"{name} must match {ruleValue} field",different:"{name} must have a different value than {ruleValue} field",creditCard:"{name} must be a valid credit card number",minCount:"{name} must have at least {ruleValue} choices",exactCount:"{name} must have exactly {ruleValue} choices",maxCount:"{name} must have {ruleValue} or less choices"},selector:{checkbox:'input[type="checkbox"], input[type="radio"]',clear:".clear",field:"input, textarea, select",group:".field",input:"input",message:".error.message",prompt:".prompt.label",radio:'input[type="radio"]',reset:'.reset:not([type="reset"])',submit:'.submit:not([type="submit"])',uiCheckbox:".ui.checkbox",uiDropdown:".ui.dropdown"},className:{error:"error",label:"ui prompt label",pressed:"down",success:"success"},error:{identifier:"You must specify a string identifier for each field",method:"The method you called is not defined.",noRule:"There is no rule matching the one you specified",oldSyntax:"Starting in 2.0 forms now only take a single settings object. Validation settings converted to new syntax automatically."},templates:{error:function(e){var n='<ul class="list">';return F.each(e,function(e,t){n+="<li>"+t+"</li>"}),F(n+="</ul>")},prompt:function(e){return F("<div/>").addClass("ui basic red pointing prompt label").html(e[0])}},rules:{empty:function(e){return!(e===D||""===e||F.isArray(e)&&0===e.length)},checked:function(){return 0<F(this).filter(":checked").length},email:function(e){return F.fn.form.settings.regExp.email.test(e)},url:function(e){return F.fn.form.settings.regExp.url.test(e)},regExp:function(e,t){if(t instanceof RegExp)return e.match(t);var n,i=t.match(F.fn.form.settings.regExp.flags);return i&&(t=2<=i.length?i[1]:t,n=3<=i.length?i[2]:""),e.match(new RegExp(t,n))},integer:function(e,t){var n,i,o,a=F.fn.form.settings.regExp.integer;return t&&-1===["",".."].indexOf(t)&&(-1==t.indexOf("..")?a.test(t)&&(n=i=+t):(o=t.split("..",2),a.test(o[0])&&(n=+o[0]),a.test(o[1])&&(i=+o[1]))),a.test(e)&&(n===D||n<=e)&&(i===D||e<=i)},decimal:function(e){return F.fn.form.settings.regExp.decimal.test(e)},number:function(e){return F.fn.form.settings.regExp.number.test(e)},is:function(e,t){return t="string"==typeof t?t.toLowerCase():t,(e="string"==typeof e?e.toLowerCase():e)==t},isExactly:function(e,t){return e==t},not:function(e,t){return(e="string"==typeof e?e.toLowerCase():e)!=(t="string"==typeof t?t.toLowerCase():t)},notExactly:function(e,t){return e!=t},contains:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1!==e.search(new RegExp(t,"i"))},containsExactly:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1!==e.search(new RegExp(t))},doesntContain:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1===e.search(new RegExp(t,"i"))},doesntContainExactly:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1===e.search(new RegExp(t))},minLength:function(e,t){return e!==D&&e.length>=t},length:function(e,t){return e!==D&&e.length>=t},exactLength:function(e,t){return e!==D&&e.length==t},maxLength:function(e,t){return e!==D&&e.length<=t},match:function(e,t){var n;F(this);return 0<F('[data-validate="'+t+'"]').length?n=F('[data-validate="'+t+'"]').val():0<F("#"+t).length?n=F("#"+t).val():0<F('[name="'+t+'"]').length?n=F('[name="'+t+'"]').val():0<F('[name="'+t+'[]"]').length&&(n=F('[name="'+t+'[]"]')),n!==D&&e.toString()==n.toString()},different:function(e,t){var n;F(this);return 0<F('[data-validate="'+t+'"]').length?n=F('[data-validate="'+t+'"]').val():0<F("#"+t).length?n=F("#"+t).val():0<F('[name="'+t+'"]').length?n=F('[name="'+t+'"]').val():0<F('[name="'+t+'[]"]').length&&(n=F('[name="'+t+'[]"]')),n!==D&&e.toString()!==n.toString()},creditCard:function(n,e){var t,i,o={visa:{pattern:/^4/,length:[16]},amex:{pattern:/^3[47]/,length:[15]},mastercard:{pattern:/^5[1-5]/,length:[16]},discover:{pattern:/^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5]|64[4-9])|65)/,length:[16]},unionPay:{pattern:/^(62|88)/,length:[16,17,18,19]},jcb:{pattern:/^35(2[89]|[3-8][0-9])/,length:[16]},maestro:{pattern:/^(5018|5020|5038|6304|6759|676[1-3])/,length:[12,13,14,15,16,17,18,19]},dinersClub:{pattern:/^(30[0-5]|^36)/,length:[14]},laser:{pattern:/^(6304|670[69]|6771)/,length:[16,17,18,19]},visaElectron:{pattern:/^(4026|417500|4508|4844|491(3|7))/,length:[16]}},a={},r=!1,s="string"==typeof e&&e.split(",");if("string"==typeof n&&0!==n.length){if(n=n.replace(/[\-]/g,""),s&&(F.each(s,function(e,t){(i=o[t])&&(a={length:-1!==F.inArray(n.length,i.length),pattern:-1!==n.search(i.pattern)}).length&&a.pattern&&(r=!0)}),!r))return!1;if((t={number:-1!==F.inArray(n.length,o.unionPay.length),pattern:-1!==n.search(o.unionPay.pattern)}).number&&t.pattern)return!0;for(var l=n.length,c=0,u=[[0,1,2,3,4,5,6,7,8,9],[0,2,4,6,8,1,3,5,7,9]],d=0;l--;)d+=u[c][parseInt(n.charAt(l),10)],c^=1;return d%10==0&&0<d}},minCount:function(e,t){return 0==t||(1==t?""!==e:e.split(",").length>=t)},exactCount:function(e,t){return 0==t?""===e:1==t?""!==e&&-1===e.search(","):e.split(",").length==t},maxCount:function(e,t){return 0!=t&&(1==t?-1===e.search(","):e.split(",").length<=t)}}}}(jQuery,window,document),function(S,k,T){"use strict";k=void 0!==k&&k.Math==Math?k:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),S.fn.accordion=function(a){var v,r=S(this),b=(new Date).getTime(),y=[],x=a,C="string"==typeof x,w=[].slice.call(arguments,1);k.requestAnimationFrame||k.mozRequestAnimationFrame||k.webkitRequestAnimationFrame||k.msRequestAnimationFrame;return r.each(function(){var e,c=S.isPlainObject(a)?S.extend(!0,{},S.fn.accordion.settings,a):S.extend({},S.fn.accordion.settings),u=c.className,t=c.namespace,d=c.selector,s=c.error,n="."+t,i="module-"+t,o=r.selector||"",f=S(this),m=f.find(d.title),g=f.find(d.content),l=this,p=f.data(i),h={initialize:function(){h.debug("Initializing",f),h.bind.events(),c.observeChanges&&h.observeChanges(),h.instantiate()},instantiate:function(){p=h,f.data(i,h)},destroy:function(){h.debug("Destroying previous instance",f),f.off(n).removeData(i)},refresh:function(){m=f.find(d.title),g=f.find(d.content)},observeChanges:function(){"MutationObserver"in k&&((e=new MutationObserver(function(e){h.debug("DOM tree modified, updating selector cache"),h.refresh()})).observe(l,{childList:!0,subtree:!0}),h.debug("Setting up mutation observer",e))},bind:{events:function(){h.debug("Binding delegated events"),f.on(c.on+n,d.trigger,h.event.click)}},event:{click:function(){h.toggle.call(this)}},toggle:function(e){var t=e!==T?"number"==typeof e?m.eq(e):S(e).closest(d.title):S(this).closest(d.title),n=t.next(g),i=n.hasClass(u.animating),o=n.hasClass(u.active),a=o&&!i,r=!o&&i;h.debug("Toggling visibility of content",t),a||r?c.collapsible?h.close.call(t):h.debug("Cannot close accordion content collapsing is disabled"):h.open.call(t)},open:function(e){var t=e!==T?"number"==typeof e?m.eq(e):S(e).closest(d.title):S(this).closest(d.title),n=t.next(g),i=n.hasClass(u.animating);n.hasClass(u.active)||i?h.debug("Accordion already open, skipping",n):(h.debug("Opening accordion content",t),c.onOpening.call(n),c.onChanging.call(n),c.exclusive&&h.closeOthers.call(t),t.addClass(u.active),n.stop(!0,!0).addClass(u.animating),c.animateChildren&&(S.fn.transition!==T&&f.transition("is supported")?n.children().transition({animation:"fade in",queue:!1,useFailSafe:!0,debug:c.debug,verbose:c.verbose,duration:c.duration}):n.children().stop(!0,!0).animate({opacity:1},c.duration,h.resetOpacity)),n.slideDown(c.duration,c.easing,function(){n.removeClass(u.animating).addClass(u.active),h.reset.display.call(this),c.onOpen.call(this),c.onChange.call(this)}))},close:function(e){var t=e!==T?"number"==typeof e?m.eq(e):S(e).closest(d.title):S(this).closest(d.title),n=t.next(g),i=n.hasClass(u.animating),o=n.hasClass(u.active);!o&&!(!o&&i)||o&&i||(h.debug("Closing accordion content",n),c.onClosing.call(n),c.onChanging.call(n),t.removeClass(u.active),n.stop(!0,!0).addClass(u.animating),c.animateChildren&&(S.fn.transition!==T&&f.transition("is supported")?n.children().transition({animation:"fade out",queue:!1,useFailSafe:!0,debug:c.debug,verbose:c.verbose,duration:c.duration}):n.children().stop(!0,!0).animate({opacity:0},c.duration,h.resetOpacity)),n.slideUp(c.duration,c.easing,function(){n.removeClass(u.animating).removeClass(u.active),h.reset.display.call(this),c.onClose.call(this),c.onChange.call(this)}))},closeOthers:function(e){var t,n,i=e!==T?m.eq(e):S(this).closest(d.title),o=i.parents(d.content).prev(d.title),a=i.closest(d.accordion),r=d.title+"."+u.active+":visible",s=d.content+"."+u.active+":visible",l=c.closeNested?(t=a.find(r).not(o)).next(g):(t=a.find(r).not(o),n=a.find(s).find(r).not(o),(t=t.not(n)).next(g));0<t.length&&(h.debug("Exclusive enabled, closing other content",t),t.removeClass(u.active),l.removeClass(u.animating).stop(!0,!0),c.animateChildren&&(S.fn.transition!==T&&f.transition("is supported")?l.children().transition({animation:"fade out",useFailSafe:!0,debug:c.debug,verbose:c.verbose,duration:c.duration}):l.children().stop(!0,!0).animate({opacity:0},c.duration,h.resetOpacity)),l.slideUp(c.duration,c.easing,function(){S(this).removeClass(u.active),h.reset.display.call(this)}))},reset:{display:function(){h.verbose("Removing inline display from element",this),S(this).css("display",""),""===S(this).attr("style")&&S(this).attr("style","").removeAttr("style")},opacity:function(){h.verbose("Removing inline opacity from element",this),S(this).css("opacity",""),""===S(this).attr("style")&&S(this).attr("style","").removeAttr("style")}},setting:function(e,t){if(h.debug("Changing setting",e,t),S.isPlainObject(e))S.extend(!0,c,e);else{if(t===T)return c[e];S.isPlainObject(c[e])?S.extend(!0,c[e],t):c[e]=t}},internal:function(e,t){if(h.debug("Changing internal",e,t),t===T)return h[e];S.isPlainObject(e)?S.extend(!0,h,e):h[e]=t},debug:function(){!c.silent&&c.debug&&(c.performance?h.performance.log(arguments):(h.debug=Function.prototype.bind.call(console.info,console,c.name+":"),h.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?h.performance.log(arguments):(h.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),h.verbose.apply(console,arguments)))},error:function(){c.silent||(h.error=Function.prototype.bind.call(console.error,console,c.name+":"),h.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(b||t),b=t,y.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(h.performance.timer),h.performance.timer=setTimeout(h.performance.display,500)},display:function(){var e=c.name+":",n=0;b=!1,clearTimeout(h.performance.timer),S.each(y,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",o&&(e+=" '"+o+"'"),(console.group!==T||console.table!==T)&&0<y.length&&(console.groupCollapsed(e),console.table?console.table(y):S.each(y,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),y=[]}},invoke:function(i,e,t){var o,a,n,r=p;return e=e||w,t=l||t,"string"==typeof i&&r!==T&&(i=i.split(/[\. ]/),o=i.length-1,S.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(S.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==T)return a=r[n],!1;if(!S.isPlainObject(r[t])||e==o)return r[t]!==T?a=r[t]:h.error(s.method,i),!1;r=r[t]}})),S.isFunction(a)?n=a.apply(t,e):a!==T&&(n=a),S.isArray(v)?v.push(n):v!==T?v=[v,n]:n!==T&&(v=n),a}};C?(p===T&&h.initialize(),h.invoke(x)):(p!==T&&p.invoke("destroy"),h.initialize())}),v!==T?v:this},S.fn.accordion.settings={name:"Accordion",namespace:"accordion",silent:!1,debug:!1,verbose:!1,performance:!0,on:"click",observeChanges:!0,exclusive:!0,collapsible:!0,closeNested:!1,animateChildren:!0,duration:350,easing:"easeOutQuad",onOpening:function(){},onClosing:function(){},onChanging:function(){},onOpen:function(){},onClose:function(){},onChange:function(){},error:{method:"The method you called is not defined"},className:{active:"active",animating:"animating"},selector:{accordion:".accordion",title:".title",trigger:".title",content:".content"}},S.extend(S.easing,{easeOutQuad:function(e,t,n,i,o){return-i*(t/=o)*(t-2)+n}})}(jQuery,window,void document),function(T,A,R,P){"use strict";A=void 0!==A&&A.Math==Math?A:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),T.fn.checkbox=function(v){var b,e=T(this),y=e.selector||"",x=(new Date).getTime(),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1);return e.each(function(){var e,i=T.extend(!0,{},T.fn.checkbox.settings,v),t=i.className,n=i.namespace,o=i.selector,s=i.error,a="."+n,r="module-"+n,l=T(this),c=T(this).children(o.label),u=T(this).children(o.input),d=u[0],f=!1,m=!1,g=l.data(r),p=this,h={initialize:function(){h.verbose("Initializing checkbox",i),h.create.label(),h.bind.events(),h.set.tabbable(),h.hide.input(),h.observeChanges(),h.instantiate(),h.setup()},instantiate:function(){h.verbose("Storing instance of module",h),g=h,l.data(r,h)},destroy:function(){h.verbose("Destroying module"),h.unbind.events(),h.show.input(),l.removeData(r)},fix:{reference:function(){l.is(o.input)&&(h.debug("Behavior called on <input> adjusting invoked element"),l=l.closest(o.checkbox),h.refresh())}},setup:function(){h.set.initialLoad(),h.is.indeterminate()?(h.debug("Initial value is indeterminate"),h.indeterminate()):h.is.checked()?(h.debug("Initial value is checked"),h.check()):(h.debug("Initial value is unchecked"),h.uncheck()),h.remove.initialLoad()},refresh:function(){c=l.children(o.label),u=l.children(o.input),d=u[0]},hide:{input:function(){h.verbose("Modifying <input> z-index to be unselectable"),u.addClass(t.hidden)}},show:{input:function(){h.verbose("Modifying <input> z-index to be selectable"),u.removeClass(t.hidden)}},observeChanges:function(){"MutationObserver"in A&&((e=new MutationObserver(function(e){h.debug("DOM tree modified, updating selector cache"),h.refresh()})).observe(p,{childList:!0,subtree:!0}),h.debug("Setting up mutation observer",e))},attachEvents:function(e,t){var n=T(e);t=T.isFunction(h[t])?h[t]:h.toggle,0<n.length?(h.debug("Attaching checkbox events to element",e,t),n.on("click"+a,t)):h.error(s.notFound)},event:{click:function(e){var t=T(e.target);t.is(o.input)?h.verbose("Using default check action on initialized checkbox"):t.is(o.link)?h.debug("Clicking link inside checkbox, skipping toggle"):(h.toggle(),u.focus(),e.preventDefault())},keydown:function(e){var t=e.which,n=13,i=32;m=t==27?(h.verbose("Escape key pressed blurring field"),u.blur(),!0):!(e.ctrlKey||t!=i&&t!=n)&&(h.verbose("Enter/space key pressed, toggling checkbox"),h.toggle(),!0)},keyup:function(e){m&&e.preventDefault()}},check:function(){h.should.allowCheck()&&(h.debug("Checking checkbox",u),h.set.checked(),h.should.ignoreCallbacks()||(i.onChecked.call(d),i.onChange.call(d)))},uncheck:function(){h.should.allowUncheck()&&(h.debug("Unchecking checkbox"),h.set.unchecked(),h.should.ignoreCallbacks()||(i.onUnchecked.call(d),i.onChange.call(d)))},indeterminate:function(){h.should.allowIndeterminate()?h.debug("Checkbox is already indeterminate"):(h.debug("Making checkbox indeterminate"),h.set.indeterminate(),h.should.ignoreCallbacks()||(i.onIndeterminate.call(d),i.onChange.call(d)))},determinate:function(){h.should.allowDeterminate()?h.debug("Checkbox is already determinate"):(h.debug("Making checkbox determinate"),h.set.determinate(),h.should.ignoreCallbacks()||(i.onDeterminate.call(d),i.onChange.call(d)))},enable:function(){h.is.enabled()?h.debug("Checkbox is already enabled"):(h.debug("Enabling checkbox"),h.set.enabled(),i.onEnable.call(d),i.onEnabled.call(d))},disable:function(){h.is.disabled()?h.debug("Checkbox is already disabled"):(h.debug("Disabling checkbox"),h.set.disabled(),i.onDisable.call(d),i.onDisabled.call(d))},get:{radios:function(){var e=h.get.name();return T('input[name="'+e+'"]').closest(o.checkbox)},otherRadios:function(){return h.get.radios().not(l)},name:function(){return u.attr("name")}},is:{initialLoad:function(){return f},radio:function(){return u.hasClass(t.radio)||"radio"==u.attr("type")},indeterminate:function(){return u.prop("indeterminate")!==P&&u.prop("indeterminate")},checked:function(){return u.prop("checked")!==P&&u.prop("checked")},disabled:function(){return u.prop("disabled")!==P&&u.prop("disabled")},enabled:function(){return!h.is.disabled()},determinate:function(){return!h.is.indeterminate()},unchecked:function(){return!h.is.checked()}},should:{allowCheck:function(){return h.is.determinate()&&h.is.checked()&&!h.should.forceCallbacks()?(h.debug("Should not allow check, checkbox is already checked"),!1):!1!==i.beforeChecked.apply(d)||(h.debug("Should not allow check, beforeChecked cancelled"),!1)},allowUncheck:function(){return h.is.determinate()&&h.is.unchecked()&&!h.should.forceCallbacks()?(h.debug("Should not allow uncheck, checkbox is already unchecked"),!1):!1!==i.beforeUnchecked.apply(d)||(h.debug("Should not allow uncheck, beforeUnchecked cancelled"),!1)},allowIndeterminate:function(){return h.is.indeterminate()&&!h.should.forceCallbacks()?(h.debug("Should not allow indeterminate, checkbox is already indeterminate"),!1):!1!==i.beforeIndeterminate.apply(d)||(h.debug("Should not allow indeterminate, beforeIndeterminate cancelled"),!1)},allowDeterminate:function(){return h.is.determinate()&&!h.should.forceCallbacks()?(h.debug("Should not allow determinate, checkbox is already determinate"),!1):!1!==i.beforeDeterminate.apply(d)||(h.debug("Should not allow determinate, beforeDeterminate cancelled"),!1)},forceCallbacks:function(){return h.is.initialLoad()&&i.fireOnInit},ignoreCallbacks:function(){return f&&!i.fireOnInit}},can:{change:function(){return!(l.hasClass(t.disabled)||l.hasClass(t.readOnly)||u.prop("disabled")||u.prop("readonly"))},uncheck:function(){return"boolean"==typeof i.uncheckable?i.uncheckable:!h.is.radio()}},set:{initialLoad:function(){f=!0},checked:function(){h.verbose("Setting class to checked"),l.removeClass(t.indeterminate).addClass(t.checked),h.is.radio()&&h.uncheckOthers(),h.is.indeterminate()||!h.is.checked()?(h.verbose("Setting state to checked",d),u.prop("indeterminate",!1).prop("checked",!0),h.trigger.change()):h.debug("Input is already checked, skipping input property change")},unchecked:function(){h.verbose("Removing checked class"),l.removeClass(t.indeterminate).removeClass(t.checked),h.is.indeterminate()||!h.is.unchecked()?(h.debug("Setting state to unchecked"),u.prop("indeterminate",!1).prop("checked",!1),h.trigger.change()):h.debug("Input is already unchecked")},indeterminate:function(){h.verbose("Setting class to indeterminate"),l.addClass(t.indeterminate),h.is.indeterminate()?h.debug("Input is already indeterminate, skipping input property change"):(h.debug("Setting state to indeterminate"),u.prop("indeterminate",!0),h.trigger.change())},determinate:function(){h.verbose("Removing indeterminate class"),l.removeClass(t.indeterminate),h.is.determinate()?h.debug("Input is already determinate, skipping input property change"):(h.debug("Setting state to determinate"),u.prop("indeterminate",!1))},disabled:function(){h.verbose("Setting class to disabled"),l.addClass(t.disabled),h.is.disabled()?h.debug("Input is already disabled, skipping input property change"):(h.debug("Setting state to disabled"),u.prop("disabled","disabled"),h.trigger.change())},enabled:function(){h.verbose("Removing disabled class"),l.removeClass(t.disabled),h.is.enabled()?h.debug("Input is already enabled, skipping input property change"):(h.debug("Setting state to enabled"),u.prop("disabled",!1),h.trigger.change())},tabbable:function(){h.verbose("Adding tabindex to checkbox"),u.attr("tabindex")===P&&u.attr("tabindex",0)}},remove:{initialLoad:function(){f=!1}},trigger:{change:function(){var e=R.createEvent("HTMLEvents"),t=u[0];t&&(h.verbose("Triggering native change event"),e.initEvent("change",!0,!1),t.dispatchEvent(e))}},create:{label:function(){0<u.prevAll(o.label).length?(u.prev(o.label).detach().insertAfter(u),h.debug("Moving existing label",c)):h.has.label()||(c=T("<label>").insertAfter(u),h.debug("Creating label",c))}},has:{label:function(){return 0<c.length}},bind:{events:function(){h.verbose("Attaching checkbox events"),l.on("click"+a,h.event.click).on("keydown"+a,o.input,h.event.keydown).on("keyup"+a,o.input,h.event.keyup)}},unbind:{events:function(){h.debug("Removing events"),l.off(a)}},uncheckOthers:function(){var e=h.get.otherRadios();h.debug("Unchecking other radios",e),e.removeClass(t.checked)},toggle:function(){h.can.change()?h.is.indeterminate()||h.is.unchecked()?(h.debug("Currently unchecked"),h.check()):h.is.checked()&&h.can.uncheck()&&(h.debug("Currently checked"),h.uncheck()):h.is.radio()||h.debug("Checkbox is read-only or disabled, ignoring toggle")},setting:function(e,t){if(h.debug("Changing setting",e,t),T.isPlainObject(e))T.extend(!0,i,e);else{if(t===P)return i[e];T.isPlainObject(i[e])?T.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(T.isPlainObject(e))T.extend(!0,h,e);else{if(t===P)return h[e];h[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?h.performance.log(arguments):(h.debug=Function.prototype.bind.call(console.info,console,i.name+":"),h.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?h.performance.log(arguments):(h.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),h.verbose.apply(console,arguments)))},error:function(){i.silent||(h.error=Function.prototype.bind.call(console.error,console,i.name+":"),h.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:p,"Execution Time":n})),clearTimeout(h.performance.timer),h.performance.timer=setTimeout(h.performance.display,500)},display:function(){var e=i.name+":",n=0;x=!1,clearTimeout(h.performance.timer),T.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",y&&(e+=" '"+y+"'"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):T.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||k,t=p||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,T.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(T.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!T.isPlainObject(r[t])||e==o)return r[t]!==P?a=r[t]:h.error(s.method,i),!1;r=r[t]}})),T.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),T.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}};S?(g===P&&h.initialize(),h.invoke(w)):(g!==P&&g.invoke("destroy"),h.initialize())}),b!==P?b:this},T.fn.checkbox.settings={name:"Checkbox",namespace:"checkbox",silent:!1,debug:!1,verbose:!0,performance:!0,uncheckable:"auto",fireOnInit:!1,onChange:function(){},beforeChecked:function(){},beforeUnchecked:function(){},beforeDeterminate:function(){},beforeIndeterminate:function(){},onChecked:function(){},onUnchecked:function(){},onDeterminate:function(){},onIndeterminate:function(){},onEnable:function(){},onDisable:function(){},onEnabled:function(){},onDisabled:function(){},className:{checked:"checked",indeterminate:"indeterminate",disabled:"disabled",hidden:"hidden",radio:"radio",readOnly:"read-only"},error:{method:"The method you called is not defined"},selector:{checkbox:".ui.checkbox",label:"label, .box",input:'input[type="checkbox"], input[type="radio"]',link:"a[href]"}}}(jQuery,window,document),function(S,e,k,T){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),S.fn.dimmer=function(p){var h,v=S(this),b=(new Date).getTime(),y=[],x=p,C="string"==typeof x,w=[].slice.call(arguments,1);return v.each(function(){var a,t,r=S.isPlainObject(p)?S.extend(!0,{},S.fn.dimmer.settings,p):S.extend({},S.fn.dimmer.settings),n=r.selector,e=r.namespace,i=r.className,s=r.error,o="."+e,l="module-"+e,c=v.selector||"",u="ontouchstart"in k.documentElement?"touchstart":"click",d=S(this),f=this,m=d.data(l),g={preinitialize:function(){a=g.is.dimmer()?(t=d.parent(),d):(t=d,g.has.dimmer()?r.dimmerName?t.find(n.dimmer).filter("."+r.dimmerName):t.find(n.dimmer):g.create())},initialize:function(){g.debug("Initializing dimmer",r),g.bind.events(),g.set.dimmable(),g.instantiate()},instantiate:function(){g.verbose("Storing instance of module",g),m=g,d.data(l,m)},destroy:function(){g.verbose("Destroying previous module",a),g.unbind.events(),g.remove.variation(),t.off(o)},bind:{events:function(){"hover"==r.on?t.on("mouseenter"+o,g.show).on("mouseleave"+o,g.hide):"click"==r.on&&t.on(u+o,g.toggle),g.is.page()&&(g.debug("Setting as a page dimmer",t),g.set.pageDimmer()),g.is.closable()&&(g.verbose("Adding dimmer close event",a),t.on(u+o,n.dimmer,g.event.click))}},unbind:{events:function(){d.removeData(l),t.off(o)}},event:{click:function(e){g.verbose("Determining if event occurred on dimmer",e),0!==a.find(e.target).length&&!S(e.target).is(n.content)||(g.hide(),e.stopImmediatePropagation())}},addContent:function(e){var t=S(e);g.debug("Add content to dimmer",t),t.parent()[0]!==a[0]&&t.detach().appendTo(a)},create:function(){var e=S(r.template.dimmer());return r.dimmerName&&(g.debug("Creating named dimmer",r.dimmerName),e.addClass(r.dimmerName)),e.appendTo(t),e},show:function(e){e=S.isFunction(e)?e:function(){},g.debug("Showing dimmer",a,r),g.set.variation(),g.is.dimmed()&&!g.is.animating()||!g.is.enabled()?g.debug("Dimmer is already shown or disabled"):(g.animate.show(e),r.onShow.call(f),r.onChange.call(f))},hide:function(e){e=S.isFunction(e)?e:function(){},g.is.dimmed()||g.is.animating()?(g.debug("Hiding dimmer",a),g.animate.hide(e),r.onHide.call(f),r.onChange.call(f)):g.debug("Dimmer is not visible")},toggle:function(){g.verbose("Toggling dimmer visibility",a),g.is.dimmed()?g.hide():g.show()},animate:{show:function(e){e=S.isFunction(e)?e:function(){},r.useCSS&&S.fn.transition!==T&&a.transition("is supported")?(r.useFlex?(g.debug("Using flex dimmer"),g.remove.legacy()):(g.debug("Using legacy non-flex dimmer"),g.set.legacy()),"auto"!==r.opacity&&g.set.opacity(),a.transition({displayType:r.useFlex?"flex":"block",animation:r.transition+" in",queue:!1,duration:g.get.duration(),useFailSafe:!0,onStart:function(){g.set.dimmed()},onComplete:function(){g.set.active(),e()}})):(g.verbose("Showing dimmer animation with javascript"),g.set.dimmed(),"auto"==r.opacity&&(r.opacity=.8),a.stop().css({opacity:0,width:"100%",height:"100%"}).fadeTo(g.get.duration(),r.opacity,function(){a.removeAttr("style"),g.set.active(),e()}))},hide:function(e){e=S.isFunction(e)?e:function(){},r.useCSS&&S.fn.transition!==T&&a.transition("is supported")?(g.verbose("Hiding dimmer with css"),a.transition({displayType:r.useFlex?"flex":"block",animation:r.transition+" out",queue:!1,duration:g.get.duration(),useFailSafe:!0,onStart:function(){g.remove.dimmed()},onComplete:function(){g.remove.variation(),g.remove.active(),e()}})):(g.verbose("Hiding dimmer with javascript"),g.remove.dimmed(),a.stop().fadeOut(g.get.duration(),function(){g.remove.active(),a.removeAttr("style"),e()}))}},get:{dimmer:function(){return a},duration:function(){return"object"==typeof r.duration?g.is.active()?r.duration.hide:r.duration.show:r.duration}},has:{dimmer:function(){return r.dimmerName?0<d.find(n.dimmer).filter("."+r.dimmerName).length:0<d.find(n.dimmer).length}},is:{active:function(){return a.hasClass(i.active)},animating:function(){return a.is(":animated")||a.hasClass(i.animating)},closable:function(){return"auto"==r.closable?"hover"!=r.on:r.closable},dimmer:function(){return d.hasClass(i.dimmer)},dimmable:function(){return d.hasClass(i.dimmable)},dimmed:function(){return t.hasClass(i.dimmed)},disabled:function(){return t.hasClass(i.disabled)},enabled:function(){return!g.is.disabled()},page:function(){return t.is("body")},pageDimmer:function(){return a.hasClass(i.pageDimmer)}},can:{show:function(){return!a.hasClass(i.disabled)}},set:{opacity:function(e){var t=a.css("background-color"),n=t.split(","),i=n&&3==n.length,o=n&&4==n.length;e=0===r.opacity?0:r.opacity||e,t=i||o?(n[3]=e+")",n.join(",")):"rgba(0, 0, 0, "+e+")",g.debug("Setting opacity to",e),a.css("background-color",t)},legacy:function(){a.addClass(i.legacy)},active:function(){a.addClass(i.active)},dimmable:function(){t.addClass(i.dimmable)},dimmed:function(){t.addClass(i.dimmed)},pageDimmer:function(){a.addClass(i.pageDimmer)},disabled:function(){a.addClass(i.disabled)},variation:function(e){(e=e||r.variation)&&a.addClass(e)}},remove:{active:function(){a.removeClass(i.active)},legacy:function(){a.removeClass(i.legacy)},dimmed:function(){t.removeClass(i.dimmed)},disabled:function(){a.removeClass(i.disabled)},variation:function(e){(e=e||r.variation)&&a.removeClass(e)}},setting:function(e,t){if(g.debug("Changing setting",e,t),S.isPlainObject(e))S.extend(!0,r,e);else{if(t===T)return r[e];S.isPlainObject(r[e])?S.extend(!0,r[e],t):r[e]=t}},internal:function(e,t){if(S.isPlainObject(e))S.extend(!0,g,e);else{if(t===T)return g[e];g[e]=t}},debug:function(){!r.silent&&r.debug&&(r.performance?g.performance.log(arguments):(g.debug=Function.prototype.bind.call(console.info,console,r.name+":"),g.debug.apply(console,arguments)))},verbose:function(){!r.silent&&r.verbose&&r.debug&&(r.performance?g.performance.log(arguments):(g.verbose=Function.prototype.bind.call(console.info,console,r.name+":"),g.verbose.apply(console,arguments)))},error:function(){r.silent||(g.error=Function.prototype.bind.call(console.error,console,r.name+":"),g.error.apply(console,arguments))},performance:{log:function(e){var t,n;r.performance&&(n=(t=(new Date).getTime())-(b||t),b=t,y.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:f,"Execution Time":n})),clearTimeout(g.performance.timer),g.performance.timer=setTimeout(g.performance.display,500)},display:function(){var e=r.name+":",n=0;b=!1,clearTimeout(g.performance.timer),S.each(y,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",c&&(e+=" '"+c+"'"),1<v.length&&(e+=" ("+v.length+")"),(console.group!==T||console.table!==T)&&0<y.length&&(console.groupCollapsed(e),console.table?console.table(y):S.each(y,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),y=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||w,t=f||t,"string"==typeof i&&r!==T&&(i=i.split(/[\. ]/),o=i.length-1,S.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(S.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==T)return a=r[n],!1;if(!S.isPlainObject(r[t])||e==o)return r[t]!==T?a=r[t]:g.error(s.method,i),!1;r=r[t]}})),S.isFunction(a)?n=a.apply(t,e):a!==T&&(n=a),S.isArray(h)?h.push(n):h!==T?h=[h,n]:n!==T&&(h=n),a}};g.preinitialize(),C?(m===T&&g.initialize(),g.invoke(x)):(m!==T&&m.invoke("destroy"),g.initialize())}),h!==T?h:this},S.fn.dimmer.settings={name:"Dimmer",namespace:"dimmer",silent:!1,debug:!1,verbose:!1,performance:!0,useFlex:!0,dimmerName:!1,variation:!1,closable:"auto",useCSS:!0,transition:"fade",on:!1,opacity:"auto",duration:{show:500,hide:500},onChange:function(){},onShow:function(){},onHide:function(){},error:{method:"The method you called is not defined."},className:{active:"active",animating:"animating",dimmable:"dimmable",dimmed:"dimmed",dimmer:"dimmer",disabled:"disabled",hide:"hide",legacy:"legacy",pageDimmer:"page",show:"show"},selector:{dimmer:"> .ui.dimmer",content:".ui.dimmer > .content, .ui.dimmer > .content > .center"},template:{dimmer:function(){return S("<div />").attr("class","ui dimmer")}}}}(jQuery,window,document),function(Y,Z,K,J){"use strict";Z=void 0!==Z&&Z.Math==Math?Z:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),Y.fn.dropdown=function(M){var L,V=Y(this),N=Y(K),H=V.selector||"",U="ontouchstart"in K.documentElement,W=(new Date).getTime(),B=[],Q=M,X="string"==typeof Q,$=[].slice.call(arguments,1);return V.each(function(n){var e,t,i,o,a,r,s,g=Y.isPlainObject(M)?Y.extend(!0,{},Y.fn.dropdown.settings,M):Y.extend({},Y.fn.dropdown.settings),p=g.className,c=g.message,l=g.fields,h=g.keys,v=g.metadata,u=g.namespace,d=g.regExp,b=g.selector,f=g.error,m=g.templates,y="."+u,x="module-"+u,C=Y(this),w=Y(g.context),S=C.find(b.text),k=C.find(b.search),T=C.find(b.sizer),A=C.find(b.input),R=C.find(b.icon),P=0<C.prev().find(b.text).length?C.prev().find(b.text):C.prev(),E=C.children(b.menu),F=E.find(b.item),O=!1,D=!1,q=!1,j=this,z=C.data(x),I={initialize:function(){I.debug("Initializing dropdown",g),I.is.alreadySetup()?I.setup.reference():(I.setup.layout(),g.values&&I.change.values(g.values),I.refreshData(),I.save.defaults(),I.restore.selected(),I.create.id(),I.bind.events(),I.observeChanges(),I.instantiate())},instantiate:function(){I.verbose("Storing instance of dropdown",I),z=I,C.data(x,I)},destroy:function(){I.verbose("Destroying previous dropdown",C),I.remove.tabbable(),C.off(y).removeData(x),E.off(y),N.off(o),I.disconnect.menuObserver(),I.disconnect.selectObserver()},observeChanges:function(){"MutationObserver"in Z&&(r=new MutationObserver(I.event.select.mutation),s=new MutationObserver(I.event.menu.mutation),I.debug("Setting up mutation observer",r,s),I.observe.select(),I.observe.menu())},disconnect:{menuObserver:function(){s&&s.disconnect()},selectObserver:function(){r&&r.disconnect()}},observe:{select:function(){I.has.input()&&r.observe(C[0],{childList:!0,subtree:!0})},menu:function(){I.has.menu()&&s.observe(E[0],{childList:!0,subtree:!0})}},create:{id:function(){a=(Math.random().toString(16)+"000000000").substr(2,8),o="."+a,I.verbose("Creating unique id for element",a)},userChoice:function(e){var n,i,o;return!!(e=e||I.get.userValues())&&(e=Y.isArray(e)?e:[e],Y.each(e,function(e,t){!1===I.get.item(t)&&(o=g.templates.addition(I.add.variables(c.addResult,t)),i=Y("<div />").html(o).attr("data-"+v.value,t).attr("data-"+v.text,t).addClass(p.addition).addClass(p.item),g.hideAdditions&&i.addClass(p.hidden),n=n===J?i:n.add(i),I.verbose("Creating user choices for value",t,i))}),n)},userLabels:function(e){var t=I.get.userValues();t&&(I.debug("Adding user labels",t),Y.each(t,function(e,t){I.verbose("Adding custom user value"),I.add.label(t,t)}))},menu:function(){E=Y("<div />").addClass(p.menu).appendTo(C)},sizer:function(){T=Y("<span />").addClass(p.sizer).insertAfter(k)}},search:function(e){e=e!==J?e:I.get.query(),I.verbose("Searching for query",e),I.has.minCharacters(e)?I.filter(e):I.hide()},select:{firstUnfiltered:function(){I.verbose("Selecting first non-filtered element"),I.remove.selectedItem(),F.not(b.unselectable).not(b.addition+b.hidden).eq(0).addClass(p.selected)},nextAvailable:function(e){var t=(e=e.eq(0)).nextAll(b.item).not(b.unselectable).eq(0),n=e.prevAll(b.item).not(b.unselectable).eq(0);0<t.length?(I.verbose("Moving selection to",t),t.addClass(p.selected)):(I.verbose("Moving selection to",n),n.addClass(p.selected))}},setup:{api:function(){var e={debug:g.debug,urlData:{value:I.get.value(),query:I.get.query()},on:!1};I.verbose("First request, initializing API"),C.api(e)},layout:function(){C.is("select")&&(I.setup.select(),I.setup.returnedObject()),I.has.menu()||I.create.menu(),I.is.search()&&!I.has.search()&&(I.verbose("Adding search input"),k=Y("<input />").addClass(p.search).prop("autocomplete","off").insertBefore(S)),I.is.multiple()&&I.is.searchSelection()&&!I.has.sizer()&&I.create.sizer(),g.allowTab&&I.set.tabbable()},select:function(){var e=I.get.selectValues();I.debug("Dropdown initialized on a select",e),C.is("select")&&(A=C),0<A.parent(b.dropdown).length?(I.debug("UI dropdown already exists. Creating dropdown menu only"),C=A.closest(b.dropdown),I.has.menu()||I.create.menu(),E=C.children(b.menu),I.setup.menu(e)):(I.debug("Creating entire dropdown from select"),C=Y("<div />").attr("class",A.attr("class")).addClass(p.selection).addClass(p.dropdown).html(m.dropdown(e)).insertBefore(A),A.hasClass(p.multiple)&&!1===A.prop("multiple")&&(I.error(f.missingMultiple),A.prop("multiple",!0)),A.is("[multiple]")&&I.set.multiple(),A.prop("disabled")&&(I.debug("Disabling dropdown"),C.addClass(p.disabled)),A.removeAttr("class").detach().prependTo(C)),I.refresh()},menu:function(e){E.html(m.menu(e,l)),F=E.find(b.item)},reference:function(){I.debug("Dropdown behavior was called on select, replacing with closest dropdown"),C=C.parent(b.dropdown),z=C.data(x),j=C.get(0),I.refresh(),I.setup.returnedObject()},returnedObject:function(){var e=V.slice(0,n),t=V.slice(n+1);V=e.add(C).add(t)}},refresh:function(){I.refreshSelectors(),I.refreshData()},refreshItems:function(){F=E.find(b.item)},refreshSelectors:function(){I.verbose("Refreshing selector cache"),S=C.find(b.text),k=C.find(b.search),A=C.find(b.input),R=C.find(b.icon),P=0<C.prev().find(b.text).length?C.prev().find(b.text):C.prev(),E=C.children(b.menu),F=E.find(b.item)},refreshData:function(){I.verbose("Refreshing cached metadata"),F.removeData(v.text).removeData(v.value)},clearData:function(){I.verbose("Clearing metadata"),F.removeData(v.text).removeData(v.value),C.removeData(v.defaultText).removeData(v.defaultValue).removeData(v.placeholderText)},toggle:function(){I.verbose("Toggling menu visibility"),I.is.active()?I.hide():I.show()},show:function(e){if(e=Y.isFunction(e)?e:function(){},!I.can.show()&&I.is.remote()&&(I.debug("No API results retrieved, searching before show"),I.queryRemote(I.get.query(),I.show)),I.can.show()&&!I.is.active()){if(I.debug("Showing dropdown"),!I.has.message()||I.has.maxSelections()||I.has.allResultsFiltered()||I.remove.message(),I.is.allFiltered())return!0;!1!==g.onShow.call(j)&&I.animate.show(function(){I.can.click()&&I.bind.intent(),I.has.menuSearch()&&I.focusSearch(),I.set.visible(),e.call(j)})}},hide:function(e){e=Y.isFunction(e)?e:function(){},I.is.active()&&!I.is.animatingOutward()&&(I.debug("Hiding dropdown"),!1!==g.onHide.call(j)&&I.animate.hide(function(){I.remove.visible(),e.call(j)}))},hideOthers:function(){I.verbose("Finding other dropdowns to hide"),V.not(C).has(b.menu+"."+p.visible).dropdown("hide")},hideMenu:function(){I.verbose("Hiding menu  instantaneously"),I.remove.active(),I.remove.visible(),E.transition("hide")},hideSubMenus:function(){var e=E.children(b.item).find(b.menu);I.verbose("Hiding sub menus",e),e.transition("hide")},bind:{events:function(){U&&I.bind.touchEvents(),I.bind.keyboardEvents(),I.bind.inputEvents(),I.bind.mouseEvents()},touchEvents:function(){I.debug("Touch device detected binding additional touch events"),I.is.searchSelection()||I.is.single()&&C.on("touchstart"+y,I.event.test.toggle),E.on("touchstart"+y,b.item,I.event.item.mouseenter)},keyboardEvents:function(){I.verbose("Binding keyboard events"),C.on("keydown"+y,I.event.keydown),I.has.search()&&C.on(I.get.inputEvent()+y,b.search,I.event.input),I.is.multiple()&&N.on("keydown"+o,I.event.document.keydown)},inputEvents:function(){I.verbose("Binding input change events"),C.on("change"+y,b.input,I.event.change)},mouseEvents:function(){I.verbose("Binding mouse events"),I.is.multiple()&&C.on("click"+y,b.label,I.event.label.click).on("click"+y,b.remove,I.event.remove.click),I.is.searchSelection()?(C.on("mousedown"+y,I.event.mousedown).on("mouseup"+y,I.event.mouseup).on("mousedown"+y,b.menu,I.event.menu.mousedown).on("mouseup"+y,b.menu,I.event.menu.mouseup).on("click"+y,b.icon,I.event.icon.click).on("focus"+y,b.search,I.event.search.focus).on("click"+y,b.search,I.event.search.focus).on("blur"+y,b.search,I.event.search.blur).on("click"+y,b.text,I.event.text.focus),I.is.multiple()&&C.on("click"+y,I.event.click)):("click"==g.on?C.on("click"+y,I.event.test.toggle):"hover"==g.on?C.on("mouseenter"+y,I.delay.show).on("mouseleave"+y,I.delay.hide):C.on(g.on+y,I.toggle),C.on("click"+y,b.icon,I.event.icon.click).on("mousedown"+y,I.event.mousedown).on("mouseup"+y,I.event.mouseup).on("focus"+y,I.event.focus),I.has.menuSearch()?C.on("blur"+y,b.search,I.event.search.blur):C.on("blur"+y,I.event.blur)),E.on("mouseenter"+y,b.item,I.event.item.mouseenter).on("mouseleave"+y,b.item,I.event.item.mouseleave).on("click"+y,b.item,I.event.item.click)},intent:function(){I.verbose("Binding hide intent event to document"),U&&N.on("touchstart"+o,I.event.test.touch).on("touchmove"+o,I.event.test.touch),N.on("click"+o,I.event.test.hide)}},unbind:{intent:function(){I.verbose("Removing hide intent event from document"),U&&N.off("touchstart"+o).off("touchmove"+o),N.off("click"+o)}},filter:function(e){function t(){I.is.multiple()&&I.filterActive(),(e||!e&&0==I.get.activeItem().length)&&I.select.firstUnfiltered(),I.has.allResultsFiltered()?g.onNoResults.call(j,n)?g.allowAdditions?g.hideAdditions&&(I.verbose("User addition with no menu, setting empty style"),I.set.empty(),I.hideMenu()):(I.verbose("All items filtered, showing message",n),I.add.message(c.noResults)):(I.verbose("All items filtered, hiding dropdown",n),I.hideMenu()):(I.remove.empty(),I.remove.message()),g.allowAdditions&&I.add.userSuggestion(e),I.is.searchSelection()&&I.can.show()&&I.is.focusedOnSearch()&&I.show()}var n=e!==J?e:I.get.query();g.useLabels&&I.has.maxSelections()||(g.apiSettings?I.can.useAPI()?I.queryRemote(n,function(){g.filterRemoteData&&I.filterItems(n),t()}):I.error(f.noAPI):(I.filterItems(n),t()))},queryRemote:function(e,n){var t={errorDuration:!1,cache:"local",throttle:g.throttle,urlData:{query:e},onError:function(){I.add.message(c.serverError),n()},onFailure:function(){I.add.message(c.serverError),n()},onSuccess:function(e){var t=e[l.remoteValues];Y.isArray(t)&&0<t.length?(I.remove.message(),I.setup.menu({values:e[l.remoteValues]})):I.add.message(c.noResults),n()}};C.api("get request")||I.setup.api(),t=Y.extend(!0,{},t,g.apiSettings),C.api("setting",t).api("query")},filterItems:function(e){var i=e!==J?e:I.get.query(),o=null,t=I.escape.string(i),a=new RegExp("^"+t,"igm");I.has.query()&&(o=[],I.verbose("Searching for matching values",i),F.each(function(){var e,t,n=Y(this);if("both"==g.match||"text"==g.match){if(-1!==(e=String(I.get.choiceText(n,!1))).search(a))return o.push(this),!0;if("exact"===g.fullTextSearch&&I.exactSearch(i,e))return o.push(this),!0;if(!0===g.fullTextSearch&&I.fuzzySearch(i,e))return o.push(this),!0}if("both"==g.match||"value"==g.match){if(-1!==(t=String(I.get.choiceValue(n,e))).search(a))return o.push(this),!0;if("exact"===g.fullTextSearch&&I.exactSearch(i,t))return o.push(this),!0;if(!0===g.fullTextSearch&&I.fuzzySearch(i,t))return o.push(this),!0}})),I.debug("Showing only matched items",i),I.remove.filteredItem(),o&&F.not(o).addClass(p.filtered)},fuzzySearch:function(e,t){var n=t.length,i=e.length;if(e=e.toLowerCase(),t=t.toLowerCase(),n<i)return!1;if(i===n)return e===t;e:for(var o=0,a=0;o<i;o++){for(var r=e.charCodeAt(o);a<n;)if(t.charCodeAt(a++)===r)continue e;return!1}return!0},exactSearch:function(e,t){return e=e.toLowerCase(),-1<(t=t.toLowerCase()).indexOf(e)},filterActive:function(){g.useLabels&&F.filter("."+p.active).addClass(p.filtered)},focusSearch:function(e){I.has.search()&&!I.is.focusedOnSearch()&&(e?(C.off("focus"+y,b.search),k.focus(),C.on("focus"+y,b.search,I.event.search.focus)):k.focus())},forceSelection:function(){var e=F.not(p.filtered).filter("."+p.selected).eq(0),t=F.not(p.filtered).filter("."+p.active).eq(0),n=0<e.length?e:t;if(0<n.length&&!I.is.multiple())return I.debug("Forcing partial selection to selected item",n),void I.event.item.click.call(n,{},!0);g.allowAdditions&&I.set.selected(I.get.query()),I.remove.searchTerm()},change:{values:function(e){g.allowAdditions||I.clear(),I.debug("Creating dropdown with specified values",e),I.setup.menu({values:e}),Y.each(e,function(e,t){if(1==t.selected)return I.debug("Setting initial selection to",t.value),I.set.selected(t.value),!0})}},event:{change:function(){q||(I.debug("Input changed, updating selection"),I.set.selected())},focus:function(){g.showOnFocus&&!O&&I.is.hidden()&&!t&&I.show()},blur:function(e){t=K.activeElement===this,O||t||(I.remove.activeLabel(),I.hide())},mousedown:function(){I.is.searchSelection()?i=!0:O=!0},mouseup:function(){I.is.searchSelection()?i=!1:O=!1},click:function(e){Y(e.target).is(C)&&(I.is.focusedOnSearch()?I.show():I.focusSearch())},search:{focus:function(){O=!0,I.is.multiple()&&I.remove.activeLabel(),g.showOnFocus&&I.search()},blur:function(e){t=K.activeElement===this,I.is.searchSelection()&&!i&&(D||t||(g.forceSelection&&I.forceSelection(),I.hide())),i=!1}},icon:{click:function(e){R.hasClass(p.clear)?I.clear():I.can.click()&&I.toggle()}},text:{focus:function(e){O=!0,I.focusSearch()}},input:function(e){(I.is.multiple()||I.is.searchSelection())&&I.set.filtered(),clearTimeout(I.timer),I.timer=setTimeout(I.search,g.delay.search)},label:{click:function(e){var t=Y(this),n=C.find(b.label),i=n.filter("."+p.active),o=t.nextAll("."+p.active),a=t.prevAll("."+p.active),r=0<o.length?t.nextUntil(o).add(i).add(t):t.prevUntil(a).add(i).add(t);e.shiftKey?(i.removeClass(p.active),r.addClass(p.active)):e.ctrlKey?t.toggleClass(p.active):(i.removeClass(p.active),t.addClass(p.active)),g.onLabelSelect.apply(this,n.filter("."+p.active))}},remove:{click:function(){var e=Y(this).parent();e.hasClass(p.active)?I.remove.activeLabels():I.remove.activeLabels(e)}},test:{toggle:function(e){var t=I.is.multiple()?I.show:I.toggle;I.is.bubbledLabelClick(e)||I.is.bubbledIconClick(e)||I.determine.eventOnElement(e,t)&&e.preventDefault()},touch:function(e){I.determine.eventOnElement(e,function(){"touchstart"==e.type?I.timer=setTimeout(function(){I.hide()},g.delay.touch):"touchmove"==e.type&&clearTimeout(I.timer)}),e.stopPropagation()},hide:function(e){I.determine.eventInModule(e,I.hide)}},select:{mutation:function(e){I.debug("<select> modified, recreating menu");var n=!1;Y.each(e,function(e,t){if(Y(t.target).is("select")||Y(t.addedNodes).is("select"))return n=!0}),n&&(I.disconnect.selectObserver(),I.refresh(),I.setup.select(),I.set.selected(),I.observe.select())}},menu:{mutation:function(e){var t=e[0],n=t.addedNodes?Y(t.addedNodes[0]):Y(!1),i=t.removedNodes?Y(t.removedNodes[0]):Y(!1),o=n.add(i),a=o.is(b.addition)||0<o.closest(b.addition).length,r=o.is(b.message)||0<o.closest(b.message).length;a||r?(I.debug("Updating item selector cache"),I.refreshItems()):(I.debug("Menu modified, updating selector cache"),I.refresh())},mousedown:function(){D=!0},mouseup:function(){D=!1}},item:{mouseenter:function(e){var t=Y(e.target),n=Y(this),i=n.children(b.menu),o=n.siblings(b.item).children(b.menu),a=0<i.length;0<i.find(t).length||!a||(clearTimeout(I.itemTimer),I.itemTimer=setTimeout(function(){I.verbose("Showing sub-menu",i),Y.each(o,function(){I.animate.hide(!1,Y(this))}),I.animate.show(!1,i)},g.delay.show),e.preventDefault())},mouseleave:function(e){var t=Y(this).children(b.menu);0<t.length&&(clearTimeout(I.itemTimer),I.itemTimer=setTimeout(function(){I.verbose("Hiding sub-menu",t),I.animate.hide(!1,t)},g.delay.hide))},click:function(e,t){var n=Y(this),i=Y(e?e.target:""),o=n.find(b.menu),a=I.get.choiceText(n),r=I.get.choiceValue(n,a),s=0<o.length,l=0<o.find(i).length;I.has.menuSearch()&&Y(K.activeElement).blur(),l||s&&!g.allowCategorySelection||(I.is.searchSelection()&&(g.allowAdditions&&I.remove.userAddition(),I.remove.searchTerm(),I.is.focusedOnSearch()||1==t||I.focusSearch(!0)),g.useLabels||(I.remove.filteredItem(),I.set.scrollPosition(n)),I.determine.selectAction.call(this,a,r))}},document:{keydown:function(e){var t=e.which;if(I.is.inObject(t,h)){var n=C.find(b.label),i=n.filter("."+p.active),o=(i.data(v.value),n.index(i)),a=n.length,r=0<i.length,s=1<i.length,l=0===o,c=o+1==a,u=I.is.searchSelection(),d=I.is.focusedOnSearch(),f=I.is.focused(),m=d&&0===I.get.caretPosition();if(u&&!r&&!d)return;t==h.leftArrow?!f&&!m||r?r&&(e.shiftKey?I.verbose("Adding previous label to selection"):(I.verbose("Selecting previous label"),n.removeClass(p.active)),l&&!s?i.addClass(p.active):i.prev(b.siblingLabel).addClass(p.active).end(),e.preventDefault()):(I.verbose("Selecting previous label"),n.last().addClass(p.active)):t==h.rightArrow?(f&&!r&&n.first().addClass(p.active),r&&(e.shiftKey?I.verbose("Adding next label to selection"):(I.verbose("Selecting next label"),n.removeClass(p.active)),c?u?d?n.removeClass(p.active):I.focusSearch():s?i.next(b.siblingLabel).addClass(p.active):i.addClass(p.active):i.next(b.siblingLabel).addClass(p.active),e.preventDefault())):t==h.deleteKey||t==h.backspace?r?(I.verbose("Removing active labels"),c&&u&&!d&&I.focusSearch(),i.last().next(b.siblingLabel).addClass(p.active),I.remove.activeLabels(i),e.preventDefault()):m&&!r&&t==h.backspace&&(I.verbose("Removing last label on input backspace"),i=n.last().addClass(p.active),I.remove.activeLabels(i)):i.removeClass(p.active)}}},keydown:function(e){var t=e.which;if(I.is.inObject(t,h)){var n,i=F.not(b.unselectable).filter("."+p.selected).eq(0),o=E.children("."+p.active).eq(0),a=0<i.length?i:o,r=0<a.length?a.siblings(":not(."+p.filtered+")").addBack():E.children(":not(."+p.filtered+")"),s=a.children(b.menu),l=a.closest(b.menu),c=l.hasClass(p.visible)||l.hasClass(p.animating)||0<l.parent(b.menu).length,u=0<s.length,d=0<a.length,f=0<a.not(b.unselectable).length,m=t==h.delimiter&&g.allowAdditions&&I.is.multiple();if(g.allowAdditions&&g.hideAdditions&&(t==h.enter||m)&&f&&(I.verbose("Selecting item from keyboard shortcut",a),I.event.item.click.call(a,e),I.is.searchSelection()&&I.remove.searchTerm()),I.is.visible()){if(t!=h.enter&&!m||(t==h.enter&&d&&u&&!g.allowCategorySelection?(I.verbose("Pressed enter on unselectable category, opening sub menu"),t=h.rightArrow):f&&(I.verbose("Selecting item from keyboard shortcut",a),I.event.item.click.call(a,e),I.is.searchSelection()&&I.remove.searchTerm()),e.preventDefault()),d&&(t==h.leftArrow&&l[0]!==E[0]&&(I.verbose("Left key pressed, closing sub-menu"),I.animate.hide(!1,l),a.removeClass(p.selected),l.closest(b.item).addClass(p.selected),e.preventDefault()),t==h.rightArrow&&u&&(I.verbose("Right key pressed, opening sub-menu"),I.animate.show(!1,s),a.removeClass(p.selected),s.find(b.item).eq(0).addClass(p.selected),e.preventDefault())),t==h.upArrow){if(n=d&&c?a.prevAll(b.item+":not("+b.unselectable+")").eq(0):F.eq(0),r.index(n)<0)return I.verbose("Up key pressed but reached top of current menu"),void e.preventDefault();I.verbose("Up key pressed, changing active item"),a.removeClass(p.selected),n.addClass(p.selected),I.set.scrollPosition(n),g.selectOnKeydown&&I.is.single()&&I.set.selectedItem(n),e.preventDefault()}if(t==h.downArrow){if(0===(n=d&&c?n=a.nextAll(b.item+":not("+b.unselectable+")").eq(0):F.eq(0)).length)return I.verbose("Down key pressed but reached bottom of current menu"),void e.preventDefault();I.verbose("Down key pressed, changing active item"),F.removeClass(p.selected),n.addClass(p.selected),I.set.scrollPosition(n),g.selectOnKeydown&&I.is.single()&&I.set.selectedItem(n),e.preventDefault()}t==h.pageUp&&(I.scrollPage("up"),e.preventDefault()),t==h.pageDown&&(I.scrollPage("down"),e.preventDefault()),t==h.escape&&(I.verbose("Escape key pressed, closing dropdown"),I.hide())}else m&&e.preventDefault(),t!=h.downArrow||I.is.visible()||(I.verbose("Down key pressed, showing dropdown"),I.show(),e.preventDefault())}else I.has.search()||I.set.selectedLetter(String.fromCharCode(t))}},trigger:{change:function(){var e=K.createEvent("HTMLEvents"),t=A[0];t&&(I.verbose("Triggering native change event"),e.initEvent("change",!0,!1),t.dispatchEvent(e))}},determine:{selectAction:function(e,t){I.verbose("Determining action",g.action),Y.isFunction(I.action[g.action])?(I.verbose("Triggering preset action",g.action,e,t),I.action[g.action].call(j,e,t,this)):Y.isFunction(g.action)?(I.verbose("Triggering user action",g.action,e,t),g.action.call(j,e,t,this)):I.error(f.action,g.action)},eventInModule:function(e,t){var n=Y(e.target),i=0<n.closest(K.documentElement).length,o=0<n.closest(C).length;return t=Y.isFunction(t)?t:function(){},i&&!o?(I.verbose("Triggering event",t),t(),!0):(I.verbose("Event occurred in dropdown, canceling callback"),!1)},eventOnElement:function(e,t){var n=Y(e.target),i=n.closest(b.siblingLabel),o=K.body.contains(e.target),a=0===C.find(i).length,r=0===n.closest(E).length;return t=Y.isFunction(t)?t:function(){},o&&a&&r?(I.verbose("Triggering event",t),t(),!0):(I.verbose("Event occurred in dropdown menu, canceling callback"),!1)}},action:{nothing:function(){},activate:function(e,t,n){if(t=t!==J?t:e,I.can.activate(Y(n))){if(I.set.selected(t,Y(n)),I.is.multiple()&&!I.is.allFiltered())return;I.hideAndClear()}},select:function(e,t,n){if(t=t!==J?t:e,I.can.activate(Y(n))){if(I.set.value(t,e,Y(n)),I.is.multiple()&&!I.is.allFiltered())return;I.hideAndClear()}},combo:function(e,t,n){t=t!==J?t:e,I.set.selected(t,Y(n)),I.hideAndClear()},hide:function(e,t,n){I.set.value(t,e,Y(n)),I.hideAndClear()}},get:{id:function(){return a},defaultText:function(){return C.data(v.defaultText)},defaultValue:function(){return C.data(v.defaultValue)},placeholderText:function(){return"auto"!=g.placeholder&&"string"==typeof g.placeholder?g.placeholder:C.data(v.placeholderText)||""},text:function(){return S.text()},query:function(){return Y.trim(k.val())},searchWidth:function(e){return e=e!==J?e:k.val(),T.text(e),Math.ceil(T.width()+1)},selectionCount:function(){var e=I.get.values();return I.is.multiple()?Y.isArray(e)?e.length:0:""!==I.get.value()?1:0},transition:function(e){return"auto"==g.transition?I.is.upward(e)?"slide up":"slide down":g.transition},userValues:function(){var e=I.get.values();return!!e&&(e=Y.isArray(e)?e:[e],Y.grep(e,function(e){return!1===I.get.item(e)}))},uniqueArray:function(n){return Y.grep(n,function(e,t){return Y.inArray(e,n)===t})},caretPosition:function(){var e,t,n=k.get(0);return"selectionStart"in n?n.selectionStart:K.selection?(n.focus(),t=(e=K.selection.createRange()).text.length,e.moveStart("character",-n.value.length),e.text.length-t):void 0},value:function(){var e=0<A.length?A.val():C.data(v.value),t=Y.isArray(e)&&1===e.length&&""===e[0];return e===J||t?"":e},values:function(){var e=I.get.value();return""===e?"":!I.has.selectInput()&&I.is.multiple()?"string"==typeof e?e.split(g.delimiter):"":e},remoteValues:function(){var e=I.get.values(),i=!1;return e&&("string"==typeof e&&(e=[e]),Y.each(e,function(e,t){var n=I.read.remoteData(t);I.verbose("Restoring value from session data",n,t),n&&((i=i||{})[t]=n)})),i},choiceText:function(e,t){if(t=t!==J?t:g.preserveHTML,e)return 0<e.find(b.menu).length&&(I.verbose("Retrieving text of element with sub-menu"),(e=e.clone()).find(b.menu).remove(),e.find(b.menuIcon).remove()),e.data(v.text)!==J?e.data(v.text):t?Y.trim(e.html()):Y.trim(e.text())},choiceValue:function(e,t){return t=t||I.get.choiceText(e),!!e&&(e.data(v.value)!==J?String(e.data(v.value)):"string"==typeof t?Y.trim(t.toLowerCase()):String(t))},inputEvent:function(){var e=k[0];return!!e&&(e.oninput!==J?"input":e.onpropertychange!==J?"propertychange":"keyup")},selectValues:function(){var o={values:[]};return C.find("option").each(function(){var e=Y(this),t=e.html(),n=e.attr("disabled"),i=e.attr("value")!==J?e.attr("value"):t;"auto"===g.placeholder&&""===i?o.placeholder=t:o.values.push({name:t,value:i,disabled:n})}),g.placeholder&&"auto"!==g.placeholder&&(I.debug("Setting placeholder value to",g.placeholder),o.placeholder=g.placeholder),g.sortSelect?(o.values.sort(function(e,t){return e.name>t.name?1:-1}),I.debug("Retrieved and sorted values from select",o)):I.debug("Retrieved values from select",o),o},activeItem:function(){return F.filter("."+p.active)},selectedItem:function(){var e=F.not(b.unselectable).filter("."+p.selected);return 0<e.length?e:F.eq(0)},itemWithAdditions:function(e){var t=I.get.item(e),n=I.create.userChoice(e);return n&&0<n.length&&(t=0<t.length?t.add(n):n),t},item:function(i,o){var e,a,r=!1;return i=i!==J?i:I.get.values()!==J?I.get.values():I.get.text(),e=a?0<i.length:i!==J&&null!==i,a=I.is.multiple()&&Y.isArray(i),o=""===i||0===i||(o||!1),e&&F.each(function(){var e=Y(this),t=I.get.choiceText(e),n=I.get.choiceValue(e,t);if(null!==n&&n!==J)if(a)-1===Y.inArray(String(n),i)&&-1===Y.inArray(t,i)||(r=r?r.add(e):e);else if(o){if(I.verbose("Ambiguous dropdown value using strict type check",e,i),n===i||t===i)return r=e,!0}else if(String(n)==String(i)||t==i)return I.verbose("Found select item by value",n,i),r=e,!0}),r}},check:{maxSelections:function(e){return!g.maxSelections||((e=e!==J?e:I.get.selectionCount())>=g.maxSelections?(I.debug("Maximum selection count reached"),g.useLabels&&(F.addClass(p.filtered),I.add.message(c.maxSelections)),!0):(I.verbose("No longer at maximum selection count"),I.remove.message(),I.remove.filteredItem(),I.is.searchSelection()&&I.filterItems(),!1))}},restore:{defaults:function(){I.clear(),I.restore.defaultText(),I.restore.defaultValue()},defaultText:function(){var e=I.get.defaultText();e===I.get.placeholderText?(I.debug("Restoring default placeholder text",e),I.set.placeholderText(e)):(I.debug("Restoring default text",e),I.set.text(e))},placeholderText:function(){I.set.placeholderText()},defaultValue:function(){var e=I.get.defaultValue();e!==J&&(I.debug("Restoring default value",e),""!==e?(I.set.value(e),I.set.selected()):(I.remove.activeItem(),I.remove.selectedItem()))},labels:function(){g.allowAdditions&&(g.useLabels||(I.error(f.labels),g.useLabels=!0),I.debug("Restoring selected values"),I.create.userLabels()),I.check.maxSelections()},selected:function(){I.restore.values(),I.is.multiple()?(I.debug("Restoring previously selected values and labels"),I.restore.labels()):I.debug("Restoring previously selected values")},values:function(){I.set.initialLoad(),g.apiSettings&&g.saveRemoteData&&I.get.remoteValues()?I.restore.remoteValues():I.set.selected(),I.remove.initialLoad()},remoteValues:function(){var e=I.get.remoteValues();I.debug("Recreating selected from session data",e),e&&(I.is.single()?Y.each(e,function(e,t){I.set.text(t)}):Y.each(e,function(e,t){I.add.label(e,t)}))}},read:{remoteData:function(e){var t;if(Z.Storage!==J)return(t=sessionStorage.getItem(e))!==J&&t;I.error(f.noStorage)}},save:{defaults:function(){I.save.defaultText(),I.save.placeholderText(),I.save.defaultValue()},defaultValue:function(){var e=I.get.value();I.verbose("Saving default value as",e),C.data(v.defaultValue,e)},defaultText:function(){var e=I.get.text();I.verbose("Saving default text as",e),C.data(v.defaultText,e)},placeholderText:function(){var e;!1!==g.placeholder&&S.hasClass(p.placeholder)&&(e=I.get.text(),I.verbose("Saving placeholder text as",e),C.data(v.placeholderText,e))},remoteData:function(e,t){Z.Storage!==J?(I.verbose("Saving remote data to session storage",t,e),sessionStorage.setItem(t,e)):I.error(f.noStorage)}},clear:function(){I.is.multiple()&&g.useLabels?I.remove.labels():(I.remove.activeItem(),I.remove.selectedItem()),I.set.placeholderText(),I.clearValue()},clearValue:function(){I.set.value("")},scrollPage:function(e,t){var n=t||I.get.selectedItem(),i=n.closest(b.menu),o=i.outerHeight(),a=i.scrollTop(),r=F.eq(0).outerHeight(),s=Math.floor(o/r),l=(i.prop("scrollHeight"),"up"==e?a-r*s:a+r*s),c=F.not(b.unselectable),u="up"==e?c.index(n)-s:c.index(n)+s,d=("up"==e?0<=u:u<c.length)?c.eq(u):"up"==e?c.first():c.last();0<d.length&&(I.debug("Scrolling page",e,d),n.removeClass(p.selected),d.addClass(p.selected),g.selectOnKeydown&&I.is.single()&&I.set.selectedItem(d),i.scrollTop(l))},set:{filtered:function(){var e=I.is.multiple(),t=I.is.searchSelection(),n=e&&t,i=t?I.get.query():"",o="string"==typeof i&&0<i.length,a=I.get.searchWidth(),r=""!==i;e&&o&&(I.verbose("Adjusting input width",a,g.glyphWidth),k.css("width",a)),o||n&&r?(I.verbose("Hiding placeholder text"),S.addClass(p.filtered)):e&&(!n||r)||(I.verbose("Showing placeholder text"),S.removeClass(p.filtered))},empty:function(){C.addClass(p.empty)},loading:function(){C.addClass(p.loading)},placeholderText:function(e){e=e||I.get.placeholderText(),I.debug("Setting placeholder text",e),I.set.text(e),S.addClass(p.placeholder)},tabbable:function(){I.is.searchSelection()?(I.debug("Added tabindex to searchable dropdown"),k.val("").attr("tabindex",0),E.attr("tabindex",-1)):(I.debug("Added tabindex to dropdown"),C.attr("tabindex")===J&&(C.attr("tabindex",0),E.attr("tabindex",-1)))},initialLoad:function(){I.verbose("Setting initial load"),e=!0},activeItem:function(e){g.allowAdditions&&0<e.filter(b.addition).length?e.addClass(p.filtered):e.addClass(p.active)},partialSearch:function(e){var t=I.get.query().length;k.val(e.substr(0,t))},scrollPosition:function(e,t){var n,i,o,a,r=(e=e||I.get.selectedItem()).closest(b.menu),s=e&&0<e.length;t=t!==J&&t,e&&0<r.length&&s&&(e.position().top,r.addClass(p.loading),n=(i=r.scrollTop())-r.offset().top+e.offset().top,t||(a=i+r.height()<n+5,o=n-5<i),I.debug("Scrolling to active item",n),(t||o||a)&&r.scrollTop(n),r.removeClass(p.loading))},text:function(e){"select"!==g.action&&("combo"==g.action?(I.debug("Changing combo button text",e,P),g.preserveHTML?P.html(e):P.text(e)):(e!==I.get.placeholderText()&&S.removeClass(p.placeholder),I.debug("Changing text",e,S),S.removeClass(p.filtered),g.preserveHTML?S.html(e):S.text(e)))},selectedItem:function(e){var t=I.get.choiceValue(e),n=I.get.choiceText(e,!1),i=I.get.choiceText(e,!0);I.debug("Setting user selection to item",e),I.remove.activeItem(),I.set.partialSearch(n),I.set.activeItem(e),I.set.selected(t,e),I.set.text(i)},selectedLetter:function(e){var t,n=F.filter("."+p.selected),i=0<n.length&&I.has.firstLetter(n,e),o=!1;i&&(t=n.nextAll(F).eq(0),I.has.firstLetter(t,e)&&(o=t)),o||F.each(function(){if(I.has.firstLetter(Y(this),e))return o=Y(this),!1}),o&&(I.verbose("Scrolling to next value with letter",e),I.set.scrollPosition(o),n.removeClass(p.selected),o.addClass(p.selected),g.selectOnKeydown&&I.is.single()&&I.set.selectedItem(o))},direction:function(e){"auto"==g.direction?(I.remove.upward(),I.can.openDownward(e)?I.remove.upward(e):I.set.upward(e),I.is.leftward(e)||I.can.openRightward(e)||I.set.leftward(e)):"upward"==g.direction&&I.set.upward(e)},upward:function(e){(e||C).addClass(p.upward)},leftward:function(e){(e||E).addClass(p.leftward)},value:function(e,t,n){var i=I.escape.value(e),o=0<A.length,a=I.get.values(),r=e!==J?String(e):e;if(o){if(!g.allowReselection&&r==a&&(I.verbose("Skipping value update already same value",e,a),!I.is.initialLoad()))return;I.is.single()&&I.has.selectInput()&&I.can.extendSelect()&&(I.debug("Adding user option",e),I.add.optionValue(e)),I.debug("Updating input value",i,a),q=!0,A.val(i),!1===g.fireOnInit&&I.is.initialLoad()?I.debug("Input native change event ignored on initial load"):I.trigger.change(),q=!1}else I.verbose("Storing value in metadata",i,A),i!==a&&C.data(v.value,r);I.is.single()&&g.clearable&&(i?I.set.clearable():I.remove.clearable()),!1===g.fireOnInit&&I.is.initialLoad()?I.verbose("No callback on initial load",g.onChange):g.onChange.call(j,e,t,n)},active:function(){C.addClass(p.active)},multiple:function(){C.addClass(p.multiple)},visible:function(){C.addClass(p.visible)},exactly:function(e,t){I.debug("Setting selected to exact values"),I.clear(),I.set.selected(e,t)},selected:function(e,s){var l=I.is.multiple();(s=g.allowAdditions?s||I.get.itemWithAdditions(e):s||I.get.item(e))&&(I.debug("Setting selected menu item to",s),I.is.multiple()&&I.remove.searchWidth(),I.is.single()?(I.remove.activeItem(),I.remove.selectedItem()):g.useLabels&&I.remove.selectedItem(),s.each(function(){var e=Y(this),t=I.get.choiceText(e),n=I.get.choiceValue(e,t),i=e.hasClass(p.filtered),o=e.hasClass(p.active),a=e.hasClass(p.addition),r=l&&1==s.length;l?!o||a?(g.apiSettings&&g.saveRemoteData&&I.save.remoteData(t,n),g.useLabels?(I.add.label(n,t,r),I.add.value(n,t,e),I.set.activeItem(e),I.filterActive(),I.select.nextAvailable(s)):(I.add.value(n,t,e),I.set.text(I.add.variables(c.count)),I.set.activeItem(e))):i||(I.debug("Selected active value, removing label"),I.remove.selected(n)):(g.apiSettings&&g.saveRemoteData&&I.save.remoteData(t,n),I.set.text(t),I.set.value(n,t,e),e.addClass(p.active).addClass(p.selected))}))},clearable:function(){R.addClass(p.clear)}},add:{label:function(e,t,n){var i,o=I.is.searchSelection()?k:S,a=I.escape.value(e);g.ignoreCase&&(a=a.toLowerCase()),i=Y("<a />").addClass(p.label).attr("data-"+v.value,a).html(m.label(a,t)),i=g.onLabelCreate.call(i,a,t),I.has.label(e)?I.debug("User selection already exists, skipping",a):(g.label.variation&&i.addClass(g.label.variation),!0===n?(I.debug("Animating in label",i),i.addClass(p.hidden).insertBefore(o).transition(g.label.transition,g.label.duration)):(I.debug("Adding selection label",i),i.insertBefore(o)))},message:function(e){var t=E.children(b.message),n=g.templates.message(I.add.variables(e));0<t.length?t.html(n):t=Y("<div/>").html(n).addClass(p.message).appendTo(E)},optionValue:function(e){var t=I.escape.value(e);0<A.find('option[value="'+I.escape.string(t)+'"]').length||(I.disconnect.selectObserver(),I.is.single()&&(I.verbose("Removing previous user addition"),A.find("option."+p.addition).remove()),Y("<option/>").prop("value",t).addClass(p.addition).html(e).appendTo(A),I.verbose("Adding user addition as an <option>",e),I.observe.select())},userSuggestion:function(e){var t,n=E.children(b.addition),i=I.get.item(e),o=i&&i.not(b.addition).length,a=0<n.length;g.useLabels&&I.has.maxSelections()||(""===e||o?n.remove():(a?(n.data(v.value,e).data(v.text,e).attr("data-"+v.value,e).attr("data-"+v.text,e).removeClass(p.filtered),g.hideAdditions||(t=g.templates.addition(I.add.variables(c.addResult,e)),n.html(t)),I.verbose("Replacing user suggestion with new value",n)):((n=I.create.userChoice(e)).prependTo(E),I.verbose("Adding item choice to menu corresponding with user choice addition",n)),g.hideAdditions&&!I.is.allFiltered()||n.addClass(p.selected).siblings().removeClass(p.selected),I.refreshItems()))},variables:function(e,t){var n,i,o=-1!==e.search("{count}"),a=-1!==e.search("{maxCount}"),r=-1!==e.search("{term}");return I.verbose("Adding templated variables to message",e),o&&(n=I.get.selectionCount(),e=e.replace("{count}",n)),a&&(n=I.get.selectionCount(),e=e.replace("{maxCount}",g.maxSelections)),r&&(i=t||I.get.query(),e=e.replace("{term}",i)),e},value:function(e,t,n){var i,o=I.get.values();I.has.value(e)?I.debug("Value already selected"):""!==e?(i=Y.isArray(o)?(i=o.concat([e]),I.get.uniqueArray(i)):[e],I.has.selectInput()?I.can.extendSelect()&&(I.debug("Adding value to select",e,i,A),I.add.optionValue(e)):(i=i.join(g.delimiter),I.debug("Setting hidden input to delimited value",i,A)),!1===g.fireOnInit&&I.is.initialLoad()?I.verbose("Skipping onadd callback on initial load",g.onAdd):g.onAdd.call(j,e,t,n),I.set.value(i,e,t,n),I.check.maxSelections()):I.debug("Cannot select blank values from multiselect")}},remove:{active:function(){C.removeClass(p.active)},activeLabel:function(){C.find(b.label).removeClass(p.active)},empty:function(){C.removeClass(p.empty)},loading:function(){C.removeClass(p.loading)},initialLoad:function(){e=!1},upward:function(e){(e||C).removeClass(p.upward)},leftward:function(e){(e||E).removeClass(p.leftward)},visible:function(){C.removeClass(p.visible)},activeItem:function(){F.removeClass(p.active)},filteredItem:function(){g.useLabels&&I.has.maxSelections()||(g.useLabels&&I.is.multiple()?F.not("."+p.active).removeClass(p.filtered):F.removeClass(p.filtered),I.remove.empty())},optionValue:function(e){var t=I.escape.value(e),n=A.find('option[value="'+I.escape.string(t)+'"]');0<n.length&&n.hasClass(p.addition)&&(r&&(r.disconnect(),I.verbose("Temporarily disconnecting mutation observer")),n.remove(),I.verbose("Removing user addition as an <option>",t),r&&r.observe(A[0],{childList:!0,subtree:!0}))},message:function(){E.children(b.message).remove()},searchWidth:function(){k.css("width","")},searchTerm:function(){I.verbose("Cleared search term"),k.val(""),I.set.filtered()},userAddition:function(){F.filter(b.addition).remove()},selected:function(e,t){if(!(t=g.allowAdditions?t||I.get.itemWithAdditions(e):t||I.get.item(e)))return!1;t.each(function(){var e=Y(this),t=I.get.choiceText(e),n=I.get.choiceValue(e,t);I.is.multiple()?g.useLabels?(I.remove.value(n,t,e),I.remove.label(n)):(I.remove.value(n,t,e),0===I.get.selectionCount()?I.set.placeholderText():I.set.text(I.add.variables(c.count))):I.remove.value(n,t,e),e.removeClass(p.filtered).removeClass(p.active),g.useLabels&&e.removeClass(p.selected)})},selectedItem:function(){F.removeClass(p.selected)},value:function(e,t,n){var i,o=I.get.values();I.has.selectInput()?(I.verbose("Input is <select> removing selected option",e),i=I.remove.arrayValue(e,o),I.remove.optionValue(e)):(I.verbose("Removing from delimited values",e),i=(i=I.remove.arrayValue(e,o)).join(g.delimiter)),!1===g.fireOnInit&&I.is.initialLoad()?I.verbose("No callback on initial load",g.onRemove):g.onRemove.call(j,e,t,n),I.set.value(i,t,n),I.check.maxSelections()},arrayValue:function(t,e){return Y.isArray(e)||(e=[e]),e=Y.grep(e,function(e){return t!=e}),I.verbose("Removed value from delimited string",t,e),e},label:function(e,t){var n=C.find(b.label).filter("[data-"+v.value+'="'+I.escape.string(e)+'"]');I.verbose("Removing label",n),n.remove()},activeLabels:function(e){e=e||C.find(b.label).filter("."+p.active),I.verbose("Removing active label selections",e),I.remove.labels(e)},labels:function(e){e=e||C.find(b.label),I.verbose("Removing labels",e),e.each(function(){var e=Y(this),t=e.data(v.value),n=t!==J?String(t):t,i=I.is.userValue(n);!1!==g.onLabelRemove.call(e,t)?(I.remove.message(),i?(I.remove.value(n),I.remove.label(n)):I.remove.selected(n)):I.debug("Label remove callback cancelled removal")})},tabbable:function(){I.is.searchSelection()?(I.debug("Searchable dropdown initialized"),k.removeAttr("tabindex")):(I.debug("Simple selection dropdown initialized"),C.removeAttr("tabindex")),E.removeAttr("tabindex")},clearable:function(){R.removeClass(p.clear)}},has:{menuSearch:function(){return I.has.search()&&0<k.closest(E).length},search:function(){return 0<k.length},sizer:function(){return 0<T.length},selectInput:function(){return A.is("select")},minCharacters:function(e){return!g.minCharacters||(e=e!==J?String(e):String(I.get.query())).length>=g.minCharacters},firstLetter:function(e,t){var n;return!(!e||0===e.length||"string"!=typeof t)&&(n=I.get.choiceText(e,!1),(t=t.toLowerCase())==String(n).charAt(0).toLowerCase())},input:function(){return 0<A.length},items:function(){return 0<F.length},menu:function(){return 0<E.length},message:function(){return 0!==E.children(b.message).length},label:function(e){var t=I.escape.value(e),n=C.find(b.label);return g.ignoreCase&&(t=t.toLowerCase()),0<n.filter("[data-"+v.value+'="'+I.escape.string(t)+'"]').length},maxSelections:function(){return g.maxSelections&&I.get.selectionCount()>=g.maxSelections},allResultsFiltered:function(){var e=F.not(b.addition);return e.filter(b.unselectable).length===e.length},userSuggestion:function(){return 0<E.children(b.addition).length},query:function(){return""!==I.get.query()},value:function(e){return g.ignoreCase?I.has.valueIgnoringCase(e):I.has.valueMatchingCase(e)},valueMatchingCase:function(e){var t=I.get.values();return!!(Y.isArray(t)?t&&-1!==Y.inArray(e,t):t==e)},valueIgnoringCase:function(n){var e=I.get.values(),i=!1;return Y.isArray(e)||(e=[e]),Y.each(e,function(e,t){if(String(n).toLowerCase()==String(t).toLowerCase())return!(i=!0)}),i}},is:{active:function(){return C.hasClass(p.active)},animatingInward:function(){return E.transition("is inward")},animatingOutward:function(){return E.transition("is outward")},bubbledLabelClick:function(e){return Y(e.target).is("select, input")&&0<C.closest("label").length},bubbledIconClick:function(e){return 0<Y(e.target).closest(R).length},alreadySetup:function(){return C.is("select")&&C.parent(b.dropdown).data(x)!==J&&0===C.prev().length},animating:function(e){return e?e.transition&&e.transition("is animating"):E.transition&&E.transition("is animating")},leftward:function(e){return(e||E).hasClass(p.leftward)},disabled:function(){return C.hasClass(p.disabled)},focused:function(){return K.activeElement===C[0]},focusedOnSearch:function(){return K.activeElement===k[0]},allFiltered:function(){return(I.is.multiple()||I.has.search())&&!(0==g.hideAdditions&&I.has.userSuggestion())&&!I.has.message()&&I.has.allResultsFiltered()},hidden:function(e){return!I.is.visible(e)},initialLoad:function(){return e},inObject:function(n,e){var i=!1;return Y.each(e,function(e,t){if(t==n)return i=!0}),i},multiple:function(){return C.hasClass(p.multiple)},remote:function(){return g.apiSettings&&I.can.useAPI()},single:function(){return!I.is.multiple()},selectMutation:function(e){var n=!1;return Y.each(e,function(e,t){if(t.target&&Y(t.target).is("select"))return n=!0}),n},search:function(){return C.hasClass(p.search)},searchSelection:function(){return I.has.search()&&1===k.parent(b.dropdown).length},selection:function(){return C.hasClass(p.selection)},userValue:function(e){return-1!==Y.inArray(e,I.get.userValues())},upward:function(e){return(e||C).hasClass(p.upward)},visible:function(e){return e?e.hasClass(p.visible):E.hasClass(p.visible)},verticallyScrollableContext:function(){var e=w.get(0)!==Z&&w.css("overflow-y");return"auto"==e||"scroll"==e},horizontallyScrollableContext:function(){var e=w.get(0)!==Z&&w.css("overflow-X");return"auto"==e||"scroll"==e}},can:{activate:function(e){return!!g.useLabels||(!I.has.maxSelections()||!(!I.has.maxSelections()||!e.hasClass(p.active)))},openDownward:function(e){var t,n,i=e||E,o=!0;return i.addClass(p.loading),n={context:{offset:w.get(0)===Z?{top:0,left:0}:w.offset(),scrollTop:w.scrollTop(),height:w.outerHeight()},menu:{offset:i.offset(),height:i.outerHeight()}},I.is.verticallyScrollableContext()&&(n.menu.offset.top+=n.context.scrollTop),o=(t={above:n.context.scrollTop<=n.menu.offset.top-n.context.offset.top-n.menu.height,below:n.context.scrollTop+n.context.height>=n.menu.offset.top-n.context.offset.top+n.menu.height}).below?(I.verbose("Dropdown can fit in context downward",t),!0):t.below||t.above?(I.verbose("Dropdown cannot fit below, opening upward",t),!1):(I.verbose("Dropdown cannot fit in either direction, favoring downward",t),!0),i.removeClass(p.loading),o},openRightward:function(e){var t,n,i=e||E,o=!0;return i.addClass(p.loading),n={context:{offset:w.get(0)===Z?{top:0,left:0}:w.offset(),scrollLeft:w.scrollLeft(),width:w.outerWidth()},menu:{offset:i.offset(),width:i.outerWidth()}},I.is.horizontallyScrollableContext()&&(n.menu.offset.left+=n.context.scrollLeft),(t=n.menu.offset.left-n.context.offset.left+n.menu.width>=n.context.scrollLeft+n.context.width)&&(I.verbose("Dropdown cannot fit in context rightward",t),o=!1),i.removeClass(p.loading),o},click:function(){return U||"click"==g.on},extendSelect:function(){return g.allowAdditions||g.apiSettings},show:function(){return!I.is.disabled()&&(I.has.items()||I.has.message())},useAPI:function(){return Y.fn.api!==J}},animate:{show:function(e,t){var n,i=t||E,o=t?function(){}:function(){I.hideSubMenus(),I.hideOthers(),I.set.active()};e=Y.isFunction(e)?e:function(){},I.verbose("Doing menu show animation",i),I.set.direction(t),n=I.get.transition(t),I.is.selection()&&I.set.scrollPosition(I.get.selectedItem(),!0),(I.is.hidden(i)||I.is.animating(i))&&("none"==n?(o(),i.transition("show"),e.call(j)):Y.fn.transition!==J&&C.transition("is supported")?i.transition({animation:n+" in",debug:g.debug,verbose:g.verbose,duration:g.duration,queue:!0,onStart:o,onComplete:function(){e.call(j)}}):I.error(f.noTransition,n))},hide:function(e,t){var n=t||E,i=(t?g.duration:g.duration,t?function(){}:function(){I.can.click()&&I.unbind.intent(),I.remove.active()}),o=I.get.transition(t);e=Y.isFunction(e)?e:function(){},(I.is.visible(n)||I.is.animating(n))&&(I.verbose("Doing menu hide animation",n),"none"==o?(i(),n.transition("hide"),e.call(j)):Y.fn.transition!==J&&C.transition("is supported")?n.transition({animation:o+" out",duration:g.duration,debug:g.debug,verbose:g.verbose,queue:!1,onStart:i,onComplete:function(){e.call(j)}}):I.error(f.transition))}},hideAndClear:function(){I.remove.searchTerm(),I.has.maxSelections()||(I.has.search()?I.hide(function(){I.remove.filteredItem()}):I.hide())},delay:{show:function(){I.verbose("Delaying show event to ensure user intent"),clearTimeout(I.timer),I.timer=setTimeout(I.show,g.delay.show)},hide:function(){I.verbose("Delaying hide event to ensure user intent"),clearTimeout(I.timer),I.timer=setTimeout(I.hide,g.delay.hide)}},escape:{value:function(e){var t=Y.isArray(e),n="string"==typeof e,i=!n&&!t,o=n&&-1!==e.search(d.quote),a=[];return i||!o?e:(I.debug("Encoding quote values for use in select",e),t?(Y.each(e,function(e,t){a.push(t.replace(d.quote,"&quot;"))}),a):e.replace(d.quote,"&quot;"))},string:function(e){return(e=String(e)).replace(d.escape,"\\$&")}},setting:function(e,t){if(I.debug("Changing setting",e,t),Y.isPlainObject(e))Y.extend(!0,g,e);else{if(t===J)return g[e];Y.isPlainObject(g[e])?Y.extend(!0,g[e],t):g[e]=t}},internal:function(e,t){if(Y.isPlainObject(e))Y.extend(!0,I,e);else{if(t===J)return I[e];I[e]=t}},debug:function(){!g.silent&&g.debug&&(g.performance?I.performance.log(arguments):(I.debug=Function.prototype.bind.call(console.info,console,g.name+":"),I.debug.apply(console,arguments)))},verbose:function(){!g.silent&&g.verbose&&g.debug&&(g.performance?I.performance.log(arguments):(I.verbose=Function.prototype.bind.call(console.info,console,g.name+":"),I.verbose.apply(console,arguments)))},error:function(){g.silent||(I.error=Function.prototype.bind.call(console.error,console,g.name+":"),I.error.apply(console,arguments))},performance:{log:function(e){var t,n;g.performance&&(n=(t=(new Date).getTime())-(W||t),W=t,B.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:j,"Execution Time":n})),clearTimeout(I.performance.timer),I.performance.timer=setTimeout(I.performance.display,500)},display:function(){var e=g.name+":",n=0;W=!1,clearTimeout(I.performance.timer),Y.each(B,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",H&&(e+=" '"+H+"'"),(console.group!==J||console.table!==J)&&0<B.length&&(console.groupCollapsed(e),console.table?console.table(B):Y.each(B,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),B=[]}},invoke:function(i,e,t){var o,a,n,r=z;return e=e||$,t=j||t,"string"==typeof i&&r!==J&&(i=i.split(/[\. ]/),o=i.length-1,Y.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(Y.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==J)return a=r[n],!1;if(!Y.isPlainObject(r[t])||e==o)return r[t]!==J?a=r[t]:I.error(f.method,i),!1;r=r[t]}})),Y.isFunction(a)?n=a.apply(t,e):a!==J&&(n=a),Y.isArray(L)?L.push(n):L!==J?L=[L,n]:n!==J&&(L=n),a}};X?(z===J&&I.initialize(),I.invoke(Q)):(z!==J&&z.invoke("destroy"),I.initialize())}),L!==J?L:V},Y.fn.dropdown.settings={silent:!1,debug:!1,verbose:!1,performance:!0,on:"click",action:"activate",values:!1,clearable:!1,apiSettings:!1,selectOnKeydown:!0,minCharacters:0,filterRemoteData:!1,saveRemoteData:!0,throttle:200,context:Z,direction:"auto",keepOnScreen:!0,match:"both",fullTextSearch:!1,placeholder:"auto",preserveHTML:!0,sortSelect:!1,forceSelection:!0,allowAdditions:!1,ignoreCase:!1,hideAdditions:!0,maxSelections:!1,useLabels:!0,delimiter:",",showOnFocus:!0,allowReselection:!1,allowTab:!0,allowCategorySelection:!1,fireOnInit:!1,transition:"auto",duration:200,glyphWidth:1.037,label:{transition:"scale",duration:200,variation:!1},delay:{hide:300,show:200,search:20,touch:50},onChange:function(e,t,n){},onAdd:function(e,t,n){},onRemove:function(e,t,n){},onLabelSelect:function(e){},onLabelCreate:function(e,t){return Y(this)},onLabelRemove:function(e){return!0},onNoResults:function(e){return!0},onShow:function(){},onHide:function(){},name:"Dropdown",namespace:"dropdown",message:{addResult:"Add <b>{term}</b>",count:"{count} selected",maxSelections:"Max {maxCount} selections",noResults:"No results found.",serverError:"There was an error contacting the server"},error:{action:"You called a dropdown action that was not defined",alreadySetup:"Once a select has been initialized behaviors must be called on the created ui dropdown",labels:"Allowing user additions currently requires the use of labels.",missingMultiple:"<select> requires multiple property to be set to correctly preserve multiple values",method:"The method you called is not defined.",noAPI:"The API module is required to load resources remotely",noStorage:"Saving remote data requires session storage",noTransition:"This module requires ui transitions <https://github.com/Semantic-Org/UI-Transition>"},regExp:{escape:/[-[\]{}()*+?.,\\^$|#\s]/g,quote:/"/g},metadata:{defaultText:"defaultText",defaultValue:"defaultValue",placeholderText:"placeholder",text:"text",value:"value"},fields:{remoteValues:"results",values:"values",disabled:"disabled",name:"name",value:"value",text:"text"},keys:{backspace:8,delimiter:188,deleteKey:46,enter:13,escape:27,pageUp:33,pageDown:34,leftArrow:37,upArrow:38,rightArrow:39,downArrow:40},selector:{addition:".addition",dropdown:".ui.dropdown",hidden:".hidden",icon:"> .dropdown.icon",input:'> input[type="hidden"], > select',item:".item",label:"> .label",remove:"> .label > .delete.icon",siblingLabel:".label",menu:".menu",message:".message",menuIcon:".dropdown.icon",search:"input.search, .menu > .search > input, .menu input.search",sizer:"> input.sizer",text:"> .text:not(.icon)",unselectable:".disabled, .filtered"},className:{active:"active",addition:"addition",animating:"animating",clear:"clear",disabled:"disabled",empty:"empty",dropdown:"ui dropdown",filtered:"filtered",hidden:"hidden transition",item:"item",label:"ui label",loading:"loading",menu:"menu",message:"message",multiple:"multiple",placeholder:"default",sizer:"sizer",search:"search",selected:"selected",selection:"selection",upward:"upward",leftward:"left",visible:"visible"}},Y.fn.dropdown.settings.templates={dropdown:function(e){var t=e.placeholder||!1,n=(e.values,"");return n+='<i class="dropdown icon"></i>',e.placeholder?n+='<div class="default text">'+t+"</div>":n+='<div class="text"></div>',n+='<div class="menu">',Y.each(e.values,function(e,t){n+=t.disabled?'<div class="disabled item" data-value="'+t.value+'">'+t.name+"</div>":'<div class="item" data-value="'+t.value+'">'+t.name+"</div>"}),n+="</div>"},menu:function(e,o){var t=e[o.values]||{},a="";return Y.each(t,function(e,t){var n=t[o.text]?'data-text="'+t[o.text]+'"':"",i=t[o.disabled]?"disabled ":"";a+='<div class="'+i+'item" data-value="'+t[o.value]+'"'+n+">",a+=t[o.name],a+="</div>"}),a},label:function(e,t){return t+'<i class="delete icon"></i>'},message:function(e){return e},addition:function(e){return e}}}(jQuery,window,document),function(k,T,A){"use strict";T=void 0!==T&&T.Math==Math?T:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),k.fn.embed=function(p){var h,v=k(this),b=v.selector||"",y=(new Date).getTime(),x=[],C=p,w="string"==typeof C,S=[].slice.call(arguments,1);return v.each(function(){var i=k.isPlainObject(p)?k.extend(!0,{},k.fn.embed.settings,p):k.extend({},k.fn.embed.settings),e=i.selector,t=i.className,o=i.sources,s=i.error,a=i.metadata,n=i.namespace,r=i.templates,l="."+n,c="module-"+n,u=(k(T),k(this)),d=(u.find(e.placeholder),u.find(e.icon),u.find(e.embed)),f=this,m=u.data(c),g={initialize:function(){g.debug("Initializing embed"),g.determine.autoplay(),g.create(),g.bind.events(),g.instantiate()},instantiate:function(){g.verbose("Storing instance of module",g),m=g,u.data(c,g)},destroy:function(){g.verbose("Destroying previous instance of embed"),g.reset(),u.removeData(c).off(l)},refresh:function(){g.verbose("Refreshing selector cache"),u.find(e.placeholder),u.find(e.icon),d=u.find(e.embed)},bind:{events:function(){g.has.placeholder()&&(g.debug("Adding placeholder events"),u.on("click"+l,e.placeholder,g.createAndShow).on("click"+l,e.icon,g.createAndShow))}},create:function(){g.get.placeholder()?g.createPlaceholder():g.createAndShow()},createPlaceholder:function(e){var t=g.get.icon(),n=g.get.url();g.generate.embed(n);e=e||g.get.placeholder(),u.html(r.placeholder(e,t)),g.debug("Creating placeholder for embed",e,t)},createEmbed:function(e){g.refresh(),e=e||g.get.url(),d=k("<div/>").addClass(t.embed).html(g.generate.embed(e)).appendTo(u),i.onCreate.call(f,e),g.debug("Creating embed object",d)},changeEmbed:function(e){d.html(g.generate.embed(e))},createAndShow:function(){g.createEmbed(),g.show()},change:function(e,t,n){g.debug("Changing video to ",e,t,n),u.data(a.source,e).data(a.id,t),n?u.data(a.url,n):u.removeData(a.url),g.has.embed()?g.changeEmbed():g.create()},reset:function(){g.debug("Clearing embed and showing placeholder"),g.remove.data(),g.remove.active(),g.remove.embed(),g.showPlaceholder(),i.onReset.call(f)},show:function(){g.debug("Showing embed"),g.set.active(),i.onDisplay.call(f)},hide:function(){g.debug("Hiding embed"),g.showPlaceholder()},showPlaceholder:function(){g.debug("Showing placeholder image"),g.remove.active(),i.onPlaceholderDisplay.call(f)},get:{id:function(){return i.id||u.data(a.id)},placeholder:function(){return i.placeholder||u.data(a.placeholder)},icon:function(){return i.icon?i.icon:u.data(a.icon)!==A?u.data(a.icon):g.determine.icon()},source:function(e){return i.source?i.source:u.data(a.source)!==A?u.data(a.source):g.determine.source()},type:function(){var e=g.get.source();return o[e]!==A&&o[e].type},url:function(){return i.url?i.url:u.data(a.url)!==A?u.data(a.url):g.determine.url()}},determine:{autoplay:function(){g.should.autoplay()&&(i.autoplay=!0)},source:function(n){var i=!1;return(n=n||g.get.url())&&k.each(o,function(e,t){if(-1!==n.search(t.domain))return i=e,!1}),i},icon:function(){var e=g.get.source();return o[e]!==A&&o[e].icon},url:function(){var e=i.id||u.data(a.id),t=i.source||u.data(a.source),n=o[t]!==A&&o[t].url.replace("{id}",e);return n&&u.data(a.url,n),n}},set:{active:function(){u.addClass(t.active)}},remove:{data:function(){u.removeData(a.id).removeData(a.icon).removeData(a.placeholder).removeData(a.source).removeData(a.url)},active:function(){u.removeClass(t.active)},embed:function(){d.empty()}},encode:{parameters:function(e){var t,n=[];for(t in e)n.push(encodeURIComponent(t)+"="+encodeURIComponent(e[t]));return n.join("&amp;")}},generate:{embed:function(e){g.debug("Generating embed html");var t,n,i=g.get.source();return(e=g.get.url(e))?(n=g.generate.parameters(i),t=r.iframe(e,n)):g.error(s.noURL,u),t},parameters:function(e,t){var n=o[e]&&o[e].parameters!==A?o[e].parameters(i):{};return(t=t||i.parameters)&&(n=k.extend({},n,t)),n=i.onEmbed(n),g.encode.parameters(n)}},has:{embed:function(){return 0<d.length},placeholder:function(){return i.placeholder||u.data(a.placeholder)}},should:{autoplay:function(){return"auto"===i.autoplay?i.placeholder||u.data(a.placeholder)!==A:i.autoplay}},is:{video:function(){return"video"==g.get.type()}},setting:function(e,t){if(g.debug("Changing setting",e,t),k.isPlainObject(e))k.extend(!0,i,e);else{if(t===A)return i[e];k.isPlainObject(i[e])?k.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(k.isPlainObject(e))k.extend(!0,g,e);else{if(t===A)return g[e];g[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?g.performance.log(arguments):(g.debug=Function.prototype.bind.call(console.info,console,i.name+":"),g.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?g.performance.log(arguments):(g.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),g.verbose.apply(console,arguments)))},error:function(){i.silent||(g.error=Function.prototype.bind.call(console.error,console,i.name+":"),g.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(y||t),y=t,x.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:f,"Execution Time":n})),clearTimeout(g.performance.timer),g.performance.timer=setTimeout(g.performance.display,500)},display:function(){var e=i.name+":",n=0;y=!1,clearTimeout(g.performance.timer),k.each(x,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",b&&(e+=" '"+b+"'"),1<v.length&&(e+=" ("+v.length+")"),(console.group!==A||console.table!==A)&&0<x.length&&(console.groupCollapsed(e),console.table?console.table(x):k.each(x,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),x=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||S,t=f||t,"string"==typeof i&&r!==A&&(i=i.split(/[\. ]/),o=i.length-1,k.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(k.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==A)return a=r[n],!1;if(!k.isPlainObject(r[t])||e==o)return r[t]!==A?a=r[t]:g.error(s.method,i),!1;r=r[t]}})),k.isFunction(a)?n=a.apply(t,e):a!==A&&(n=a),k.isArray(h)?h.push(n):h!==A?h=[h,n]:n!==A&&(h=n),a}};w?(m===A&&g.initialize(),g.invoke(C)):(m!==A&&m.invoke("destroy"),g.initialize())}),h!==A?h:this},k.fn.embed.settings={name:"Embed",namespace:"embed",silent:!1,debug:!1,verbose:!1,performance:!0,icon:!1,source:!1,url:!1,id:!1,autoplay:"auto",color:"#444444",hd:!0,brandedUI:!1,parameters:!1,onDisplay:function(){},onPlaceholderDisplay:function(){},onReset:function(){},onCreate:function(e){},onEmbed:function(e){return e},metadata:{id:"id",icon:"icon",placeholder:"placeholder",source:"source",url:"url"},error:{noURL:"No URL specified",method:"The method you called is not defined"},className:{active:"active",embed:"embed"},selector:{embed:".embed",placeholder:".placeholder",icon:".icon"},sources:{youtube:{name:"youtube",type:"video",icon:"video play",domain:"youtube.com",url:"//www.youtube.com/embed/{id}",parameters:function(e){return{autohide:!e.brandedUI,autoplay:e.autoplay,color:e.color||A,hq:e.hd,jsapi:e.api,modestbranding:!e.brandedUI}}},vimeo:{name:"vimeo",type:"video",icon:"video play",domain:"vimeo.com",url:"//player.vimeo.com/video/{id}",parameters:function(e){return{api:e.api,autoplay:e.autoplay,byline:e.brandedUI,color:e.color||A,portrait:e.brandedUI,title:e.brandedUI}}}},templates:{iframe:function(e,t){var n=e;return t&&(n+="?"+t),'<iframe src="'+n+'" width="100%" height="100%" frameborder="0" scrolling="no" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>'},placeholder:function(e,t){var n="";return t&&(n+='<i class="'+t+' icon"></i>'),e&&(n+='<img class="placeholder" src="'+e+'">'),n}},api:!1,onPause:function(){},onPlay:function(){},onStop:function(){}}}(jQuery,window,void document),function(j,z,I,M){"use strict";z=void 0!==z&&z.Math==Math?z:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),j.fn.modal=function(w){var S,e=j(this),k=j(z),T=j(I),A=j("body"),R=e.selector||"",P=(new Date).getTime(),E=[],F=w,O="string"==typeof F,D=[].slice.call(arguments,1),q=z.requestAnimationFrame||z.mozRequestAnimationFrame||z.webkitRequestAnimationFrame||z.msRequestAnimationFrame||function(e){setTimeout(e,0)};return e.each(function(){var n,i,e,o,a,t,r,s,l=j.isPlainObject(w)?j.extend(!0,{},j.fn.modal.settings,w):j.extend({},j.fn.modal.settings),c=l.selector,u=l.className,d=l.namespace,f=l.error,m="."+d,g="module-"+d,p=j(this),h=j(l.context),v=p.find(c.close),b=this,y=p.data(g),x=!1,C={initialize:function(){C.verbose("Initializing dimmer",h),C.create.id(),C.create.dimmer(),C.refreshModals(),C.bind.events(),l.observeChanges&&C.observeChanges(),C.instantiate()},instantiate:function(){C.verbose("Storing instance of modal"),y=C,p.data(g,y)},create:{dimmer:function(){var e={debug:l.debug,variation:!l.centered&&"top aligned",dimmerName:"modals"},t=j.extend(!0,e,l.dimmerSettings);j.fn.dimmer!==M?(C.debug("Creating dimmer"),o=h.dimmer(t),l.detachable?(C.verbose("Modal is detachable, moving content into dimmer"),o.dimmer("add content",p)):C.set.undetached(),a=o.dimmer("get dimmer")):C.error(f.dimmer)},id:function(){r=(Math.random().toString(16)+"000000000").substr(2,8),t="."+r,C.verbose("Creating unique id for element",r)}},destroy:function(){s&&s.disconnect(),C.verbose("Destroying previous modal"),p.removeData(g).off(m),k.off(t),a.off(t),v.off(m),h.dimmer("destroy")},observeChanges:function(){"MutationObserver"in z&&((s=new MutationObserver(function(e){C.debug("DOM tree modified, refreshing"),C.refresh()})).observe(b,{childList:!0,subtree:!0}),C.debug("Setting up mutation observer",s))},refresh:function(){C.remove.scrolling(),C.cacheSizes(),C.can.useFlex()||C.set.modalOffset(),C.set.screenHeight(),C.set.type()},refreshModals:function(){i=p.siblings(c.modal),n=i.add(p)},attachEvents:function(e,t){var n=j(e);t=j.isFunction(C[t])?C[t]:C.toggle,0<n.length?(C.debug("Attaching modal events to element",e,t),n.off(m).on("click"+m,t)):C.error(f.notFound,e)},bind:{events:function(){C.verbose("Attaching events"),p.on("click"+m,c.close,C.event.close).on("click"+m,c.approve,C.event.approve).on("click"+m,c.deny,C.event.deny),k.on("resize"+t,C.event.resize)},scrollLock:function(){o.get(0).addEventListener("touchmove",C.event.preventScroll,{passive:!1})}},unbind:{scrollLock:function(){o.get(0).removeEventListener("touchmove",C.event.preventScroll,{passive:!1})}},get:{id:function(){return(Math.random().toString(16)+"000000000").substr(2,8)}},event:{approve:function(){x||!1===l.onApprove.call(b,j(this))?C.verbose("Approve callback returned false cancelling hide"):(x=!0,C.hide(function(){x=!1}))},preventScroll:function(e){e.preventDefault()},deny:function(){x||!1===l.onDeny.call(b,j(this))?C.verbose("Deny callback returned false cancelling hide"):(x=!0,C.hide(function(){x=!1}))},close:function(){C.hide()},click:function(e){var t,n;l.closable?(t=0<j(e.target).closest(c.modal).length,n=j.contains(I.documentElement,e.target),!t&&n&&C.is.active()&&(C.debug("Dimmer clicked, hiding all modals"),C.remove.clickaway(),l.allowMultiple?C.hide():C.hideAll())):C.verbose("Dimmer clicked but closable setting is disabled")},debounce:function(e,t){clearTimeout(C.timer),C.timer=setTimeout(e,t)},keyboard:function(e){27==e.which&&(l.closable?(C.debug("Escape key pressed hiding modal"),C.hide()):C.debug("Escape key pressed, but closable is set to false"),e.preventDefault())},resize:function(){o.dimmer("is active")&&(C.is.animating()||C.is.active())&&q(C.refresh)}},toggle:function(){C.is.active()||C.is.animating()?C.hide():C.show()},show:function(e){e=j.isFunction(e)?e:function(){},C.refreshModals(),C.set.dimmerSettings(),C.set.dimmerStyles(),C.showModal(e)},hide:function(e){e=j.isFunction(e)?e:function(){},C.refreshModals(),C.hideModal(e)},showModal:function(e){e=j.isFunction(e)?e:function(){},C.is.animating()||!C.is.active()?(C.showDimmer(),C.cacheSizes(),C.can.useFlex()?C.remove.legacy():(C.set.legacy(),C.set.modalOffset(),C.debug("Using non-flex legacy modal positioning.")),C.set.screenHeight(),C.set.type(),C.set.clickaway(),!l.allowMultiple&&C.others.active()?C.hideOthers(C.showModal):(l.allowMultiple&&l.detachable&&p.detach().appendTo(a),l.onShow.call(b),l.transition&&j.fn.transition!==M&&p.transition("is supported")?(C.debug("Showing modal with css animations"),p.transition({debug:l.debug,animation:l.transition+" in",queue:l.queue,duration:l.duration,useFailSafe:!0,onComplete:function(){l.onVisible.apply(b),l.keyboardShortcuts&&C.add.keyboardShortcuts(),C.save.focus(),C.set.active(),l.autofocus&&C.set.autofocus(),e()}})):C.error(f.noTransition))):C.debug("Modal is already visible")},hideModal:function(e,t){e=j.isFunction(e)?e:function(){},C.debug("Hiding modal"),!1!==l.onHide.call(b,j(this))?(C.is.animating()||C.is.active())&&(l.transition&&j.fn.transition!==M&&p.transition("is supported")?(C.remove.active(),p.transition({debug:l.debug,animation:l.transition+" out",queue:l.queue,duration:l.duration,useFailSafe:!0,onStart:function(){C.others.active()||t||C.hideDimmer(),l.keyboardShortcuts&&C.remove.keyboardShortcuts()},onComplete:function(){l.onHidden.call(b),C.remove.dimmerStyles(),C.restore.focus(),e()}})):C.error(f.noTransition)):C.verbose("Hide callback returned false cancelling hide")},showDimmer:function(){o.dimmer("is animating")||!o.dimmer("is active")?(C.debug("Showing dimmer"),o.dimmer("show")):C.debug("Dimmer already visible")},hideDimmer:function(){o.dimmer("is animating")||o.dimmer("is active")?(C.unbind.scrollLock(),o.dimmer("hide",function(){C.remove.clickaway(),C.remove.screenHeight()})):C.debug("Dimmer is not visible cannot hide")},hideAll:function(e){var t=n.filter("."+u.active+", ."+u.animating);e=j.isFunction(e)?e:function(){},0<t.length&&(C.debug("Hiding all visible modals"),C.hideDimmer(),t.modal("hide modal",e))},hideOthers:function(e){var t=i.filter("."+u.active+", ."+u.animating);e=j.isFunction(e)?e:function(){},0<t.length&&(C.debug("Hiding other modals",i),t.modal("hide modal",e,!0))},others:{active:function(){return 0<i.filter("."+u.active).length},animating:function(){return 0<i.filter("."+u.animating).length}},add:{keyboardShortcuts:function(){C.verbose("Adding keyboard shortcuts"),T.on("keyup"+m,C.event.keyboard)}},save:{focus:function(){0<j(I.activeElement).closest(p).length||(e=j(I.activeElement).blur())}},restore:{focus:function(){e&&0<e.length&&e.focus()}},remove:{active:function(){p.removeClass(u.active)},legacy:function(){p.removeClass(u.legacy)},clickaway:function(){a.off("click"+t)},dimmerStyles:function(){a.removeClass(u.inverted),o.removeClass(u.blurring)},bodyStyle:function(){""===A.attr("style")&&(C.verbose("Removing style attribute"),A.removeAttr("style"))},screenHeight:function(){C.debug("Removing page height"),A.css("height","")},keyboardShortcuts:function(){C.verbose("Removing keyboard shortcuts"),T.off("keyup"+m)},scrolling:function(){o.removeClass(u.scrolling),p.removeClass(u.scrolling)}},cacheSizes:function(){p.addClass(u.loading);var e=p.prop("scrollHeight"),t=p.outerWidth(),n=p.outerHeight();C.cache!==M&&0===n||(C.cache={pageHeight:j(I).outerHeight(),width:t,height:n+l.offset,scrollHeight:e+l.offset,contextHeight:"body"==l.context?j(z).height():o.height()},C.cache.topOffset=-C.cache.height/2),p.removeClass(u.loading),C.debug("Caching modal and container sizes",C.cache)},can:{useFlex:function(){return"auto"==l.useFlex?l.detachable&&!C.is.ie():l.useFlex},fit:function(){var e=C.cache.contextHeight,t=C.cache.contextHeight/2,n=C.cache.topOffset,i=C.cache.scrollHeight,o=C.cache.height,a=l.padding;return o<i?t+n+i+a<e:o+2*a<e}},is:{active:function(){return p.hasClass(u.active)},ie:function(){return!z.ActiveXObject&&"ActiveXObject"in z||"ActiveXObject"in z},animating:function(){return p.transition("is supported")?p.transition("is animating"):p.is(":visible")},scrolling:function(){return o.hasClass(u.scrolling)},modernBrowser:function(){return!(z.ActiveXObject||"ActiveXObject"in z)}},set:{autofocus:function(){var e=p.find("[tabindex], :input").filter(":visible"),t=e.filter("[autofocus]"),n=0<t.length?t.first():e.first();0<n.length&&n.focus()},clickaway:function(){a.on("click"+t,C.event.click)},dimmerSettings:function(){var e,t;j.fn.dimmer!==M?(e={debug:l.debug,dimmerName:"modals",closable:"auto",useFlex:C.can.useFlex(),variation:!l.centered&&"top aligned",duration:{show:l.duration,hide:l.duration}},t=j.extend(!0,e,l.dimmerSettings),l.inverted&&(t.variation=t.variation!==M?t.variation+" inverted":"inverted"),h.dimmer("setting",t)):C.error(f.dimmer)},dimmerStyles:function(){l.inverted?a.addClass(u.inverted):a.removeClass(u.inverted),l.blurring?o.addClass(u.blurring):o.removeClass(u.blurring)},modalOffset:function(){var e=C.cache.width,t=C.cache.height;p.css({marginTop:l.centered&&C.can.fit()?-t/2:0,marginLeft:-e/2}),C.verbose("Setting modal offset for legacy mode")},screenHeight:function(){C.can.fit()?A.css("height",""):(C.debug("Modal is taller than page content, resizing page height"),A.css("height",C.cache.height+2*l.padding))},active:function(){p.addClass(u.active)},scrolling:function(){o.addClass(u.scrolling),p.addClass(u.scrolling),C.unbind.scrollLock()},legacy:function(){p.addClass(u.legacy)},type:function(){C.can.fit()?(C.verbose("Modal fits on screen"),C.others.active()||C.others.animating()||(C.remove.scrolling(),C.bind.scrollLock())):(C.verbose("Modal cannot fit on screen setting to scrolling"),C.set.scrolling())},undetached:function(){o.addClass(u.undetached)}},setting:function(e,t){if(C.debug("Changing setting",e,t),j.isPlainObject(e))j.extend(!0,l,e);else{if(t===M)return l[e];j.isPlainObject(l[e])?j.extend(!0,l[e],t):l[e]=t}},internal:function(e,t){if(j.isPlainObject(e))j.extend(!0,C,e);else{if(t===M)return C[e];C[e]=t}},debug:function(){!l.silent&&l.debug&&(l.performance?C.performance.log(arguments):(C.debug=Function.prototype.bind.call(console.info,console,l.name+":"),C.debug.apply(console,arguments)))},verbose:function(){!l.silent&&l.verbose&&l.debug&&(l.performance?C.performance.log(arguments):(C.verbose=Function.prototype.bind.call(console.info,console,l.name+":"),C.verbose.apply(console,arguments)))},error:function(){l.silent||(C.error=Function.prototype.bind.call(console.error,console,l.name+":"),C.error.apply(console,arguments))},performance:{log:function(e){var t,n;l.performance&&(n=(t=(new Date).getTime())-(P||t),P=t,E.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:b,"Execution Time":n})),clearTimeout(C.performance.timer),C.performance.timer=setTimeout(C.performance.display,500)},display:function(){var e=l.name+":",n=0;P=!1,clearTimeout(C.performance.timer),j.each(E,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",R&&(e+=" '"+R+"'"),(console.group!==M||console.table!==M)&&0<E.length&&(console.groupCollapsed(e),console.table?console.table(E):j.each(E,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),E=[]}},invoke:function(i,e,t){var o,a,n,r=y;return e=e||D,t=b||t,"string"==typeof i&&r!==M&&(i=i.split(/[\. ]/),o=i.length-1,j.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(j.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==M)return a=r[n],!1;if(!j.isPlainObject(r[t])||e==o)return r[t]!==M&&(a=r[t]),!1;r=r[t]}})),j.isFunction(a)?n=a.apply(t,e):a!==M&&(n=a),j.isArray(S)?S.push(n):S!==M?S=[S,n]:n!==M&&(S=n),a}};O?(y===M&&C.initialize(),C.invoke(F)):(y!==M&&y.invoke("destroy"),C.initialize())}),S!==M?S:this},j.fn.modal.settings={name:"Modal",namespace:"modal",useFlex:"auto",offset:0,silent:!1,debug:!1,verbose:!1,performance:!0,observeChanges:!1,allowMultiple:!1,detachable:!0,closable:!0,autofocus:!0,inverted:!1,blurring:!1,centered:!0,dimmerSettings:{closable:!1,useCSS:!0},keyboardShortcuts:!0,context:"body",queue:!1,duration:500,transition:"scale",padding:50,onShow:function(){},onVisible:function(){},onHide:function(){return!0},onHidden:function(){},onApprove:function(){return!0},onDeny:function(){return!0},selector:{close:"> .close",approve:".actions .positive, .actions .approve, .actions .ok",deny:".actions .negative, .actions .deny, .actions .cancel",modal:".ui.modal"},error:{dimmer:"UI Dimmer, a required component is not included in this page",method:"The method you called is not defined.",notFound:"The element you specified could not be found"},className:{active:"active",animating:"animating",blurring:"blurring",inverted:"inverted",legacy:"legacy",loading:"loading",scrolling:"scrolling",undetached:"undetached"}}}(jQuery,window,document),function(y,x,C){"use strict";x=void 0!==x&&x.Math==Math?x:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),y.fn.nag=function(d){var f,e=y(this),m=e.selector||"",g=(new Date).getTime(),p=[],h=d,v="string"==typeof h,b=[].slice.call(arguments,1);return e.each(function(){var i=y.isPlainObject(d)?y.extend(!0,{},y.fn.nag.settings,d):y.extend({},y.fn.nag.settings),e=(i.className,i.selector),s=i.error,t=i.namespace,n="."+t,o=t+"-module",a=y(this),r=(a.find(e.close),i.context?y(i.context):y("body")),l=this,c=a.data(o),u=(x.requestAnimationFrame||x.mozRequestAnimationFrame||x.webkitRequestAnimationFrame||x.msRequestAnimationFrame,{initialize:function(){u.verbose("Initializing element"),a.on("click"+n,e.close,u.dismiss).data(o,u),i.detachable&&a.parent()[0]!==r[0]&&a.detach().prependTo(r),0<i.displayTime&&setTimeout(u.hide,i.displayTime),u.show()},destroy:function(){u.verbose("Destroying instance"),a.removeData(o).off(n)},show:function(){u.should.show()&&!a.is(":visible")&&(u.debug("Showing nag",i.animation.show),"fade"==i.animation.show?a.fadeIn(i.duration,i.easing):a.slideDown(i.duration,i.easing))},hide:function(){u.debug("Showing nag",i.animation.hide),"fade"==i.animation.show?a.fadeIn(i.duration,i.easing):a.slideUp(i.duration,i.easing)},onHide:function(){u.debug("Removing nag",i.animation.hide),a.remove(),i.onHide&&i.onHide()},dismiss:function(e){i.storageMethod&&u.storage.set(i.key,i.value),u.hide(),e.stopImmediatePropagation(),e.preventDefault()},should:{show:function(){return i.persist?(u.debug("Persistent nag is set, can show nag"),!0):u.storage.get(i.key)!=i.value.toString()?(u.debug("Stored value is not set, can show nag",u.storage.get(i.key)),!0):(u.debug("Stored value is set, cannot show nag",u.storage.get(i.key)),!1)}},get:{storageOptions:function(){var e={};return i.expires&&(e.expires=i.expires),i.domain&&(e.domain=i.domain),i.path&&(e.path=i.path),e}},clear:function(){u.storage.remove(i.key)},storage:{set:function(e,t){var n=u.get.storageOptions();if("localstorage"==i.storageMethod&&x.localStorage!==C)x.localStorage.setItem(e,t),u.debug("Value stored using local storage",e,t);else if("sessionstorage"==i.storageMethod&&x.sessionStorage!==C)x.sessionStorage.setItem(e,t),u.debug("Value stored using session storage",e,t);else{if(y.cookie===C)return void u.error(s.noCookieStorage);y.cookie(e,t,n),u.debug("Value stored using cookie",e,t,n)}},get:function(e,t){var n;return"localstorage"==i.storageMethod&&x.localStorage!==C?n=x.localStorage.getItem(e):"sessionstorage"==i.storageMethod&&x.sessionStorage!==C?n=x.sessionStorage.getItem(e):y.cookie!==C?n=y.cookie(e):u.error(s.noCookieStorage),"undefined"!=n&&"null"!=n&&n!==C&&null!==n||(n=C),n},remove:function(e){var t=u.get.storageOptions();"localstorage"==i.storageMethod&&x.localStorage!==C?x.localStorage.removeItem(e):"sessionstorage"==i.storageMethod&&x.sessionStorage!==C?x.sessionStorage.removeItem(e):y.cookie!==C?y.removeCookie(e,t):u.error(s.noStorage)}},setting:function(e,t){if(u.debug("Changing setting",e,t),y.isPlainObject(e))y.extend(!0,i,e);else{if(t===C)return i[e];y.isPlainObject(i[e])?y.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(y.isPlainObject(e))y.extend(!0,u,e);else{if(t===C)return u[e];u[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?u.performance.log(arguments):(u.debug=Function.prototype.bind.call(console.info,console,i.name+":"),u.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?u.performance.log(arguments):(u.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),u.verbose.apply(console,arguments)))},error:function(){i.silent||(u.error=Function.prototype.bind.call(console.error,console,i.name+":"),u.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(g||t),g=t,p.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(u.performance.timer),u.performance.timer=setTimeout(u.performance.display,500)},display:function(){var e=i.name+":",n=0;g=!1,clearTimeout(u.performance.timer),y.each(p,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",m&&(e+=" '"+m+"'"),(console.group!==C||console.table!==C)&&0<p.length&&(console.groupCollapsed(e),console.table?console.table(p):y.each(p,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),p=[]}},invoke:function(i,e,t){var o,a,n,r=c;return e=e||b,t=l||t,"string"==typeof i&&r!==C&&(i=i.split(/[\. ]/),o=i.length-1,y.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(y.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==C)return a=r[n],!1;if(!y.isPlainObject(r[t])||e==o)return r[t]!==C?a=r[t]:u.error(s.method,i),!1;r=r[t]}})),y.isFunction(a)?n=a.apply(t,e):a!==C&&(n=a),y.isArray(f)?f.push(n):f!==C?f=[f,n]:n!==C&&(f=n),a}});v?(c===C&&u.initialize(),u.invoke(h)):(c!==C&&c.invoke("destroy"),u.initialize())}),f!==C?f:this},y.fn.nag.settings={name:"Nag",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"Nag",persist:!1,displayTime:0,animation:{show:"slide",hide:"slide"},context:!1,detachable:!1,expires:30,domain:!1,path:"/",storageMethod:"cookie",key:"nag",value:"dismiss",error:{noCookieStorage:"$.cookie is not included. A storage solution is required.",noStorage:"Neither $.cookie or store is defined. A storage solution is required for storing state",method:"The method you called is not defined."},className:{bottom:"bottom",fixed:"fixed"},selector:{close:".close.icon"},speed:500,easing:"easeOutQuad",onHide:function(){}},y.extend(y.easing,{easeOutQuad:function(e,t,n,i,o){return-i*(t/=o)*(t-2)+n}})}(jQuery,window,void document),function(z,I,M,L){"use strict";I=void 0!==I&&I.Math==Math?I:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),z.fn.popup=function(k){var T,e=z(this),A=z(M),R=z(I),P=z("body"),E=e.selector||"",F=(new Date).getTime(),O=[],D=k,q="string"==typeof D,j=[].slice.call(arguments,1);return e.each(function(){var u,c,e,t,n,d=z.isPlainObject(k)?z.extend(!0,{},z.fn.popup.settings,k):z.extend({},z.fn.popup.settings),o=d.selector,f=d.className,m=d.error,g=d.metadata,i=d.namespace,a="."+d.namespace,r="module-"+i,p=z(this),s=z(d.context),l=z(d.scrollContext),h=z(d.boundary),v=d.target?z(d.target):p,b=0,y=!1,x=!1,C=this,w=p.data(r),S={initialize:function(){S.debug("Initializing",p),S.createID(),S.bind.events(),!S.exists()&&d.preserve&&S.create(),d.observeChanges&&S.observeChanges(),S.instantiate()},instantiate:function(){S.verbose("Storing instance",S),w=S,p.data(r,w)},observeChanges:function(){"MutationObserver"in I&&((e=new MutationObserver(S.event.documentChanged)).observe(M,{childList:!0,subtree:!0}),S.debug("Setting up mutation observer",e))},refresh:function(){d.popup?u=z(d.popup).eq(0):d.inline&&(u=v.nextAll(o.popup).eq(0),d.popup=u),d.popup?(u.addClass(f.loading),c=S.get.offsetParent(),u.removeClass(f.loading),d.movePopup&&S.has.popup()&&S.get.offsetParent(u)[0]!==c[0]&&(S.debug("Moving popup to the same offset parent as target"),u.detach().appendTo(c))):c=d.inline?S.get.offsetParent(v):S.has.popup()?S.get.offsetParent(u):P,c.is("html")&&c[0]!==P[0]&&(S.debug("Setting page as offset parent"),c=P),S.get.variation()&&S.set.variation()},reposition:function(){S.refresh(),S.set.position()},destroy:function(){S.debug("Destroying previous module"),e&&e.disconnect(),u&&!d.preserve&&S.removePopup(),clearTimeout(S.hideTimer),clearTimeout(S.showTimer),S.unbind.close(),S.unbind.events(),p.removeData(r)},event:{start:function(e){var t=z.isPlainObject(d.delay)?d.delay.show:d.delay;clearTimeout(S.hideTimer),x||(S.showTimer=setTimeout(S.show,t))},end:function(){var e=z.isPlainObject(d.delay)?d.delay.hide:d.delay;clearTimeout(S.showTimer),S.hideTimer=setTimeout(S.hide,e)},touchstart:function(e){x=!0,S.show()},resize:function(){S.is.visible()&&S.set.position()},documentChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==C||0<z(e).find(C).length)&&(S.debug("Element removed from DOM, tearing down events"),S.destroy())})})},hideGracefully:function(e){var t=z(e.target),n=z.contains(M.documentElement,e.target),i=0<t.closest(o.popup).length;e&&!i&&n?(S.debug("Click occurred outside popup hiding popup"),S.hide()):S.debug("Click was inside popup, keeping popup open")}},create:function(){var e=S.get.html(),t=S.get.title(),n=S.get.content();e||n||t?(S.debug("Creating pop-up html"),e=e||d.templates.popup({title:t,content:n}),u=z("<div/>").addClass(f.popup).data(g.activator,p).html(e),d.inline?(S.verbose("Inserting popup element inline",u),u.insertAfter(p)):(S.verbose("Appending popup element to body",u),u.appendTo(s)),S.refresh(),S.set.variation(),d.hoverable&&S.bind.popup(),d.onCreate.call(u,C)):0!==v.next(o.popup).length?(S.verbose("Pre-existing popup found"),d.inline=!0,d.popup=v.next(o.popup).data(g.activator,p),S.refresh(),d.hoverable&&S.bind.popup()):d.popup?(z(d.popup).data(g.activator,p),S.verbose("Used popup specified in settings"),S.refresh(),d.hoverable&&S.bind.popup()):S.debug("No content specified skipping display",C)},createID:function(){n=(Math.random().toString(16)+"000000000").substr(2,8),t="."+n,S.verbose("Creating unique id for element",n)},toggle:function(){S.debug("Toggling pop-up"),S.is.hidden()?(S.debug("Popup is hidden, showing pop-up"),S.unbind.close(),S.show()):(S.debug("Popup is visible, hiding pop-up"),S.hide())},show:function(e){if(e=e||function(){},S.debug("Showing pop-up",d.transition),S.is.hidden()&&(!S.is.active()||!S.is.dropdown())){if(S.exists()||S.create(),!1===d.onShow.call(u,C))return void S.debug("onShow callback returned false, cancelling popup animation");d.preserve||d.popup||S.refresh(),u&&S.set.position()&&(S.save.conditions(),d.exclusive&&S.hideAll(),S.animate.show(e))}},hide:function(e){if(e=e||function(){},S.is.visible()||S.is.animating()){if(!1===d.onHide.call(u,C))return void S.debug("onHide callback returned false, cancelling popup animation");S.remove.visible(),S.unbind.close(),S.restore.conditions(),S.animate.hide(e)}},hideAll:function(){z(o.popup).filter("."+f.popupVisible).each(function(){z(this).data(g.activator).popup("hide")})},exists:function(){return!!u&&(d.inline||d.popup?S.has.popup():1<=u.closest(s).length)},removePopup:function(){S.has.popup()&&!d.popup&&(S.debug("Removing popup",u),u.remove(),u=L,d.onRemove.call(u,C))},save:{conditions:function(){S.cache={title:p.attr("title")},S.cache.title&&p.removeAttr("title"),S.verbose("Saving original attributes",S.cache.title)}},restore:{conditions:function(){return S.cache&&S.cache.title&&(p.attr("title",S.cache.title),S.verbose("Restoring original attributes",S.cache.title)),!0}},supports:{svg:function(){return"undefined"==typeof SVGGraphicsElement}},animate:{show:function(e){e=z.isFunction(e)?e:function(){},d.transition&&z.fn.transition!==L&&p.transition("is supported")?(S.set.visible(),u.transition({animation:d.transition+" in",queue:!1,debug:d.debug,verbose:d.verbose,duration:d.duration,onComplete:function(){S.bind.close(),e.call(u,C),d.onVisible.call(u,C)}})):S.error(m.noTransition)},hide:function(e){e=z.isFunction(e)?e:function(){},S.debug("Hiding pop-up"),!1!==d.onHide.call(u,C)?d.transition&&z.fn.transition!==L&&p.transition("is supported")?u.transition({animation:d.transition+" out",queue:!1,duration:d.duration,debug:d.debug,verbose:d.verbose,onComplete:function(){S.reset(),e.call(u,C),d.onHidden.call(u,C)}}):S.error(m.noTransition):S.debug("onHide callback returned false, cancelling popup animation")}},change:{content:function(e){u.html(e)}},get:{html:function(){return p.removeData(g.html),p.data(g.html)||d.html},title:function(){return p.removeData(g.title),p.data(g.title)||d.title},content:function(){return p.removeData(g.content),p.data(g.content)||d.content||p.attr("title")},variation:function(){return p.removeData(g.variation),p.data(g.variation)||d.variation},popup:function(){return u},popupOffset:function(){return u.offset()},calculations:function(){var e,t,n=S.get.offsetParent(u),i=v[0],o=h[0]==I,a=d.inline||d.popup&&d.movePopup?v.position():v.offset(),r=o?{top:0,left:0}:h.offset(),s={},l=o?{top:R.scrollTop(),left:R.scrollLeft()}:{top:0,left:0},s={target:{element:v[0],width:v.outerWidth(),height:v.outerHeight(),top:a.top,left:a.left,margin:{}},popup:{width:u.outerWidth(),height:u.outerHeight()},parent:{width:c.outerWidth(),height:c.outerHeight()},screen:{top:r.top,left:r.left,scroll:{top:l.top,left:l.left},width:h.width(),height:h.height()}};return n.get(0)!==c.get(0)&&(t=n.offset(),s.target.top-=t.top,s.target.left-=t.left,s.parent.width=n.outerWidth(),s.parent.height=n.outerHeight()),d.setFluidWidth&&S.is.fluid()&&(s.container={width:u.parent().outerWidth()},s.popup.width=s.container.width),s.target.margin.top=d.inline?parseInt(I.getComputedStyle(i).getPropertyValue("margin-top"),10):0,s.target.margin.left=d.inline?S.is.rtl()?parseInt(I.getComputedStyle(i).getPropertyValue("margin-right"),10):parseInt(I.getComputedStyle(i).getPropertyValue("margin-left"),10):0,e=s.screen,s.boundary={top:e.top+e.scroll.top,bottom:e.top+e.scroll.top+e.height,left:e.left+e.scroll.left,right:e.left+e.scroll.left+e.width},s},id:function(){return n},startEvent:function(){return"hover"==d.on?"mouseenter":"focus"==d.on&&"focus"},scrollEvent:function(){return"scroll"},endEvent:function(){return"hover"==d.on?"mouseleave":"focus"==d.on&&"blur"},distanceFromBoundary:function(e,t){var n={},i=(t=t||S.get.calculations()).popup,o=t.boundary;return e&&(n={top:e.top-o.top,left:e.left-o.left,right:o.right-(e.left+i.width),bottom:o.bottom-(e.top+i.height)},S.verbose("Distance from boundaries determined",e,n)),n},offsetParent:function(e){var t=(e!==L?e[0]:v[0]).parentNode,n=z(t);if(t)for(var i="none"===n.css("transform"),o="static"===n.css("position"),a=n.is("body");t&&!a&&o&&i;)t=t.parentNode,i="none"===(n=z(t)).css("transform"),o="static"===n.css("position"),a=n.is("body");return n&&0<n.length?n:z()},positions:function(){return{"top left":!1,"top center":!1,"top right":!1,"bottom left":!1,"bottom center":!1,"bottom right":!1,"left center":!1,"right center":!1}},nextPosition:function(e){var t=e.split(" "),n=t[0],i=t[1],o="top"==n||"bottom"==n,a=!1,r=!1,s=!1;return y||(S.verbose("All available positions available"),y=S.get.positions()),S.debug("Recording last position tried",e),y[e]=!0,"opposite"===d.prefer&&(s=(s=[{top:"bottom",bottom:"top",left:"right",right:"left"}[n],i]).join(" "),a=!0===y[s],S.debug("Trying opposite strategy",s)),"adjacent"===d.prefer&&o&&(s=(s=[n,{left:"center",center:"right",right:"left"}[i]]).join(" "),r=!0===y[s],S.debug("Trying adjacent strategy",s)),(r||a)&&(S.debug("Using backup position",s),s={"top left":"top center","top center":"top right","top right":"right center","right center":"bottom right","bottom right":"bottom center","bottom center":"bottom left","bottom left":"left center","left center":"top left"}[e]),s}},set:{position:function(e,t){if(0!==v.length&&0!==u.length){var n,i,o,a,r,s,l,c;if(t=t||S.get.calculations(),e=e||p.data(g.position)||d.position,n=p.data(g.offset)||d.offset,i=d.distanceAway,o=t.target,a=t.popup,r=t.parent,S.should.centerArrow(t)&&(S.verbose("Adjusting offset to center arrow on small target element"),"top left"!=e&&"bottom left"!=e||(n+=o.width/2,n-=d.arrowPixelsFromEdge),"top right"!=e&&"bottom right"!=e||(n-=o.width/2,n+=d.arrowPixelsFromEdge)),0===o.width&&0===o.height&&!S.is.svg(o.element))return S.debug("Popup target is hidden, no action taken"),!1;switch(d.inline&&(S.debug("Adding margin to calculation",o.margin),"left center"==e||"right center"==e?(n+=o.margin.top,i+=-o.margin.left):"top left"==e||"top center"==e||"top right"==e?(n+=o.margin.left,i-=o.margin.top):(n+=o.margin.left,i+=o.margin.top)),S.debug("Determining popup position from calculations",e,t),S.is.rtl()&&(e=e.replace(/left|right/g,function(e){return"left"==e?"right":"left"}),S.debug("RTL: Popup position updated",e)),b==d.maxSearchDepth&&"string"==typeof d.lastResort&&(e=d.lastResort),e){case"top left":s={top:"auto",bottom:r.height-o.top+i,left:o.left+n,right:"auto"};break;case"top center":s={bottom:r.height-o.top+i,left:o.left+o.width/2-a.width/2+n,top:"auto",right:"auto"};break;case"top right":s={bottom:r.height-o.top+i,right:r.width-o.left-o.width-n,top:"auto",left:"auto"};break;case"left center":s={top:o.top+o.height/2-a.height/2+n,right:r.width-o.left+i,left:"auto",bottom:"auto"};break;case"right center":s={top:o.top+o.height/2-a.height/2+n,left:o.left+o.width+i,bottom:"auto",right:"auto"};break;case"bottom left":s={top:o.top+o.height+i,left:o.left+n,bottom:"auto",right:"auto"};break;case"bottom center":s={top:o.top+o.height+i,left:o.left+o.width/2-a.width/2+n,bottom:"auto",right:"auto"};break;case"bottom right":s={top:o.top+o.height+i,right:r.width-o.left-o.width-n,left:"auto",bottom:"auto"}}if(s===L&&S.error(m.invalidPosition,e),S.debug("Calculated popup positioning values",s),u.css(s).removeClass(f.position).addClass(e).addClass(f.loading),l=S.get.popupOffset(),c=S.get.distanceFromBoundary(l,t),S.is.offstage(c,e)){if(S.debug("Position is outside viewport",e),b<d.maxSearchDepth)return b++,e=S.get.nextPosition(e),S.debug("Trying new position",e),!!u&&S.set.position(e,t);if(!d.lastResort)return S.debug("Popup could not find a position to display",u),S.error(m.cannotPlace,C),S.remove.attempts(),S.remove.loading(),S.reset(),d.onUnplaceable.call(u,C),!1;S.debug("No position found, showing with last position")}return S.debug("Position is on stage",e),S.remove.attempts(),S.remove.loading(),d.setFluidWidth&&S.is.fluid()&&S.set.fluidWidth(t),!0}S.error(m.notFound)},fluidWidth:function(e){e=e||S.get.calculations(),S.debug("Automatically setting element width to parent width",e.parent.width),u.css("width",e.container.width)},variation:function(e){(e=e||S.get.variation())&&S.has.popup()&&(S.verbose("Adding variation to popup",e),u.addClass(e))},visible:function(){p.addClass(f.visible)}},remove:{loading:function(){u.removeClass(f.loading)},variation:function(e){(e=e||S.get.variation())&&(S.verbose("Removing variation",e),u.removeClass(e))},visible:function(){p.removeClass(f.visible)},attempts:function(){S.verbose("Resetting all searched positions"),b=0,y=!1}},bind:{events:function(){S.debug("Binding popup events to module"),"click"==d.on&&p.on("click"+a,S.toggle),"hover"==d.on&&p.on("touchstart"+a,S.event.touchstart),S.get.startEvent()&&p.on(S.get.startEvent()+a,S.event.start).on(S.get.endEvent()+a,S.event.end),d.target&&S.debug("Target set to element",v),R.on("resize"+t,S.event.resize)},popup:function(){S.verbose("Allowing hover events on popup to prevent closing"),u&&S.has.popup()&&u.on("mouseenter"+a,S.event.start).on("mouseleave"+a,S.event.end)},close:function(){(!0===d.hideOnScroll||"auto"==d.hideOnScroll&&"click"!=d.on)&&S.bind.closeOnScroll(),S.is.closable()?S.bind.clickaway():"hover"==d.on&&x&&S.bind.touchClose()},closeOnScroll:function(){S.verbose("Binding scroll close event to document"),l.one(S.get.scrollEvent()+t,S.event.hideGracefully)},touchClose:function(){S.verbose("Binding popup touchclose event to document"),A.on("touchstart"+t,function(e){S.verbose("Touched away from popup"),S.event.hideGracefully.call(C,e)})},clickaway:function(){S.verbose("Binding popup close event to document"),A.on("click"+t,function(e){S.verbose("Clicked away from popup"),S.event.hideGracefully.call(C,e)})}},unbind:{events:function(){R.off(t),p.off(a)},close:function(){A.off(t),l.off(t)}},has:{popup:function(){return u&&0<u.length}},should:{centerArrow:function(e){return!S.is.basic()&&e.target.width<=2*d.arrowPixelsFromEdge}},is:{closable:function(){return"auto"==d.closable?"hover"!=d.on:d.closable},offstage:function(e,n){var i=[];return z.each(e,function(e,t){t<-d.jitter&&(S.debug("Position exceeds allowable distance from edge",e,t,n),i.push(e))}),0<i.length},svg:function(e){return S.supports.svg()&&e instanceof SVGGraphicsElement},basic:function(){return p.hasClass(f.basic)},active:function(){return p.hasClass(f.active)},animating:function(){return u!==L&&u.hasClass(f.animating)},fluid:function(){return u!==L&&u.hasClass(f.fluid)},visible:function(){return u!==L&&u.hasClass(f.popupVisible)},dropdown:function(){return p.hasClass(f.dropdown)},hidden:function(){return!S.is.visible()},rtl:function(){return"rtl"==p.css("direction")}},reset:function(){S.remove.visible(),d.preserve?z.fn.transition!==L&&u.transition("remove transition"):S.removePopup()},setting:function(e,t){if(z.isPlainObject(e))z.extend(!0,d,e);else{if(t===L)return d[e];d[e]=t}},internal:function(e,t){if(z.isPlainObject(e))z.extend(!0,S,e);else{if(t===L)return S[e];S[e]=t}},debug:function(){!d.silent&&d.debug&&(d.performance?S.performance.log(arguments):(S.debug=Function.prototype.bind.call(console.info,console,d.name+":"),S.debug.apply(console,arguments)))},verbose:function(){!d.silent&&d.verbose&&d.debug&&(d.performance?S.performance.log(arguments):(S.verbose=Function.prototype.bind.call(console.info,console,d.name+":"),S.verbose.apply(console,arguments)))},error:function(){d.silent||(S.error=Function.prototype.bind.call(console.error,console,d.name+":"),S.error.apply(console,arguments))},performance:{log:function(e){var t,n;d.performance&&(n=(t=(new Date).getTime())-(F||t),F=t,O.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:C,"Execution Time":n})),clearTimeout(S.performance.timer),S.performance.timer=setTimeout(S.performance.display,500)},display:function(){var e=d.name+":",n=0;F=!1,clearTimeout(S.performance.timer),z.each(O,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",E&&(e+=" '"+E+"'"),(console.group!==L||console.table!==L)&&0<O.length&&(console.groupCollapsed(e),console.table?console.table(O):z.each(O,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),O=[]}},invoke:function(i,e,t){var o,a,n,r=w;return e=e||j,t=C||t,"string"==typeof i&&r!==L&&(i=i.split(/[\. ]/),o=i.length-1,z.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(z.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==L)return a=r[n],!1;if(!z.isPlainObject(r[t])||e==o)return r[t]!==L&&(a=r[t]),!1;r=r[t]}})),z.isFunction(a)?n=a.apply(t,e):a!==L&&(n=a),z.isArray(T)?T.push(n):T!==L?T=[T,n]:n!==L&&(T=n),a}};q?(w===L&&S.initialize(),S.invoke(D)):(w!==L&&w.invoke("destroy"),S.initialize())}),T!==L?T:this},z.fn.popup.settings={name:"Popup",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"popup",observeChanges:!0,onCreate:function(){},onRemove:function(){},onShow:function(){},onVisible:function(){},onHide:function(){},onUnplaceable:function(){},onHidden:function(){},on:"hover",boundary:I,addTouchEvents:!0,position:"top left",variation:"",movePopup:!0,target:!1,popup:!1,inline:!1,preserve:!1,hoverable:!1,content:!1,html:!1,title:!1,closable:!0,hideOnScroll:"auto",exclusive:!1,context:"body",scrollContext:I,prefer:"opposite",lastResort:!1,arrowPixelsFromEdge:20,delay:{show:50,hide:70},setFluidWidth:!0,duration:200,transition:"scale",distanceAway:0,jitter:2,offset:0,maxSearchDepth:15,error:{invalidPosition:"The position you specified is not a valid position",cannotPlace:"Popup does not fit within the boundaries of the viewport",method:"The method you called is not defined.",noTransition:"This module requires ui transitions <https://github.com/Semantic-Org/UI-Transition>",notFound:"The target or popup you specified does not exist on the page"},metadata:{activator:"activator",content:"content",html:"html",offset:"offset",position:"position",title:"title",variation:"variation"},className:{active:"active",basic:"basic",animating:"animating",dropdown:"dropdown",fluid:"fluid",loading:"loading",popup:"ui popup",position:"top left center bottom right",visible:"visible",popupVisible:"visible"},selector:{popup:".ui.popup"},templates:{escape:function(e){var t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"};return/[&<>"'`]/.test(e)?e.replace(/[&<>"'`]/g,function(e){return t[e]}):e},popup:function(e){var t="",n=z.fn.popup.settings.templates.escape;return typeof e!==L&&(typeof e.title!==L&&e.title&&(e.title=n(e.title),t+='<div class="header">'+e.title+"</div>"),typeof e.content!==L&&e.content&&(e.content=n(e.content),t+='<div class="content">'+e.content+"</div>")),t}}}}(jQuery,window,document),function(k,e,T,A){"use strict";void 0!==(e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")())&&e.Math==Math||"undefined"!=typeof self&&self.Math==Math||Function("return this")();k.fn.progress=function(h){var v,e=k(this),b=e.selector||"",y=(new Date).getTime(),x=[],C=h,w="string"==typeof C,S=[].slice.call(arguments,1);return e.each(function(){var i=k.isPlainObject(h)?k.extend(!0,{},k.fn.progress.settings,h):k.extend({},k.fn.progress.settings),t=i.className,n=i.metadata,e=i.namespace,o=i.selector,s=i.error,a="."+e,r="module-"+e,l=k(this),c=k(this).find(o.bar),u=k(this).find(o.progress),d=k(this).find(o.label),f=this,m=l.data(r),g=!1,p={initialize:function(){p.debug("Initializing progress bar",i),p.set.duration(),p.set.transitionEvent(),p.read.metadata(),p.read.settings(),p.instantiate()},instantiate:function(){p.verbose("Storing instance of progress",p),m=p,l.data(r,p)},destroy:function(){p.verbose("Destroying previous progress for",l),clearInterval(m.interval),p.remove.state(),l.removeData(r),m=A},reset:function(){p.remove.nextValue(),p.update.progress(0)},complete:function(){(p.percent===A||p.percent<100)&&(p.remove.progressPoll(),p.set.percent(100))},read:{metadata:function(){var e={percent:l.data(n.percent),total:l.data(n.total),value:l.data(n.value)};e.percent&&(p.debug("Current percent value set from metadata",e.percent),p.set.percent(e.percent)),e.total&&(p.debug("Total value set from metadata",e.total),p.set.total(e.total)),e.value&&(p.debug("Current value set from metadata",e.value),p.set.value(e.value),p.set.progress(e.value))},settings:function(){!1!==i.total&&(p.debug("Current total set in settings",i.total),p.set.total(i.total)),!1!==i.value&&(p.debug("Current value set in settings",i.value),p.set.value(i.value),p.set.progress(p.value)),!1!==i.percent&&(p.debug("Current percent set in settings",i.percent),p.set.percent(i.percent))}},bind:{transitionEnd:function(t){var e=p.get.transitionEnd();c.one(e+a,function(e){clearTimeout(p.failSafeTimer),t.call(this,e)}),p.failSafeTimer=setTimeout(function(){c.triggerHandler(e)},i.duration+i.failSafeDelay),p.verbose("Adding fail safe timer",p.timer)}},increment:function(e){var t,n;p.has.total()?n=(t=p.get.value())+(e=e||1):(n=(t=p.get.percent())+(e=e||p.get.randomValue()),p.debug("Incrementing percentage by",t,n)),n=p.get.normalizedValue(n),p.set.progress(n)},decrement:function(e){var t,n;p.get.total()?(n=(t=p.get.value())-(e=e||1),p.debug("Decrementing value by",e,t)):(n=(t=p.get.percent())-(e=e||p.get.randomValue()),p.debug("Decrementing percentage by",e,t)),n=p.get.normalizedValue(n),p.set.progress(n)},has:{progressPoll:function(){return p.progressPoll},total:function(){return!1!==p.get.total()}},get:{text:function(e){var t=p.value||0,n=p.total||0,i=g?p.get.displayPercent():p.percent||0,o=0<p.total?n-t:100-i;return e=(e=e||"").replace("{value}",t).replace("{total}",n).replace("{left}",o).replace("{percent}",i),p.verbose("Adding variables to progress bar text",e),e},normalizedValue:function(e){if(e<0)return p.debug("Value cannot decrement below 0"),0;if(p.has.total()){if(e>p.total)return p.debug("Value cannot increment above total",p.total),p.total}else if(100<e)return p.debug("Value cannot increment above 100 percent"),100;return e},updateInterval:function(){return"auto"==i.updateInterval?i.duration:i.updateInterval},randomValue:function(){return p.debug("Generating random increment percentage"),Math.floor(Math.random()*i.random.max+i.random.min)},numericValue:function(e){return"string"==typeof e?""!==e.replace(/[^\d.]/g,"")&&+e.replace(/[^\d.]/g,""):e},transitionEnd:function(){var e,t=T.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==A)return n[e]},displayPercent:function(){var e=c.width(),t=l.width(),n=parseInt(c.css("min-width"),10)<e?e/t*100:p.percent;return 0<i.precision?Math.round(n*(10*i.precision))/(10*i.precision):Math.round(n)},percent:function(){return p.percent||0},value:function(){return p.nextValue||p.value||0},total:function(){return p.total||!1}},create:{progressPoll:function(){p.progressPoll=setTimeout(function(){p.update.toNextValue(),p.remove.progressPoll()},p.get.updateInterval())}},is:{complete:function(){return p.is.success()||p.is.warning()||p.is.error()},success:function(){return l.hasClass(t.success)},warning:function(){return l.hasClass(t.warning)},error:function(){return l.hasClass(t.error)},active:function(){return l.hasClass(t.active)},visible:function(){return l.is(":visible")}},remove:{progressPoll:function(){p.verbose("Removing progress poll timer"),p.progressPoll&&(clearTimeout(p.progressPoll),delete p.progressPoll)},nextValue:function(){p.verbose("Removing progress value stored for next update"),delete p.nextValue},state:function(){p.verbose("Removing stored state"),delete p.total,delete p.percent,delete p.value},active:function(){p.verbose("Removing active state"),l.removeClass(t.active)},success:function(){p.verbose("Removing success state"),l.removeClass(t.success)},warning:function(){p.verbose("Removing warning state"),l.removeClass(t.warning)},error:function(){p.verbose("Removing error state"),l.removeClass(t.error)}},set:{barWidth:function(e){100<e?p.error(s.tooHigh,e):e<0?p.error(s.tooLow,e):(c.css("width",e+"%"),l.attr("data-percent",parseInt(e,10)))},duration:function(e){e="number"==typeof(e=e||i.duration)?e+"ms":e,p.verbose("Setting progress bar transition duration",e),c.css({"transition-duration":e})},percent:function(e){e="string"==typeof e?+e.replace("%",""):e,e=0<i.precision?Math.round(e*(10*i.precision))/(10*i.precision):Math.round(e),p.percent=e,p.has.total()||(p.value=0<i.precision?Math.round(e/100*p.total*(10*i.precision))/(10*i.precision):Math.round(e/100*p.total*10)/10,i.limitValues&&(p.value=100<p.value?100:p.value<0?0:p.value)),p.set.barWidth(e),p.set.labelInterval(),p.set.labels(),i.onChange.call(f,e,p.value,p.total)},labelInterval:function(){clearInterval(p.interval),p.bind.transitionEnd(function(){p.verbose("Bar finished animating, removing continuous label updates"),clearInterval(p.interval),g=!1,p.set.labels()}),g=!0,p.interval=setInterval(function(){k.contains(T.documentElement,f)||(clearInterval(p.interval),g=!1),p.set.labels()},i.framerate)},labels:function(){p.verbose("Setting both bar progress and outer label text"),p.set.barLabel(),p.set.state()},label:function(e){(e=e||"")&&(e=p.get.text(e),p.verbose("Setting label to text",e),d.text(e))},state:function(e){100===(e=e!==A?e:p.percent)?i.autoSuccess&&!(p.is.warning()||p.is.error()||p.is.success())?(p.set.success(),p.debug("Automatically triggering success at 100%")):(p.verbose("Reached 100% removing active state"),p.remove.active(),p.remove.progressPoll()):0<e?(p.verbose("Adjusting active progress bar label",e),p.set.active()):(p.remove.active(),p.set.label(i.text.active))},barLabel:function(e){e!==A?u.text(p.get.text(e)):"ratio"==i.label&&p.total?(p.verbose("Adding ratio to bar label"),u.text(p.get.text(i.text.ratio))):"percent"==i.label&&(p.verbose("Adding percentage to bar label"),u.text(p.get.text(i.text.percent)))},active:function(e){e=e||i.text.active,p.debug("Setting active state"),i.showActivity&&!p.is.active()&&l.addClass(t.active),p.remove.warning(),p.remove.error(),p.remove.success(),(e=i.onLabelUpdate("active",e,p.value,p.total))&&p.set.label(e),p.bind.transitionEnd(function(){i.onActive.call(f,p.value,p.total)})},success:function(e){e=e||i.text.success||i.text.active,p.debug("Setting success state"),l.addClass(t.success),p.remove.active(),p.remove.warning(),p.remove.error(),p.complete(),e=i.text.success?i.onLabelUpdate("success",e,p.value,p.total):i.onLabelUpdate("active",e,p.value,p.total),p.set.label(e),p.bind.transitionEnd(function(){i.onSuccess.call(f,p.total)})},warning:function(e){e=e||i.text.warning,p.debug("Setting warning state"),l.addClass(t.warning),p.remove.active(),p.remove.success(),p.remove.error(),p.complete(),(e=i.onLabelUpdate("warning",e,p.value,p.total))&&p.set.label(e),p.bind.transitionEnd(function(){i.onWarning.call(f,p.value,p.total)})},error:function(e){e=e||i.text.error,p.debug("Setting error state"),l.addClass(t.error),p.remove.active(),p.remove.success(),p.remove.warning(),p.complete(),(e=i.onLabelUpdate("error",e,p.value,p.total))&&p.set.label(e),p.bind.transitionEnd(function(){i.onError.call(f,p.value,p.total)})},transitionEvent:function(){p.get.transitionEnd()},total:function(e){p.total=e},value:function(e){p.value=e},progress:function(e){p.has.progressPoll()?(p.debug("Updated within interval, setting next update to use new value",e),p.set.nextValue(e)):(p.debug("First update in progress update interval, immediately updating",e),p.update.progress(e),p.create.progressPoll())},nextValue:function(e){p.nextValue=e}},update:{toNextValue:function(){var e=p.nextValue;e&&(p.debug("Update interval complete using last updated value",e),p.update.progress(e),p.remove.nextValue())},progress:function(e){var t;!1===(e=p.get.numericValue(e))&&p.error(s.nonNumeric,e),e=p.get.normalizedValue(e),p.has.total()?(p.set.value(e),t=e/p.total*100,p.debug("Calculating percent complete from total",t)):(t=e,p.debug("Setting value to exact percentage value",t)),p.set.percent(t)}},setting:function(e,t){if(p.debug("Changing setting",e,t),k.isPlainObject(e))k.extend(!0,i,e);else{if(t===A)return i[e];k.isPlainObject(i[e])?k.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(k.isPlainObject(e))k.extend(!0,p,e);else{if(t===A)return p[e];p[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?p.performance.log(arguments):(p.debug=Function.prototype.bind.call(console.info,console,i.name+":"),p.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?p.performance.log(arguments):(p.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),p.verbose.apply(console,arguments)))},error:function(){i.silent||(p.error=Function.prototype.bind.call(console.error,console,i.name+":"),p.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(y||t),y=t,x.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:f,"Execution Time":n})),clearTimeout(p.performance.timer),p.performance.timer=setTimeout(p.performance.display,500)},display:function(){var e=i.name+":",n=0;y=!1,clearTimeout(p.performance.timer),k.each(x,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",b&&(e+=" '"+b+"'"),(console.group!==A||console.table!==A)&&0<x.length&&(console.groupCollapsed(e),console.table?console.table(x):k.each(x,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),x=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||S,t=f||t,"string"==typeof i&&r!==A&&(i=i.split(/[\. ]/),o=i.length-1,k.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(k.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==A)return a=r[n],!1;if(!k.isPlainObject(r[t])||e==o)return r[t]!==A?a=r[t]:p.error(s.method,i),!1;r=r[t]}})),k.isFunction(a)?n=a.apply(t,e):a!==A&&(n=a),k.isArray(v)?v.push(n):v!==A?v=[v,n]:n!==A&&(v=n),a}};w?(m===A&&p.initialize(),p.invoke(C)):(m!==A&&m.invoke("destroy"),p.initialize())}),v!==A?v:this},k.fn.progress.settings={name:"Progress",namespace:"progress",silent:!1,debug:!1,verbose:!1,performance:!0,random:{min:2,max:5},duration:300,updateInterval:"auto",autoSuccess:!0,showActivity:!0,limitValues:!0,label:"percent",precision:0,framerate:1e3/30,percent:!1,total:!1,value:!1,failSafeDelay:100,onLabelUpdate:function(e,t,n,i){return t},onChange:function(e,t,n){},onSuccess:function(e){},onActive:function(e,t){},onError:function(e,t){},onWarning:function(e,t){},error:{method:"The method you called is not defined.",nonNumeric:"Progress value is non numeric",tooHigh:"Value specified is above 100%",tooLow:"Value specified is below 0%"},regExp:{variable:/\{\$*[A-z0-9]+\}/g},metadata:{percent:"percent",total:"total",value:"value"},selector:{bar:"> .bar",label:"> .label",progress:".bar > .progress"},text:{active:!1,error:!1,success:!1,warning:!1,percent:"{percent}%",ratio:"{value} of {total}"},className:{active:"active",error:"error",success:"success",warning:"warning"}}}(jQuery,window,document),function(w,e,S){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),w.fn.rating=function(m){var g,p=w(this),h=p.selector||"",v=(new Date).getTime(),b=[],y=m,x="string"==typeof y,C=[].slice.call(arguments,1);return p.each(function(){var e,i=w.isPlainObject(m)?w.extend(!0,{},w.fn.rating.settings,m):w.extend({},w.fn.rating.settings),t=i.namespace,o=i.className,n=i.metadata,a=i.selector,r=(i.error,"."+t),s="module-"+t,l=this,c=w(this).data(s),u=w(this),d=u.find(a.icon),f={initialize:function(){f.verbose("Initializing rating module",i),0===d.length&&f.setup.layout(),i.interactive?f.enable():f.disable(),f.set.initialLoad(),f.set.rating(f.get.initialRating()),f.remove.initialLoad(),f.instantiate()},instantiate:function(){f.verbose("Instantiating module",i),c=f,u.data(s,f)},destroy:function(){f.verbose("Destroying previous instance",c),f.remove.events(),u.removeData(s)},refresh:function(){d=u.find(a.icon)},setup:{layout:function(){var e=f.get.maxRating(),t=w.fn.rating.settings.templates.icon(e);f.debug("Generating icon html dynamically"),u.html(t),f.refresh()}},event:{mouseenter:function(){var e=w(this);e.nextAll().removeClass(o.selected),u.addClass(o.selected),e.addClass(o.selected).prevAll().addClass(o.selected)},mouseleave:function(){u.removeClass(o.selected),d.removeClass(o.selected)},click:function(){var e=w(this),t=f.get.rating(),n=d.index(e)+1;("auto"==i.clearable?1===d.length:i.clearable)&&t==n?f.clearRating():f.set.rating(n)}},clearRating:function(){f.debug("Clearing current rating"),f.set.rating(0)},bind:{events:function(){f.verbose("Binding events"),u.on("mouseenter"+r,a.icon,f.event.mouseenter).on("mouseleave"+r,a.icon,f.event.mouseleave).on("click"+r,a.icon,f.event.click)}},remove:{events:function(){f.verbose("Removing events"),u.off(r)},initialLoad:function(){e=!1}},enable:function(){f.debug("Setting rating to interactive mode"),f.bind.events(),u.removeClass(o.disabled)},disable:function(){f.debug("Setting rating to read-only mode"),f.remove.events(),u.addClass(o.disabled)},is:{initialLoad:function(){return e}},get:{initialRating:function(){return u.data(n.rating)!==S?(u.removeData(n.rating),u.data(n.rating)):i.initialRating},maxRating:function(){return u.data(n.maxRating)!==S?(u.removeData(n.maxRating),u.data(n.maxRating)):i.maxRating},rating:function(){var e=d.filter("."+o.active).length;return f.verbose("Current rating retrieved",e),e}},set:{rating:function(e){var t=0<=e-1?e-1:0,n=d.eq(t);u.removeClass(o.selected),d.removeClass(o.selected).removeClass(o.active),0<e&&(f.verbose("Setting current rating to",e),n.prevAll().addBack().addClass(o.active)),f.is.initialLoad()||i.onRate.call(l,e)},initialLoad:function(){e=!0}},setting:function(e,t){if(f.debug("Changing setting",e,t),w.isPlainObject(e))w.extend(!0,i,e);else{if(t===S)return i[e];w.isPlainObject(i[e])?w.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(w.isPlainObject(e))w.extend(!0,f,e);else{if(t===S)return f[e];f[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?f.performance.log(arguments):(f.debug=Function.prototype.bind.call(console.info,console,i.name+":"),f.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?f.performance.log(arguments):(f.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),f.verbose.apply(console,arguments)))},error:function(){i.silent||(f.error=Function.prototype.bind.call(console.error,console,i.name+":"),f.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(v||t),v=t,b.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(f.performance.timer),f.performance.timer=setTimeout(f.performance.display,500)},display:function(){var e=i.name+":",n=0;v=!1,clearTimeout(f.performance.timer),w.each(b,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",h&&(e+=" '"+h+"'"),1<p.length&&(e+=" ("+p.length+")"),(console.group!==S||console.table!==S)&&0<b.length&&(console.groupCollapsed(e),console.table?console.table(b):w.each(b,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),b=[]}},invoke:function(i,e,t){var o,a,n,r=c;return e=e||C,t=l||t,"string"==typeof i&&r!==S&&(i=i.split(/[\. ]/),o=i.length-1,w.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(w.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==S)return a=r[n],!1;if(!w.isPlainObject(r[t])||e==o)return r[t]!==S&&(a=r[t]),!1;r=r[t]}})),w.isFunction(a)?n=a.apply(t,e):a!==S&&(n=a),w.isArray(g)?g.push(n):g!==S?g=[g,n]:n!==S&&(g=n),a}};x?(c===S&&f.initialize(),f.invoke(y)):(c!==S&&c.invoke("destroy"),f.initialize())}),g!==S?g:this},w.fn.rating.settings={name:"Rating",namespace:"rating",slent:!1,debug:!1,verbose:!1,performance:!0,initialRating:0,interactive:!0,maxRating:4,clearable:"auto",fireOnInit:!1,onRate:function(e){},error:{method:"The method you called is not defined",noMaximum:"No maximum rating specified. Cannot generate HTML automatically"},metadata:{rating:"rating",maxRating:"maxRating"},className:{active:"active",disabled:"disabled",selected:"selected",loading:"loading"},selector:{icon:".icon"},templates:{icon:function(e){for(var t=1,n="";t<=e;)n+='<i class="icon"></i>',t++;return n}}}}(jQuery,window,void document),function(E,F,O,D){"use strict";F=void 0!==F&&F.Math==Math?F:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),E.fn.search=function(l){var C,w=E(this),S=w.selector||"",k=(new Date).getTime(),T=[],A=l,R="string"==typeof A,P=[].slice.call(arguments,1);return E(this).each(function(){var c=E.isPlainObject(l)?E.extend(!0,{},E.fn.search.settings,l):E.extend({},E.fn.search.settings),f=c.className,u=c.metadata,d=c.regExp,a=c.fields,m=c.selector,g=c.error,e=c.namespace,i="."+e,t=e+"-module",p=E(this),h=p.find(m.prompt),n=p.find(m.searchButton),o=p.find(m.results),r=p.find(m.result),v=(p.find(m.category),this),s=p.data(t),b=!1,y=!1,x={initialize:function(){x.verbose("Initializing module"),x.get.settings(),x.determine.searchFields(),x.bind.events(),x.set.type(),x.create.results(),x.instantiate()},instantiate:function(){x.verbose("Storing instance of module",x),s=x,p.data(t,x)},destroy:function(){x.verbose("Destroying instance"),p.off(i).removeData(t)},refresh:function(){x.debug("Refreshing selector cache"),h=p.find(m.prompt),n=p.find(m.searchButton),p.find(m.category),o=p.find(m.results),r=p.find(m.result)},refreshResults:function(){o=p.find(m.results),r=p.find(m.result)},bind:{events:function(){x.verbose("Binding events to search"),c.automatic&&(p.on(x.get.inputEvent()+i,m.prompt,x.event.input),h.attr("autocomplete","off")),p.on("focus"+i,m.prompt,x.event.focus).on("blur"+i,m.prompt,x.event.blur).on("keydown"+i,m.prompt,x.handleKeyboard).on("click"+i,m.searchButton,x.query).on("mousedown"+i,m.results,x.event.result.mousedown).on("mouseup"+i,m.results,x.event.result.mouseup).on("click"+i,m.result,x.event.result.click)}},determine:{searchFields:function(){l&&l.searchFields!==D&&(c.searchFields=l.searchFields)}},event:{input:function(){c.searchDelay?(clearTimeout(x.timer),x.timer=setTimeout(function(){x.is.focused()&&x.query()},c.searchDelay)):x.query()},focus:function(){x.set.focus(),c.searchOnFocus&&x.has.minimumCharacters()&&x.query(function(){x.can.show()&&x.showResults()})},blur:function(e){function t(){x.cancel.query(),x.remove.focus(),x.timer=setTimeout(x.hideResults,c.hideDelay)}var n=O.activeElement===this;n||(y=!1,x.resultsClicked?(x.debug("Determining if user action caused search to close"),p.one("click.close"+i,m.results,function(e){x.is.inMessage(e)||b?h.focus():(b=!1,x.is.animating()||x.is.hidden()||t())})):(x.debug("Input blurred without user action, closing results"),t()))},result:{mousedown:function(){x.resultsClicked=!0},mouseup:function(){x.resultsClicked=!1},click:function(e){x.debug("Search result selected");var t=E(this),n=t.find(m.title).eq(0),i=t.is("a[href]")?t:t.find("a[href]").eq(0),o=i.attr("href")||!1,a=i.attr("target")||!1,r=(n.html(),0<n.length&&n.text()),s=x.get.results(),l=t.data(u.result)||x.get.result(r,s);if(E.isFunction(c.onSelect)&&!1===c.onSelect.call(v,l,s))return x.debug("Custom onSelect callback cancelled default select action"),void(b=!0);x.hideResults(),r&&x.set.value(r),o&&(x.verbose("Opening search link found in result",i),"_blank"==a||e.ctrlKey?F.open(o):F.location.href=o)}}},handleKeyboard:function(e){var t,n=p.find(m.result),i=p.find(m.category),o=n.filter("."+f.active),a=n.index(o),r=n.length,s=0<o.length,l=e.which,c=13,u=38,d=40;if(l==27&&(x.verbose("Escape key pressed, blurring search field"),x.hideResults(),y=!0),x.is.visible())if(l==c){if(x.verbose("Enter key pressed, selecting active result"),0<n.filter("."+f.active).length)return x.event.result.click.call(n.filter("."+f.active),e),e.preventDefault(),!1}else l==u&&s?(x.verbose("Up key pressed, changing active result"),t=a-1<0?a:a-1,i.removeClass(f.active),n.removeClass(f.active).eq(t).addClass(f.active).closest(i).addClass(f.active),e.preventDefault()):l==d&&(x.verbose("Down key pressed, changing active result"),t=r<=a+1?a:a+1,i.removeClass(f.active),n.removeClass(f.active).eq(t).addClass(f.active).closest(i).addClass(f.active),e.preventDefault());else l==c&&(x.verbose("Enter key pressed, executing query"),x.query(),x.set.buttonPressed(),h.one("keyup",x.remove.buttonFocus))},setup:{api:function(t,n){var e={debug:c.debug,on:!1,cache:c.cache,action:"search",urlData:{query:t},onSuccess:function(e){x.parse.response.call(v,e,t),n()},onFailure:function(){x.displayMessage(g.serverError),n()},onAbort:function(e){},onError:x.error};E.extend(!0,e,c.apiSettings),x.verbose("Setting up API request",e),p.api(e)}},can:{useAPI:function(){return E.fn.api!==D},show:function(){return x.is.focused()&&!x.is.visible()&&!x.is.empty()},transition:function(){return c.transition&&E.fn.transition!==D&&p.transition("is supported")}},is:{animating:function(){return o.hasClass(f.animating)},hidden:function(){return o.hasClass(f.hidden)},inMessage:function(e){if(e.target){var t=E(e.target);return E.contains(O.documentElement,e.target)&&0<t.closest(m.message).length}},empty:function(){return""===o.html()},visible:function(){return 0<o.filter(":visible").length},focused:function(){return 0<h.filter(":focus").length}},get:{settings:function(){E.isPlainObject(l)&&l.searchFullText&&(c.fullTextSearch=l.searchFullText,x.error(c.error.oldSearchSyntax,v))},inputEvent:function(){var e=h[0];return e!==D&&e.oninput!==D?"input":e!==D&&e.onpropertychange!==D?"propertychange":"keyup"},value:function(){return h.val()},results:function(){return p.data(u.results)},result:function(n,e){var i=["title","id"],o=!1;return n=n!==D?n:x.get.value(),e=e!==D?e:x.get.results(),"category"===c.type?(x.debug("Finding result that matches",n),E.each(e,function(e,t){if(E.isArray(t.results)&&(o=x.search.object(n,t.results,i)[0]))return!1})):(x.debug("Finding result in results object",n),o=x.search.object(n,e,i)[0]),o||!1}},select:{firstResult:function(){x.verbose("Selecting first result"),r.first().addClass(f.active)}},set:{focus:function(){p.addClass(f.focus)},loading:function(){p.addClass(f.loading)},value:function(e){x.verbose("Setting search input value",e),h.val(e)},type:function(e){e=e||c.type,"category"==c.type&&p.addClass(c.type)},buttonPressed:function(){n.addClass(f.pressed)}},remove:{loading:function(){p.removeClass(f.loading)},focus:function(){p.removeClass(f.focus)},buttonPressed:function(){n.removeClass(f.pressed)}},query:function(e){e=E.isFunction(e)?e:function(){};var t=x.get.value(),n=x.read.cache(t);e=e||function(){},x.has.minimumCharacters()?(n?(x.debug("Reading result from cache",t),x.save.results(n.results),x.addResults(n.html),x.inject.id(n.results),e()):(x.debug("Querying for",t),E.isPlainObject(c.source)||E.isArray(c.source)?(x.search.local(t),e()):x.can.useAPI()?x.search.remote(t,e):(x.error(g.source),e())),c.onSearchQuery.call(v,t)):x.hideResults()},search:{local:function(e){var t,n=x.search.object(e,c.content);x.set.loading(),x.save.results(n),x.debug("Returned full local search results",n),0<c.maxResults&&(x.debug("Using specified max results",n),n=n.slice(0,c.maxResults)),"category"==c.type&&(n=x.create.categoryResults(n)),t=x.generateResults({results:n}),x.remove.loading(),x.addResults(t),x.inject.id(n),x.write.cache(e,{html:t,results:n})},remote:function(e,t){t=E.isFunction(t)?t:function(){},p.api("is loading")&&p.api("abort"),x.setup.api(e,t),p.api("query")},object:function(i,t,e){function o(e,t){var n=-1==E.inArray(t,a),i=-1==E.inArray(t,s),o=-1==E.inArray(t,r);n&&i&&o&&e.push(t)}var a=[],r=[],s=[],n=i.toString().replace(d.escape,"\\$&"),l=new RegExp(d.beginsWith+n,"i");return t=t||c.source,e=e!==D?e:c.searchFields,E.isArray(e)||(e=[e]),t===D||!1===t?(x.error(g.source),[]):(E.each(e,function(e,n){E.each(t,function(e,t){"string"==typeof t[n]&&(-1!==t[n].search(l)?o(a,t):"exact"===c.fullTextSearch&&x.exactSearch(i,t[n])?o(r,t):1==c.fullTextSearch&&x.fuzzySearch(i,t[n])&&o(s,t))})}),E.merge(r,s),E.merge(a,r),a)}},exactSearch:function(e,t){return e=e.toLowerCase(),-1<(t=t.toLowerCase()).indexOf(e)},fuzzySearch:function(e,t){var n=t.length,i=e.length;if("string"!=typeof e)return!1;if(e=e.toLowerCase(),t=t.toLowerCase(),n<i)return!1;if(i===n)return e===t;e:for(var o=0,a=0;o<i;o++){for(var r=e.charCodeAt(o);a<n;)if(t.charCodeAt(a++)===r)continue e;return!1}return!0},parse:{response:function(e,t){var n=x.generateResults(e);x.verbose("Parsing server response",e),e!==D&&t!==D&&e[a.results]!==D&&(x.addResults(n),x.inject.id(e[a.results]),x.write.cache(t,{html:n,results:e[a.results]}),x.save.results(e[a.results]))}},cancel:{query:function(){x.can.useAPI()&&p.api("abort")}},has:{minimumCharacters:function(){return x.get.value().length>=c.minCharacters},results:function(){return 0!==o.length&&""!=o.html()}},clear:{cache:function(e){var t=p.data(u.cache);e?e&&t&&t[e]&&(x.debug("Removing value from cache",e),delete t[e],p.data(u.cache,t)):(x.debug("Clearing cache",e),p.removeData(u.cache))}},read:{cache:function(e){var t=p.data(u.cache);return!!c.cache&&(x.verbose("Checking cache for generated html for query",e),"object"==typeof t&&t[e]!==D&&t[e])}},create:{categoryResults:function(e){var n={};return E.each(e,function(e,t){t.category&&(n[t.category]===D?(x.verbose("Creating new category of results",t.category),n[t.category]={name:t.category,results:[t]}):n[t.category].results.push(t))}),n},id:function(e,t){var n,i=e+1;return t!==D?(n=String.fromCharCode(97+t)+i,x.verbose("Creating category result id",n)):(n=i,x.verbose("Creating result id",n)),n},results:function(){0===o.length&&(o=E("<div />").addClass(f.results).appendTo(p))}},inject:{result:function(e,t,n){x.verbose("Injecting result into results");var i=n!==D?o.children().eq(n).children(m.results).first().children(m.result).eq(t):o.children(m.result).eq(t);x.verbose("Injecting results metadata",i),i.data(u.result,e)},id:function(i){x.debug("Injecting unique ids into results");var o=0,a=0;return"category"===c.type?E.each(i,function(e,i){a=0,E.each(i.results,function(e,t){var n=i.results[e];n.id===D&&(n.id=x.create.id(a,o)),x.inject.result(n,a,o),a++}),o++}):E.each(i,function(e,t){var n=i[e];n.id===D&&(n.id=x.create.id(a)),x.inject.result(n,a),a++}),i}},save:{results:function(e){x.verbose("Saving current search results to metadata",e),p.data(u.results,e)}},write:{cache:function(e,t){var n=p.data(u.cache)!==D?p.data(u.cache):{};c.cache&&(x.verbose("Writing generated html to cache",e,t),n[e]=t,p.data(u.cache,n))}},addResults:function(e){if(E.isFunction(c.onResultsAdd)&&!1===c.onResultsAdd.call(o,e))return x.debug("onResultsAdd callback cancelled default action"),!1;e?(o.html(e),x.refreshResults(),c.selectFirstResult&&x.select.firstResult(),x.showResults()):x.hideResults(function(){o.empty()})},showResults:function(e){e=E.isFunction(e)?e:function(){},y||!x.is.visible()&&x.has.results()&&(x.can.transition()?(x.debug("Showing results with css animations"),o.transition({animation:c.transition+" in",debug:c.debug,verbose:c.verbose,duration:c.duration,onComplete:function(){e()},queue:!0})):(x.debug("Showing results with javascript"),o.stop().fadeIn(c.duration,c.easing)),c.onResultsOpen.call(o))},hideResults:function(e){e=E.isFunction(e)?e:function(){},x.is.visible()&&(x.can.transition()?(x.debug("Hiding results with css animations"),o.transition({animation:c.transition+" out",debug:c.debug,verbose:c.verbose,duration:c.duration,onComplete:function(){e()},queue:!0})):(x.debug("Hiding results with javascript"),o.stop().fadeOut(c.duration,c.easing)),c.onResultsClose.call(o))},generateResults:function(e){x.debug("Generating html from response",e);var t=c.templates[c.type],n=E.isPlainObject(e[a.results])&&!E.isEmptyObject(e[a.results]),i=E.isArray(e[a.results])&&0<e[a.results].length,o="";return n||i?(0<c.maxResults&&(n?"standard"==c.type&&x.error(g.maxResults):e[a.results]=e[a.results].slice(0,c.maxResults)),E.isFunction(t)?o=t(e,a):x.error(g.noTemplate,!1)):c.showNoResults&&(o=x.displayMessage(g.noResults,"empty")),c.onResults.call(v,e),o},displayMessage:function(e,t){return t=t||"standard",x.debug("Displaying message",e,t),x.addResults(c.templates.message(e,t)),c.templates.message(e,t)},setting:function(e,t){if(E.isPlainObject(e))E.extend(!0,c,e);else{if(t===D)return c[e];c[e]=t}},internal:function(e,t){if(E.isPlainObject(e))E.extend(!0,x,e);else{if(t===D)return x[e];x[e]=t}},debug:function(){!c.silent&&c.debug&&(c.performance?x.performance.log(arguments):(x.debug=Function.prototype.bind.call(console.info,console,c.name+":"),x.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?x.performance.log(arguments):(x.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),x.verbose.apply(console,arguments)))},error:function(){c.silent||(x.error=Function.prototype.bind.call(console.error,console,c.name+":"),x.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(k||t),k=t,T.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:v,"Execution Time":n})),clearTimeout(x.performance.timer),x.performance.timer=setTimeout(x.performance.display,500)},display:function(){var e=c.name+":",n=0;k=!1,clearTimeout(x.performance.timer),E.each(T,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",S&&(e+=" '"+S+"'"),1<w.length&&(e+=" ("+w.length+")"),(console.group!==D||console.table!==D)&&0<T.length&&(console.groupCollapsed(e),console.table?console.table(T):E.each(T,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),T=[]}},invoke:function(i,e,t){var o,a,n,r=s;return e=e||P,t=v||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,E.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(E.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!E.isPlainObject(r[t])||e==o)return r[t]!==D&&(a=r[t]),!1;r=r[t]}})),E.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),E.isArray(C)?C.push(n):C!==D?C=[C,n]:n!==D&&(C=n),a}};R?(s===D&&x.initialize(),x.invoke(A)):(s!==D&&s.invoke("destroy"),x.initialize())}),C!==D?C:this},E.fn.search.settings={name:"Search",namespace:"search",silent:!1,debug:!1,verbose:!1,performance:!0,type:"standard",minCharacters:1,selectFirstResult:!1,apiSettings:!1,source:!1,searchOnFocus:!0,searchFields:["title","description"],displayField:"",fullTextSearch:"exact",automatic:!0,hideDelay:0,searchDelay:200,maxResults:7,cache:!0,showNoResults:!0,transition:"scale",duration:200,easing:"easeOutExpo",onSelect:!1,onResultsAdd:!1,onSearchQuery:function(e){},onResults:function(e){},onResultsOpen:function(){},onResultsClose:function(){},className:{animating:"animating",active:"active",empty:"empty",focus:"focus",hidden:"hidden",loading:"loading",results:"results",pressed:"down"},error:{source:"Cannot search. No source used, and Semantic API module was not included",noResults:"Your search returned no results",logging:"Error in debug logging, exiting.",noEndpoint:"No search endpoint was specified",noTemplate:"A valid template name was not specified.",oldSearchSyntax:"searchFullText setting has been renamed fullTextSearch for consistency, please adjust your settings.",serverError:"There was an issue querying the server.",maxResults:"Results must be an array to use maxResults setting",method:"The method you called is not defined."},metadata:{cache:"cache",results:"results",result:"result"},regExp:{escape:/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,beginsWith:"(?:s|^)"},fields:{categories:"results",categoryName:"name",categoryResults:"results",description:"description",image:"image",price:"price",results:"results",title:"title",url:"url",action:"action",actionText:"text",actionURL:"url"},selector:{prompt:".prompt",searchButton:".search.button",results:".results",message:".results > .message",category:".category",result:".result",title:".title, .name"},templates:{escape:function(e){var t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"};return/[&<>"'`]/.test(e)?e.replace(/[&<>"'`]/g,function(e){return t[e]}):e},message:function(e,t){var n="";return e!==D&&t!==D&&(n+='<div class="message '+t+'">',n+="empty"==t?'<div class="header">No Results</div class="header"><div class="description">'+e+'</div class="description">':' <div class="description">'+e+"</div>",n+="</div>"),n},category:function(e,n){var i="";E.fn.search.settings.templates.escape;return e[n.categoryResults]!==D&&(E.each(e[n.categoryResults],function(e,t){t[n.results]!==D&&0<t.results.length&&(i+='<div class="category">',t[n.categoryName]!==D&&(i+='<div class="name">'+t[n.categoryName]+"</div>"),i+='<div class="results">',E.each(t.results,function(e,t){t[n.url]?i+='<a class="result" href="'+t[n.url]+'">':i+='<a class="result">',t[n.image]!==D&&(i+='<div class="image"> <img src="'+t[n.image]+'"></div>'),i+='<div class="content">',t[n.price]!==D&&(i+='<div class="price">'+t[n.price]+"</div>"),t[n.title]!==D&&(i+='<div class="title">'+t[n.title]+"</div>"),t[n.description]!==D&&(i+='<div class="description">'+t[n.description]+"</div>"),i+="</div>",i+="</a>"}),i+="</div>",i+="</div>")}),e[n.action]&&(i+='<a href="'+e[n.action][n.actionURL]+'" class="action">'+e[n.action][n.actionText]+"</a>"),i)},standard:function(e,n){var i="";return e[n.results]!==D&&(E.each(e[n.results],function(e,t){t[n.url]?i+='<a class="result" href="'+t[n.url]+'">':i+='<a class="result">',t[n.image]!==D&&(i+='<div class="image"> <img src="'+t[n.image]+'"></div>'),i+='<div class="content">',t[n.price]!==D&&(i+='<div class="price">'+t[n.price]+"</div>"),t[n.title]!==D&&(i+='<div class="title">'+t[n.title]+"</div>"),t[n.description]!==D&&(i+='<div class="description">'+t[n.description]+"</div>"),i+="</div>",i+="</a>"}),e[n.action]&&(i+='<a href="'+e[n.action][n.actionURL]+'" class="action">'+e[n.action][n.actionText]+"</a>"),i)}}}}(jQuery,window,document),function(A,e,R,P){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),A.fn.shape=function(v){var b,y=A(this),x=(A("body"),(new Date).getTime()),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1),T=e.requestAnimationFrame||e.mozRequestAnimationFrame||e.webkitRequestAnimationFrame||e.msRequestAnimationFrame||function(e){setTimeout(e,0)};return y.each(function(){var i,o,t=y.selector||"",a=A.isPlainObject(v)?A.extend(!0,{},A.fn.shape.settings,v):A.extend({},A.fn.shape.settings),e=a.namespace,r=a.selector,n=a.error,s=a.className,l="."+e,c="module-"+e,u=A(this),d=u.find(r.sides),f=u.find(r.side),m=!1,g=this,p=u.data(c),h={initialize:function(){h.verbose("Initializing module for",g),h.set.defaultSide(),h.instantiate()},instantiate:function(){h.verbose("Storing instance of module",h),p=h,u.data(c,p)},destroy:function(){h.verbose("Destroying previous module for",g),u.removeData(c).off(l)},refresh:function(){h.verbose("Refreshing selector cache for",g),u=A(g),d=A(this).find(r.shape),f=A(this).find(r.side)},repaint:function(){h.verbose("Forcing repaint event");(d[0]||R.createElement("div")).offsetWidth},animate:function(e,t){h.verbose("Animating box with properties",e),t=t||function(e){h.verbose("Executing animation callback"),e!==P&&e.stopPropagation(),h.reset(),h.set.active()},a.beforeChange.call(o[0]),h.get.transitionEvent()?(h.verbose("Starting CSS animation"),u.addClass(s.animating),d.css(e).one(h.get.transitionEvent(),t),h.set.duration(a.duration),T(function(){u.addClass(s.animating),i.addClass(s.hidden)})):t()},queue:function(e){h.debug("Queueing animation of",e),d.one(h.get.transitionEvent(),function(){h.debug("Executing queued animation"),setTimeout(function(){u.shape(e)},0)})},reset:function(){h.verbose("Animating states reset"),u.removeClass(s.animating).attr("style","").removeAttr("style"),d.attr("style","").removeAttr("style"),f.attr("style","").removeAttr("style").removeClass(s.hidden),o.removeClass(s.animating).attr("style","").removeAttr("style")},is:{complete:function(){return f.filter("."+s.active)[0]==o[0]},animating:function(){return u.hasClass(s.animating)}},set:{defaultSide:function(){i=u.find("."+a.className.active),o=0<i.next(r.side).length?i.next(r.side):u.find(r.side).first(),m=!1,h.verbose("Active side set to",i),h.verbose("Next side set to",o)},duration:function(e){e="number"==typeof(e=e||a.duration)?e+"ms":e,h.verbose("Setting animation duration",e),!a.duration&&0!==a.duration||d.add(f).css({"-webkit-transition-duration":e,"-moz-transition-duration":e,"-ms-transition-duration":e,"-o-transition-duration":e,"transition-duration":e})},currentStageSize:function(){var e=u.find("."+a.className.active),t=e.outerWidth(!0),n=e.outerHeight(!0);u.css({width:t,height:n})},stageSize:function(){var e=u.clone().addClass(s.loading),t=e.find("."+a.className.active),n=m?e.find(r.side).eq(m):0<t.next(r.side).length?t.next(r.side):e.find(r.side).first(),i="next"==a.width?n.outerWidth(!0):"initial"==a.width?u.width():a.width,o="next"==a.height?n.outerHeight(!0):"initial"==a.height?u.height():a.height;t.removeClass(s.active),n.addClass(s.active),e.insertAfter(u),e.remove(),"auto"!=a.width&&(u.css("width",i+a.jitter),h.verbose("Specifying width during animation",i)),"auto"!=a.height&&(u.css("height",o+a.jitter),h.verbose("Specifying height during animation",o))},nextSide:function(e){m=e,o=f.filter(e),m=f.index(o),0===o.length&&(h.set.defaultSide(),h.error(n.side)),h.verbose("Next side manually set to",o)},active:function(){h.verbose("Setting new side to active",o),f.removeClass(s.active),o.addClass(s.active),a.onChange.call(o[0]),h.set.defaultSide()}},flip:{up:function(){var e;!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip up"):(h.debug("Flipping up",o),e=h.get.transform.up(),h.set.stageSize(),h.stage.above(),h.animate(e)):h.debug("Side already visible",o)},down:function(){var e;!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip down"):(h.debug("Flipping down",o),e=h.get.transform.down(),h.set.stageSize(),h.stage.below(),h.animate(e)):h.debug("Side already visible",o)},left:function(){var e;!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip left"):(h.debug("Flipping left",o),e=h.get.transform.left(),h.set.stageSize(),h.stage.left(),h.animate(e)):h.debug("Side already visible",o)},right:function(){var e;!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip right"):(h.debug("Flipping right",o),e=h.get.transform.right(),h.set.stageSize(),h.stage.right(),h.animate(e)):h.debug("Side already visible",o)},over:function(){!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip over"):(h.debug("Flipping over",o),h.set.stageSize(),h.stage.behind(),h.animate(h.get.transform.over())):h.debug("Side already visible",o)},back:function(){!h.is.complete()||h.is.animating()||a.allowRepeats?h.is.animating()?h.queue("flip back"):(h.debug("Flipping back",o),h.set.stageSize(),h.stage.behind(),h.animate(h.get.transform.back())):h.debug("Side already visible",o)}},get:{transform:{up:function(){return{transform:"translateY("+-(i.outerHeight(!0)-o.outerHeight(!0))/2+"px) translateZ("+-i.outerHeight(!0)/2+"px) rotateX(-90deg)"}},down:function(){return{transform:"translateY("+-(i.outerHeight(!0)-o.outerHeight(!0))/2+"px) translateZ("+-i.outerHeight(!0)/2+"px) rotateX(90deg)"}},left:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) translateZ("+-i.outerWidth(!0)/2+"px) rotateY(90deg)"}},right:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) translateZ("+-i.outerWidth(!0)/2+"px) rotateY(-90deg)"}},over:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) rotateY(180deg)"}},back:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) rotateY(-180deg)"}}},transitionEvent:function(){var e,t=R.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==P)return n[e]},nextSide:function(){return 0<i.next(r.side).length?i.next(r.side):u.find(r.side).first()}},stage:{above:function(){var e={origin:(i.outerHeight(!0)-o.outerHeight(!0))/2,depth:{active:o.outerHeight(!0)/2,next:i.outerHeight(!0)/2}};h.verbose("Setting the initial animation position as above",o,e),d.css({transform:"translateZ(-"+e.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+e.depth.active+"px)"}),o.addClass(s.animating).css({top:e.origin+"px",transform:"rotateX(90deg) translateZ("+e.depth.next+"px)"})},below:function(){var e={origin:(i.outerHeight(!0)-o.outerHeight(!0))/2,depth:{active:o.outerHeight(!0)/2,next:i.outerHeight(!0)/2}};h.verbose("Setting the initial animation position as below",o,e),d.css({transform:"translateZ(-"+e.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+e.depth.active+"px)"}),o.addClass(s.animating).css({top:e.origin+"px",transform:"rotateX(-90deg) translateZ("+e.depth.next+"px)"})},left:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};h.verbose("Setting the initial animation position as left",o,n),d.css({transform:"translateZ(-"+n.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+n.depth.active+"px)"}),o.addClass(s.animating).css({left:n.origin+"px",transform:"rotateY(-90deg) translateZ("+n.depth.next+"px)"})},right:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};h.verbose("Setting the initial animation position as left",o,n),d.css({transform:"translateZ(-"+n.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+n.depth.active+"px)"}),o.addClass(s.animating).css({left:n.origin+"px",transform:"rotateY(90deg) translateZ("+n.depth.next+"px)"})},behind:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};h.verbose("Setting the initial animation position as behind",o,n),i.css({transform:"rotateY(0deg)"}),o.addClass(s.animating).css({left:n.origin+"px",transform:"rotateY(-180deg)"})}},setting:function(e,t){if(h.debug("Changing setting",e,t),A.isPlainObject(e))A.extend(!0,a,e);else{if(t===P)return a[e];A.isPlainObject(a[e])?A.extend(!0,a[e],t):a[e]=t}},internal:function(e,t){if(A.isPlainObject(e))A.extend(!0,h,e);else{if(t===P)return h[e];h[e]=t}},debug:function(){!a.silent&&a.debug&&(a.performance?h.performance.log(arguments):(h.debug=Function.prototype.bind.call(console.info,console,a.name+":"),h.debug.apply(console,arguments)))},verbose:function(){!a.silent&&a.verbose&&a.debug&&(a.performance?h.performance.log(arguments):(h.verbose=Function.prototype.bind.call(console.info,console,a.name+":"),h.verbose.apply(console,arguments)))},error:function(){a.silent||(h.error=Function.prototype.bind.call(console.error,console,a.name+":"),h.error.apply(console,arguments))},performance:{log:function(e){var t,n;a.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:g,"Execution Time":n})),clearTimeout(h.performance.timer),h.performance.timer=setTimeout(h.performance.display,500)},display:function(){var e=a.name+":",n=0;x=!1,clearTimeout(h.performance.timer),A.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",t&&(e+=" '"+t+"'"),1<y.length&&(e+=" ("+y.length+")"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):A.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=p;return e=e||k,t=g||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,A.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(A.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!A.isPlainObject(r[t])||e==o)return r[t]!==P&&(a=r[t]),!1;r=r[t]}})),A.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),A.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}};S?(p===P&&h.initialize(),h.invoke(w)):(p!==P&&p.invoke("destroy"),h.initialize())}),b!==P?b:this},A.fn.shape.settings={name:"Shape",silent:!1,debug:!1,verbose:!1,jitter:0,performance:!0,namespace:"shape",width:"initial",height:"initial",beforeChange:function(){},onChange:function(){},allowRepeats:!1,duration:!1,error:{side:"You tried to switch to a side that does not exist.",method:"The method you called is not defined"},className:{animating:"animating",hidden:"hidden",loading:"loading",active:"active"},selector:{sides:".sides",side:".side"}}}(jQuery,window,document),function(q,j,z,I){"use strict";j=void 0!==j&&j.Math==Math?j:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),q.fn.sidebar=function(x){var C,e=q(this),w=q(j),S=q(z),k=q("html"),T=q("head"),A=e.selector||"",R=(new Date).getTime(),P=[],E=x,F="string"==typeof E,O=[].slice.call(arguments,1),D=j.requestAnimationFrame||j.mozRequestAnimationFrame||j.webkitRequestAnimationFrame||j.msRequestAnimationFrame||function(e){setTimeout(e,0)};return e.each(function(){var r,s,e,t,l,c=q.isPlainObject(x)?q.extend(!0,{},q.fn.sidebar.settings,x):q.extend({},q.fn.sidebar.settings),n=c.selector,a=c.className,i=c.namespace,o=c.regExp,u=c.error,d="."+i,f="module-"+i,m=q(this),g=q(c.context),p=m.children(n.sidebar),h=(g.children(n.fixed),g.children(n.pusher)),v=this,b=m.data(f),y={initialize:function(){y.debug("Initializing sidebar",x),y.create.id(),l=y.get.transitionEvent(),c.delaySetup?D(y.setup.layout):y.setup.layout(),D(function(){y.setup.cache()}),y.instantiate()},instantiate:function(){y.verbose("Storing instance of module",y),b=y,m.data(f,y)},create:{id:function(){e=(Math.random().toString(16)+"000000000").substr(2,8),s="."+e,y.verbose("Creating unique id for element",e)}},destroy:function(){y.verbose("Destroying previous module for",m),m.off(d).removeData(f),y.is.ios()&&y.remove.ios(),g.off(s),w.off(s),S.off(s)},event:{clickaway:function(e){var t=0<h.find(e.target).length||h.is(e.target),n=g.is(e.target);t&&(y.verbose("User clicked on dimmed page"),y.hide()),n&&(y.verbose("User clicked on dimmable context (scaled out page)"),y.hide())},touch:function(e){},containScroll:function(e){v.scrollTop<=0&&(v.scrollTop=1),v.scrollTop+v.offsetHeight>=v.scrollHeight&&(v.scrollTop=v.scrollHeight-v.offsetHeight-1)},scroll:function(e){0===q(e.target).closest(n.sidebar).length&&e.preventDefault()}},bind:{clickaway:function(){y.verbose("Adding clickaway events to context",g),c.closable&&g.on("click"+s,y.event.clickaway).on("touchend"+s,y.event.clickaway)},scrollLock:function(){c.scrollLock&&(y.debug("Disabling page scroll"),w.on("DOMMouseScroll"+s,y.event.scroll)),y.verbose("Adding events to contain sidebar scroll"),S.on("touchmove"+s,y.event.touch),m.on("scroll"+d,y.event.containScroll)}},unbind:{clickaway:function(){y.verbose("Removing clickaway events from context",g),g.off(s)},scrollLock:function(){y.verbose("Removing scroll lock from page"),S.off(s),w.off(s),m.off("scroll"+d)}},add:{inlineCSS:function(){var e,t=y.cache.width||m.outerWidth(),n=y.cache.height||m.outerHeight(),i=y.is.rtl(),o=y.get.direction(),a={left:t,right:-t,top:n,bottom:-n};i&&(y.verbose("RTL detected, flipping widths"),a.left=-t,a.right=t),e="<style>","left"===o||"right"===o?(y.debug("Adding CSS rules for animation distance",t),e+=" .ui.visible."+o+".sidebar ~ .fixed, .ui.visible."+o+".sidebar ~ .pusher {   -webkit-transform: translate3d("+a[o]+"px, 0, 0);           transform: translate3d("+a[o]+"px, 0, 0); }"):"top"!==o&&"bottom"!=o||(e+=" .ui.visible."+o+".sidebar ~ .fixed, .ui.visible."+o+".sidebar ~ .pusher {   -webkit-transform: translate3d(0, "+a[o]+"px, 0);           transform: translate3d(0, "+a[o]+"px, 0); }"),y.is.ie()&&("left"===o||"right"===o?(y.debug("Adding CSS rules for animation distance",t),e+=" body.pushable > .ui.visible."+o+".sidebar ~ .pusher:after {   -webkit-transform: translate3d("+a[o]+"px, 0, 0);           transform: translate3d("+a[o]+"px, 0, 0); }"):"top"!==o&&"bottom"!=o||(e+=" body.pushable > .ui.visible."+o+".sidebar ~ .pusher:after {   -webkit-transform: translate3d(0, "+a[o]+"px, 0);           transform: translate3d(0, "+a[o]+"px, 0); }"),e+=" body.pushable > .ui.visible.left.sidebar ~ .ui.visible.right.sidebar ~ .pusher:after, body.pushable > .ui.visible.right.sidebar ~ .ui.visible.left.sidebar ~ .pusher:after {   -webkit-transform: translate3d(0px, 0, 0);           transform: translate3d(0px, 0, 0); }"),r=q(e+="</style>").appendTo(T),y.debug("Adding sizing css to head",r)}},refresh:function(){y.verbose("Refreshing selector cache"),g=q(c.context),p=g.children(n.sidebar),h=g.children(n.pusher),g.children(n.fixed),y.clear.cache()},refreshSidebars:function(){y.verbose("Refreshing other sidebars"),p=g.children(n.sidebar)},repaint:function(){y.verbose("Forcing repaint event"),v.style.display="none";v.offsetHeight;v.scrollTop=v.scrollTop,v.style.display=""},setup:{cache:function(){y.cache={width:m.outerWidth(),height:m.outerHeight(),rtl:"rtl"==m.css("direction")}},layout:function(){0===g.children(n.pusher).length&&(y.debug("Adding wrapper element for sidebar"),y.error(u.pusher),h=q('<div class="pusher" />'),g.children().not(n.omitted).not(p).wrapAll(h),y.refresh()),0!==m.nextAll(n.pusher).length&&m.nextAll(n.pusher)[0]===h[0]||(y.debug("Moved sidebar to correct parent element"),y.error(u.movedSidebar,v),m.detach().prependTo(g),y.refresh()),y.clear.cache(),y.set.pushable(),y.set.direction()}},attachEvents:function(e,t){var n=q(e);t=q.isFunction(y[t])?y[t]:y.toggle,0<n.length?(y.debug("Attaching sidebar events to element",e,t),n.on("click"+d,t)):y.error(u.notFound,e)},show:function(e){if(e=q.isFunction(e)?e:function(){},y.is.hidden()){if(y.refreshSidebars(),c.overlay&&(y.error(u.overlay),c.transition="overlay"),y.refresh(),y.othersActive())if(y.debug("Other sidebars currently visible"),c.exclusive){if("overlay"!=c.transition)return void y.hideOthers(y.show);y.hideOthers()}else c.transition="overlay";y.pushPage(function(){e.call(v),c.onShow.call(v)}),c.onChange.call(v),c.onVisible.call(v)}else y.debug("Sidebar is already visible")},hide:function(e){e=q.isFunction(e)?e:function(){},(y.is.visible()||y.is.animating())&&(y.debug("Hiding sidebar",e),y.refreshSidebars(),y.pullPage(function(){e.call(v),c.onHidden.call(v)}),c.onChange.call(v),c.onHide.call(v))},othersAnimating:function(){return 0<p.not(m).filter("."+a.animating).length},othersVisible:function(){return 0<p.not(m).filter("."+a.visible).length},othersActive:function(){return y.othersVisible()||y.othersAnimating()},hideOthers:function(e){var t=p.not(m).filter("."+a.visible),n=t.length,i=0;e=e||function(){},t.sidebar("hide",function(){++i==n&&e()})},toggle:function(){y.verbose("Determining toggled direction"),y.is.hidden()?y.show():y.hide()},pushPage:function(t){var e,n,i,o=y.get.transition(),a="overlay"===o||y.othersActive()?m:h;t=q.isFunction(t)?t:function(){},"scale down"==c.transition&&y.scrollToTop(),y.set.transition(o),y.repaint(),e=function(){y.bind.clickaway(),y.add.inlineCSS(),y.set.animating(),y.set.visible()},n=function(){y.set.dimmed()},i=function(e){e.target==a[0]&&(a.off(l+s,i),y.remove.animating(),y.bind.scrollLock(),t.call(v))},a.off(l+s),a.on(l+s,i),D(e),c.dimPage&&!y.othersVisible()&&D(n)},pullPage:function(t){var e,n,i=y.get.transition(),o="overlay"==i||y.othersActive()?m:h;t=q.isFunction(t)?t:function(){},y.verbose("Removing context push state",y.get.direction()),y.unbind.clickaway(),y.unbind.scrollLock(),e=function(){y.set.transition(i),y.set.animating(),y.remove.visible(),c.dimPage&&!y.othersVisible()&&h.removeClass(a.dimmed)},n=function(e){e.target==o[0]&&(o.off(l+s,n),y.remove.animating(),y.remove.transition(),y.remove.inlineCSS(),("scale down"==i||c.returnScroll&&y.is.mobile())&&y.scrollBack(),t.call(v))},o.off(l+s),o.on(l+s,n),D(e)},scrollToTop:function(){y.verbose("Scrolling to top of page to avoid animation issues"),t=q(j).scrollTop(),m.scrollTop(0),j.scrollTo(0,0)},scrollBack:function(){y.verbose("Scrolling back to original page position"),j.scrollTo(0,t)},clear:{cache:function(){y.verbose("Clearing cached dimensions"),y.cache={}}},set:{ios:function(){k.addClass(a.ios)},pushed:function(){g.addClass(a.pushed)},pushable:function(){g.addClass(a.pushable)},dimmed:function(){h.addClass(a.dimmed)},active:function(){m.addClass(a.active)},animating:function(){m.addClass(a.animating)},transition:function(e){e=e||y.get.transition(),m.addClass(e)},direction:function(e){e=e||y.get.direction(),m.addClass(a[e])},visible:function(){m.addClass(a.visible)},overlay:function(){m.addClass(a.overlay)}},remove:{inlineCSS:function(){y.debug("Removing inline css styles",r),r&&0<r.length&&r.remove()},ios:function(){k.removeClass(a.ios)},pushed:function(){g.removeClass(a.pushed)},pushable:function(){g.removeClass(a.pushable)},active:function(){m.removeClass(a.active)},animating:function(){m.removeClass(a.animating)},transition:function(e){e=e||y.get.transition(),m.removeClass(e)},direction:function(e){e=e||y.get.direction(),m.removeClass(a[e])},visible:function(){m.removeClass(a.visible)},overlay:function(){m.removeClass(a.overlay)}},get:{direction:function(){return m.hasClass(a.top)?a.top:m.hasClass(a.right)?a.right:m.hasClass(a.bottom)?a.bottom:a.left},transition:function(){var e=y.get.direction(),t=y.is.mobile()?"auto"==c.mobileTransition?c.defaultTransition.mobile[e]:c.mobileTransition:"auto"==c.transition?c.defaultTransition.computer[e]:c.transition;return y.verbose("Determined transition",t),t},transitionEvent:function(){var e,t=z.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==I)return n[e]}},is:{ie:function(){return!j.ActiveXObject&&"ActiveXObject"in j||"ActiveXObject"in j},ios:function(){var e=navigator.userAgent,t=e.match(o.ios),n=e.match(o.mobileChrome);return!(!t||n)&&(y.verbose("Browser was found to be iOS",e),!0)},mobile:function(){var e=navigator.userAgent;return e.match(o.mobile)?(y.verbose("Browser was found to be mobile",e),!0):(y.verbose("Browser is not mobile, using regular transition",e),!1)},hidden:function(){return!y.is.visible()},visible:function(){return m.hasClass(a.visible)},open:function(){return y.is.visible()},closed:function(){return y.is.hidden()},vertical:function(){return m.hasClass(a.top)},animating:function(){return g.hasClass(a.animating)},rtl:function(){return y.cache.rtl===I&&(y.cache.rtl="rtl"==m.css("direction")),y.cache.rtl}},setting:function(e,t){if(y.debug("Changing setting",e,t),q.isPlainObject(e))q.extend(!0,c,e);else{if(t===I)return c[e];q.isPlainObject(c[e])?q.extend(!0,c[e],t):c[e]=t}},internal:function(e,t){if(q.isPlainObject(e))q.extend(!0,y,e);else{if(t===I)return y[e];y[e]=t}},debug:function(){!c.silent&&c.debug&&(c.performance?y.performance.log(arguments):(y.debug=Function.prototype.bind.call(console.info,console,c.name+":"),y.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?y.performance.log(arguments):(y.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),y.verbose.apply(console,arguments)))},error:function(){c.silent||(y.error=Function.prototype.bind.call(console.error,console,c.name+":"),y.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(R||t),R=t,P.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:v,"Execution Time":n})),clearTimeout(y.performance.timer),y.performance.timer=setTimeout(y.performance.display,500)},display:function(){var e=c.name+":",n=0;R=!1,clearTimeout(y.performance.timer),q.each(P,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",A&&(e+=" '"+A+"'"),(console.group!==I||console.table!==I)&&0<P.length&&(console.groupCollapsed(e),console.table?console.table(P):q.each(P,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),P=[]}},invoke:function(i,e,t){var o,a,n,r=b;return e=e||O,t=v||t,"string"==typeof i&&r!==I&&(i=i.split(/[\. ]/),o=i.length-1,q.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(q.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==I)return a=r[n],!1;if(!q.isPlainObject(r[t])||e==o)return r[t]!==I?a=r[t]:y.error(u.method,i),!1;r=r[t]}})),q.isFunction(a)?n=a.apply(t,e):a!==I&&(n=a),q.isArray(C)?C.push(n):C!==I?C=[C,n]:n!==I&&(C=n),a}};F?(b===I&&y.initialize(),y.invoke(E)):(b!==I&&y.invoke("destroy"),y.initialize())}),C!==I?C:this},q.fn.sidebar.settings={name:"Sidebar",namespace:"sidebar",silent:!1,debug:!1,verbose:!1,performance:!0,transition:"auto",mobileTransition:"auto",defaultTransition:{computer:{left:"uncover",right:"uncover",top:"overlay",bottom:"overlay"},mobile:{left:"uncover",right:"uncover",top:"overlay",bottom:"overlay"}},context:"body",exclusive:!1,closable:!0,dimPage:!0,scrollLock:!1,returnScroll:!1,delaySetup:!1,duration:500,onChange:function(){},onShow:function(){},onHide:function(){},onHidden:function(){},onVisible:function(){},className:{active:"active",animating:"animating",dimmed:"dimmed",ios:"ios",pushable:"pushable",pushed:"pushed",right:"right",top:"top",left:"left",bottom:"bottom",visible:"visible"},selector:{fixed:".fixed",omitted:"script, link, style, .ui.modal, .ui.dimmer, .ui.nag, .ui.fixed",pusher:".pusher",sidebar:".ui.sidebar"},regExp:{ios:/(iPad|iPhone|iPod)/g,mobileChrome:/(CriOS)/g,mobile:/Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/g},error:{method:"The method you called is not defined.",pusher:"Had to add pusher element. For optimal performance make sure body content is inside a pusher element",movedSidebar:"Had to move sidebar. For optimal performance make sure sidebar and pusher are direct children of your body tag",overlay:"The overlay setting is no longer supported, use animation: overlay",notFound:"There were no elements that matched the specified selector"}}}(jQuery,window,document),function(T,A,R,P){"use strict";A=void 0!==A&&A.Math==Math?A:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),T.fn.sticky=function(v){var b,e=T(this),y=e.selector||"",x=(new Date).getTime(),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1);return e.each(function(){var i,o,e,t,d=T.isPlainObject(v)?T.extend(!0,{},T.fn.sticky.settings,v):T.extend({},T.fn.sticky.settings),n=d.className,a=d.namespace,r=d.error,s="."+a,l="module-"+a,c=T(this),u=T(A),f=T(d.scrollContext),m=(c.selector,c.data(l)),g=A.requestAnimationFrame||A.mozRequestAnimationFrame||A.webkitRequestAnimationFrame||A.msRequestAnimationFrame||function(e){setTimeout(e,0)},p=this,h={initialize:function(){h.determineContainer(),h.determineContext(),h.verbose("Initializing sticky",d,i),h.save.positions(),h.checkErrors(),h.bind.events(),d.observeChanges&&h.observeChanges(),h.instantiate()},instantiate:function(){h.verbose("Storing instance of module",h),m=h,c.data(l,h)},destroy:function(){h.verbose("Destroying previous instance"),h.reset(),e&&e.disconnect(),t&&t.disconnect(),u.off("load"+s,h.event.load).off("resize"+s,h.event.resize),f.off("scrollchange"+s,h.event.scrollchange),c.removeData(l)},observeChanges:function(){"MutationObserver"in A&&(e=new MutationObserver(h.event.documentChanged),t=new MutationObserver(h.event.changed),e.observe(R,{childList:!0,subtree:!0}),t.observe(p,{childList:!0,subtree:!0}),t.observe(o[0],{childList:!0,subtree:!0}),h.debug("Setting up mutation observer",t))},determineContainer:function(){i=d.container?T(d.container):c.offsetParent()},determineContext:function(){0!==(o=d.context?T(d.context):i).length||h.error(r.invalidContext,d.context,c)},checkErrors:function(){if(h.is.hidden()&&h.error(r.visible,c),h.cache.element.height>h.cache.context.height)return h.reset(),void h.error(r.elementSize,c)},bind:{events:function(){u.on("load"+s,h.event.load).on("resize"+s,h.event.resize),f.off("scroll"+s).on("scroll"+s,h.event.scroll).on("scrollchange"+s,h.event.scrollchange)}},event:{changed:function(e){clearTimeout(h.timer),h.timer=setTimeout(function(){h.verbose("DOM tree modified, updating sticky menu",e),h.refresh()},100)},documentChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==p||0<T(e).find(p).length)&&(h.debug("Element removed from DOM, tearing down events"),h.destroy())})})},load:function(){h.verbose("Page contents finished loading"),g(h.refresh)},resize:function(){h.verbose("Window resized"),g(h.refresh)},scroll:function(){g(function(){f.triggerHandler("scrollchange"+s,f.scrollTop())})},scrollchange:function(e,t){h.stick(t),d.onScroll.call(p)}},refresh:function(e){h.reset(),d.context||h.determineContext(),e&&h.determineContainer(),h.save.positions(),h.stick(),d.onReposition.call(p)},supports:{sticky:function(){var e=T("<div/>");e[0];return e.addClass(n.supported),e.css("position").match("sticky")}},save:{lastScroll:function(e){h.lastScroll=e},elementScroll:function(e){h.elementScroll=e},positions:function(){var e={height:f.height()},t={margin:{top:parseInt(c.css("margin-top"),10),bottom:parseInt(c.css("margin-bottom"),10)},offset:c.offset(),width:c.outerWidth(),height:c.outerHeight()},n={offset:o.offset(),height:o.outerHeight()};i.outerHeight();h.is.standardScroll()||(h.debug("Non-standard scroll. Removing scroll offset from element offset"),e.top=f.scrollTop(),e.left=f.scrollLeft(),t.offset.top+=e.top,n.offset.top+=e.top,t.offset.left+=e.left,n.offset.left+=e.left),h.cache={fits:t.height+d.offset<=e.height,sameHeight:t.height==n.height,scrollContext:{height:e.height},element:{margin:t.margin,top:t.offset.top-t.margin.top,left:t.offset.left,width:t.width,height:t.height,bottom:t.offset.top+t.height},context:{top:n.offset.top,height:n.height,bottom:n.offset.top+n.height}},h.set.containerSize(),h.stick(),h.debug("Caching element positions",h.cache)}},get:{direction:function(e){var t="down";return e=e||f.scrollTop(),h.lastScroll!==P&&(h.lastScroll<e?t="down":h.lastScroll>e&&(t="up")),t},scrollChange:function(e){return e=e||f.scrollTop(),h.lastScroll?e-h.lastScroll:0},currentElementScroll:function(){return h.elementScroll?h.elementScroll:h.is.top()?Math.abs(parseInt(c.css("top"),10))||0:Math.abs(parseInt(c.css("bottom"),10))||0},elementScroll:function(e){e=e||f.scrollTop();var t=h.cache.element,n=h.cache.scrollContext,i=h.get.scrollChange(e),o=t.height-n.height+d.offset,a=h.get.currentElementScroll(),r=a+i;return a=h.cache.fits||r<0?0:o<r?o:r}},remove:{lastScroll:function(){delete h.lastScroll},elementScroll:function(e){delete h.elementScroll},minimumSize:function(){i.css("min-height","")},offset:function(){c.css("margin-top","")}},set:{offset:function(){h.verbose("Setting offset on element",d.offset),c.css("margin-top",d.offset)},containerSize:function(){var e,t=i.get(0).tagName;"HTML"===t||"body"==t?h.determineContainer():((e=Math.max(h.cache.context.height,h.cache.element.height))-i.outerHeight()>d.jitter?(h.debug("Context is taller than container. Specifying exact height for container",h.cache.context.height),i.css({height:e})):i.css({height:""}),Math.abs(i.outerHeight()-h.cache.context.height)>d.jitter&&(h.debug("Context has padding, specifying exact height for container",h.cache.context.height),i.css({height:h.cache.context.height})))},minimumSize:function(){var e=h.cache.element;i.css("min-height",e.height)},scroll:function(e){h.debug("Setting scroll on element",e),h.elementScroll!=e&&(h.is.top()&&c.css("bottom","").css("top",-e),h.is.bottom()&&c.css("top","").css("bottom",e))},size:function(){0!==h.cache.element.height&&0!==h.cache.element.width&&(p.style.setProperty("width",h.cache.element.width+"px","important"),p.style.setProperty("height",h.cache.element.height+"px","important"))}},is:{standardScroll:function(){return f[0]==A},top:function(){return c.hasClass(n.top)},bottom:function(){return c.hasClass(n.bottom)},initialPosition:function(){return!h.is.fixed()&&!h.is.bound()},hidden:function(){return!c.is(":visible")},bound:function(){return c.hasClass(n.bound)},fixed:function(){return c.hasClass(n.fixed)}},stick:function(e){var t=e||f.scrollTop(),n=h.cache,i=n.fits,o=n.sameHeight,a=n.element,r=n.scrollContext,s=n.context,l=h.is.bottom()&&d.pushing?d.bottomOffset:d.offset,e={top:t+l,bottom:t+l+r.height},c=(h.get.direction(e.top),i?0:h.get.elementScroll(e.top)),u=!i;0===a.height||o||(h.is.initialPosition()?e.top>=s.bottom?(h.debug("Initial element position is bottom of container"),h.bindBottom()):e.top>a.top&&(a.height+e.top-c>=s.bottom&&a.height<s.height?(h.debug("Initial element position is bottom of container"),h.bindBottom()):(h.debug("Initial element position is fixed"),h.fixTop())):h.is.fixed()?h.is.top()?e.top<=a.top?(h.debug("Fixed element reached top of container"),h.setInitialPosition()):a.height+e.top-c>=s.bottom?(h.debug("Fixed element reached bottom of container"),h.bindBottom()):u&&(h.set.scroll(c),h.save.lastScroll(e.top),h.save.elementScroll(c)):h.is.bottom()&&(e.bottom-a.height<=a.top?(h.debug("Bottom fixed rail has reached top of container"),h.setInitialPosition()):e.bottom>=s.bottom?(h.debug("Bottom fixed rail has reached bottom of container"),h.bindBottom()):u&&(h.set.scroll(c),h.save.lastScroll(e.top),h.save.elementScroll(c))):h.is.bottom()&&(e.top<=a.top?(h.debug("Jumped from bottom fixed to top fixed, most likely used home/end button"),h.setInitialPosition()):d.pushing?h.is.bound()&&e.bottom<=s.bottom&&(h.debug("Fixing bottom attached element to bottom of browser."),h.fixBottom()):h.is.bound()&&e.top<=s.bottom-a.height&&(h.debug("Fixing bottom attached element to top of browser."),h.fixTop())))},bindTop:function(){h.debug("Binding element to top of parent container"),h.remove.offset(),d.setSize&&h.set.size(),c.css({left:"",top:"",marginBottom:""}).removeClass(n.fixed).removeClass(n.bottom).addClass(n.bound).addClass(n.top),d.onTop.call(p),d.onUnstick.call(p)},bindBottom:function(){h.debug("Binding element to bottom of parent container"),h.remove.offset(),d.setSize&&h.set.size(),c.css({left:"",top:""}).removeClass(n.fixed).removeClass(n.top).addClass(n.bound).addClass(n.bottom),d.onBottom.call(p),d.onUnstick.call(p)},setInitialPosition:function(){h.debug("Returning to initial position"),h.unfix(),h.unbind()},fixTop:function(){h.debug("Fixing element to top of page"),d.setSize&&h.set.size(),h.set.minimumSize(),h.set.offset(),c.css({left:h.cache.element.left,bottom:"",marginBottom:""}).removeClass(n.bound).removeClass(n.bottom).addClass(n.fixed).addClass(n.top),d.onStick.call(p)},fixBottom:function(){h.debug("Sticking element to bottom of page"),d.setSize&&h.set.size(),h.set.minimumSize(),h.set.offset(),c.css({left:h.cache.element.left,bottom:"",marginBottom:""}).removeClass(n.bound).removeClass(n.top).addClass(n.fixed).addClass(n.bottom),d.onStick.call(p)},unbind:function(){h.is.bound()&&(h.debug("Removing container bound position on element"),h.remove.offset(),c.removeClass(n.bound).removeClass(n.top).removeClass(n.bottom))},unfix:function(){h.is.fixed()&&(h.debug("Removing fixed position on element"),h.remove.minimumSize(),h.remove.offset(),c.removeClass(n.fixed).removeClass(n.top).removeClass(n.bottom),d.onUnstick.call(p))},reset:function(){h.debug("Resetting elements position"),h.unbind(),h.unfix(),h.resetCSS(),h.remove.offset(),h.remove.lastScroll()},resetCSS:function(){c.css({width:"",height:""}),i.css({height:""})},setting:function(e,t){if(T.isPlainObject(e))T.extend(!0,d,e);else{if(t===P)return d[e];d[e]=t}},internal:function(e,t){if(T.isPlainObject(e))T.extend(!0,h,e);else{if(t===P)return h[e];h[e]=t}},debug:function(){!d.silent&&d.debug&&(d.performance?h.performance.log(arguments):(h.debug=Function.prototype.bind.call(console.info,console,d.name+":"),h.debug.apply(console,arguments)))},verbose:function(){!d.silent&&d.verbose&&d.debug&&(d.performance?h.performance.log(arguments):(h.verbose=Function.prototype.bind.call(console.info,console,d.name+":"),h.verbose.apply(console,arguments)))},error:function(){d.silent||(h.error=Function.prototype.bind.call(console.error,console,d.name+":"),h.error.apply(console,arguments))},performance:{log:function(e){var t,n;d.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:p,"Execution Time":n})),clearTimeout(h.performance.timer),h.performance.timer=setTimeout(h.performance.display,0)},display:function(){var e=d.name+":",n=0;x=!1,clearTimeout(h.performance.timer),T.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",y&&(e+=" '"+y+"'"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):T.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||k,t=p||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,T.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(T.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!T.isPlainObject(r[t])||e==o)return r[t]!==P&&(a=r[t]),!1;r=r[t]}})),T.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),T.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}};S?(m===P&&h.initialize(),h.invoke(w)):(m!==P&&m.invoke("destroy"),h.initialize())}),b!==P?b:this},T.fn.sticky.settings={name:"Sticky",namespace:"sticky",silent:!1,debug:!1,verbose:!0,performance:!0,pushing:!1,context:!1,container:!1,scrollContext:A,offset:0,bottomOffset:0,jitter:5,setSize:!0,observeChanges:!1,onReposition:function(){},onScroll:function(){},onStick:function(){},onUnstick:function(){},onTop:function(){},onBottom:function(){},error:{container:"Sticky element must be inside a relative container",visible:"Element is hidden, you must call refresh after element becomes visible. Use silent setting to surpress this warning in production.",method:"The method you called is not defined.",invalidContext:"Context specified does not exist",elementSize:"Sticky element is larger than its container, cannot create sticky."},className:{bound:"bound",fixed:"fixed",supported:"native",top:"top",bottom:"bottom"}}}(jQuery,window,document),function(E,F,O,D){"use strict";F=void 0!==F&&F.Math==Math?F:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),E.fn.tab=function(r){var c,u=E.isFunction(this)?E(F):E(this),d=u.selector||"",f=(new Date).getTime(),m=[],g=r,A="string"==typeof g,R=[].slice.call(arguments,1),P=!1;return u.each(function(){var p,a,h,v,b,y=E.isPlainObject(r)?E.extend(!0,{},E.fn.tab.settings,r):E.extend({},E.fn.tab.settings),x=y.className,C=y.metadata,t=y.selector,w=y.error,e="."+y.namespace,n="module-"+y.namespace,S=E(this),i={},k=!0,o=0,s=this,l=S.data(n),T={initialize:function(){T.debug("Initializing tab menu item",S),T.fix.callbacks(),T.determineTabs(),T.debug("Determining tabs",y.context,a),y.auto&&T.set.auto(),T.bind.events(),y.history&&!P&&(T.initializeHistory(),P=!0),T.instantiate()},instantiate:function(){T.verbose("Storing instance of module",T),l=T,S.data(n,T)},destroy:function(){T.debug("Destroying tabs",S),S.removeData(n).off(e)},bind:{events:function(){E.isWindow(s)||(T.debug("Attaching tab activation events to element",S),S.on("click"+e,T.event.click))}},determineTabs:function(){var e;"parent"===y.context?(0<S.closest(t.ui).length?(e=S.closest(t.ui),T.verbose("Using closest UI element as parent",e)):e=S,p=e.parent(),T.verbose("Determined parent element for creating context",p)):y.context?(p=E(y.context),T.verbose("Using selector for tab context",y.context,p)):p=E("body"),y.childrenOnly?(a=p.children(t.tabs),T.debug("Searching tab context children for tabs",p,a)):(a=p.find(t.tabs),T.debug("Searching tab context for tabs",p,a))},fix:{callbacks:function(){E.isPlainObject(r)&&(r.onTabLoad||r.onTabInit)&&(r.onTabLoad&&(r.onLoad=r.onTabLoad,delete r.onTabLoad,T.error(w.legacyLoad,r.onLoad)),r.onTabInit&&(r.onFirstLoad=r.onTabInit,delete r.onTabInit,T.error(w.legacyInit,r.onFirstLoad)),y=E.extend(!0,{},E.fn.tab.settings,r))}},initializeHistory:function(){if(T.debug("Initializing page state"),E.address===D)return T.error(w.state),!1;if("state"==y.historyType){if(T.debug("Using HTML5 to manage state"),!1===y.path)return T.error(w.path),!1;E.address.history(!0).state(y.path)}E.address.bind("change",T.event.history.change)},event:{click:function(e){var t=E(this).data(C.tab);t!==D?(y.history?(T.verbose("Updating page state",e),E.address.value(t)):(T.verbose("Changing tab",e),T.changeTab(t)),e.preventDefault()):T.debug("No tab specified")},history:{change:function(e){var t=e.pathNames.join("/")||T.get.initialPath(),n=y.templates.determineTitle(t)||!1;T.performance.display(),T.debug("History change event",t,e),b=e,t!==D&&T.changeTab(t),n&&E.address.title(n)}}},refresh:function(){h&&(T.debug("Refreshing tab",h),T.changeTab(h))},cache:{read:function(e){return e!==D&&i[e]},add:function(e,t){e=e||h,T.debug("Adding cached content for",e),i[e]=t},remove:function(e){e=e||h,T.debug("Removing cached content for",e),delete i[e]}},set:{auto:function(){var e="string"==typeof y.path?y.path.replace(/\/$/,"")+"/{$tab}":"/{$tab}";T.verbose("Setting up automatic tab retrieval from server",e),E.isPlainObject(y.apiSettings)?y.apiSettings.url=e:y.apiSettings={url:e}},loading:function(e){var t=T.get.tabElement(e);t.hasClass(x.loading)||(T.verbose("Setting loading state for",t),t.addClass(x.loading).siblings(a).removeClass(x.active+" "+x.loading),0<t.length&&y.onRequest.call(t[0],e))},state:function(e){E.address.value(e)}},changeTab:function(d){var f=F.history&&F.history.pushState&&y.ignoreFirstLoad&&k,m=y.auto||E.isPlainObject(y.apiSettings),g=m&&!f?T.utilities.pathToArray(d):T.get.defaultPathArray(d);d=T.utilities.arrayToPath(g),E.each(g,function(e,t){var n,i,o,a,r=g.slice(0,e+1),s=T.utilities.arrayToPath(r),l=T.is.tab(s),c=e+1==g.length,u=T.get.tabElement(s);if(T.verbose("Looking for tab",t),l){if(T.verbose("Tab was found",t),h=s,v=T.utilities.filterArray(g,r),c?a=!0:(i=g.slice(0,e+2),o=T.utilities.arrayToPath(i),(a=!T.is.tab(o))&&T.verbose("Tab parameters found",i)),a&&m)return f?(T.debug("Ignoring remote content on first tab load",s),k=!1,T.cache.add(d,u.html()),T.activate.all(s),y.onFirstLoad.call(u[0],s,v,b),y.onLoad.call(u[0],s,v,b)):(T.activate.navigation(s),T.fetch.content(s,d)),!1;T.debug("Opened local tab",s),T.activate.all(s),T.cache.read(s)||(T.cache.add(s,!0),T.debug("First time tab loaded calling tab init"),y.onFirstLoad.call(u[0],s,v,b)),y.onLoad.call(u[0],s,v,b)}else{if(-1!=d.search("/")||""===d)return T.error(w.missingTab,S,p,s),!1;if(s=(n=E("#"+d+', a[name="'+d+'"]')).closest("[data-tab]").data(C.tab),u=T.get.tabElement(s),n&&0<n.length&&s)return T.debug("Anchor link used, opening parent tab",u,n),u.hasClass(x.active)||setTimeout(function(){T.scrollTo(n)},0),T.activate.all(s),T.cache.read(s)||(T.cache.add(s,!0),T.debug("First time tab loaded calling tab init"),y.onFirstLoad.call(u[0],s,v,b)),y.onLoad.call(u[0],s,v,b),!1}})},scrollTo:function(e){var t=!!(e&&0<e.length)&&e.offset().top;!1!==t&&(T.debug("Forcing scroll to an in-page link in a hidden tab",t,e),E(O).scrollTop(t))},update:{content:function(e,t,n){var i=T.get.tabElement(e),o=i[0];n=n!==D?n:y.evaluateScripts,"string"==typeof y.cacheType&&"dom"==y.cacheType.toLowerCase()&&"string"!=typeof t?i.empty().append(E(t).clone(!0)):n?(T.debug("Updating HTML and evaluating inline scripts",e,t),i.html(t)):(T.debug("Updating HTML",e,t),o.innerHTML=t)}},fetch:{content:function(t,n){var e,i,o=T.get.tabElement(t),a={dataType:"html",encodeParameters:!1,on:"now",cache:y.alwaysRefresh,headers:{"X-Remote":!0},onSuccess:function(e){"response"==y.cacheType&&T.cache.add(n,e),T.update.content(t,e),t==h?(T.debug("Content loaded",t),T.activate.tab(t)):T.debug("Content loaded in background",t),y.onFirstLoad.call(o[0],t,v,b),y.onLoad.call(o[0],t,v,b),y.loadOnce?T.cache.add(n,!0):"string"==typeof y.cacheType&&"dom"==y.cacheType.toLowerCase()&&0<o.children().length?setTimeout(function(){var e=(e=o.children().clone(!0)).not("script");T.cache.add(n,e)},0):T.cache.add(n,o.html())},urlData:{tab:n}},r=o.api("get request")||!1,s=r&&"pending"===r.state();n=n||t,i=T.cache.read(n),y.cache&&i?(T.activate.tab(t),T.debug("Adding cached content",n),y.loadOnce||("once"==y.evaluateScripts?T.update.content(t,i,!1):T.update.content(t,i)),y.onLoad.call(o[0],t,v,b)):s?(T.set.loading(t),T.debug("Content is already loading",n)):E.api!==D?(e=E.extend(!0,{},y.apiSettings,a),T.debug("Retrieving remote content",n,e),T.set.loading(t),o.api(e)):T.error(w.api)}},activate:{all:function(e){T.activate.tab(e),T.activate.navigation(e)},tab:function(e){var t=T.get.tabElement(e),n="siblings"==y.deactivate?t.siblings(a):a.not(t),i=t.hasClass(x.active);T.verbose("Showing tab content for",t),i||(t.addClass(x.active),n.removeClass(x.active+" "+x.loading),0<t.length&&y.onVisible.call(t[0],e))},navigation:function(e){var t=T.get.navElement(e),n="siblings"==y.deactivate?t.siblings(u):u.not(t),i=t.hasClass(x.active);T.verbose("Activating tab navigation for",t,e),i||(t.addClass(x.active),n.removeClass(x.active+" "+x.loading))}},deactivate:{all:function(){T.deactivate.navigation(),T.deactivate.tabs()},navigation:function(){u.removeClass(x.active)},tabs:function(){a.removeClass(x.active+" "+x.loading)}},is:{tab:function(e){return e!==D&&0<T.get.tabElement(e).length}},get:{initialPath:function(){return u.eq(0).data(C.tab)||a.eq(0).data(C.tab)},path:function(){return E.address.value()},defaultPathArray:function(e){return T.utilities.pathToArray(T.get.defaultPath(e))},defaultPath:function(e){var t=u.filter("[data-"+C.tab+'^="'+e+'/"]').eq(0).data(C.tab)||!1;if(t){if(T.debug("Found default tab",t),o<y.maxDepth)return o++,T.get.defaultPath(t);T.error(w.recursion)}else T.debug("No default tabs found for",e,a);return o=0,e},navElement:function(e){return e=e||h,u.filter("[data-"+C.tab+'="'+e+'"]')},tabElement:function(e){var t,n,i,o;return e=e||h,i=T.utilities.pathToArray(e),o=T.utilities.last(i),t=a.filter("[data-"+C.tab+'="'+e+'"]'),n=a.filter("[data-"+C.tab+'="'+o+'"]'),0<t.length?t:n},tab:function(){return h}},utilities:{filterArray:function(e,t){return E.grep(e,function(e){return-1==E.inArray(e,t)})},last:function(e){return!!E.isArray(e)&&e[e.length-1]},pathToArray:function(e){return e===D&&(e=h),"string"==typeof e?e.split("/"):[e]},arrayToPath:function(e){return!!E.isArray(e)&&e.join("/")}},setting:function(e,t){if(T.debug("Changing setting",e,t),E.isPlainObject(e))E.extend(!0,y,e);else{if(t===D)return y[e];E.isPlainObject(y[e])?E.extend(!0,y[e],t):y[e]=t}},internal:function(e,t){if(E.isPlainObject(e))E.extend(!0,T,e);else{if(t===D)return T[e];T[e]=t}},debug:function(){!y.silent&&y.debug&&(y.performance?T.performance.log(arguments):(T.debug=Function.prototype.bind.call(console.info,console,y.name+":"),T.debug.apply(console,arguments)))},verbose:function(){!y.silent&&y.verbose&&y.debug&&(y.performance?T.performance.log(arguments):(T.verbose=Function.prototype.bind.call(console.info,console,y.name+":"),T.verbose.apply(console,arguments)))},error:function(){y.silent||(T.error=Function.prototype.bind.call(console.error,console,y.name+":"),T.error.apply(console,arguments))},performance:{log:function(e){var t,n;y.performance&&(n=(t=(new Date).getTime())-(f||t),f=t,m.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:s,"Execution Time":n})),clearTimeout(T.performance.timer),T.performance.timer=setTimeout(T.performance.display,500)},display:function(){var e=y.name+":",n=0;f=!1,clearTimeout(T.performance.timer),E.each(m,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",d&&(e+=" '"+d+"'"),(console.group!==D||console.table!==D)&&0<m.length&&(console.groupCollapsed(e),console.table?console.table(m):E.each(m,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),m=[]}},invoke:function(i,e,t){var o,a,n,r=l;return e=e||R,t=s||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,E.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(E.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!E.isPlainObject(r[t])||e==o)return r[t]!==D?a=r[t]:T.error(w.method,i),!1;r=r[t]}})),E.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),E.isArray(c)?c.push(n):c!==D?c=[c,n]:n!==D&&(c=n),a}};A?(l===D&&T.initialize(),T.invoke(g)):(l!==D&&l.invoke("destroy"),T.initialize())}),c!==D?c:this},E.tab=function(){E(F).tab.apply(this,arguments)},E.fn.tab.settings={name:"Tab",namespace:"tab",silent:!1,debug:!1,verbose:!1,performance:!0,auto:!1,history:!1,historyType:"hash",path:!1,context:!1,childrenOnly:!1,maxDepth:25,deactivate:"siblings",alwaysRefresh:!1,cache:!0,loadOnce:!1,cacheType:"response",ignoreFirstLoad:!1,apiSettings:!1,evaluateScripts:"once",onFirstLoad:function(e,t,n){},onLoad:function(e,t,n){},onVisible:function(e,t,n){},onRequest:function(e,t,n){},templates:{determineTitle:function(e){}},error:{api:"You attempted to load content without API module",method:"The method you called is not defined",missingTab:"Activated tab cannot be found. Tabs are case-sensitive.",noContent:"The tab you specified is missing a content url.",path:"History enabled, but no path was specified",recursion:"Max recursive depth reached",legacyInit:"onTabInit has been renamed to onFirstLoad in 2.0, please adjust your code.",legacyLoad:"onTabLoad has been renamed to onLoad in 2.0. Please adjust your code",state:"History requires Asual's Address library <https://github.com/asual/jquery-address>"},metadata:{tab:"tab",loaded:"loaded",promise:"promise"},className:{loading:"loading",active:"active"},selector:{tabs:".ui.tab",ui:".ui"}}}(jQuery,window,document),function(C,e,w,S){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),C.fn.transition=function(){var c,r=C(this),g=r.selector||"",p=(new Date).getTime(),h=[],v=arguments,b=v[0],y=[].slice.call(arguments,1),x="string"==typeof b;e.requestAnimationFrame||e.mozRequestAnimationFrame||e.webkitRequestAnimationFrame||e.msRequestAnimationFrame;return r.each(function(i){var u,s,t,d,n,o,e,a,f=C(this),l=this,m={initialize:function(){u=m.get.settings.apply(l,v),d=u.className,t=u.error,n=u.metadata,a="."+u.namespace,e="module-"+u.namespace,s=f.data(e)||m,o=m.get.animationEndEvent(),!1===(x=x&&m.invoke(b))&&(m.verbose("Converted arguments into settings object",u),u.interval?m.delay(u.animate):m.animate(),m.instantiate())},instantiate:function(){m.verbose("Storing instance of module",m),s=m,f.data(e,s)},destroy:function(){m.verbose("Destroying previous module for",l),f.removeData(e)},refresh:function(){m.verbose("Refreshing display type on next animation"),delete m.displayType},forceRepaint:function(){m.verbose("Forcing element repaint");var e=f.parent(),t=f.next();0===t.length?f.detach().appendTo(e):f.detach().insertBefore(t)},repaint:function(){m.verbose("Repainting element");l.offsetWidth},delay:function(e){var t,n=(n=m.get.animationDirection())||(m.can.transition()?m.get.direction():"static");e=e!==S?e:u.interval,t="auto"==u.reverse&&n==d.outward||1==u.reverse?(r.length-i)*u.interval:i*u.interval,m.debug("Delaying animation by",t),setTimeout(m.animate,t)},animate:function(e){if(u=e||u,!m.is.supported())return m.error(t.support),!1;if(m.debug("Preparing animation",u.animation),m.is.animating()){if(u.queue)return!u.allowRepeats&&m.has.direction()&&m.is.occurring()&&!0!==m.queuing?m.debug("Animation is currently occurring, preventing queueing same animation",u.animation):m.queue(u.animation),!1;if(!u.allowRepeats&&m.is.occurring())return m.debug("Animation is already occurring, will not execute repeated animation",u.animation),!1;m.debug("New animation started, completing previous early",u.animation),s.complete()}m.can.animate()?m.set.animating(u.animation):m.error(t.noAnimation,u.animation,l)},reset:function(){m.debug("Resetting animation to beginning conditions"),m.remove.animationCallbacks(),m.restore.conditions(),m.remove.animating()},queue:function(e){m.debug("Queueing animation of",e),m.queuing=!0,f.one(o+".queue"+a,function(){m.queuing=!1,m.repaint(),m.animate.apply(this,u)})},complete:function(e){m.debug("Animation complete",u.animation),m.remove.completeCallback(),m.remove.failSafe(),m.is.looping()||(m.is.outward()?(m.verbose("Animation is outward, hiding element"),m.restore.conditions(),m.hide()):m.is.inward()?(m.verbose("Animation is outward, showing element"),m.restore.conditions(),m.show()):(m.verbose("Static animation completed"),m.restore.conditions(),u.onComplete.call(l)))},force:{visible:function(){var e=f.attr("style"),t=m.get.userStyle(),n=m.get.displayType(),i=t+"display: "+n+" !important;",o=f.css("display"),a=e===S||""===e;o!==n?(m.verbose("Overriding default display to show element",n),f.attr("style",i)):a&&f.removeAttr("style")},hidden:function(){var e=f.attr("style"),t=f.css("display"),n=e===S||""===e;"none"===t||m.is.hidden()?n&&f.removeAttr("style"):(m.verbose("Overriding default display to hide element"),f.css("display","none"))}},has:{direction:function(e){var n=!1;return"string"==typeof(e=e||u.animation)&&(e=e.split(" "),C.each(e,function(e,t){t!==d.inward&&t!==d.outward||(n=!0)})),n},inlineDisplay:function(){var e=f.attr("style")||"";return C.isArray(e.match(/display.*?;/,""))}},set:{animating:function(e){var t;m.remove.completeCallback(),e=e||u.animation,t=m.get.animationClass(e),m.save.animation(t),m.force.visible(),m.remove.hidden(),m.remove.direction(),m.start.animation(t)},duration:function(e,t){!(t="number"==typeof(t=t||u.duration)?t+"ms":t)&&0!==t||(m.verbose("Setting animation duration",t),f.css({"animation-duration":t}))},direction:function(e){(e=e||m.get.direction())==d.inward?m.set.inward():m.set.outward()},looping:function(){m.debug("Transition set to loop"),f.addClass(d.looping)},hidden:function(){f.addClass(d.transition).addClass(d.hidden)},inward:function(){m.debug("Setting direction to inward"),f.removeClass(d.outward).addClass(d.inward)},outward:function(){m.debug("Setting direction to outward"),f.removeClass(d.inward).addClass(d.outward)},visible:function(){f.addClass(d.transition).addClass(d.visible)}},start:{animation:function(e){e=e||m.get.animationClass(),m.debug("Starting tween",e),f.addClass(e).one(o+".complete"+a,m.complete),u.useFailSafe&&m.add.failSafe(),m.set.duration(u.duration),u.onStart.call(l)}},save:{animation:function(e){m.cache||(m.cache={}),m.cache.animation=e},displayType:function(e){"none"!==e&&f.data(n.displayType,e)},transitionExists:function(e,t){C.fn.transition.exists[e]=t,m.verbose("Saving existence of transition",e,t)}},restore:{conditions:function(){var e=m.get.currentAnimation();e&&(f.removeClass(e),m.verbose("Removing animation class",m.cache)),m.remove.duration()}},add:{failSafe:function(){var e=m.get.duration();m.timer=setTimeout(function(){f.triggerHandler(o)},e+u.failSafeDelay),m.verbose("Adding fail safe timer",m.timer)}},remove:{animating:function(){f.removeClass(d.animating)},animationCallbacks:function(){m.remove.queueCallback(),m.remove.completeCallback()},queueCallback:function(){f.off(".queue"+a)},completeCallback:function(){f.off(".complete"+a)},display:function(){f.css("display","")},direction:function(){f.removeClass(d.inward).removeClass(d.outward)},duration:function(){f.css("animation-duration","")},failSafe:function(){m.verbose("Removing fail safe timer",m.timer),m.timer&&clearTimeout(m.timer)},hidden:function(){f.removeClass(d.hidden)},visible:function(){f.removeClass(d.visible)},looping:function(){m.debug("Transitions are no longer looping"),m.is.looping()&&(m.reset(),f.removeClass(d.looping))},transition:function(){f.removeClass(d.visible).removeClass(d.hidden)}},get:{settings:function(e,t,n){return"object"==typeof e?C.extend(!0,{},C.fn.transition.settings,e):"function"==typeof n?C.extend({},C.fn.transition.settings,{animation:e,onComplete:n,duration:t}):"string"==typeof t||"number"==typeof t?C.extend({},C.fn.transition.settings,{animation:e,duration:t}):"object"==typeof t?C.extend({},C.fn.transition.settings,t,{animation:e}):"function"==typeof t?C.extend({},C.fn.transition.settings,{animation:e,onComplete:t}):C.extend({},C.fn.transition.settings,{animation:e})},animationClass:function(e){var t=e||u.animation,n=m.can.transition()&&!m.has.direction()?m.get.direction()+" ":"";return d.animating+" "+d.transition+" "+n+t},currentAnimation:function(){return!(!m.cache||m.cache.animation===S)&&m.cache.animation},currentDirection:function(){return m.is.inward()?d.inward:d.outward},direction:function(){return m.is.hidden()||!m.is.visible()?d.inward:d.outward},animationDirection:function(e){var n;return"string"==typeof(e=e||u.animation)&&(e=e.split(" "),C.each(e,function(e,t){t===d.inward?n=d.inward:t===d.outward&&(n=d.outward)})),n||!1},duration:function(e){return!1===(e=e||u.duration)&&(e=f.css("animation-duration")||0),"string"==typeof e?-1<e.indexOf("ms")?parseFloat(e):1e3*parseFloat(e):e},displayType:function(e){return e=e===S||e,u.displayType?u.displayType:(e&&f.data(n.displayType)===S&&m.can.transition(!0),f.data(n.displayType))},userStyle:function(e){return(e=e||f.attr("style")||"").replace(/display.*?;/,"")},transitionExists:function(e){return C.fn.transition.exists[e]},animationStartEvent:function(){var e,t=w.createElement("div"),n={animation:"animationstart",OAnimation:"oAnimationStart",MozAnimation:"mozAnimationStart",WebkitAnimation:"webkitAnimationStart"};for(e in n)if(t.style[e]!==S)return n[e];return!1},animationEndEvent:function(){var e,t=w.createElement("div"),n={animation:"animationend",OAnimation:"oAnimationEnd",MozAnimation:"mozAnimationEnd",WebkitAnimation:"webkitAnimationEnd"};for(e in n)if(t.style[e]!==S)return n[e];return!1}},can:{transition:function(e){var t,n,i,o,a,r,s=u.animation,l=m.get.transitionExists(s),c=m.get.displayType(!1);if(l===S||e){if(m.verbose("Determining whether animation exists"),t=f.attr("class"),n=f.prop("tagName"),o=(i=C("<"+n+" />").addClass(t).insertAfter(f)).addClass(s).removeClass(d.inward).removeClass(d.outward).addClass(d.animating).addClass(d.transition).css("animationName"),a=i.addClass(d.inward).css("animationName"),c||(c=i.attr("class",t).removeAttr("style").removeClass(d.hidden).removeClass(d.visible).show().css("display"),m.verbose("Determining final display state",c),m.save.displayType(c)),i.remove(),o!=a)m.debug("Direction exists for animation",s),r=!0;else{if("none"==o||!o)return void m.debug("No animation defined in css",s);m.debug("Static animation found",s,c),r=!1}m.save.transitionExists(s,r)}return l!==S?l:r},animate:function(){return m.can.transition()!==S}},is:{animating:function(){return f.hasClass(d.animating)},inward:function(){return f.hasClass(d.inward)},outward:function(){return f.hasClass(d.outward)},looping:function(){return f.hasClass(d.looping)},occurring:function(e){return e="."+(e=e||u.animation).replace(" ","."),0<f.filter(e).length},visible:function(){return f.is(":visible")},hidden:function(){return"hidden"===f.css("visibility")},supported:function(){return!1!==o}},hide:function(){m.verbose("Hiding element"),m.is.animating()&&m.reset(),l.blur(),m.remove.display(),m.remove.visible(),m.set.hidden(),m.force.hidden(),u.onHide.call(l),u.onComplete.call(l)},show:function(e){m.verbose("Showing element",e),m.remove.hidden(),m.set.visible(),m.force.visible(),u.onShow.call(l),u.onComplete.call(l)},toggle:function(){m.is.visible()?m.hide():m.show()},stop:function(){m.debug("Stopping current animation"),f.triggerHandler(o)},stopAll:function(){m.debug("Stopping all animation"),m.remove.queueCallback(),f.triggerHandler(o)},clear:{queue:function(){m.debug("Clearing animation queue"),m.remove.queueCallback()}},enable:function(){m.verbose("Starting animation"),f.removeClass(d.disabled)},disable:function(){m.debug("Stopping animation"),f.addClass(d.disabled)},setting:function(e,t){if(m.debug("Changing setting",e,t),C.isPlainObject(e))C.extend(!0,u,e);else{if(t===S)return u[e];C.isPlainObject(u[e])?C.extend(!0,u[e],t):u[e]=t}},internal:function(e,t){if(C.isPlainObject(e))C.extend(!0,m,e);else{if(t===S)return m[e];m[e]=t}},debug:function(){!u.silent&&u.debug&&(u.performance?m.performance.log(arguments):(m.debug=Function.prototype.bind.call(console.info,console,u.name+":"),m.debug.apply(console,arguments)))},verbose:function(){!u.silent&&u.verbose&&u.debug&&(u.performance?m.performance.log(arguments):(m.verbose=Function.prototype.bind.call(console.info,console,u.name+":"),m.verbose.apply(console,arguments)))},error:function(){u.silent||(m.error=Function.prototype.bind.call(console.error,console,u.name+":"),m.error.apply(console,arguments))},performance:{log:function(e){var t,n;u.performance&&(n=(t=(new Date).getTime())-(p||t),p=t,h.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(m.performance.timer),m.performance.timer=setTimeout(m.performance.display,500)},display:function(){var e=u.name+":",n=0;p=!1,clearTimeout(m.performance.timer),C.each(h,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",g&&(e+=" '"+g+"'"),1<r.length&&(e+=" ("+r.length+")"),(console.group!==S||console.table!==S)&&0<h.length&&(console.groupCollapsed(e),console.table?console.table(h):C.each(h,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),h=[]}},invoke:function(i,e,t){var o,a,n,r=s;return e=e||y,t=l||t,"string"==typeof i&&r!==S&&(i=i.split(/[\. ]/),o=i.length-1,C.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(C.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==S)return a=r[n],!1;if(!C.isPlainObject(r[t])||e==o)return r[t]!==S&&(a=r[t]),!1;r=r[t]}})),C.isFunction(a)?n=a.apply(t,e):a!==S&&(n=a),C.isArray(c)?c.push(n):c!==S?c=[c,n]:n!==S&&(c=n),a!==S&&a}};m.initialize()}),c!==S?c:this},C.fn.transition.exists={},C.fn.transition.settings={name:"Transition",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"transition",interval:0,reverse:"auto",onStart:function(){},onComplete:function(){},onShow:function(){},onHide:function(){},useFailSafe:!0,failSafeDelay:100,allowRepeats:!1,displayType:!1,animation:"fade",duration:!1,queue:!0,metadata:{displayType:"display"},className:{animating:"animating",disabled:"disabled",hidden:"hidden",inward:"in",loading:"loading",looping:"looping",outward:"out",transition:"transition",visible:"visible"},error:{noAnimation:"Element is no longer attached to DOM. Unable to animate.  Use silent setting to surpress this warning in production.",repeated:"That animation is already occurring, cancelling repeated animation",method:"The method you called is not defined",support:"This browser does not support CSS animations"}}}(jQuery,window,document),function(P,E,F){"use strict";E=void 0!==E&&E.Math==Math?E:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")();P.api=P.fn.api=function(x){var C,e=P.isFunction(this)?P(E):P(this),w=e.selector||"",S=(new Date).getTime(),k=[],T=x,A="string"==typeof T,R=[].slice.call(arguments,1);return e.each(function(){var a,r,n,e,s,l=P.isPlainObject(x)?P.extend(!0,{},P.fn.api.settings,x):P.extend({},P.fn.api.settings),t=l.namespace,i=l.metadata,o=l.selector,c=l.error,u=l.className,d="."+t,f="module-"+t,m=P(this),g=m.closest(o.form),p=l.stateContext?P(l.stateContext):m,h=this,v=p[0],b=m.data(f),y={initialize:function(){A||y.bind.events(),y.instantiate()},instantiate:function(){y.verbose("Storing instance of module",y),b=y,m.data(f,b)},destroy:function(){y.verbose("Destroying previous module for",h),m.removeData(f).off(d)},bind:{events:function(){var e=y.get.event();e?(y.verbose("Attaching API events to element",e),m.on(e+d,y.event.trigger)):"now"==l.on&&(y.debug("Querying API endpoint immediately"),y.query())}},decode:{json:function(e){if(e!==F&&"string"==typeof e)try{e=JSON.parse(e)}catch(e){}return e}},read:{cachedResponse:function(e){var t;if(E.Storage!==F)return t=sessionStorage.getItem(e),y.debug("Using cached response",e,t),t=y.decode.json(t);y.error(c.noStorage)}},write:{cachedResponse:function(e,t){t&&""===t?y.debug("Response empty, not caching",t):E.Storage!==F?(P.isPlainObject(t)&&(t=JSON.stringify(t)),sessionStorage.setItem(e,t),y.verbose("Storing cached response for url",e,t)):y.error(c.noStorage)}},query:function(){if(y.is.disabled())y.debug("Element is disabled API request aborted");else{if(y.is.loading()){if(!l.interruptRequests)return void y.debug("Cancelling request, previous request is still pending");y.debug("Interrupting previous request"),y.abort()}if(l.defaultData&&P.extend(!0,l.urlData,y.get.defaultData()),l.serializeForm&&(l.data=y.add.formData(l.data)),!1===(r=y.get.settings()))return y.cancelled=!0,void y.error(c.beforeSend);if(y.cancelled=!1,(n=y.get.templatedURL())||y.is.mocked()){if((n=y.add.urlData(n))||y.is.mocked()){if(r.url=l.base+n,a=P.extend(!0,{},l,{type:l.method||l.type,data:e,url:l.base+n,beforeSend:l.beforeXHR,success:function(){},failure:function(){},complete:function(){}}),y.debug("Querying URL",a.url),y.verbose("Using AJAX settings",a),"local"===l.cache&&y.read.cachedResponse(n))return y.debug("Response returned from local cache"),y.request=y.create.request(),void y.request.resolveWith(v,[y.read.cachedResponse(n)]);l.throttle?l.throttleFirstRequest||y.timer?(y.debug("Throttling request",l.throttle),clearTimeout(y.timer),y.timer=setTimeout(function(){y.timer&&delete y.timer,y.debug("Sending throttled request",e,a.method),y.send.request()},l.throttle)):(y.debug("Sending request",e,a.method),y.send.request(),y.timer=setTimeout(function(){},l.throttle)):(y.debug("Sending request",e,a.method),y.send.request())}}else y.error(c.missingURL)}},should:{removeError:function(){return!0===l.hideError||"auto"===l.hideError&&!y.is.form()}},is:{disabled:function(){return 0<m.filter(o.disabled).length},expectingJSON:function(){return"json"===l.dataType||"jsonp"===l.dataType},form:function(){return m.is("form")||p.is("form")},mocked:function(){return l.mockResponse||l.mockResponseAsync||l.response||l.responseAsync},input:function(){return m.is("input")},loading:function(){return!!y.request&&"pending"==y.request.state()},abortedRequest:function(e){return e&&e.readyState!==F&&0===e.readyState?(y.verbose("XHR request determined to be aborted"),!0):(y.verbose("XHR request was not aborted"),!1)},validResponse:function(e){return y.is.expectingJSON()&&P.isFunction(l.successTest)?(y.debug("Checking JSON returned success",l.successTest,e),l.successTest(e)?(y.debug("Response passed success test",e),!0):(y.debug("Response failed success test",e),!1)):(y.verbose("Response is not JSON, skipping validation",l.successTest,e),!0)}},was:{cancelled:function(){return y.cancelled||!1},succesful:function(){return y.request&&"resolved"==y.request.state()},failure:function(){return y.request&&"rejected"==y.request.state()},complete:function(){return y.request&&("resolved"==y.request.state()||"rejected"==y.request.state())}},add:{urlData:function(o,a){var e,t;return o&&(e=o.match(l.regExp.required),t=o.match(l.regExp.optional),a=a||l.urlData,e&&(y.debug("Looking for required URL variables",e),P.each(e,function(e,t){var n=-1!==t.indexOf("$")?t.substr(2,t.length-3):t.substr(1,t.length-2),i=P.isPlainObject(a)&&a[n]!==F?a[n]:m.data(n)!==F?m.data(n):p.data(n)!==F?p.data(n):a[n];if(i===F)return y.error(c.requiredParameter,n,o),o=!1;y.verbose("Found required variable",n,i),i=l.encodeParameters?y.get.urlEncodedValue(i):i,o=o.replace(t,i)})),t&&(y.debug("Looking for optional URL variables",e),P.each(t,function(e,t){var n=-1!==t.indexOf("$")?t.substr(3,t.length-4):t.substr(2,t.length-3),i=P.isPlainObject(a)&&a[n]!==F?a[n]:m.data(n)!==F?m.data(n):p.data(n)!==F?p.data(n):a[n];o=i!==F?(y.verbose("Optional variable Found",n,i),o.replace(t,i)):(y.verbose("Optional variable not found",n),-1!==o.indexOf("/"+t)?o.replace("/"+t,""):o.replace(t,""))}))),o},formData:function(e){var t=P.fn.serializeObject!==F,n=t?g.serializeObject():g.serialize();return e=e||l.data,e=P.isPlainObject(e)?t?(y.debug("Extending existing data with form data",e,n),P.extend(!0,{},e,n)):(y.error(c.missingSerialize),y.debug("Cant extend data. Replacing data with form data",e,n),n):(y.debug("Adding form data",n),n)}},send:{request:function(){y.set.loading(),y.request=y.create.request(),y.is.mocked()?y.mockedXHR=y.create.mockedXHR():y.xhr=y.create.xhr(),l.onRequest.call(v,y.request,y.xhr)}},event:{trigger:function(e){y.query(),"submit"!=e.type&&"click"!=e.type||e.preventDefault()},xhr:{always:function(){},done:function(e,t,n){var i=this,o=(new Date).getTime()-s,a=l.loadingDuration-o,r=!!P.isFunction(l.onResponse)&&(y.is.expectingJSON()?l.onResponse.call(i,P.extend(!0,{},e)):l.onResponse.call(i,e)),a=0<a?a:0;r&&(y.debug("Modified API response in onResponse callback",l.onResponse,r,e),e=r),0<a&&y.debug("Response completed early delaying state change by",a),setTimeout(function(){y.is.validResponse(e)?y.request.resolveWith(i,[e,n]):y.request.rejectWith(i,[n,"invalid"])},a)},fail:function(e,t,n){var i=this,o=(new Date).getTime()-s,a=l.loadingDuration-o;0<(a=0<a?a:0)&&y.debug("Response completed early delaying state change by",a),setTimeout(function(){y.is.abortedRequest(e)?y.request.rejectWith(i,[e,"aborted",n]):y.request.rejectWith(i,[e,"error",t,n])},a)}},request:{done:function(e,t){y.debug("Successful API Response",e),"local"===l.cache&&n&&(y.write.cachedResponse(n,e),y.debug("Saving server response locally",y.cache)),l.onSuccess.call(v,e,m,t)},complete:function(e,t){var n,i;y.was.succesful()?(i=e,n=t):(n=e,i=y.get.responseFromXHR(n)),y.remove.loading(),l.onComplete.call(v,i,m,n)},fail:function(e,t,n){var i=y.get.responseFromXHR(e),o=y.get.errorFromRequest(i,t,n);if("aborted"==t)return y.debug("XHR Aborted (Most likely caused by page navigation or CORS Policy)",t,n),l.onAbort.call(v,t,m,e),!0;"invalid"==t?y.debug("JSON did not pass success test. A server-side error has most likely occurred",i):"error"==t&&e!==F&&(y.debug("XHR produced a server error",t,n),200!=e.status&&n!==F&&""!==n&&y.error(c.statusMessage+n,a.url),l.onError.call(v,o,m,e)),l.errorDuration&&"aborted"!==t&&(y.debug("Adding error state"),y.set.error(),y.should.removeError()&&setTimeout(y.remove.error,l.errorDuration)),y.debug("API Request failed",o,e),l.onFailure.call(v,i,m,e)}}},create:{request:function(){return P.Deferred().always(y.event.request.complete).done(y.event.request.done).fail(y.event.request.fail)},mockedXHR:function(){var e,t,n=l.mockResponse||l.response,i=l.mockResponseAsync||l.responseAsync,o=P.Deferred().always(y.event.xhr.complete).done(y.event.xhr.done).fail(y.event.xhr.fail);return n?(t=P.isFunction(n)?(y.debug("Using specified synchronous callback",n),n.call(v,r)):(y.debug("Using settings specified response",n),n),o.resolveWith(v,[t,!1,{responseText:t}])):P.isFunction(i)&&(e=function(e){y.debug("Async callback returned response",e),e?o.resolveWith(v,[e,!1,{responseText:e}]):o.rejectWith(v,[{responseText:e},!1,!1])},y.debug("Using specified async response callback",i),i.call(v,r,e)),o},xhr:function(){var e=P.ajax(a).always(y.event.xhr.always).done(y.event.xhr.done).fail(y.event.xhr.fail);return y.verbose("Created server request",e,a),e}},set:{error:function(){y.verbose("Adding error state to element",p),p.addClass(u.error)},loading:function(){y.verbose("Adding loading state to element",p),p.addClass(u.loading),s=(new Date).getTime()}},remove:{error:function(){y.verbose("Removing error state from element",p),p.removeClass(u.error)},loading:function(){y.verbose("Removing loading state from element",p),p.removeClass(u.loading)}},get:{responseFromXHR:function(e){return!!P.isPlainObject(e)&&(y.is.expectingJSON()?y.decode.json(e.responseText):e.responseText)},errorFromRequest:function(e,t,n){return P.isPlainObject(e)&&e.error!==F?e.error:l.error[t]!==F?l.error[t]:n},request:function(){return y.request||!1},xhr:function(){return y.xhr||!1},settings:function(){var e=l.beforeSend.call(v,l);return e&&(e.success!==F&&(y.debug("Legacy success callback detected",e),y.error(c.legacyParameters,e.success),e.onSuccess=e.success),e.failure!==F&&(y.debug("Legacy failure callback detected",e),y.error(c.legacyParameters,e.failure),e.onFailure=e.failure),e.complete!==F&&(y.debug("Legacy complete callback detected",e),y.error(c.legacyParameters,e.complete),e.onComplete=e.complete)),e===F&&y.error(c.noReturnedValue),!1===e?e:e!==F?P.extend(!0,{},e):P.extend(!0,{},l)},urlEncodedValue:function(e){var t=E.decodeURIComponent(e),n=E.encodeURIComponent(e);return t!==e?(y.debug("URL value is already encoded, avoiding double encoding",e),e):(y.verbose("Encoding value using encodeURIComponent",e,n),n)},defaultData:function(){var e={};return P.isWindow(h)||(y.is.input()?e.value=m.val():y.is.form()||(e.text=m.text())),e},event:function(){return P.isWindow(h)||"now"==l.on?(y.debug("API called without element, no events attached"),!1):"auto"==l.on?m.is("input")?h.oninput!==F?"input":h.onpropertychange!==F?"propertychange":"keyup":m.is("form")?"submit":"click":l.on},templatedURL:function(e){if(e=e||m.data(i.action)||l.action||!1,n=m.data(i.url)||l.url||!1)return y.debug("Using specified url",n),n;if(e){if(y.debug("Looking up url for action",e,l.api),l.api[e]===F&&!y.is.mocked())return void y.error(c.missingAction,l.action,l.api);n=l.api[e]}else y.is.form()&&(n=m.attr("action")||p.attr("action")||!1,y.debug("No url or action specified, defaulting to form action",n));return n}},abort:function(){var e=y.get.xhr();e&&"resolved"!==e.state()&&(y.debug("Cancelling API request"),e.abort())},reset:function(){y.remove.error(),y.remove.loading()},setting:function(e,t){if(y.debug("Changing setting",e,t),P.isPlainObject(e))P.extend(!0,l,e);else{if(t===F)return l[e];P.isPlainObject(l[e])?P.extend(!0,l[e],t):l[e]=t}},internal:function(e,t){if(P.isPlainObject(e))P.extend(!0,y,e);else{if(t===F)return y[e];y[e]=t}},debug:function(){!l.silent&&l.debug&&(l.performance?y.performance.log(arguments):(y.debug=Function.prototype.bind.call(console.info,console,l.name+":"),y.debug.apply(console,arguments)))},verbose:function(){!l.silent&&l.verbose&&l.debug&&(l.performance?y.performance.log(arguments):(y.verbose=Function.prototype.bind.call(console.info,console,l.name+":"),y.verbose.apply(console,arguments)))},error:function(){l.silent||(y.error=Function.prototype.bind.call(console.error,console,l.name+":"),y.error.apply(console,arguments))},performance:{log:function(e){var t,n;l.performance&&(n=(t=(new Date).getTime())-(S||t),S=t,k.push({Name:e[0],Arguments:[].slice.call(e,1)||"","Execution Time":n})),clearTimeout(y.performance.timer),y.performance.timer=setTimeout(y.performance.display,500)},display:function(){var e=l.name+":",n=0;S=!1,clearTimeout(y.performance.timer),P.each(k,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",w&&(e+=" '"+w+"'"),(console.group!==F||console.table!==F)&&0<k.length&&(console.groupCollapsed(e),console.table?console.table(k):P.each(k,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),k=[]}},invoke:function(i,e,t){var o,a,n,r=b;return e=e||R,t=h||t,"string"==typeof i&&r!==F&&(i=i.split(/[\. ]/),o=i.length-1,P.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(P.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==F)return a=r[n],!1;if(!P.isPlainObject(r[t])||e==o)return r[t]!==F?a=r[t]:y.error(c.method,i),!1;r=r[t]}})),P.isFunction(a)?n=a.apply(t,e):a!==F&&(n=a),P.isArray(C)?C.push(n):C!==F?C=[C,n]:n!==F&&(C=n),a}};A?(b===F&&y.initialize(),y.invoke(T)):(b!==F&&b.invoke("destroy"),y.initialize())}),C!==F?C:this},P.api.settings={name:"API",namespace:"api",debug:!1,verbose:!1,performance:!0,api:{},cache:!0,interruptRequests:!0,on:"auto",stateContext:!1,loadingDuration:0,hideError:"auto",errorDuration:2e3,encodeParameters:!0,action:!1,url:!1,base:"",urlData:{},defaultData:!0,serializeForm:!1,throttle:0,throttleFirstRequest:!0,method:"get",data:{},dataType:"json",mockResponse:!1,mockResponseAsync:!1,response:!1,responseAsync:!1,beforeSend:function(e){return e},beforeXHR:function(e){},onRequest:function(e,t){},onResponse:!1,onSuccess:function(e,t){},onComplete:function(e,t){},onFailure:function(e,t){},onError:function(e,t){},onAbort:function(e,t){},successTest:!1,error:{beforeSend:"The before send function has aborted the request",error:"There was an error with your request",exitConditions:"API Request Aborted. Exit conditions met",JSONParse:"JSON could not be parsed during error handling",legacyParameters:"You are using legacy API success callback names",method:"The method you called is not defined",missingAction:"API action used but no url was defined",missingSerialize:"jquery-serialize-object is required to add form data to an existing data object",missingURL:"No URL specified for api event",noReturnedValue:"The beforeSend callback must return a settings object, beforeSend ignored.",noStorage:"Caching responses locally requires session storage",parseError:"There was an error parsing your request",requiredParameter:"Missing a required URL parameter: ",statusMessage:"Server gave an error: ",timeout:"Your request timed out"},regExp:{required:/\{\$*[A-z0-9]+\}/g,optional:/\{\/\$*[A-z0-9]+\}/g},className:{loading:"loading",error:"error"},selector:{disabled:".disabled",form:"form"},metadata:{action:"action",url:"url"}}}(jQuery,window,void document),function(P,E,F,O){"use strict";E=void 0!==E&&E.Math==Math?E:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),P.fn.visibility=function(b){var y,e=P(this),x=e.selector||"",C=(new Date).getTime(),w=[],S=b,k="string"==typeof S,T=[].slice.call(arguments,1),A=e.length,R=0;return e.each(function(){var e,t,n,o=P.isPlainObject(b)?P.extend(!0,{},P.fn.visibility.settings,b):P.extend({},P.fn.visibility.settings),i=o.className,a=o.namespace,s=o.error,r=o.metadata,l="."+a,c="module-"+a,u=P(E),d=P(this),f=P(o.context),m=(d.selector,d.data(c)),g=E.requestAnimationFrame||E.mozRequestAnimationFrame||E.webkitRequestAnimationFrame||E.msRequestAnimationFrame||function(e){setTimeout(e,0)},p=this,h=!1,v={initialize:function(){v.debug("Initializing",o),v.setup.cache(),v.should.trackChanges()&&("image"==o.type&&v.setup.image(),"fixed"==o.type&&v.setup.fixed(),o.observeChanges&&v.observeChanges(),v.bind.events()),v.save.position(),v.is.visible()||v.error(s.visible,d),o.initialCheck&&v.checkVisibility(),v.instantiate()},instantiate:function(){v.debug("Storing instance",v),d.data(c,v),m=v},destroy:function(){v.verbose("Destroying previous module"),n&&n.disconnect(),t&&t.disconnect(),u.off("load"+l,v.event.load).off("resize"+l,v.event.resize),f.off("scroll"+l,v.event.scroll).off("scrollchange"+l,v.event.scrollchange),"fixed"==o.type&&(v.resetFixed(),v.remove.placeholder()),d.off(l).removeData(c)},observeChanges:function(){"MutationObserver"in E&&(t=new MutationObserver(v.event.contextChanged),n=new MutationObserver(v.event.changed),t.observe(F,{childList:!0,subtree:!0}),n.observe(p,{childList:!0,subtree:!0}),v.debug("Setting up mutation observer",n))},bind:{events:function(){v.verbose("Binding visibility events to scroll and resize"),o.refreshOnLoad&&u.on("load"+l,v.event.load),u.on("resize"+l,v.event.resize),f.off("scroll"+l).on("scroll"+l,v.event.scroll).on("scrollchange"+l,v.event.scrollchange)}},event:{changed:function(e){v.verbose("DOM tree modified, updating visibility calculations"),v.timer=setTimeout(function(){v.verbose("DOM tree modified, updating sticky menu"),v.refresh()},100)},contextChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==p||0<P(e).find(p).length)&&(v.debug("Element removed from DOM, tearing down events"),v.destroy())})})},resize:function(){v.debug("Window resized"),o.refreshOnResize&&g(v.refresh)},load:function(){v.debug("Page finished loading"),g(v.refresh)},scroll:function(){o.throttle?(clearTimeout(v.timer),v.timer=setTimeout(function(){f.triggerHandler("scrollchange"+l,[f.scrollTop()])},o.throttle)):g(function(){f.triggerHandler("scrollchange"+l,[f.scrollTop()])})},scrollchange:function(e,t){v.checkVisibility(t)}},precache:function(e,t){e instanceof Array||(e=[e]);for(var n=e.length,i=0,o=[],a=F.createElement("img"),r=function(){++i>=e.length&&P.isFunction(t)&&t()};n--;)(a=F.createElement("img")).onload=r,a.onerror=r,a.src=e[n],o.push(a)},enableCallbacks:function(){v.debug("Allowing callbacks to occur"),h=!1},disableCallbacks:function(){v.debug("Disabling all callbacks temporarily"),h=!0},should:{trackChanges:function(){return k?(v.debug("One time query, no need to bind events"),!1):(v.debug("Callbacks being attached"),!0)}},setup:{cache:function(){v.cache={occurred:{},screen:{},element:{}}},image:function(){var e=d.data(r.src);e&&(v.verbose("Lazy loading image",e),o.once=!0,o.observeChanges=!1,o.onOnScreen=function(){v.debug("Image on screen",p),v.precache(e,function(){v.set.image(e,function(){++R==A&&o.onAllLoaded.call(this),o.onLoad.call(this)})})})},fixed:function(){v.debug("Setting up fixed"),o.once=!1,o.observeChanges=!1,o.initialCheck=!0,o.refreshOnLoad=!0,b.transition||(o.transition=!1),v.create.placeholder(),v.debug("Added placeholder",e),o.onTopPassed=function(){v.debug("Element passed, adding fixed position",d),v.show.placeholder(),v.set.fixed(),o.transition&&P.fn.transition!==O&&d.transition(o.transition,o.duration)},o.onTopPassedReverse=function(){v.debug("Element returned to position, removing fixed",d),v.hide.placeholder(),v.remove.fixed()}}},create:{placeholder:function(){v.verbose("Creating fixed position placeholder"),e=d.clone(!1).css("display","none").addClass(i.placeholder).insertAfter(d)}},show:{placeholder:function(){v.verbose("Showing placeholder"),e.css("display","block").css("visibility","hidden")}},hide:{placeholder:function(){v.verbose("Hiding placeholder"),e.css("display","none").css("visibility","")}},set:{fixed:function(){v.verbose("Setting element to fixed position"),d.addClass(i.fixed).css({position:"fixed",top:o.offset+"px",left:"auto",zIndex:o.zIndex}),o.onFixed.call(p)},image:function(e,t){if(d.attr("src",e),o.transition)if(P.fn.transition!==O){if(d.hasClass(i.visible))return void v.debug("Transition already occurred on this image, skipping animation");d.transition(o.transition,o.duration,t)}else d.fadeIn(o.duration,t);else d.show()}},is:{onScreen:function(){return v.get.elementCalculations().onScreen},offScreen:function(){return v.get.elementCalculations().offScreen},visible:function(){return!(!v.cache||!v.cache.element)&&!(0===v.cache.element.width&&0===v.cache.element.offset.top)},verticallyScrollableContext:function(){var e=f.get(0)!==E&&f.css("overflow-y");return"auto"==e||"scroll"==e},horizontallyScrollableContext:function(){var e=f.get(0)!==E&&f.css("overflow-x");return"auto"==e||"scroll"==e}},refresh:function(){v.debug("Refreshing constants (width/height)"),"fixed"==o.type&&v.resetFixed(),v.reset(),v.save.position(),o.checkOnRefresh&&v.checkVisibility(),o.onRefresh.call(p)},resetFixed:function(){v.remove.fixed(),v.remove.occurred()},reset:function(){v.verbose("Resetting all cached values"),P.isPlainObject(v.cache)&&(v.cache.screen={},v.cache.element={})},checkVisibility:function(e){v.verbose("Checking visibility of element",v.cache.element),!h&&v.is.visible()&&(v.save.scroll(e),v.save.calculations(),v.passed(),v.passingReverse(),v.topVisibleReverse(),v.bottomVisibleReverse(),v.topPassedReverse(),v.bottomPassedReverse(),v.onScreen(),v.offScreen(),v.passing(),v.topVisible(),v.bottomVisible(),v.topPassed(),v.bottomPassed(),o.onUpdate&&o.onUpdate.call(p,v.get.elementCalculations()))},passed:function(e,t){var n=v.get.elementCalculations();if(e&&t)o.onPassed[e]=t;else{if(e!==O)return v.get.pixelsPassed(e)>n.pixelsPassed;n.passing&&P.each(o.onPassed,function(e,t){n.bottomVisible||n.pixelsPassed>v.get.pixelsPassed(e)?v.execute(t,e):o.once||v.remove.occurred(t)})}},onScreen:function(e){var t=v.get.elementCalculations(),n=e||o.onOnScreen,i="onScreen";if(e&&(v.debug("Adding callback for onScreen",e),o.onOnScreen=e),t.onScreen?v.execute(n,i):o.once||v.remove.occurred(i),e!==O)return t.onOnScreen},offScreen:function(e){var t=v.get.elementCalculations(),n=e||o.onOffScreen,i="offScreen";if(e&&(v.debug("Adding callback for offScreen",e),o.onOffScreen=e),t.offScreen?v.execute(n,i):o.once||v.remove.occurred(i),e!==O)return t.onOffScreen},passing:function(e){var t=v.get.elementCalculations(),n=e||o.onPassing,i="passing";if(e&&(v.debug("Adding callback for passing",e),o.onPassing=e),t.passing?v.execute(n,i):o.once||v.remove.occurred(i),e!==O)return t.passing},topVisible:function(e){var t=v.get.elementCalculations(),n=e||o.onTopVisible,i="topVisible";if(e&&(v.debug("Adding callback for top visible",e),o.onTopVisible=e),t.topVisible?v.execute(n,i):o.once||v.remove.occurred(i),e===O)return t.topVisible},bottomVisible:function(e){var t=v.get.elementCalculations(),n=e||o.onBottomVisible,i="bottomVisible";if(e&&(v.debug("Adding callback for bottom visible",e),o.onBottomVisible=e),t.bottomVisible?v.execute(n,i):o.once||v.remove.occurred(i),e===O)return t.bottomVisible},topPassed:function(e){var t=v.get.elementCalculations(),n=e||o.onTopPassed,i="topPassed";if(e&&(v.debug("Adding callback for top passed",e),o.onTopPassed=e),t.topPassed?v.execute(n,i):o.once||v.remove.occurred(i),e===O)return t.topPassed},bottomPassed:function(e){var t=v.get.elementCalculations(),n=e||o.onBottomPassed,i="bottomPassed";if(e&&(v.debug("Adding callback for bottom passed",e),o.onBottomPassed=e),t.bottomPassed?v.execute(n,i):o.once||v.remove.occurred(i),e===O)return t.bottomPassed},passingReverse:function(e){var t=v.get.elementCalculations(),n=e||o.onPassingReverse,i="passingReverse";if(e&&(v.debug("Adding callback for passing reverse",e),o.onPassingReverse=e),t.passing?o.once||v.remove.occurred(i):v.get.occurred("passing")&&v.execute(n,i),e!==O)return!t.passing},topVisibleReverse:function(e){var t=v.get.elementCalculations(),n=e||o.onTopVisibleReverse,i="topVisibleReverse";if(e&&(v.debug("Adding callback for top visible reverse",e),o.onTopVisibleReverse=e),t.topVisible?o.once||v.remove.occurred(i):v.get.occurred("topVisible")&&v.execute(n,i),e===O)return!t.topVisible},bottomVisibleReverse:function(e){var t=v.get.elementCalculations(),n=e||o.onBottomVisibleReverse,i="bottomVisibleReverse";if(e&&(v.debug("Adding callback for bottom visible reverse",e),o.onBottomVisibleReverse=e),t.bottomVisible?o.once||v.remove.occurred(i):v.get.occurred("bottomVisible")&&v.execute(n,i),e===O)return!t.bottomVisible},topPassedReverse:function(e){var t=v.get.elementCalculations(),n=e||o.onTopPassedReverse,i="topPassedReverse";if(e&&(v.debug("Adding callback for top passed reverse",e),o.onTopPassedReverse=e),t.topPassed?o.once||v.remove.occurred(i):v.get.occurred("topPassed")&&v.execute(n,i),e===O)return!t.onTopPassed},bottomPassedReverse:function(e){var t=v.get.elementCalculations(),n=e||o.onBottomPassedReverse,i="bottomPassedReverse";if(e&&(v.debug("Adding callback for bottom passed reverse",e),o.onBottomPassedReverse=e),t.bottomPassed?o.once||v.remove.occurred(i):v.get.occurred("bottomPassed")&&v.execute(n,i),e===O)return!t.bottomPassed},execute:function(e,t){var n=v.get.elementCalculations(),i=v.get.screenCalculations();(e=e||!1)&&(o.continuous?(v.debug("Callback being called continuously",t,n),e.call(p,n,i)):v.get.occurred(t)||(v.debug("Conditions met",t,n),e.call(p,n,i))),v.save.occurred(t)},remove:{fixed:function(){v.debug("Removing fixed position"),d.removeClass(i.fixed).css({position:"",top:"",left:"",zIndex:""}),o.onUnfixed.call(p)},placeholder:function(){v.debug("Removing placeholder content"),e&&e.remove()},occurred:function(e){var t;e?(t=v.cache.occurred)[e]!==O&&!0===t[e]&&(v.debug("Callback can now be called again",e),v.cache.occurred[e]=!1):v.cache.occurred={}}},save:{calculations:function(){v.verbose("Saving all calculations necessary to determine positioning"),v.save.direction(),v.save.screenCalculations(),v.save.elementCalculations()},occurred:function(e){e&&(v.cache.occurred[e]!==O&&!0===v.cache.occurred[e]||(v.verbose("Saving callback occurred",e),v.cache.occurred[e]=!0))},scroll:function(e){e=e+o.offset||f.scrollTop()+o.offset,v.cache.scroll=e},direction:function(){var e=v.get.scroll(),t=v.get.lastScroll(),n=t<e&&t?"down":e<t&&t?"up":"static";return v.cache.direction=n,v.cache.direction},elementPosition:function(){var e=v.cache.element,t=v.get.screenSize();return v.verbose("Saving element position"),e.fits=e.height<t.height,e.offset=d.offset(),e.width=d.outerWidth(),e.height=d.outerHeight(),v.is.verticallyScrollableContext()&&(e.offset.top+=f.scrollTop()-f.offset().top),v.is.horizontallyScrollableContext()&&(e.offset.left+=f.scrollLeft-f.offset().left),v.cache.element=e},elementCalculations:function(){var e=v.get.screenCalculations(),t=v.get.elementPosition();return o.includeMargin?(t.margin={},t.margin.top=parseInt(d.css("margin-top"),10),t.margin.bottom=parseInt(d.css("margin-bottom"),10),t.top=t.offset.top-t.margin.top,t.bottom=t.offset.top+t.height+t.margin.bottom):(t.top=t.offset.top,t.bottom=t.offset.top+t.height),t.topPassed=e.top>=t.top,t.bottomPassed=e.top>=t.bottom,t.topVisible=e.bottom>=t.top&&!t.topPassed,t.bottomVisible=e.bottom>=t.bottom&&!t.bottomPassed,t.pixelsPassed=0,t.percentagePassed=0,t.onScreen=(t.topVisible||t.passing)&&!t.bottomPassed,t.passing=t.topPassed&&!t.bottomPassed,t.offScreen=!t.onScreen,t.passing&&(t.pixelsPassed=e.top-t.top,t.percentagePassed=(e.top-t.top)/t.height),v.cache.element=t,v.verbose("Updated element calculations",t),t},screenCalculations:function(){var e=v.get.scroll();return v.save.direction(),v.cache.screen.top=e,v.cache.screen.bottom=e+v.cache.screen.height,v.cache.screen},screenSize:function(){v.verbose("Saving window position"),v.cache.screen={height:f.height()}},position:function(){v.save.screenSize(),v.save.elementPosition()}},get:{pixelsPassed:function(e){var t=v.get.elementCalculations();return-1<e.search("%")?t.height*(parseInt(e,10)/100):parseInt(e,10)},occurred:function(e){return v.cache.occurred!==O&&v.cache.occurred[e]||!1},direction:function(){return v.cache.direction===O&&v.save.direction(),v.cache.direction},elementPosition:function(){return v.cache.element===O&&v.save.elementPosition(),v.cache.element},elementCalculations:function(){return v.cache.element===O&&v.save.elementCalculations(),v.cache.element},screenCalculations:function(){return v.cache.screen===O&&v.save.screenCalculations(),v.cache.screen},screenSize:function(){return v.cache.screen===O&&v.save.screenSize(),v.cache.screen},scroll:function(){return v.cache.scroll===O&&v.save.scroll(),v.cache.scroll},lastScroll:function(){return v.cache.screen===O?(v.debug("First scroll event, no last scroll could be found"),!1):v.cache.screen.top}},setting:function(e,t){if(P.isPlainObject(e))P.extend(!0,o,e);else{if(t===O)return o[e];o[e]=t}},internal:function(e,t){if(P.isPlainObject(e))P.extend(!0,v,e);else{if(t===O)return v[e];v[e]=t}},debug:function(){!o.silent&&o.debug&&(o.performance?v.performance.log(arguments):(v.debug=Function.prototype.bind.call(console.info,console,o.name+":"),v.debug.apply(console,arguments)))},verbose:function(){!o.silent&&o.verbose&&o.debug&&(o.performance?v.performance.log(arguments):(v.verbose=Function.prototype.bind.call(console.info,console,o.name+":"),v.verbose.apply(console,arguments)))},error:function(){o.silent||(v.error=Function.prototype.bind.call(console.error,console,o.name+":"),v.error.apply(console,arguments))},performance:{log:function(e){var t,n;o.performance&&(n=(t=(new Date).getTime())-(C||t),C=t,w.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:p,"Execution Time":n})),clearTimeout(v.performance.timer),v.performance.timer=setTimeout(v.performance.display,500)},display:function(){var e=o.name+":",n=0;C=!1,clearTimeout(v.performance.timer),P.each(w,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",x&&(e+=" '"+x+"'"),(console.group!==O||console.table!==O)&&0<w.length&&(console.groupCollapsed(e),console.table?console.table(w):P.each(w,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),w=[]}},invoke:function(i,e,t){var o,a,n,r=m;return e=e||T,t=p||t,"string"==typeof i&&r!==O&&(i=i.split(/[\. ]/),o=i.length-1,P.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(P.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==O)return a=r[n],!1;if(!P.isPlainObject(r[t])||e==o)return r[t]!==O?a=r[t]:v.error(s.method,i),!1;r=r[t]}})),P.isFunction(a)?n=a.apply(t,e):a!==O&&(n=a),P.isArray(y)?y.push(n):y!==O?y=[y,n]:n!==O&&(y=n),a}};k?(m===O&&v.initialize(),m.save.scroll(),m.save.calculations(),v.invoke(S)):(m!==O&&m.invoke("destroy"),v.initialize())}),y!==O?y:this},P.fn.visibility.settings={name:"Visibility",namespace:"visibility",debug:!1,verbose:!1,performance:!0,observeChanges:!0,initialCheck:!0,refreshOnLoad:!0,refreshOnResize:!0,checkOnRefresh:!0,once:!0,continuous:!1,offset:0,includeMargin:!1,context:E,throttle:!1,type:!1,zIndex:"10",transition:"fade in",duration:1e3,onPassed:{},onOnScreen:!1,onOffScreen:!1,onPassing:!1,onTopVisible:!1,onBottomVisible:!1,onTopPassed:!1,onBottomPassed:!1,onPassingReverse:!1,onTopVisibleReverse:!1,onBottomVisibleReverse:!1,onTopPassedReverse:!1,onBottomPassedReverse:!1,onLoad:function(){},onAllLoaded:function(){},onFixed:function(){},onUnfixed:function(){},onUpdate:!1,onRefresh:function(){},metadata:{src:"src"},className:{fixed:"fixed",placeholder:"placeholder",visible:"visible"},error:{method:"The method you called is not defined.",visible:"Element is hidden, you must call refresh after element becomes visible"}}}(jQuery,window,document);
define("semantic", ["jquery"], function(){});

requirejs.config({

	paths: {

		jquery: "node_modules/jquery/dist/jquery.min",
		semantic: "node_modules/semantic-ui-offline/semantic.min",
		hljs: "node_modules/highlight.js-postbuild/index"
	},
	shim: {

		semantic: { deps: ["jquery"] }
	}
});

define("Datum", [], function() {

	return Datum;
});

require(["jquery", "js/App", "semantic"], function($, App) {

	$(function() { new BindingRoot(app = new App()); });
});

define("main.js", function(){});

