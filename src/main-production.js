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

/*! jQuery v3.4.1 | (c) JS Foundation and other contributors | jquery.org/license */
!function(e,t){"use strict";"object"==typeof module&&"object"==typeof module.exports?module.exports=e.document?t(e,!0):function(e){if(!e.document)throw new Error("jQuery requires a window with a document");return t(e)}:t(e)}("undefined"!=typeof window?window:this,function(C,e){"use strict";var t=[],E=C.document,r=Object.getPrototypeOf,s=t.slice,g=t.concat,u=t.push,i=t.indexOf,n={},o=n.toString,v=n.hasOwnProperty,a=v.toString,l=a.call(Object),y={},m=function(e){return"function"==typeof e&&"number"!=typeof e.nodeType},x=function(e){return null!=e&&e===e.window},c={type:!0,src:!0,nonce:!0,noModule:!0};function b(e,t,n){var r,i,o=(n=n||E).createElement("script");if(o.text=e,t)for(r in c)(i=t[r]||t.getAttribute&&t.getAttribute(r))&&o.setAttribute(r,i);n.head.appendChild(o).parentNode.removeChild(o)}function w(e){return null==e?e+"":"object"==typeof e||"function"==typeof e?n[o.call(e)]||"object":typeof e}var f="3.4.1",k=function(e,t){return new k.fn.init(e,t)},p=/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;function d(e){var t=!!e&&"length"in e&&e.length,n=w(e);return!m(e)&&!x(e)&&("array"===n||0===t||"number"==typeof t&&0<t&&t-1 in e)}k.fn=k.prototype={jquery:f,constructor:k,length:0,toArray:function(){return s.call(this)},get:function(e){return null==e?s.call(this):e<0?this[e+this.length]:this[e]},pushStack:function(e){var t=k.merge(this.constructor(),e);return t.prevObject=this,t},each:function(e){return k.each(this,e)},map:function(n){return this.pushStack(k.map(this,function(e,t){return n.call(e,t,e)}))},slice:function(){return this.pushStack(s.apply(this,arguments))},first:function(){return this.eq(0)},last:function(){return this.eq(-1)},eq:function(e){var t=this.length,n=+e+(e<0?t:0);return this.pushStack(0<=n&&n<t?[this[n]]:[])},end:function(){return this.prevObject||this.constructor()},push:u,sort:t.sort,splice:t.splice},k.extend=k.fn.extend=function(){var e,t,n,r,i,o,a=arguments[0]||{},s=1,u=arguments.length,l=!1;for("boolean"==typeof a&&(l=a,a=arguments[s]||{},s++),"object"==typeof a||m(a)||(a={}),s===u&&(a=this,s--);s<u;s++)if(null!=(e=arguments[s]))for(t in e)r=e[t],"__proto__"!==t&&a!==r&&(l&&r&&(k.isPlainObject(r)||(i=Array.isArray(r)))?(n=a[t],o=i&&!Array.isArray(n)?[]:i||k.isPlainObject(n)?n:{},i=!1,a[t]=k.extend(l,o,r)):void 0!==r&&(a[t]=r));return a},k.extend({expando:"jQuery"+(f+Math.random()).replace(/\D/g,""),isReady:!0,error:function(e){throw new Error(e)},noop:function(){},isPlainObject:function(e){var t,n;return!(!e||"[object Object]"!==o.call(e))&&(!(t=r(e))||"function"==typeof(n=v.call(t,"constructor")&&t.constructor)&&a.call(n)===l)},isEmptyObject:function(e){var t;for(t in e)return!1;return!0},globalEval:function(e,t){b(e,{nonce:t&&t.nonce})},each:function(e,t){var n,r=0;if(d(e)){for(n=e.length;r<n;r++)if(!1===t.call(e[r],r,e[r]))break}else for(r in e)if(!1===t.call(e[r],r,e[r]))break;return e},trim:function(e){return null==e?"":(e+"").replace(p,"")},makeArray:function(e,t){var n=t||[];return null!=e&&(d(Object(e))?k.merge(n,"string"==typeof e?[e]:e):u.call(n,e)),n},inArray:function(e,t,n){return null==t?-1:i.call(t,e,n)},merge:function(e,t){for(var n=+t.length,r=0,i=e.length;r<n;r++)e[i++]=t[r];return e.length=i,e},grep:function(e,t,n){for(var r=[],i=0,o=e.length,a=!n;i<o;i++)!t(e[i],i)!==a&&r.push(e[i]);return r},map:function(e,t,n){var r,i,o=0,a=[];if(d(e))for(r=e.length;o<r;o++)null!=(i=t(e[o],o,n))&&a.push(i);else for(o in e)null!=(i=t(e[o],o,n))&&a.push(i);return g.apply([],a)},guid:1,support:y}),"function"==typeof Symbol&&(k.fn[Symbol.iterator]=t[Symbol.iterator]),k.each("Boolean Number String Function Array Date RegExp Object Error Symbol".split(" "),function(e,t){n["[object "+t+"]"]=t.toLowerCase()});var h=function(n){var e,d,b,o,i,h,f,g,w,u,l,T,C,a,E,v,s,c,y,k="sizzle"+1*new Date,m=n.document,S=0,r=0,p=ue(),x=ue(),N=ue(),A=ue(),D=function(e,t){return e===t&&(l=!0),0},j={}.hasOwnProperty,t=[],q=t.pop,L=t.push,H=t.push,O=t.slice,P=function(e,t){for(var n=0,r=e.length;n<r;n++)if(e[n]===t)return n;return-1},R="checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",M="[\\x20\\t\\r\\n\\f]",I="(?:\\\\.|[\\w-]|[^\0-\\xa0])+",W="\\["+M+"*("+I+")(?:"+M+"*([*^$|!~]?=)"+M+"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|("+I+"))|)"+M+"*\\]",$=":("+I+")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|"+W+")*)|.*)\\)|)",F=new RegExp(M+"+","g"),B=new RegExp("^"+M+"+|((?:^|[^\\\\])(?:\\\\.)*)"+M+"+$","g"),_=new RegExp("^"+M+"*,"+M+"*"),z=new RegExp("^"+M+"*([>+~]|"+M+")"+M+"*"),U=new RegExp(M+"|>"),X=new RegExp($),V=new RegExp("^"+I+"$"),G={ID:new RegExp("^#("+I+")"),CLASS:new RegExp("^\\.("+I+")"),TAG:new RegExp("^("+I+"|[*])"),ATTR:new RegExp("^"+W),PSEUDO:new RegExp("^"+$),CHILD:new RegExp("^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\("+M+"*(even|odd|(([+-]|)(\\d*)n|)"+M+"*(?:([+-]|)"+M+"*(\\d+)|))"+M+"*\\)|)","i"),bool:new RegExp("^(?:"+R+")$","i"),needsContext:new RegExp("^"+M+"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\("+M+"*((?:-\\d)?\\d*)"+M+"*\\)|)(?=[^-]|$)","i")},Y=/HTML$/i,Q=/^(?:input|select|textarea|button)$/i,J=/^h\d$/i,K=/^[^{]+\{\s*\[native \w/,Z=/^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,ee=/[+~]/,te=new RegExp("\\\\([\\da-f]{1,6}"+M+"?|("+M+")|.)","ig"),ne=function(e,t,n){var r="0x"+t-65536;return r!=r||n?t:r<0?String.fromCharCode(r+65536):String.fromCharCode(r>>10|55296,1023&r|56320)},re=/([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,ie=function(e,t){return t?"\0"===e?"\ufffd":e.slice(0,-1)+"\\"+e.charCodeAt(e.length-1).toString(16)+" ":"\\"+e},oe=function(){T()},ae=be(function(e){return!0===e.disabled&&"fieldset"===e.nodeName.toLowerCase()},{dir:"parentNode",next:"legend"});try{H.apply(t=O.call(m.childNodes),m.childNodes),t[m.childNodes.length].nodeType}catch(e){H={apply:t.length?function(e,t){L.apply(e,O.call(t))}:function(e,t){var n=e.length,r=0;while(e[n++]=t[r++]);e.length=n-1}}}function se(t,e,n,r){var i,o,a,s,u,l,c,f=e&&e.ownerDocument,p=e?e.nodeType:9;if(n=n||[],"string"!=typeof t||!t||1!==p&&9!==p&&11!==p)return n;if(!r&&((e?e.ownerDocument||e:m)!==C&&T(e),e=e||C,E)){if(11!==p&&(u=Z.exec(t)))if(i=u[1]){if(9===p){if(!(a=e.getElementById(i)))return n;if(a.id===i)return n.push(a),n}else if(f&&(a=f.getElementById(i))&&y(e,a)&&a.id===i)return n.push(a),n}else{if(u[2])return H.apply(n,e.getElementsByTagName(t)),n;if((i=u[3])&&d.getElementsByClassName&&e.getElementsByClassName)return H.apply(n,e.getElementsByClassName(i)),n}if(d.qsa&&!A[t+" "]&&(!v||!v.test(t))&&(1!==p||"object"!==e.nodeName.toLowerCase())){if(c=t,f=e,1===p&&U.test(t)){(s=e.getAttribute("id"))?s=s.replace(re,ie):e.setAttribute("id",s=k),o=(l=h(t)).length;while(o--)l[o]="#"+s+" "+xe(l[o]);c=l.join(","),f=ee.test(t)&&ye(e.parentNode)||e}try{return H.apply(n,f.querySelectorAll(c)),n}catch(e){A(t,!0)}finally{s===k&&e.removeAttribute("id")}}}return g(t.replace(B,"$1"),e,n,r)}function ue(){var r=[];return function e(t,n){return r.push(t+" ")>b.cacheLength&&delete e[r.shift()],e[t+" "]=n}}function le(e){return e[k]=!0,e}function ce(e){var t=C.createElement("fieldset");try{return!!e(t)}catch(e){return!1}finally{t.parentNode&&t.parentNode.removeChild(t),t=null}}function fe(e,t){var n=e.split("|"),r=n.length;while(r--)b.attrHandle[n[r]]=t}function pe(e,t){var n=t&&e,r=n&&1===e.nodeType&&1===t.nodeType&&e.sourceIndex-t.sourceIndex;if(r)return r;if(n)while(n=n.nextSibling)if(n===t)return-1;return e?1:-1}function de(t){return function(e){return"input"===e.nodeName.toLowerCase()&&e.type===t}}function he(n){return function(e){var t=e.nodeName.toLowerCase();return("input"===t||"button"===t)&&e.type===n}}function ge(t){return function(e){return"form"in e?e.parentNode&&!1===e.disabled?"label"in e?"label"in e.parentNode?e.parentNode.disabled===t:e.disabled===t:e.isDisabled===t||e.isDisabled!==!t&&ae(e)===t:e.disabled===t:"label"in e&&e.disabled===t}}function ve(a){return le(function(o){return o=+o,le(function(e,t){var n,r=a([],e.length,o),i=r.length;while(i--)e[n=r[i]]&&(e[n]=!(t[n]=e[n]))})})}function ye(e){return e&&"undefined"!=typeof e.getElementsByTagName&&e}for(e in d=se.support={},i=se.isXML=function(e){var t=e.namespaceURI,n=(e.ownerDocument||e).documentElement;return!Y.test(t||n&&n.nodeName||"HTML")},T=se.setDocument=function(e){var t,n,r=e?e.ownerDocument||e:m;return r!==C&&9===r.nodeType&&r.documentElement&&(a=(C=r).documentElement,E=!i(C),m!==C&&(n=C.defaultView)&&n.top!==n&&(n.addEventListener?n.addEventListener("unload",oe,!1):n.attachEvent&&n.attachEvent("onunload",oe)),d.attributes=ce(function(e){return e.className="i",!e.getAttribute("className")}),d.getElementsByTagName=ce(function(e){return e.appendChild(C.createComment("")),!e.getElementsByTagName("*").length}),d.getElementsByClassName=K.test(C.getElementsByClassName),d.getById=ce(function(e){return a.appendChild(e).id=k,!C.getElementsByName||!C.getElementsByName(k).length}),d.getById?(b.filter.ID=function(e){var t=e.replace(te,ne);return function(e){return e.getAttribute("id")===t}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n=t.getElementById(e);return n?[n]:[]}}):(b.filter.ID=function(e){var n=e.replace(te,ne);return function(e){var t="undefined"!=typeof e.getAttributeNode&&e.getAttributeNode("id");return t&&t.value===n}},b.find.ID=function(e,t){if("undefined"!=typeof t.getElementById&&E){var n,r,i,o=t.getElementById(e);if(o){if((n=o.getAttributeNode("id"))&&n.value===e)return[o];i=t.getElementsByName(e),r=0;while(o=i[r++])if((n=o.getAttributeNode("id"))&&n.value===e)return[o]}return[]}}),b.find.TAG=d.getElementsByTagName?function(e,t){return"undefined"!=typeof t.getElementsByTagName?t.getElementsByTagName(e):d.qsa?t.querySelectorAll(e):void 0}:function(e,t){var n,r=[],i=0,o=t.getElementsByTagName(e);if("*"===e){while(n=o[i++])1===n.nodeType&&r.push(n);return r}return o},b.find.CLASS=d.getElementsByClassName&&function(e,t){if("undefined"!=typeof t.getElementsByClassName&&E)return t.getElementsByClassName(e)},s=[],v=[],(d.qsa=K.test(C.querySelectorAll))&&(ce(function(e){a.appendChild(e).innerHTML="<a id='"+k+"'></a><select id='"+k+"-\r\\' msallowcapture=''><option selected=''></option></select>",e.querySelectorAll("[msallowcapture^='']").length&&v.push("[*^$]="+M+"*(?:''|\"\")"),e.querySelectorAll("[selected]").length||v.push("\\["+M+"*(?:value|"+R+")"),e.querySelectorAll("[id~="+k+"-]").length||v.push("~="),e.querySelectorAll(":checked").length||v.push(":checked"),e.querySelectorAll("a#"+k+"+*").length||v.push(".#.+[+~]")}),ce(function(e){e.innerHTML="<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";var t=C.createElement("input");t.setAttribute("type","hidden"),e.appendChild(t).setAttribute("name","D"),e.querySelectorAll("[name=d]").length&&v.push("name"+M+"*[*^$|!~]?="),2!==e.querySelectorAll(":enabled").length&&v.push(":enabled",":disabled"),a.appendChild(e).disabled=!0,2!==e.querySelectorAll(":disabled").length&&v.push(":enabled",":disabled"),e.querySelectorAll("*,:x"),v.push(",.*:")})),(d.matchesSelector=K.test(c=a.matches||a.webkitMatchesSelector||a.mozMatchesSelector||a.oMatchesSelector||a.msMatchesSelector))&&ce(function(e){d.disconnectedMatch=c.call(e,"*"),c.call(e,"[s!='']:x"),s.push("!=",$)}),v=v.length&&new RegExp(v.join("|")),s=s.length&&new RegExp(s.join("|")),t=K.test(a.compareDocumentPosition),y=t||K.test(a.contains)?function(e,t){var n=9===e.nodeType?e.documentElement:e,r=t&&t.parentNode;return e===r||!(!r||1!==r.nodeType||!(n.contains?n.contains(r):e.compareDocumentPosition&&16&e.compareDocumentPosition(r)))}:function(e,t){if(t)while(t=t.parentNode)if(t===e)return!0;return!1},D=t?function(e,t){if(e===t)return l=!0,0;var n=!e.compareDocumentPosition-!t.compareDocumentPosition;return n||(1&(n=(e.ownerDocument||e)===(t.ownerDocument||t)?e.compareDocumentPosition(t):1)||!d.sortDetached&&t.compareDocumentPosition(e)===n?e===C||e.ownerDocument===m&&y(m,e)?-1:t===C||t.ownerDocument===m&&y(m,t)?1:u?P(u,e)-P(u,t):0:4&n?-1:1)}:function(e,t){if(e===t)return l=!0,0;var n,r=0,i=e.parentNode,o=t.parentNode,a=[e],s=[t];if(!i||!o)return e===C?-1:t===C?1:i?-1:o?1:u?P(u,e)-P(u,t):0;if(i===o)return pe(e,t);n=e;while(n=n.parentNode)a.unshift(n);n=t;while(n=n.parentNode)s.unshift(n);while(a[r]===s[r])r++;return r?pe(a[r],s[r]):a[r]===m?-1:s[r]===m?1:0}),C},se.matches=function(e,t){return se(e,null,null,t)},se.matchesSelector=function(e,t){if((e.ownerDocument||e)!==C&&T(e),d.matchesSelector&&E&&!A[t+" "]&&(!s||!s.test(t))&&(!v||!v.test(t)))try{var n=c.call(e,t);if(n||d.disconnectedMatch||e.document&&11!==e.document.nodeType)return n}catch(e){A(t,!0)}return 0<se(t,C,null,[e]).length},se.contains=function(e,t){return(e.ownerDocument||e)!==C&&T(e),y(e,t)},se.attr=function(e,t){(e.ownerDocument||e)!==C&&T(e);var n=b.attrHandle[t.toLowerCase()],r=n&&j.call(b.attrHandle,t.toLowerCase())?n(e,t,!E):void 0;return void 0!==r?r:d.attributes||!E?e.getAttribute(t):(r=e.getAttributeNode(t))&&r.specified?r.value:null},se.escape=function(e){return(e+"").replace(re,ie)},se.error=function(e){throw new Error("Syntax error, unrecognized expression: "+e)},se.uniqueSort=function(e){var t,n=[],r=0,i=0;if(l=!d.detectDuplicates,u=!d.sortStable&&e.slice(0),e.sort(D),l){while(t=e[i++])t===e[i]&&(r=n.push(i));while(r--)e.splice(n[r],1)}return u=null,e},o=se.getText=function(e){var t,n="",r=0,i=e.nodeType;if(i){if(1===i||9===i||11===i){if("string"==typeof e.textContent)return e.textContent;for(e=e.firstChild;e;e=e.nextSibling)n+=o(e)}else if(3===i||4===i)return e.nodeValue}else while(t=e[r++])n+=o(t);return n},(b=se.selectors={cacheLength:50,createPseudo:le,match:G,attrHandle:{},find:{},relative:{">":{dir:"parentNode",first:!0}," ":{dir:"parentNode"},"+":{dir:"previousSibling",first:!0},"~":{dir:"previousSibling"}},preFilter:{ATTR:function(e){return e[1]=e[1].replace(te,ne),e[3]=(e[3]||e[4]||e[5]||"").replace(te,ne),"~="===e[2]&&(e[3]=" "+e[3]+" "),e.slice(0,4)},CHILD:function(e){return e[1]=e[1].toLowerCase(),"nth"===e[1].slice(0,3)?(e[3]||se.error(e[0]),e[4]=+(e[4]?e[5]+(e[6]||1):2*("even"===e[3]||"odd"===e[3])),e[5]=+(e[7]+e[8]||"odd"===e[3])):e[3]&&se.error(e[0]),e},PSEUDO:function(e){var t,n=!e[6]&&e[2];return G.CHILD.test(e[0])?null:(e[3]?e[2]=e[4]||e[5]||"":n&&X.test(n)&&(t=h(n,!0))&&(t=n.indexOf(")",n.length-t)-n.length)&&(e[0]=e[0].slice(0,t),e[2]=n.slice(0,t)),e.slice(0,3))}},filter:{TAG:function(e){var t=e.replace(te,ne).toLowerCase();return"*"===e?function(){return!0}:function(e){return e.nodeName&&e.nodeName.toLowerCase()===t}},CLASS:function(e){var t=p[e+" "];return t||(t=new RegExp("(^|"+M+")"+e+"("+M+"|$)"))&&p(e,function(e){return t.test("string"==typeof e.className&&e.className||"undefined"!=typeof e.getAttribute&&e.getAttribute("class")||"")})},ATTR:function(n,r,i){return function(e){var t=se.attr(e,n);return null==t?"!="===r:!r||(t+="","="===r?t===i:"!="===r?t!==i:"^="===r?i&&0===t.indexOf(i):"*="===r?i&&-1<t.indexOf(i):"$="===r?i&&t.slice(-i.length)===i:"~="===r?-1<(" "+t.replace(F," ")+" ").indexOf(i):"|="===r&&(t===i||t.slice(0,i.length+1)===i+"-"))}},CHILD:function(h,e,t,g,v){var y="nth"!==h.slice(0,3),m="last"!==h.slice(-4),x="of-type"===e;return 1===g&&0===v?function(e){return!!e.parentNode}:function(e,t,n){var r,i,o,a,s,u,l=y!==m?"nextSibling":"previousSibling",c=e.parentNode,f=x&&e.nodeName.toLowerCase(),p=!n&&!x,d=!1;if(c){if(y){while(l){a=e;while(a=a[l])if(x?a.nodeName.toLowerCase()===f:1===a.nodeType)return!1;u=l="only"===h&&!u&&"nextSibling"}return!0}if(u=[m?c.firstChild:c.lastChild],m&&p){d=(s=(r=(i=(o=(a=c)[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===S&&r[1])&&r[2],a=s&&c.childNodes[s];while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if(1===a.nodeType&&++d&&a===e){i[h]=[S,s,d];break}}else if(p&&(d=s=(r=(i=(o=(a=e)[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]||[])[0]===S&&r[1]),!1===d)while(a=++s&&a&&a[l]||(d=s=0)||u.pop())if((x?a.nodeName.toLowerCase()===f:1===a.nodeType)&&++d&&(p&&((i=(o=a[k]||(a[k]={}))[a.uniqueID]||(o[a.uniqueID]={}))[h]=[S,d]),a===e))break;return(d-=v)===g||d%g==0&&0<=d/g}}},PSEUDO:function(e,o){var t,a=b.pseudos[e]||b.setFilters[e.toLowerCase()]||se.error("unsupported pseudo: "+e);return a[k]?a(o):1<a.length?(t=[e,e,"",o],b.setFilters.hasOwnProperty(e.toLowerCase())?le(function(e,t){var n,r=a(e,o),i=r.length;while(i--)e[n=P(e,r[i])]=!(t[n]=r[i])}):function(e){return a(e,0,t)}):a}},pseudos:{not:le(function(e){var r=[],i=[],s=f(e.replace(B,"$1"));return s[k]?le(function(e,t,n,r){var i,o=s(e,null,r,[]),a=e.length;while(a--)(i=o[a])&&(e[a]=!(t[a]=i))}):function(e,t,n){return r[0]=e,s(r,null,n,i),r[0]=null,!i.pop()}}),has:le(function(t){return function(e){return 0<se(t,e).length}}),contains:le(function(t){return t=t.replace(te,ne),function(e){return-1<(e.textContent||o(e)).indexOf(t)}}),lang:le(function(n){return V.test(n||"")||se.error("unsupported lang: "+n),n=n.replace(te,ne).toLowerCase(),function(e){var t;do{if(t=E?e.lang:e.getAttribute("xml:lang")||e.getAttribute("lang"))return(t=t.toLowerCase())===n||0===t.indexOf(n+"-")}while((e=e.parentNode)&&1===e.nodeType);return!1}}),target:function(e){var t=n.location&&n.location.hash;return t&&t.slice(1)===e.id},root:function(e){return e===a},focus:function(e){return e===C.activeElement&&(!C.hasFocus||C.hasFocus())&&!!(e.type||e.href||~e.tabIndex)},enabled:ge(!1),disabled:ge(!0),checked:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&!!e.checked||"option"===t&&!!e.selected},selected:function(e){return e.parentNode&&e.parentNode.selectedIndex,!0===e.selected},empty:function(e){for(e=e.firstChild;e;e=e.nextSibling)if(e.nodeType<6)return!1;return!0},parent:function(e){return!b.pseudos.empty(e)},header:function(e){return J.test(e.nodeName)},input:function(e){return Q.test(e.nodeName)},button:function(e){var t=e.nodeName.toLowerCase();return"input"===t&&"button"===e.type||"button"===t},text:function(e){var t;return"input"===e.nodeName.toLowerCase()&&"text"===e.type&&(null==(t=e.getAttribute("type"))||"text"===t.toLowerCase())},first:ve(function(){return[0]}),last:ve(function(e,t){return[t-1]}),eq:ve(function(e,t,n){return[n<0?n+t:n]}),even:ve(function(e,t){for(var n=0;n<t;n+=2)e.push(n);return e}),odd:ve(function(e,t){for(var n=1;n<t;n+=2)e.push(n);return e}),lt:ve(function(e,t,n){for(var r=n<0?n+t:t<n?t:n;0<=--r;)e.push(r);return e}),gt:ve(function(e,t,n){for(var r=n<0?n+t:n;++r<t;)e.push(r);return e})}}).pseudos.nth=b.pseudos.eq,{radio:!0,checkbox:!0,file:!0,password:!0,image:!0})b.pseudos[e]=de(e);for(e in{submit:!0,reset:!0})b.pseudos[e]=he(e);function me(){}function xe(e){for(var t=0,n=e.length,r="";t<n;t++)r+=e[t].value;return r}function be(s,e,t){var u=e.dir,l=e.next,c=l||u,f=t&&"parentNode"===c,p=r++;return e.first?function(e,t,n){while(e=e[u])if(1===e.nodeType||f)return s(e,t,n);return!1}:function(e,t,n){var r,i,o,a=[S,p];if(n){while(e=e[u])if((1===e.nodeType||f)&&s(e,t,n))return!0}else while(e=e[u])if(1===e.nodeType||f)if(i=(o=e[k]||(e[k]={}))[e.uniqueID]||(o[e.uniqueID]={}),l&&l===e.nodeName.toLowerCase())e=e[u]||e;else{if((r=i[c])&&r[0]===S&&r[1]===p)return a[2]=r[2];if((i[c]=a)[2]=s(e,t,n))return!0}return!1}}function we(i){return 1<i.length?function(e,t,n){var r=i.length;while(r--)if(!i[r](e,t,n))return!1;return!0}:i[0]}function Te(e,t,n,r,i){for(var o,a=[],s=0,u=e.length,l=null!=t;s<u;s++)(o=e[s])&&(n&&!n(o,r,i)||(a.push(o),l&&t.push(s)));return a}function Ce(d,h,g,v,y,e){return v&&!v[k]&&(v=Ce(v)),y&&!y[k]&&(y=Ce(y,e)),le(function(e,t,n,r){var i,o,a,s=[],u=[],l=t.length,c=e||function(e,t,n){for(var r=0,i=t.length;r<i;r++)se(e,t[r],n);return n}(h||"*",n.nodeType?[n]:n,[]),f=!d||!e&&h?c:Te(c,s,d,n,r),p=g?y||(e?d:l||v)?[]:t:f;if(g&&g(f,p,n,r),v){i=Te(p,u),v(i,[],n,r),o=i.length;while(o--)(a=i[o])&&(p[u[o]]=!(f[u[o]]=a))}if(e){if(y||d){if(y){i=[],o=p.length;while(o--)(a=p[o])&&i.push(f[o]=a);y(null,p=[],i,r)}o=p.length;while(o--)(a=p[o])&&-1<(i=y?P(e,a):s[o])&&(e[i]=!(t[i]=a))}}else p=Te(p===t?p.splice(l,p.length):p),y?y(null,t,p,r):H.apply(t,p)})}function Ee(e){for(var i,t,n,r=e.length,o=b.relative[e[0].type],a=o||b.relative[" "],s=o?1:0,u=be(function(e){return e===i},a,!0),l=be(function(e){return-1<P(i,e)},a,!0),c=[function(e,t,n){var r=!o&&(n||t!==w)||((i=t).nodeType?u(e,t,n):l(e,t,n));return i=null,r}];s<r;s++)if(t=b.relative[e[s].type])c=[be(we(c),t)];else{if((t=b.filter[e[s].type].apply(null,e[s].matches))[k]){for(n=++s;n<r;n++)if(b.relative[e[n].type])break;return Ce(1<s&&we(c),1<s&&xe(e.slice(0,s-1).concat({value:" "===e[s-2].type?"*":""})).replace(B,"$1"),t,s<n&&Ee(e.slice(s,n)),n<r&&Ee(e=e.slice(n)),n<r&&xe(e))}c.push(t)}return we(c)}return me.prototype=b.filters=b.pseudos,b.setFilters=new me,h=se.tokenize=function(e,t){var n,r,i,o,a,s,u,l=x[e+" "];if(l)return t?0:l.slice(0);a=e,s=[],u=b.preFilter;while(a){for(o in n&&!(r=_.exec(a))||(r&&(a=a.slice(r[0].length)||a),s.push(i=[])),n=!1,(r=z.exec(a))&&(n=r.shift(),i.push({value:n,type:r[0].replace(B," ")}),a=a.slice(n.length)),b.filter)!(r=G[o].exec(a))||u[o]&&!(r=u[o](r))||(n=r.shift(),i.push({value:n,type:o,matches:r}),a=a.slice(n.length));if(!n)break}return t?a.length:a?se.error(e):x(e,s).slice(0)},f=se.compile=function(e,t){var n,v,y,m,x,r,i=[],o=[],a=N[e+" "];if(!a){t||(t=h(e)),n=t.length;while(n--)(a=Ee(t[n]))[k]?i.push(a):o.push(a);(a=N(e,(v=o,m=0<(y=i).length,x=0<v.length,r=function(e,t,n,r,i){var o,a,s,u=0,l="0",c=e&&[],f=[],p=w,d=e||x&&b.find.TAG("*",i),h=S+=null==p?1:Math.random()||.1,g=d.length;for(i&&(w=t===C||t||i);l!==g&&null!=(o=d[l]);l++){if(x&&o){a=0,t||o.ownerDocument===C||(T(o),n=!E);while(s=v[a++])if(s(o,t||C,n)){r.push(o);break}i&&(S=h)}m&&((o=!s&&o)&&u--,e&&c.push(o))}if(u+=l,m&&l!==u){a=0;while(s=y[a++])s(c,f,t,n);if(e){if(0<u)while(l--)c[l]||f[l]||(f[l]=q.call(r));f=Te(f)}H.apply(r,f),i&&!e&&0<f.length&&1<u+y.length&&se.uniqueSort(r)}return i&&(S=h,w=p),c},m?le(r):r))).selector=e}return a},g=se.select=function(e,t,n,r){var i,o,a,s,u,l="function"==typeof e&&e,c=!r&&h(e=l.selector||e);if(n=n||[],1===c.length){if(2<(o=c[0]=c[0].slice(0)).length&&"ID"===(a=o[0]).type&&9===t.nodeType&&E&&b.relative[o[1].type]){if(!(t=(b.find.ID(a.matches[0].replace(te,ne),t)||[])[0]))return n;l&&(t=t.parentNode),e=e.slice(o.shift().value.length)}i=G.needsContext.test(e)?0:o.length;while(i--){if(a=o[i],b.relative[s=a.type])break;if((u=b.find[s])&&(r=u(a.matches[0].replace(te,ne),ee.test(o[0].type)&&ye(t.parentNode)||t))){if(o.splice(i,1),!(e=r.length&&xe(o)))return H.apply(n,r),n;break}}}return(l||f(e,c))(r,t,!E,n,!t||ee.test(e)&&ye(t.parentNode)||t),n},d.sortStable=k.split("").sort(D).join("")===k,d.detectDuplicates=!!l,T(),d.sortDetached=ce(function(e){return 1&e.compareDocumentPosition(C.createElement("fieldset"))}),ce(function(e){return e.innerHTML="<a href='#'></a>","#"===e.firstChild.getAttribute("href")})||fe("type|href|height|width",function(e,t,n){if(!n)return e.getAttribute(t,"type"===t.toLowerCase()?1:2)}),d.attributes&&ce(function(e){return e.innerHTML="<input/>",e.firstChild.setAttribute("value",""),""===e.firstChild.getAttribute("value")})||fe("value",function(e,t,n){if(!n&&"input"===e.nodeName.toLowerCase())return e.defaultValue}),ce(function(e){return null==e.getAttribute("disabled")})||fe(R,function(e,t,n){var r;if(!n)return!0===e[t]?t.toLowerCase():(r=e.getAttributeNode(t))&&r.specified?r.value:null}),se}(C);k.find=h,k.expr=h.selectors,k.expr[":"]=k.expr.pseudos,k.uniqueSort=k.unique=h.uniqueSort,k.text=h.getText,k.isXMLDoc=h.isXML,k.contains=h.contains,k.escapeSelector=h.escape;var T=function(e,t,n){var r=[],i=void 0!==n;while((e=e[t])&&9!==e.nodeType)if(1===e.nodeType){if(i&&k(e).is(n))break;r.push(e)}return r},S=function(e,t){for(var n=[];e;e=e.nextSibling)1===e.nodeType&&e!==t&&n.push(e);return n},N=k.expr.match.needsContext;function A(e,t){return e.nodeName&&e.nodeName.toLowerCase()===t.toLowerCase()}var D=/^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;function j(e,n,r){return m(n)?k.grep(e,function(e,t){return!!n.call(e,t,e)!==r}):n.nodeType?k.grep(e,function(e){return e===n!==r}):"string"!=typeof n?k.grep(e,function(e){return-1<i.call(n,e)!==r}):k.filter(n,e,r)}k.filter=function(e,t,n){var r=t[0];return n&&(e=":not("+e+")"),1===t.length&&1===r.nodeType?k.find.matchesSelector(r,e)?[r]:[]:k.find.matches(e,k.grep(t,function(e){return 1===e.nodeType}))},k.fn.extend({find:function(e){var t,n,r=this.length,i=this;if("string"!=typeof e)return this.pushStack(k(e).filter(function(){for(t=0;t<r;t++)if(k.contains(i[t],this))return!0}));for(n=this.pushStack([]),t=0;t<r;t++)k.find(e,i[t],n);return 1<r?k.uniqueSort(n):n},filter:function(e){return this.pushStack(j(this,e||[],!1))},not:function(e){return this.pushStack(j(this,e||[],!0))},is:function(e){return!!j(this,"string"==typeof e&&N.test(e)?k(e):e||[],!1).length}});var q,L=/^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;(k.fn.init=function(e,t,n){var r,i;if(!e)return this;if(n=n||q,"string"==typeof e){if(!(r="<"===e[0]&&">"===e[e.length-1]&&3<=e.length?[null,e,null]:L.exec(e))||!r[1]&&t)return!t||t.jquery?(t||n).find(e):this.constructor(t).find(e);if(r[1]){if(t=t instanceof k?t[0]:t,k.merge(this,k.parseHTML(r[1],t&&t.nodeType?t.ownerDocument||t:E,!0)),D.test(r[1])&&k.isPlainObject(t))for(r in t)m(this[r])?this[r](t[r]):this.attr(r,t[r]);return this}return(i=E.getElementById(r[2]))&&(this[0]=i,this.length=1),this}return e.nodeType?(this[0]=e,this.length=1,this):m(e)?void 0!==n.ready?n.ready(e):e(k):k.makeArray(e,this)}).prototype=k.fn,q=k(E);var H=/^(?:parents|prev(?:Until|All))/,O={children:!0,contents:!0,next:!0,prev:!0};function P(e,t){while((e=e[t])&&1!==e.nodeType);return e}k.fn.extend({has:function(e){var t=k(e,this),n=t.length;return this.filter(function(){for(var e=0;e<n;e++)if(k.contains(this,t[e]))return!0})},closest:function(e,t){var n,r=0,i=this.length,o=[],a="string"!=typeof e&&k(e);if(!N.test(e))for(;r<i;r++)for(n=this[r];n&&n!==t;n=n.parentNode)if(n.nodeType<11&&(a?-1<a.index(n):1===n.nodeType&&k.find.matchesSelector(n,e))){o.push(n);break}return this.pushStack(1<o.length?k.uniqueSort(o):o)},index:function(e){return e?"string"==typeof e?i.call(k(e),this[0]):i.call(this,e.jquery?e[0]:e):this[0]&&this[0].parentNode?this.first().prevAll().length:-1},add:function(e,t){return this.pushStack(k.uniqueSort(k.merge(this.get(),k(e,t))))},addBack:function(e){return this.add(null==e?this.prevObject:this.prevObject.filter(e))}}),k.each({parent:function(e){var t=e.parentNode;return t&&11!==t.nodeType?t:null},parents:function(e){return T(e,"parentNode")},parentsUntil:function(e,t,n){return T(e,"parentNode",n)},next:function(e){return P(e,"nextSibling")},prev:function(e){return P(e,"previousSibling")},nextAll:function(e){return T(e,"nextSibling")},prevAll:function(e){return T(e,"previousSibling")},nextUntil:function(e,t,n){return T(e,"nextSibling",n)},prevUntil:function(e,t,n){return T(e,"previousSibling",n)},siblings:function(e){return S((e.parentNode||{}).firstChild,e)},children:function(e){return S(e.firstChild)},contents:function(e){return"undefined"!=typeof e.contentDocument?e.contentDocument:(A(e,"template")&&(e=e.content||e),k.merge([],e.childNodes))}},function(r,i){k.fn[r]=function(e,t){var n=k.map(this,i,e);return"Until"!==r.slice(-5)&&(t=e),t&&"string"==typeof t&&(n=k.filter(t,n)),1<this.length&&(O[r]||k.uniqueSort(n),H.test(r)&&n.reverse()),this.pushStack(n)}});var R=/[^\x20\t\r\n\f]+/g;function M(e){return e}function I(e){throw e}function W(e,t,n,r){var i;try{e&&m(i=e.promise)?i.call(e).done(t).fail(n):e&&m(i=e.then)?i.call(e,t,n):t.apply(void 0,[e].slice(r))}catch(e){n.apply(void 0,[e])}}k.Callbacks=function(r){var e,n;r="string"==typeof r?(e=r,n={},k.each(e.match(R)||[],function(e,t){n[t]=!0}),n):k.extend({},r);var i,t,o,a,s=[],u=[],l=-1,c=function(){for(a=a||r.once,o=i=!0;u.length;l=-1){t=u.shift();while(++l<s.length)!1===s[l].apply(t[0],t[1])&&r.stopOnFalse&&(l=s.length,t=!1)}r.memory||(t=!1),i=!1,a&&(s=t?[]:"")},f={add:function(){return s&&(t&&!i&&(l=s.length-1,u.push(t)),function n(e){k.each(e,function(e,t){m(t)?r.unique&&f.has(t)||s.push(t):t&&t.length&&"string"!==w(t)&&n(t)})}(arguments),t&&!i&&c()),this},remove:function(){return k.each(arguments,function(e,t){var n;while(-1<(n=k.inArray(t,s,n)))s.splice(n,1),n<=l&&l--}),this},has:function(e){return e?-1<k.inArray(e,s):0<s.length},empty:function(){return s&&(s=[]),this},disable:function(){return a=u=[],s=t="",this},disabled:function(){return!s},lock:function(){return a=u=[],t||i||(s=t=""),this},locked:function(){return!!a},fireWith:function(e,t){return a||(t=[e,(t=t||[]).slice?t.slice():t],u.push(t),i||c()),this},fire:function(){return f.fireWith(this,arguments),this},fired:function(){return!!o}};return f},k.extend({Deferred:function(e){var o=[["notify","progress",k.Callbacks("memory"),k.Callbacks("memory"),2],["resolve","done",k.Callbacks("once memory"),k.Callbacks("once memory"),0,"resolved"],["reject","fail",k.Callbacks("once memory"),k.Callbacks("once memory"),1,"rejected"]],i="pending",a={state:function(){return i},always:function(){return s.done(arguments).fail(arguments),this},"catch":function(e){return a.then(null,e)},pipe:function(){var i=arguments;return k.Deferred(function(r){k.each(o,function(e,t){var n=m(i[t[4]])&&i[t[4]];s[t[1]](function(){var e=n&&n.apply(this,arguments);e&&m(e.promise)?e.promise().progress(r.notify).done(r.resolve).fail(r.reject):r[t[0]+"With"](this,n?[e]:arguments)})}),i=null}).promise()},then:function(t,n,r){var u=0;function l(i,o,a,s){return function(){var n=this,r=arguments,e=function(){var e,t;if(!(i<u)){if((e=a.apply(n,r))===o.promise())throw new TypeError("Thenable self-resolution");t=e&&("object"==typeof e||"function"==typeof e)&&e.then,m(t)?s?t.call(e,l(u,o,M,s),l(u,o,I,s)):(u++,t.call(e,l(u,o,M,s),l(u,o,I,s),l(u,o,M,o.notifyWith))):(a!==M&&(n=void 0,r=[e]),(s||o.resolveWith)(n,r))}},t=s?e:function(){try{e()}catch(e){k.Deferred.exceptionHook&&k.Deferred.exceptionHook(e,t.stackTrace),u<=i+1&&(a!==I&&(n=void 0,r=[e]),o.rejectWith(n,r))}};i?t():(k.Deferred.getStackHook&&(t.stackTrace=k.Deferred.getStackHook()),C.setTimeout(t))}}return k.Deferred(function(e){o[0][3].add(l(0,e,m(r)?r:M,e.notifyWith)),o[1][3].add(l(0,e,m(t)?t:M)),o[2][3].add(l(0,e,m(n)?n:I))}).promise()},promise:function(e){return null!=e?k.extend(e,a):a}},s={};return k.each(o,function(e,t){var n=t[2],r=t[5];a[t[1]]=n.add,r&&n.add(function(){i=r},o[3-e][2].disable,o[3-e][3].disable,o[0][2].lock,o[0][3].lock),n.add(t[3].fire),s[t[0]]=function(){return s[t[0]+"With"](this===s?void 0:this,arguments),this},s[t[0]+"With"]=n.fireWith}),a.promise(s),e&&e.call(s,s),s},when:function(e){var n=arguments.length,t=n,r=Array(t),i=s.call(arguments),o=k.Deferred(),a=function(t){return function(e){r[t]=this,i[t]=1<arguments.length?s.call(arguments):e,--n||o.resolveWith(r,i)}};if(n<=1&&(W(e,o.done(a(t)).resolve,o.reject,!n),"pending"===o.state()||m(i[t]&&i[t].then)))return o.then();while(t--)W(i[t],a(t),o.reject);return o.promise()}});var $=/^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;k.Deferred.exceptionHook=function(e,t){C.console&&C.console.warn&&e&&$.test(e.name)&&C.console.warn("jQuery.Deferred exception: "+e.message,e.stack,t)},k.readyException=function(e){C.setTimeout(function(){throw e})};var F=k.Deferred();function B(){E.removeEventListener("DOMContentLoaded",B),C.removeEventListener("load",B),k.ready()}k.fn.ready=function(e){return F.then(e)["catch"](function(e){k.readyException(e)}),this},k.extend({isReady:!1,readyWait:1,ready:function(e){(!0===e?--k.readyWait:k.isReady)||(k.isReady=!0)!==e&&0<--k.readyWait||F.resolveWith(E,[k])}}),k.ready.then=F.then,"complete"===E.readyState||"loading"!==E.readyState&&!E.documentElement.doScroll?C.setTimeout(k.ready):(E.addEventListener("DOMContentLoaded",B),C.addEventListener("load",B));var _=function(e,t,n,r,i,o,a){var s=0,u=e.length,l=null==n;if("object"===w(n))for(s in i=!0,n)_(e,t,s,n[s],!0,o,a);else if(void 0!==r&&(i=!0,m(r)||(a=!0),l&&(a?(t.call(e,r),t=null):(l=t,t=function(e,t,n){return l.call(k(e),n)})),t))for(;s<u;s++)t(e[s],n,a?r:r.call(e[s],s,t(e[s],n)));return i?e:l?t.call(e):u?t(e[0],n):o},z=/^-ms-/,U=/-([a-z])/g;function X(e,t){return t.toUpperCase()}function V(e){return e.replace(z,"ms-").replace(U,X)}var G=function(e){return 1===e.nodeType||9===e.nodeType||!+e.nodeType};function Y(){this.expando=k.expando+Y.uid++}Y.uid=1,Y.prototype={cache:function(e){var t=e[this.expando];return t||(t={},G(e)&&(e.nodeType?e[this.expando]=t:Object.defineProperty(e,this.expando,{value:t,configurable:!0}))),t},set:function(e,t,n){var r,i=this.cache(e);if("string"==typeof t)i[V(t)]=n;else for(r in t)i[V(r)]=t[r];return i},get:function(e,t){return void 0===t?this.cache(e):e[this.expando]&&e[this.expando][V(t)]},access:function(e,t,n){return void 0===t||t&&"string"==typeof t&&void 0===n?this.get(e,t):(this.set(e,t,n),void 0!==n?n:t)},remove:function(e,t){var n,r=e[this.expando];if(void 0!==r){if(void 0!==t){n=(t=Array.isArray(t)?t.map(V):(t=V(t))in r?[t]:t.match(R)||[]).length;while(n--)delete r[t[n]]}(void 0===t||k.isEmptyObject(r))&&(e.nodeType?e[this.expando]=void 0:delete e[this.expando])}},hasData:function(e){var t=e[this.expando];return void 0!==t&&!k.isEmptyObject(t)}};var Q=new Y,J=new Y,K=/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,Z=/[A-Z]/g;function ee(e,t,n){var r,i;if(void 0===n&&1===e.nodeType)if(r="data-"+t.replace(Z,"-$&").toLowerCase(),"string"==typeof(n=e.getAttribute(r))){try{n="true"===(i=n)||"false"!==i&&("null"===i?null:i===+i+""?+i:K.test(i)?JSON.parse(i):i)}catch(e){}J.set(e,t,n)}else n=void 0;return n}k.extend({hasData:function(e){return J.hasData(e)||Q.hasData(e)},data:function(e,t,n){return J.access(e,t,n)},removeData:function(e,t){J.remove(e,t)},_data:function(e,t,n){return Q.access(e,t,n)},_removeData:function(e,t){Q.remove(e,t)}}),k.fn.extend({data:function(n,e){var t,r,i,o=this[0],a=o&&o.attributes;if(void 0===n){if(this.length&&(i=J.get(o),1===o.nodeType&&!Q.get(o,"hasDataAttrs"))){t=a.length;while(t--)a[t]&&0===(r=a[t].name).indexOf("data-")&&(r=V(r.slice(5)),ee(o,r,i[r]));Q.set(o,"hasDataAttrs",!0)}return i}return"object"==typeof n?this.each(function(){J.set(this,n)}):_(this,function(e){var t;if(o&&void 0===e)return void 0!==(t=J.get(o,n))?t:void 0!==(t=ee(o,n))?t:void 0;this.each(function(){J.set(this,n,e)})},null,e,1<arguments.length,null,!0)},removeData:function(e){return this.each(function(){J.remove(this,e)})}}),k.extend({queue:function(e,t,n){var r;if(e)return t=(t||"fx")+"queue",r=Q.get(e,t),n&&(!r||Array.isArray(n)?r=Q.access(e,t,k.makeArray(n)):r.push(n)),r||[]},dequeue:function(e,t){t=t||"fx";var n=k.queue(e,t),r=n.length,i=n.shift(),o=k._queueHooks(e,t);"inprogress"===i&&(i=n.shift(),r--),i&&("fx"===t&&n.unshift("inprogress"),delete o.stop,i.call(e,function(){k.dequeue(e,t)},o)),!r&&o&&o.empty.fire()},_queueHooks:function(e,t){var n=t+"queueHooks";return Q.get(e,n)||Q.access(e,n,{empty:k.Callbacks("once memory").add(function(){Q.remove(e,[t+"queue",n])})})}}),k.fn.extend({queue:function(t,n){var e=2;return"string"!=typeof t&&(n=t,t="fx",e--),arguments.length<e?k.queue(this[0],t):void 0===n?this:this.each(function(){var e=k.queue(this,t,n);k._queueHooks(this,t),"fx"===t&&"inprogress"!==e[0]&&k.dequeue(this,t)})},dequeue:function(e){return this.each(function(){k.dequeue(this,e)})},clearQueue:function(e){return this.queue(e||"fx",[])},promise:function(e,t){var n,r=1,i=k.Deferred(),o=this,a=this.length,s=function(){--r||i.resolveWith(o,[o])};"string"!=typeof e&&(t=e,e=void 0),e=e||"fx";while(a--)(n=Q.get(o[a],e+"queueHooks"))&&n.empty&&(r++,n.empty.add(s));return s(),i.promise(t)}});var te=/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,ne=new RegExp("^(?:([+-])=|)("+te+")([a-z%]*)$","i"),re=["Top","Right","Bottom","Left"],ie=E.documentElement,oe=function(e){return k.contains(e.ownerDocument,e)},ae={composed:!0};ie.getRootNode&&(oe=function(e){return k.contains(e.ownerDocument,e)||e.getRootNode(ae)===e.ownerDocument});var se=function(e,t){return"none"===(e=t||e).style.display||""===e.style.display&&oe(e)&&"none"===k.css(e,"display")},ue=function(e,t,n,r){var i,o,a={};for(o in t)a[o]=e.style[o],e.style[o]=t[o];for(o in i=n.apply(e,r||[]),t)e.style[o]=a[o];return i};function le(e,t,n,r){var i,o,a=20,s=r?function(){return r.cur()}:function(){return k.css(e,t,"")},u=s(),l=n&&n[3]||(k.cssNumber[t]?"":"px"),c=e.nodeType&&(k.cssNumber[t]||"px"!==l&&+u)&&ne.exec(k.css(e,t));if(c&&c[3]!==l){u/=2,l=l||c[3],c=+u||1;while(a--)k.style(e,t,c+l),(1-o)*(1-(o=s()/u||.5))<=0&&(a=0),c/=o;c*=2,k.style(e,t,c+l),n=n||[]}return n&&(c=+c||+u||0,i=n[1]?c+(n[1]+1)*n[2]:+n[2],r&&(r.unit=l,r.start=c,r.end=i)),i}var ce={};function fe(e,t){for(var n,r,i,o,a,s,u,l=[],c=0,f=e.length;c<f;c++)(r=e[c]).style&&(n=r.style.display,t?("none"===n&&(l[c]=Q.get(r,"display")||null,l[c]||(r.style.display="")),""===r.style.display&&se(r)&&(l[c]=(u=a=o=void 0,a=(i=r).ownerDocument,s=i.nodeName,(u=ce[s])||(o=a.body.appendChild(a.createElement(s)),u=k.css(o,"display"),o.parentNode.removeChild(o),"none"===u&&(u="block"),ce[s]=u)))):"none"!==n&&(l[c]="none",Q.set(r,"display",n)));for(c=0;c<f;c++)null!=l[c]&&(e[c].style.display=l[c]);return e}k.fn.extend({show:function(){return fe(this,!0)},hide:function(){return fe(this)},toggle:function(e){return"boolean"==typeof e?e?this.show():this.hide():this.each(function(){se(this)?k(this).show():k(this).hide()})}});var pe=/^(?:checkbox|radio)$/i,de=/<([a-z][^\/\0>\x20\t\r\n\f]*)/i,he=/^$|^module$|\/(?:java|ecma)script/i,ge={option:[1,"<select multiple='multiple'>","</select>"],thead:[1,"<table>","</table>"],col:[2,"<table><colgroup>","</colgroup></table>"],tr:[2,"<table><tbody>","</tbody></table>"],td:[3,"<table><tbody><tr>","</tr></tbody></table>"],_default:[0,"",""]};function ve(e,t){var n;return n="undefined"!=typeof e.getElementsByTagName?e.getElementsByTagName(t||"*"):"undefined"!=typeof e.querySelectorAll?e.querySelectorAll(t||"*"):[],void 0===t||t&&A(e,t)?k.merge([e],n):n}function ye(e,t){for(var n=0,r=e.length;n<r;n++)Q.set(e[n],"globalEval",!t||Q.get(t[n],"globalEval"))}ge.optgroup=ge.option,ge.tbody=ge.tfoot=ge.colgroup=ge.caption=ge.thead,ge.th=ge.td;var me,xe,be=/<|&#?\w+;/;function we(e,t,n,r,i){for(var o,a,s,u,l,c,f=t.createDocumentFragment(),p=[],d=0,h=e.length;d<h;d++)if((o=e[d])||0===o)if("object"===w(o))k.merge(p,o.nodeType?[o]:o);else if(be.test(o)){a=a||f.appendChild(t.createElement("div")),s=(de.exec(o)||["",""])[1].toLowerCase(),u=ge[s]||ge._default,a.innerHTML=u[1]+k.htmlPrefilter(o)+u[2],c=u[0];while(c--)a=a.lastChild;k.merge(p,a.childNodes),(a=f.firstChild).textContent=""}else p.push(t.createTextNode(o));f.textContent="",d=0;while(o=p[d++])if(r&&-1<k.inArray(o,r))i&&i.push(o);else if(l=oe(o),a=ve(f.appendChild(o),"script"),l&&ye(a),n){c=0;while(o=a[c++])he.test(o.type||"")&&n.push(o)}return f}me=E.createDocumentFragment().appendChild(E.createElement("div")),(xe=E.createElement("input")).setAttribute("type","radio"),xe.setAttribute("checked","checked"),xe.setAttribute("name","t"),me.appendChild(xe),y.checkClone=me.cloneNode(!0).cloneNode(!0).lastChild.checked,me.innerHTML="<textarea>x</textarea>",y.noCloneChecked=!!me.cloneNode(!0).lastChild.defaultValue;var Te=/^key/,Ce=/^(?:mouse|pointer|contextmenu|drag|drop)|click/,Ee=/^([^.]*)(?:\.(.+)|)/;function ke(){return!0}function Se(){return!1}function Ne(e,t){return e===function(){try{return E.activeElement}catch(e){}}()==("focus"===t)}function Ae(e,t,n,r,i,o){var a,s;if("object"==typeof t){for(s in"string"!=typeof n&&(r=r||n,n=void 0),t)Ae(e,s,n,r,t[s],o);return e}if(null==r&&null==i?(i=n,r=n=void 0):null==i&&("string"==typeof n?(i=r,r=void 0):(i=r,r=n,n=void 0)),!1===i)i=Se;else if(!i)return e;return 1===o&&(a=i,(i=function(e){return k().off(e),a.apply(this,arguments)}).guid=a.guid||(a.guid=k.guid++)),e.each(function(){k.event.add(this,t,i,r,n)})}function De(e,i,o){o?(Q.set(e,i,!1),k.event.add(e,i,{namespace:!1,handler:function(e){var t,n,r=Q.get(this,i);if(1&e.isTrigger&&this[i]){if(r.length)(k.event.special[i]||{}).delegateType&&e.stopPropagation();else if(r=s.call(arguments),Q.set(this,i,r),t=o(this,i),this[i](),r!==(n=Q.get(this,i))||t?Q.set(this,i,!1):n={},r!==n)return e.stopImmediatePropagation(),e.preventDefault(),n.value}else r.length&&(Q.set(this,i,{value:k.event.trigger(k.extend(r[0],k.Event.prototype),r.slice(1),this)}),e.stopImmediatePropagation())}})):void 0===Q.get(e,i)&&k.event.add(e,i,ke)}k.event={global:{},add:function(t,e,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=Q.get(t);if(v){n.handler&&(n=(o=n).handler,i=o.selector),i&&k.find.matchesSelector(ie,i),n.guid||(n.guid=k.guid++),(u=v.events)||(u=v.events={}),(a=v.handle)||(a=v.handle=function(e){return"undefined"!=typeof k&&k.event.triggered!==e.type?k.event.dispatch.apply(t,arguments):void 0}),l=(e=(e||"").match(R)||[""]).length;while(l--)d=g=(s=Ee.exec(e[l])||[])[1],h=(s[2]||"").split(".").sort(),d&&(f=k.event.special[d]||{},d=(i?f.delegateType:f.bindType)||d,f=k.event.special[d]||{},c=k.extend({type:d,origType:g,data:r,handler:n,guid:n.guid,selector:i,needsContext:i&&k.expr.match.needsContext.test(i),namespace:h.join(".")},o),(p=u[d])||((p=u[d]=[]).delegateCount=0,f.setup&&!1!==f.setup.call(t,r,h,a)||t.addEventListener&&t.addEventListener(d,a)),f.add&&(f.add.call(t,c),c.handler.guid||(c.handler.guid=n.guid)),i?p.splice(p.delegateCount++,0,c):p.push(c),k.event.global[d]=!0)}},remove:function(e,t,n,r,i){var o,a,s,u,l,c,f,p,d,h,g,v=Q.hasData(e)&&Q.get(e);if(v&&(u=v.events)){l=(t=(t||"").match(R)||[""]).length;while(l--)if(d=g=(s=Ee.exec(t[l])||[])[1],h=(s[2]||"").split(".").sort(),d){f=k.event.special[d]||{},p=u[d=(r?f.delegateType:f.bindType)||d]||[],s=s[2]&&new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"),a=o=p.length;while(o--)c=p[o],!i&&g!==c.origType||n&&n.guid!==c.guid||s&&!s.test(c.namespace)||r&&r!==c.selector&&("**"!==r||!c.selector)||(p.splice(o,1),c.selector&&p.delegateCount--,f.remove&&f.remove.call(e,c));a&&!p.length&&(f.teardown&&!1!==f.teardown.call(e,h,v.handle)||k.removeEvent(e,d,v.handle),delete u[d])}else for(d in u)k.event.remove(e,d+t[l],n,r,!0);k.isEmptyObject(u)&&Q.remove(e,"handle events")}},dispatch:function(e){var t,n,r,i,o,a,s=k.event.fix(e),u=new Array(arguments.length),l=(Q.get(this,"events")||{})[s.type]||[],c=k.event.special[s.type]||{};for(u[0]=s,t=1;t<arguments.length;t++)u[t]=arguments[t];if(s.delegateTarget=this,!c.preDispatch||!1!==c.preDispatch.call(this,s)){a=k.event.handlers.call(this,s,l),t=0;while((i=a[t++])&&!s.isPropagationStopped()){s.currentTarget=i.elem,n=0;while((o=i.handlers[n++])&&!s.isImmediatePropagationStopped())s.rnamespace&&!1!==o.namespace&&!s.rnamespace.test(o.namespace)||(s.handleObj=o,s.data=o.data,void 0!==(r=((k.event.special[o.origType]||{}).handle||o.handler).apply(i.elem,u))&&!1===(s.result=r)&&(s.preventDefault(),s.stopPropagation()))}return c.postDispatch&&c.postDispatch.call(this,s),s.result}},handlers:function(e,t){var n,r,i,o,a,s=[],u=t.delegateCount,l=e.target;if(u&&l.nodeType&&!("click"===e.type&&1<=e.button))for(;l!==this;l=l.parentNode||this)if(1===l.nodeType&&("click"!==e.type||!0!==l.disabled)){for(o=[],a={},n=0;n<u;n++)void 0===a[i=(r=t[n]).selector+" "]&&(a[i]=r.needsContext?-1<k(i,this).index(l):k.find(i,this,null,[l]).length),a[i]&&o.push(r);o.length&&s.push({elem:l,handlers:o})}return l=this,u<t.length&&s.push({elem:l,handlers:t.slice(u)}),s},addProp:function(t,e){Object.defineProperty(k.Event.prototype,t,{enumerable:!0,configurable:!0,get:m(e)?function(){if(this.originalEvent)return e(this.originalEvent)}:function(){if(this.originalEvent)return this.originalEvent[t]},set:function(e){Object.defineProperty(this,t,{enumerable:!0,configurable:!0,writable:!0,value:e})}})},fix:function(e){return e[k.expando]?e:new k.Event(e)},special:{load:{noBubble:!0},click:{setup:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&De(t,"click",ke),!1},trigger:function(e){var t=this||e;return pe.test(t.type)&&t.click&&A(t,"input")&&De(t,"click"),!0},_default:function(e){var t=e.target;return pe.test(t.type)&&t.click&&A(t,"input")&&Q.get(t,"click")||A(t,"a")}},beforeunload:{postDispatch:function(e){void 0!==e.result&&e.originalEvent&&(e.originalEvent.returnValue=e.result)}}}},k.removeEvent=function(e,t,n){e.removeEventListener&&e.removeEventListener(t,n)},k.Event=function(e,t){if(!(this instanceof k.Event))return new k.Event(e,t);e&&e.type?(this.originalEvent=e,this.type=e.type,this.isDefaultPrevented=e.defaultPrevented||void 0===e.defaultPrevented&&!1===e.returnValue?ke:Se,this.target=e.target&&3===e.target.nodeType?e.target.parentNode:e.target,this.currentTarget=e.currentTarget,this.relatedTarget=e.relatedTarget):this.type=e,t&&k.extend(this,t),this.timeStamp=e&&e.timeStamp||Date.now(),this[k.expando]=!0},k.Event.prototype={constructor:k.Event,isDefaultPrevented:Se,isPropagationStopped:Se,isImmediatePropagationStopped:Se,isSimulated:!1,preventDefault:function(){var e=this.originalEvent;this.isDefaultPrevented=ke,e&&!this.isSimulated&&e.preventDefault()},stopPropagation:function(){var e=this.originalEvent;this.isPropagationStopped=ke,e&&!this.isSimulated&&e.stopPropagation()},stopImmediatePropagation:function(){var e=this.originalEvent;this.isImmediatePropagationStopped=ke,e&&!this.isSimulated&&e.stopImmediatePropagation(),this.stopPropagation()}},k.each({altKey:!0,bubbles:!0,cancelable:!0,changedTouches:!0,ctrlKey:!0,detail:!0,eventPhase:!0,metaKey:!0,pageX:!0,pageY:!0,shiftKey:!0,view:!0,"char":!0,code:!0,charCode:!0,key:!0,keyCode:!0,button:!0,buttons:!0,clientX:!0,clientY:!0,offsetX:!0,offsetY:!0,pointerId:!0,pointerType:!0,screenX:!0,screenY:!0,targetTouches:!0,toElement:!0,touches:!0,which:function(e){var t=e.button;return null==e.which&&Te.test(e.type)?null!=e.charCode?e.charCode:e.keyCode:!e.which&&void 0!==t&&Ce.test(e.type)?1&t?1:2&t?3:4&t?2:0:e.which}},k.event.addProp),k.each({focus:"focusin",blur:"focusout"},function(e,t){k.event.special[e]={setup:function(){return De(this,e,Ne),!1},trigger:function(){return De(this,e),!0},delegateType:t}}),k.each({mouseenter:"mouseover",mouseleave:"mouseout",pointerenter:"pointerover",pointerleave:"pointerout"},function(e,i){k.event.special[e]={delegateType:i,bindType:i,handle:function(e){var t,n=e.relatedTarget,r=e.handleObj;return n&&(n===this||k.contains(this,n))||(e.type=r.origType,t=r.handler.apply(this,arguments),e.type=i),t}}}),k.fn.extend({on:function(e,t,n,r){return Ae(this,e,t,n,r)},one:function(e,t,n,r){return Ae(this,e,t,n,r,1)},off:function(e,t,n){var r,i;if(e&&e.preventDefault&&e.handleObj)return r=e.handleObj,k(e.delegateTarget).off(r.namespace?r.origType+"."+r.namespace:r.origType,r.selector,r.handler),this;if("object"==typeof e){for(i in e)this.off(i,t,e[i]);return this}return!1!==t&&"function"!=typeof t||(n=t,t=void 0),!1===n&&(n=Se),this.each(function(){k.event.remove(this,e,n,t)})}});var je=/<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,qe=/<script|<style|<link/i,Le=/checked\s*(?:[^=]|=\s*.checked.)/i,He=/^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;function Oe(e,t){return A(e,"table")&&A(11!==t.nodeType?t:t.firstChild,"tr")&&k(e).children("tbody")[0]||e}function Pe(e){return e.type=(null!==e.getAttribute("type"))+"/"+e.type,e}function Re(e){return"true/"===(e.type||"").slice(0,5)?e.type=e.type.slice(5):e.removeAttribute("type"),e}function Me(e,t){var n,r,i,o,a,s,u,l;if(1===t.nodeType){if(Q.hasData(e)&&(o=Q.access(e),a=Q.set(t,o),l=o.events))for(i in delete a.handle,a.events={},l)for(n=0,r=l[i].length;n<r;n++)k.event.add(t,i,l[i][n]);J.hasData(e)&&(s=J.access(e),u=k.extend({},s),J.set(t,u))}}function Ie(n,r,i,o){r=g.apply([],r);var e,t,a,s,u,l,c=0,f=n.length,p=f-1,d=r[0],h=m(d);if(h||1<f&&"string"==typeof d&&!y.checkClone&&Le.test(d))return n.each(function(e){var t=n.eq(e);h&&(r[0]=d.call(this,e,t.html())),Ie(t,r,i,o)});if(f&&(t=(e=we(r,n[0].ownerDocument,!1,n,o)).firstChild,1===e.childNodes.length&&(e=t),t||o)){for(s=(a=k.map(ve(e,"script"),Pe)).length;c<f;c++)u=e,c!==p&&(u=k.clone(u,!0,!0),s&&k.merge(a,ve(u,"script"))),i.call(n[c],u,c);if(s)for(l=a[a.length-1].ownerDocument,k.map(a,Re),c=0;c<s;c++)u=a[c],he.test(u.type||"")&&!Q.access(u,"globalEval")&&k.contains(l,u)&&(u.src&&"module"!==(u.type||"").toLowerCase()?k._evalUrl&&!u.noModule&&k._evalUrl(u.src,{nonce:u.nonce||u.getAttribute("nonce")}):b(u.textContent.replace(He,""),u,l))}return n}function We(e,t,n){for(var r,i=t?k.filter(t,e):e,o=0;null!=(r=i[o]);o++)n||1!==r.nodeType||k.cleanData(ve(r)),r.parentNode&&(n&&oe(r)&&ye(ve(r,"script")),r.parentNode.removeChild(r));return e}k.extend({htmlPrefilter:function(e){return e.replace(je,"<$1></$2>")},clone:function(e,t,n){var r,i,o,a,s,u,l,c=e.cloneNode(!0),f=oe(e);if(!(y.noCloneChecked||1!==e.nodeType&&11!==e.nodeType||k.isXMLDoc(e)))for(a=ve(c),r=0,i=(o=ve(e)).length;r<i;r++)s=o[r],u=a[r],void 0,"input"===(l=u.nodeName.toLowerCase())&&pe.test(s.type)?u.checked=s.checked:"input"!==l&&"textarea"!==l||(u.defaultValue=s.defaultValue);if(t)if(n)for(o=o||ve(e),a=a||ve(c),r=0,i=o.length;r<i;r++)Me(o[r],a[r]);else Me(e,c);return 0<(a=ve(c,"script")).length&&ye(a,!f&&ve(e,"script")),c},cleanData:function(e){for(var t,n,r,i=k.event.special,o=0;void 0!==(n=e[o]);o++)if(G(n)){if(t=n[Q.expando]){if(t.events)for(r in t.events)i[r]?k.event.remove(n,r):k.removeEvent(n,r,t.handle);n[Q.expando]=void 0}n[J.expando]&&(n[J.expando]=void 0)}}}),k.fn.extend({detach:function(e){return We(this,e,!0)},remove:function(e){return We(this,e)},text:function(e){return _(this,function(e){return void 0===e?k.text(this):this.empty().each(function(){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||(this.textContent=e)})},null,e,arguments.length)},append:function(){return Ie(this,arguments,function(e){1!==this.nodeType&&11!==this.nodeType&&9!==this.nodeType||Oe(this,e).appendChild(e)})},prepend:function(){return Ie(this,arguments,function(e){if(1===this.nodeType||11===this.nodeType||9===this.nodeType){var t=Oe(this,e);t.insertBefore(e,t.firstChild)}})},before:function(){return Ie(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this)})},after:function(){return Ie(this,arguments,function(e){this.parentNode&&this.parentNode.insertBefore(e,this.nextSibling)})},empty:function(){for(var e,t=0;null!=(e=this[t]);t++)1===e.nodeType&&(k.cleanData(ve(e,!1)),e.textContent="");return this},clone:function(e,t){return e=null!=e&&e,t=null==t?e:t,this.map(function(){return k.clone(this,e,t)})},html:function(e){return _(this,function(e){var t=this[0]||{},n=0,r=this.length;if(void 0===e&&1===t.nodeType)return t.innerHTML;if("string"==typeof e&&!qe.test(e)&&!ge[(de.exec(e)||["",""])[1].toLowerCase()]){e=k.htmlPrefilter(e);try{for(;n<r;n++)1===(t=this[n]||{}).nodeType&&(k.cleanData(ve(t,!1)),t.innerHTML=e);t=0}catch(e){}}t&&this.empty().append(e)},null,e,arguments.length)},replaceWith:function(){var n=[];return Ie(this,arguments,function(e){var t=this.parentNode;k.inArray(this,n)<0&&(k.cleanData(ve(this)),t&&t.replaceChild(e,this))},n)}}),k.each({appendTo:"append",prependTo:"prepend",insertBefore:"before",insertAfter:"after",replaceAll:"replaceWith"},function(e,a){k.fn[e]=function(e){for(var t,n=[],r=k(e),i=r.length-1,o=0;o<=i;o++)t=o===i?this:this.clone(!0),k(r[o])[a](t),u.apply(n,t.get());return this.pushStack(n)}});var $e=new RegExp("^("+te+")(?!px)[a-z%]+$","i"),Fe=function(e){var t=e.ownerDocument.defaultView;return t&&t.opener||(t=C),t.getComputedStyle(e)},Be=new RegExp(re.join("|"),"i");function _e(e,t,n){var r,i,o,a,s=e.style;return(n=n||Fe(e))&&(""!==(a=n.getPropertyValue(t)||n[t])||oe(e)||(a=k.style(e,t)),!y.pixelBoxStyles()&&$e.test(a)&&Be.test(t)&&(r=s.width,i=s.minWidth,o=s.maxWidth,s.minWidth=s.maxWidth=s.width=a,a=n.width,s.width=r,s.minWidth=i,s.maxWidth=o)),void 0!==a?a+"":a}function ze(e,t){return{get:function(){if(!e())return(this.get=t).apply(this,arguments);delete this.get}}}!function(){function e(){if(u){s.style.cssText="position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0",u.style.cssText="position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%",ie.appendChild(s).appendChild(u);var e=C.getComputedStyle(u);n="1%"!==e.top,a=12===t(e.marginLeft),u.style.right="60%",o=36===t(e.right),r=36===t(e.width),u.style.position="absolute",i=12===t(u.offsetWidth/3),ie.removeChild(s),u=null}}function t(e){return Math.round(parseFloat(e))}var n,r,i,o,a,s=E.createElement("div"),u=E.createElement("div");u.style&&(u.style.backgroundClip="content-box",u.cloneNode(!0).style.backgroundClip="",y.clearCloneStyle="content-box"===u.style.backgroundClip,k.extend(y,{boxSizingReliable:function(){return e(),r},pixelBoxStyles:function(){return e(),o},pixelPosition:function(){return e(),n},reliableMarginLeft:function(){return e(),a},scrollboxSize:function(){return e(),i}}))}();var Ue=["Webkit","Moz","ms"],Xe=E.createElement("div").style,Ve={};function Ge(e){var t=k.cssProps[e]||Ve[e];return t||(e in Xe?e:Ve[e]=function(e){var t=e[0].toUpperCase()+e.slice(1),n=Ue.length;while(n--)if((e=Ue[n]+t)in Xe)return e}(e)||e)}var Ye=/^(none|table(?!-c[ea]).+)/,Qe=/^--/,Je={position:"absolute",visibility:"hidden",display:"block"},Ke={letterSpacing:"0",fontWeight:"400"};function Ze(e,t,n){var r=ne.exec(t);return r?Math.max(0,r[2]-(n||0))+(r[3]||"px"):t}function et(e,t,n,r,i,o){var a="width"===t?1:0,s=0,u=0;if(n===(r?"border":"content"))return 0;for(;a<4;a+=2)"margin"===n&&(u+=k.css(e,n+re[a],!0,i)),r?("content"===n&&(u-=k.css(e,"padding"+re[a],!0,i)),"margin"!==n&&(u-=k.css(e,"border"+re[a]+"Width",!0,i))):(u+=k.css(e,"padding"+re[a],!0,i),"padding"!==n?u+=k.css(e,"border"+re[a]+"Width",!0,i):s+=k.css(e,"border"+re[a]+"Width",!0,i));return!r&&0<=o&&(u+=Math.max(0,Math.ceil(e["offset"+t[0].toUpperCase()+t.slice(1)]-o-u-s-.5))||0),u}function tt(e,t,n){var r=Fe(e),i=(!y.boxSizingReliable()||n)&&"border-box"===k.css(e,"boxSizing",!1,r),o=i,a=_e(e,t,r),s="offset"+t[0].toUpperCase()+t.slice(1);if($e.test(a)){if(!n)return a;a="auto"}return(!y.boxSizingReliable()&&i||"auto"===a||!parseFloat(a)&&"inline"===k.css(e,"display",!1,r))&&e.getClientRects().length&&(i="border-box"===k.css(e,"boxSizing",!1,r),(o=s in e)&&(a=e[s])),(a=parseFloat(a)||0)+et(e,t,n||(i?"border":"content"),o,r,a)+"px"}function nt(e,t,n,r,i){return new nt.prototype.init(e,t,n,r,i)}k.extend({cssHooks:{opacity:{get:function(e,t){if(t){var n=_e(e,"opacity");return""===n?"1":n}}}},cssNumber:{animationIterationCount:!0,columnCount:!0,fillOpacity:!0,flexGrow:!0,flexShrink:!0,fontWeight:!0,gridArea:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnStart:!0,gridRow:!0,gridRowEnd:!0,gridRowStart:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,widows:!0,zIndex:!0,zoom:!0},cssProps:{},style:function(e,t,n,r){if(e&&3!==e.nodeType&&8!==e.nodeType&&e.style){var i,o,a,s=V(t),u=Qe.test(t),l=e.style;if(u||(t=Ge(s)),a=k.cssHooks[t]||k.cssHooks[s],void 0===n)return a&&"get"in a&&void 0!==(i=a.get(e,!1,r))?i:l[t];"string"===(o=typeof n)&&(i=ne.exec(n))&&i[1]&&(n=le(e,t,i),o="number"),null!=n&&n==n&&("number"!==o||u||(n+=i&&i[3]||(k.cssNumber[s]?"":"px")),y.clearCloneStyle||""!==n||0!==t.indexOf("background")||(l[t]="inherit"),a&&"set"in a&&void 0===(n=a.set(e,n,r))||(u?l.setProperty(t,n):l[t]=n))}},css:function(e,t,n,r){var i,o,a,s=V(t);return Qe.test(t)||(t=Ge(s)),(a=k.cssHooks[t]||k.cssHooks[s])&&"get"in a&&(i=a.get(e,!0,n)),void 0===i&&(i=_e(e,t,r)),"normal"===i&&t in Ke&&(i=Ke[t]),""===n||n?(o=parseFloat(i),!0===n||isFinite(o)?o||0:i):i}}),k.each(["height","width"],function(e,u){k.cssHooks[u]={get:function(e,t,n){if(t)return!Ye.test(k.css(e,"display"))||e.getClientRects().length&&e.getBoundingClientRect().width?tt(e,u,n):ue(e,Je,function(){return tt(e,u,n)})},set:function(e,t,n){var r,i=Fe(e),o=!y.scrollboxSize()&&"absolute"===i.position,a=(o||n)&&"border-box"===k.css(e,"boxSizing",!1,i),s=n?et(e,u,n,a,i):0;return a&&o&&(s-=Math.ceil(e["offset"+u[0].toUpperCase()+u.slice(1)]-parseFloat(i[u])-et(e,u,"border",!1,i)-.5)),s&&(r=ne.exec(t))&&"px"!==(r[3]||"px")&&(e.style[u]=t,t=k.css(e,u)),Ze(0,t,s)}}}),k.cssHooks.marginLeft=ze(y.reliableMarginLeft,function(e,t){if(t)return(parseFloat(_e(e,"marginLeft"))||e.getBoundingClientRect().left-ue(e,{marginLeft:0},function(){return e.getBoundingClientRect().left}))+"px"}),k.each({margin:"",padding:"",border:"Width"},function(i,o){k.cssHooks[i+o]={expand:function(e){for(var t=0,n={},r="string"==typeof e?e.split(" "):[e];t<4;t++)n[i+re[t]+o]=r[t]||r[t-2]||r[0];return n}},"margin"!==i&&(k.cssHooks[i+o].set=Ze)}),k.fn.extend({css:function(e,t){return _(this,function(e,t,n){var r,i,o={},a=0;if(Array.isArray(t)){for(r=Fe(e),i=t.length;a<i;a++)o[t[a]]=k.css(e,t[a],!1,r);return o}return void 0!==n?k.style(e,t,n):k.css(e,t)},e,t,1<arguments.length)}}),((k.Tween=nt).prototype={constructor:nt,init:function(e,t,n,r,i,o){this.elem=e,this.prop=n,this.easing=i||k.easing._default,this.options=t,this.start=this.now=this.cur(),this.end=r,this.unit=o||(k.cssNumber[n]?"":"px")},cur:function(){var e=nt.propHooks[this.prop];return e&&e.get?e.get(this):nt.propHooks._default.get(this)},run:function(e){var t,n=nt.propHooks[this.prop];return this.options.duration?this.pos=t=k.easing[this.easing](e,this.options.duration*e,0,1,this.options.duration):this.pos=t=e,this.now=(this.end-this.start)*t+this.start,this.options.step&&this.options.step.call(this.elem,this.now,this),n&&n.set?n.set(this):nt.propHooks._default.set(this),this}}).init.prototype=nt.prototype,(nt.propHooks={_default:{get:function(e){var t;return 1!==e.elem.nodeType||null!=e.elem[e.prop]&&null==e.elem.style[e.prop]?e.elem[e.prop]:(t=k.css(e.elem,e.prop,""))&&"auto"!==t?t:0},set:function(e){k.fx.step[e.prop]?k.fx.step[e.prop](e):1!==e.elem.nodeType||!k.cssHooks[e.prop]&&null==e.elem.style[Ge(e.prop)]?e.elem[e.prop]=e.now:k.style(e.elem,e.prop,e.now+e.unit)}}}).scrollTop=nt.propHooks.scrollLeft={set:function(e){e.elem.nodeType&&e.elem.parentNode&&(e.elem[e.prop]=e.now)}},k.easing={linear:function(e){return e},swing:function(e){return.5-Math.cos(e*Math.PI)/2},_default:"swing"},k.fx=nt.prototype.init,k.fx.step={};var rt,it,ot,at,st=/^(?:toggle|show|hide)$/,ut=/queueHooks$/;function lt(){it&&(!1===E.hidden&&C.requestAnimationFrame?C.requestAnimationFrame(lt):C.setTimeout(lt,k.fx.interval),k.fx.tick())}function ct(){return C.setTimeout(function(){rt=void 0}),rt=Date.now()}function ft(e,t){var n,r=0,i={height:e};for(t=t?1:0;r<4;r+=2-t)i["margin"+(n=re[r])]=i["padding"+n]=e;return t&&(i.opacity=i.width=e),i}function pt(e,t,n){for(var r,i=(dt.tweeners[t]||[]).concat(dt.tweeners["*"]),o=0,a=i.length;o<a;o++)if(r=i[o].call(n,t,e))return r}function dt(o,e,t){var n,a,r=0,i=dt.prefilters.length,s=k.Deferred().always(function(){delete u.elem}),u=function(){if(a)return!1;for(var e=rt||ct(),t=Math.max(0,l.startTime+l.duration-e),n=1-(t/l.duration||0),r=0,i=l.tweens.length;r<i;r++)l.tweens[r].run(n);return s.notifyWith(o,[l,n,t]),n<1&&i?t:(i||s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l]),!1)},l=s.promise({elem:o,props:k.extend({},e),opts:k.extend(!0,{specialEasing:{},easing:k.easing._default},t),originalProperties:e,originalOptions:t,startTime:rt||ct(),duration:t.duration,tweens:[],createTween:function(e,t){var n=k.Tween(o,l.opts,e,t,l.opts.specialEasing[e]||l.opts.easing);return l.tweens.push(n),n},stop:function(e){var t=0,n=e?l.tweens.length:0;if(a)return this;for(a=!0;t<n;t++)l.tweens[t].run(1);return e?(s.notifyWith(o,[l,1,0]),s.resolveWith(o,[l,e])):s.rejectWith(o,[l,e]),this}}),c=l.props;for(!function(e,t){var n,r,i,o,a;for(n in e)if(i=t[r=V(n)],o=e[n],Array.isArray(o)&&(i=o[1],o=e[n]=o[0]),n!==r&&(e[r]=o,delete e[n]),(a=k.cssHooks[r])&&"expand"in a)for(n in o=a.expand(o),delete e[r],o)n in e||(e[n]=o[n],t[n]=i);else t[r]=i}(c,l.opts.specialEasing);r<i;r++)if(n=dt.prefilters[r].call(l,o,c,l.opts))return m(n.stop)&&(k._queueHooks(l.elem,l.opts.queue).stop=n.stop.bind(n)),n;return k.map(c,pt,l),m(l.opts.start)&&l.opts.start.call(o,l),l.progress(l.opts.progress).done(l.opts.done,l.opts.complete).fail(l.opts.fail).always(l.opts.always),k.fx.timer(k.extend(u,{elem:o,anim:l,queue:l.opts.queue})),l}k.Animation=k.extend(dt,{tweeners:{"*":[function(e,t){var n=this.createTween(e,t);return le(n.elem,e,ne.exec(t),n),n}]},tweener:function(e,t){m(e)?(t=e,e=["*"]):e=e.match(R);for(var n,r=0,i=e.length;r<i;r++)n=e[r],dt.tweeners[n]=dt.tweeners[n]||[],dt.tweeners[n].unshift(t)},prefilters:[function(e,t,n){var r,i,o,a,s,u,l,c,f="width"in t||"height"in t,p=this,d={},h=e.style,g=e.nodeType&&se(e),v=Q.get(e,"fxshow");for(r in n.queue||(null==(a=k._queueHooks(e,"fx")).unqueued&&(a.unqueued=0,s=a.empty.fire,a.empty.fire=function(){a.unqueued||s()}),a.unqueued++,p.always(function(){p.always(function(){a.unqueued--,k.queue(e,"fx").length||a.empty.fire()})})),t)if(i=t[r],st.test(i)){if(delete t[r],o=o||"toggle"===i,i===(g?"hide":"show")){if("show"!==i||!v||void 0===v[r])continue;g=!0}d[r]=v&&v[r]||k.style(e,r)}if((u=!k.isEmptyObject(t))||!k.isEmptyObject(d))for(r in f&&1===e.nodeType&&(n.overflow=[h.overflow,h.overflowX,h.overflowY],null==(l=v&&v.display)&&(l=Q.get(e,"display")),"none"===(c=k.css(e,"display"))&&(l?c=l:(fe([e],!0),l=e.style.display||l,c=k.css(e,"display"),fe([e]))),("inline"===c||"inline-block"===c&&null!=l)&&"none"===k.css(e,"float")&&(u||(p.done(function(){h.display=l}),null==l&&(c=h.display,l="none"===c?"":c)),h.display="inline-block")),n.overflow&&(h.overflow="hidden",p.always(function(){h.overflow=n.overflow[0],h.overflowX=n.overflow[1],h.overflowY=n.overflow[2]})),u=!1,d)u||(v?"hidden"in v&&(g=v.hidden):v=Q.access(e,"fxshow",{display:l}),o&&(v.hidden=!g),g&&fe([e],!0),p.done(function(){for(r in g||fe([e]),Q.remove(e,"fxshow"),d)k.style(e,r,d[r])})),u=pt(g?v[r]:0,r,p),r in v||(v[r]=u.start,g&&(u.end=u.start,u.start=0))}],prefilter:function(e,t){t?dt.prefilters.unshift(e):dt.prefilters.push(e)}}),k.speed=function(e,t,n){var r=e&&"object"==typeof e?k.extend({},e):{complete:n||!n&&t||m(e)&&e,duration:e,easing:n&&t||t&&!m(t)&&t};return k.fx.off?r.duration=0:"number"!=typeof r.duration&&(r.duration in k.fx.speeds?r.duration=k.fx.speeds[r.duration]:r.duration=k.fx.speeds._default),null!=r.queue&&!0!==r.queue||(r.queue="fx"),r.old=r.complete,r.complete=function(){m(r.old)&&r.old.call(this),r.queue&&k.dequeue(this,r.queue)},r},k.fn.extend({fadeTo:function(e,t,n,r){return this.filter(se).css("opacity",0).show().end().animate({opacity:t},e,n,r)},animate:function(t,e,n,r){var i=k.isEmptyObject(t),o=k.speed(e,n,r),a=function(){var e=dt(this,k.extend({},t),o);(i||Q.get(this,"finish"))&&e.stop(!0)};return a.finish=a,i||!1===o.queue?this.each(a):this.queue(o.queue,a)},stop:function(i,e,o){var a=function(e){var t=e.stop;delete e.stop,t(o)};return"string"!=typeof i&&(o=e,e=i,i=void 0),e&&!1!==i&&this.queue(i||"fx",[]),this.each(function(){var e=!0,t=null!=i&&i+"queueHooks",n=k.timers,r=Q.get(this);if(t)r[t]&&r[t].stop&&a(r[t]);else for(t in r)r[t]&&r[t].stop&&ut.test(t)&&a(r[t]);for(t=n.length;t--;)n[t].elem!==this||null!=i&&n[t].queue!==i||(n[t].anim.stop(o),e=!1,n.splice(t,1));!e&&o||k.dequeue(this,i)})},finish:function(a){return!1!==a&&(a=a||"fx"),this.each(function(){var e,t=Q.get(this),n=t[a+"queue"],r=t[a+"queueHooks"],i=k.timers,o=n?n.length:0;for(t.finish=!0,k.queue(this,a,[]),r&&r.stop&&r.stop.call(this,!0),e=i.length;e--;)i[e].elem===this&&i[e].queue===a&&(i[e].anim.stop(!0),i.splice(e,1));for(e=0;e<o;e++)n[e]&&n[e].finish&&n[e].finish.call(this);delete t.finish})}}),k.each(["toggle","show","hide"],function(e,r){var i=k.fn[r];k.fn[r]=function(e,t,n){return null==e||"boolean"==typeof e?i.apply(this,arguments):this.animate(ft(r,!0),e,t,n)}}),k.each({slideDown:ft("show"),slideUp:ft("hide"),slideToggle:ft("toggle"),fadeIn:{opacity:"show"},fadeOut:{opacity:"hide"},fadeToggle:{opacity:"toggle"}},function(e,r){k.fn[e]=function(e,t,n){return this.animate(r,e,t,n)}}),k.timers=[],k.fx.tick=function(){var e,t=0,n=k.timers;for(rt=Date.now();t<n.length;t++)(e=n[t])()||n[t]!==e||n.splice(t--,1);n.length||k.fx.stop(),rt=void 0},k.fx.timer=function(e){k.timers.push(e),k.fx.start()},k.fx.interval=13,k.fx.start=function(){it||(it=!0,lt())},k.fx.stop=function(){it=null},k.fx.speeds={slow:600,fast:200,_default:400},k.fn.delay=function(r,e){return r=k.fx&&k.fx.speeds[r]||r,e=e||"fx",this.queue(e,function(e,t){var n=C.setTimeout(e,r);t.stop=function(){C.clearTimeout(n)}})},ot=E.createElement("input"),at=E.createElement("select").appendChild(E.createElement("option")),ot.type="checkbox",y.checkOn=""!==ot.value,y.optSelected=at.selected,(ot=E.createElement("input")).value="t",ot.type="radio",y.radioValue="t"===ot.value;var ht,gt=k.expr.attrHandle;k.fn.extend({attr:function(e,t){return _(this,k.attr,e,t,1<arguments.length)},removeAttr:function(e){return this.each(function(){k.removeAttr(this,e)})}}),k.extend({attr:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return"undefined"==typeof e.getAttribute?k.prop(e,t,n):(1===o&&k.isXMLDoc(e)||(i=k.attrHooks[t.toLowerCase()]||(k.expr.match.bool.test(t)?ht:void 0)),void 0!==n?null===n?void k.removeAttr(e,t):i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:(e.setAttribute(t,n+""),n):i&&"get"in i&&null!==(r=i.get(e,t))?r:null==(r=k.find.attr(e,t))?void 0:r)},attrHooks:{type:{set:function(e,t){if(!y.radioValue&&"radio"===t&&A(e,"input")){var n=e.value;return e.setAttribute("type",t),n&&(e.value=n),t}}}},removeAttr:function(e,t){var n,r=0,i=t&&t.match(R);if(i&&1===e.nodeType)while(n=i[r++])e.removeAttribute(n)}}),ht={set:function(e,t,n){return!1===t?k.removeAttr(e,n):e.setAttribute(n,n),n}},k.each(k.expr.match.bool.source.match(/\w+/g),function(e,t){var a=gt[t]||k.find.attr;gt[t]=function(e,t,n){var r,i,o=t.toLowerCase();return n||(i=gt[o],gt[o]=r,r=null!=a(e,t,n)?o:null,gt[o]=i),r}});var vt=/^(?:input|select|textarea|button)$/i,yt=/^(?:a|area)$/i;function mt(e){return(e.match(R)||[]).join(" ")}function xt(e){return e.getAttribute&&e.getAttribute("class")||""}function bt(e){return Array.isArray(e)?e:"string"==typeof e&&e.match(R)||[]}k.fn.extend({prop:function(e,t){return _(this,k.prop,e,t,1<arguments.length)},removeProp:function(e){return this.each(function(){delete this[k.propFix[e]||e]})}}),k.extend({prop:function(e,t,n){var r,i,o=e.nodeType;if(3!==o&&8!==o&&2!==o)return 1===o&&k.isXMLDoc(e)||(t=k.propFix[t]||t,i=k.propHooks[t]),void 0!==n?i&&"set"in i&&void 0!==(r=i.set(e,n,t))?r:e[t]=n:i&&"get"in i&&null!==(r=i.get(e,t))?r:e[t]},propHooks:{tabIndex:{get:function(e){var t=k.find.attr(e,"tabindex");return t?parseInt(t,10):vt.test(e.nodeName)||yt.test(e.nodeName)&&e.href?0:-1}}},propFix:{"for":"htmlFor","class":"className"}}),y.optSelected||(k.propHooks.selected={get:function(e){var t=e.parentNode;return t&&t.parentNode&&t.parentNode.selectedIndex,null},set:function(e){var t=e.parentNode;t&&(t.selectedIndex,t.parentNode&&t.parentNode.selectedIndex)}}),k.each(["tabIndex","readOnly","maxLength","cellSpacing","cellPadding","rowSpan","colSpan","useMap","frameBorder","contentEditable"],function(){k.propFix[this.toLowerCase()]=this}),k.fn.extend({addClass:function(t){var e,n,r,i,o,a,s,u=0;if(m(t))return this.each(function(e){k(this).addClass(t.call(this,e,xt(this)))});if((e=bt(t)).length)while(n=this[u++])if(i=xt(n),r=1===n.nodeType&&" "+mt(i)+" "){a=0;while(o=e[a++])r.indexOf(" "+o+" ")<0&&(r+=o+" ");i!==(s=mt(r))&&n.setAttribute("class",s)}return this},removeClass:function(t){var e,n,r,i,o,a,s,u=0;if(m(t))return this.each(function(e){k(this).removeClass(t.call(this,e,xt(this)))});if(!arguments.length)return this.attr("class","");if((e=bt(t)).length)while(n=this[u++])if(i=xt(n),r=1===n.nodeType&&" "+mt(i)+" "){a=0;while(o=e[a++])while(-1<r.indexOf(" "+o+" "))r=r.replace(" "+o+" "," ");i!==(s=mt(r))&&n.setAttribute("class",s)}return this},toggleClass:function(i,t){var o=typeof i,a="string"===o||Array.isArray(i);return"boolean"==typeof t&&a?t?this.addClass(i):this.removeClass(i):m(i)?this.each(function(e){k(this).toggleClass(i.call(this,e,xt(this),t),t)}):this.each(function(){var e,t,n,r;if(a){t=0,n=k(this),r=bt(i);while(e=r[t++])n.hasClass(e)?n.removeClass(e):n.addClass(e)}else void 0!==i&&"boolean"!==o||((e=xt(this))&&Q.set(this,"__className__",e),this.setAttribute&&this.setAttribute("class",e||!1===i?"":Q.get(this,"__className__")||""))})},hasClass:function(e){var t,n,r=0;t=" "+e+" ";while(n=this[r++])if(1===n.nodeType&&-1<(" "+mt(xt(n))+" ").indexOf(t))return!0;return!1}});var wt=/\r/g;k.fn.extend({val:function(n){var r,e,i,t=this[0];return arguments.length?(i=m(n),this.each(function(e){var t;1===this.nodeType&&(null==(t=i?n.call(this,e,k(this).val()):n)?t="":"number"==typeof t?t+="":Array.isArray(t)&&(t=k.map(t,function(e){return null==e?"":e+""})),(r=k.valHooks[this.type]||k.valHooks[this.nodeName.toLowerCase()])&&"set"in r&&void 0!==r.set(this,t,"value")||(this.value=t))})):t?(r=k.valHooks[t.type]||k.valHooks[t.nodeName.toLowerCase()])&&"get"in r&&void 0!==(e=r.get(t,"value"))?e:"string"==typeof(e=t.value)?e.replace(wt,""):null==e?"":e:void 0}}),k.extend({valHooks:{option:{get:function(e){var t=k.find.attr(e,"value");return null!=t?t:mt(k.text(e))}},select:{get:function(e){var t,n,r,i=e.options,o=e.selectedIndex,a="select-one"===e.type,s=a?null:[],u=a?o+1:i.length;for(r=o<0?u:a?o:0;r<u;r++)if(((n=i[r]).selected||r===o)&&!n.disabled&&(!n.parentNode.disabled||!A(n.parentNode,"optgroup"))){if(t=k(n).val(),a)return t;s.push(t)}return s},set:function(e,t){var n,r,i=e.options,o=k.makeArray(t),a=i.length;while(a--)((r=i[a]).selected=-1<k.inArray(k.valHooks.option.get(r),o))&&(n=!0);return n||(e.selectedIndex=-1),o}}}}),k.each(["radio","checkbox"],function(){k.valHooks[this]={set:function(e,t){if(Array.isArray(t))return e.checked=-1<k.inArray(k(e).val(),t)}},y.checkOn||(k.valHooks[this].get=function(e){return null===e.getAttribute("value")?"on":e.value})}),y.focusin="onfocusin"in C;var Tt=/^(?:focusinfocus|focusoutblur)$/,Ct=function(e){e.stopPropagation()};k.extend(k.event,{trigger:function(e,t,n,r){var i,o,a,s,u,l,c,f,p=[n||E],d=v.call(e,"type")?e.type:e,h=v.call(e,"namespace")?e.namespace.split("."):[];if(o=f=a=n=n||E,3!==n.nodeType&&8!==n.nodeType&&!Tt.test(d+k.event.triggered)&&(-1<d.indexOf(".")&&(d=(h=d.split(".")).shift(),h.sort()),u=d.indexOf(":")<0&&"on"+d,(e=e[k.expando]?e:new k.Event(d,"object"==typeof e&&e)).isTrigger=r?2:3,e.namespace=h.join("."),e.rnamespace=e.namespace?new RegExp("(^|\\.)"+h.join("\\.(?:.*\\.|)")+"(\\.|$)"):null,e.result=void 0,e.target||(e.target=n),t=null==t?[e]:k.makeArray(t,[e]),c=k.event.special[d]||{},r||!c.trigger||!1!==c.trigger.apply(n,t))){if(!r&&!c.noBubble&&!x(n)){for(s=c.delegateType||d,Tt.test(s+d)||(o=o.parentNode);o;o=o.parentNode)p.push(o),a=o;a===(n.ownerDocument||E)&&p.push(a.defaultView||a.parentWindow||C)}i=0;while((o=p[i++])&&!e.isPropagationStopped())f=o,e.type=1<i?s:c.bindType||d,(l=(Q.get(o,"events")||{})[e.type]&&Q.get(o,"handle"))&&l.apply(o,t),(l=u&&o[u])&&l.apply&&G(o)&&(e.result=l.apply(o,t),!1===e.result&&e.preventDefault());return e.type=d,r||e.isDefaultPrevented()||c._default&&!1!==c._default.apply(p.pop(),t)||!G(n)||u&&m(n[d])&&!x(n)&&((a=n[u])&&(n[u]=null),k.event.triggered=d,e.isPropagationStopped()&&f.addEventListener(d,Ct),n[d](),e.isPropagationStopped()&&f.removeEventListener(d,Ct),k.event.triggered=void 0,a&&(n[u]=a)),e.result}},simulate:function(e,t,n){var r=k.extend(new k.Event,n,{type:e,isSimulated:!0});k.event.trigger(r,null,t)}}),k.fn.extend({trigger:function(e,t){return this.each(function(){k.event.trigger(e,t,this)})},triggerHandler:function(e,t){var n=this[0];if(n)return k.event.trigger(e,t,n,!0)}}),y.focusin||k.each({focus:"focusin",blur:"focusout"},function(n,r){var i=function(e){k.event.simulate(r,e.target,k.event.fix(e))};k.event.special[r]={setup:function(){var e=this.ownerDocument||this,t=Q.access(e,r);t||e.addEventListener(n,i,!0),Q.access(e,r,(t||0)+1)},teardown:function(){var e=this.ownerDocument||this,t=Q.access(e,r)-1;t?Q.access(e,r,t):(e.removeEventListener(n,i,!0),Q.remove(e,r))}}});var Et=C.location,kt=Date.now(),St=/\?/;k.parseXML=function(e){var t;if(!e||"string"!=typeof e)return null;try{t=(new C.DOMParser).parseFromString(e,"text/xml")}catch(e){t=void 0}return t&&!t.getElementsByTagName("parsererror").length||k.error("Invalid XML: "+e),t};var Nt=/\[\]$/,At=/\r?\n/g,Dt=/^(?:submit|button|image|reset|file)$/i,jt=/^(?:input|select|textarea|keygen)/i;function qt(n,e,r,i){var t;if(Array.isArray(e))k.each(e,function(e,t){r||Nt.test(n)?i(n,t):qt(n+"["+("object"==typeof t&&null!=t?e:"")+"]",t,r,i)});else if(r||"object"!==w(e))i(n,e);else for(t in e)qt(n+"["+t+"]",e[t],r,i)}k.param=function(e,t){var n,r=[],i=function(e,t){var n=m(t)?t():t;r[r.length]=encodeURIComponent(e)+"="+encodeURIComponent(null==n?"":n)};if(null==e)return"";if(Array.isArray(e)||e.jquery&&!k.isPlainObject(e))k.each(e,function(){i(this.name,this.value)});else for(n in e)qt(n,e[n],t,i);return r.join("&")},k.fn.extend({serialize:function(){return k.param(this.serializeArray())},serializeArray:function(){return this.map(function(){var e=k.prop(this,"elements");return e?k.makeArray(e):this}).filter(function(){var e=this.type;return this.name&&!k(this).is(":disabled")&&jt.test(this.nodeName)&&!Dt.test(e)&&(this.checked||!pe.test(e))}).map(function(e,t){var n=k(this).val();return null==n?null:Array.isArray(n)?k.map(n,function(e){return{name:t.name,value:e.replace(At,"\r\n")}}):{name:t.name,value:n.replace(At,"\r\n")}}).get()}});var Lt=/%20/g,Ht=/#.*$/,Ot=/([?&])_=[^&]*/,Pt=/^(.*?):[ \t]*([^\r\n]*)$/gm,Rt=/^(?:GET|HEAD)$/,Mt=/^\/\//,It={},Wt={},$t="*/".concat("*"),Ft=E.createElement("a");function Bt(o){return function(e,t){"string"!=typeof e&&(t=e,e="*");var n,r=0,i=e.toLowerCase().match(R)||[];if(m(t))while(n=i[r++])"+"===n[0]?(n=n.slice(1)||"*",(o[n]=o[n]||[]).unshift(t)):(o[n]=o[n]||[]).push(t)}}function _t(t,i,o,a){var s={},u=t===Wt;function l(e){var r;return s[e]=!0,k.each(t[e]||[],function(e,t){var n=t(i,o,a);return"string"!=typeof n||u||s[n]?u?!(r=n):void 0:(i.dataTypes.unshift(n),l(n),!1)}),r}return l(i.dataTypes[0])||!s["*"]&&l("*")}function zt(e,t){var n,r,i=k.ajaxSettings.flatOptions||{};for(n in t)void 0!==t[n]&&((i[n]?e:r||(r={}))[n]=t[n]);return r&&k.extend(!0,e,r),e}Ft.href=Et.href,k.extend({active:0,lastModified:{},etag:{},ajaxSettings:{url:Et.href,type:"GET",isLocal:/^(?:about|app|app-storage|.+-extension|file|res|widget):$/.test(Et.protocol),global:!0,processData:!0,async:!0,contentType:"application/x-www-form-urlencoded; charset=UTF-8",accepts:{"*":$t,text:"text/plain",html:"text/html",xml:"application/xml, text/xml",json:"application/json, text/javascript"},contents:{xml:/\bxml\b/,html:/\bhtml/,json:/\bjson\b/},responseFields:{xml:"responseXML",text:"responseText",json:"responseJSON"},converters:{"* text":String,"text html":!0,"text json":JSON.parse,"text xml":k.parseXML},flatOptions:{url:!0,context:!0}},ajaxSetup:function(e,t){return t?zt(zt(e,k.ajaxSettings),t):zt(k.ajaxSettings,e)},ajaxPrefilter:Bt(It),ajaxTransport:Bt(Wt),ajax:function(e,t){"object"==typeof e&&(t=e,e=void 0),t=t||{};var c,f,p,n,d,r,h,g,i,o,v=k.ajaxSetup({},t),y=v.context||v,m=v.context&&(y.nodeType||y.jquery)?k(y):k.event,x=k.Deferred(),b=k.Callbacks("once memory"),w=v.statusCode||{},a={},s={},u="canceled",T={readyState:0,getResponseHeader:function(e){var t;if(h){if(!n){n={};while(t=Pt.exec(p))n[t[1].toLowerCase()+" "]=(n[t[1].toLowerCase()+" "]||[]).concat(t[2])}t=n[e.toLowerCase()+" "]}return null==t?null:t.join(", ")},getAllResponseHeaders:function(){return h?p:null},setRequestHeader:function(e,t){return null==h&&(e=s[e.toLowerCase()]=s[e.toLowerCase()]||e,a[e]=t),this},overrideMimeType:function(e){return null==h&&(v.mimeType=e),this},statusCode:function(e){var t;if(e)if(h)T.always(e[T.status]);else for(t in e)w[t]=[w[t],e[t]];return this},abort:function(e){var t=e||u;return c&&c.abort(t),l(0,t),this}};if(x.promise(T),v.url=((e||v.url||Et.href)+"").replace(Mt,Et.protocol+"//"),v.type=t.method||t.type||v.method||v.type,v.dataTypes=(v.dataType||"*").toLowerCase().match(R)||[""],null==v.crossDomain){r=E.createElement("a");try{r.href=v.url,r.href=r.href,v.crossDomain=Ft.protocol+"//"+Ft.host!=r.protocol+"//"+r.host}catch(e){v.crossDomain=!0}}if(v.data&&v.processData&&"string"!=typeof v.data&&(v.data=k.param(v.data,v.traditional)),_t(It,v,t,T),h)return T;for(i in(g=k.event&&v.global)&&0==k.active++&&k.event.trigger("ajaxStart"),v.type=v.type.toUpperCase(),v.hasContent=!Rt.test(v.type),f=v.url.replace(Ht,""),v.hasContent?v.data&&v.processData&&0===(v.contentType||"").indexOf("application/x-www-form-urlencoded")&&(v.data=v.data.replace(Lt,"+")):(o=v.url.slice(f.length),v.data&&(v.processData||"string"==typeof v.data)&&(f+=(St.test(f)?"&":"?")+v.data,delete v.data),!1===v.cache&&(f=f.replace(Ot,"$1"),o=(St.test(f)?"&":"?")+"_="+kt+++o),v.url=f+o),v.ifModified&&(k.lastModified[f]&&T.setRequestHeader("If-Modified-Since",k.lastModified[f]),k.etag[f]&&T.setRequestHeader("If-None-Match",k.etag[f])),(v.data&&v.hasContent&&!1!==v.contentType||t.contentType)&&T.setRequestHeader("Content-Type",v.contentType),T.setRequestHeader("Accept",v.dataTypes[0]&&v.accepts[v.dataTypes[0]]?v.accepts[v.dataTypes[0]]+("*"!==v.dataTypes[0]?", "+$t+"; q=0.01":""):v.accepts["*"]),v.headers)T.setRequestHeader(i,v.headers[i]);if(v.beforeSend&&(!1===v.beforeSend.call(y,T,v)||h))return T.abort();if(u="abort",b.add(v.complete),T.done(v.success),T.fail(v.error),c=_t(Wt,v,t,T)){if(T.readyState=1,g&&m.trigger("ajaxSend",[T,v]),h)return T;v.async&&0<v.timeout&&(d=C.setTimeout(function(){T.abort("timeout")},v.timeout));try{h=!1,c.send(a,l)}catch(e){if(h)throw e;l(-1,e)}}else l(-1,"No Transport");function l(e,t,n,r){var i,o,a,s,u,l=t;h||(h=!0,d&&C.clearTimeout(d),c=void 0,p=r||"",T.readyState=0<e?4:0,i=200<=e&&e<300||304===e,n&&(s=function(e,t,n){var r,i,o,a,s=e.contents,u=e.dataTypes;while("*"===u[0])u.shift(),void 0===r&&(r=e.mimeType||t.getResponseHeader("Content-Type"));if(r)for(i in s)if(s[i]&&s[i].test(r)){u.unshift(i);break}if(u[0]in n)o=u[0];else{for(i in n){if(!u[0]||e.converters[i+" "+u[0]]){o=i;break}a||(a=i)}o=o||a}if(o)return o!==u[0]&&u.unshift(o),n[o]}(v,T,n)),s=function(e,t,n,r){var i,o,a,s,u,l={},c=e.dataTypes.slice();if(c[1])for(a in e.converters)l[a.toLowerCase()]=e.converters[a];o=c.shift();while(o)if(e.responseFields[o]&&(n[e.responseFields[o]]=t),!u&&r&&e.dataFilter&&(t=e.dataFilter(t,e.dataType)),u=o,o=c.shift())if("*"===o)o=u;else if("*"!==u&&u!==o){if(!(a=l[u+" "+o]||l["* "+o]))for(i in l)if((s=i.split(" "))[1]===o&&(a=l[u+" "+s[0]]||l["* "+s[0]])){!0===a?a=l[i]:!0!==l[i]&&(o=s[0],c.unshift(s[1]));break}if(!0!==a)if(a&&e["throws"])t=a(t);else try{t=a(t)}catch(e){return{state:"parsererror",error:a?e:"No conversion from "+u+" to "+o}}}return{state:"success",data:t}}(v,s,T,i),i?(v.ifModified&&((u=T.getResponseHeader("Last-Modified"))&&(k.lastModified[f]=u),(u=T.getResponseHeader("etag"))&&(k.etag[f]=u)),204===e||"HEAD"===v.type?l="nocontent":304===e?l="notmodified":(l=s.state,o=s.data,i=!(a=s.error))):(a=l,!e&&l||(l="error",e<0&&(e=0))),T.status=e,T.statusText=(t||l)+"",i?x.resolveWith(y,[o,l,T]):x.rejectWith(y,[T,l,a]),T.statusCode(w),w=void 0,g&&m.trigger(i?"ajaxSuccess":"ajaxError",[T,v,i?o:a]),b.fireWith(y,[T,l]),g&&(m.trigger("ajaxComplete",[T,v]),--k.active||k.event.trigger("ajaxStop")))}return T},getJSON:function(e,t,n){return k.get(e,t,n,"json")},getScript:function(e,t){return k.get(e,void 0,t,"script")}}),k.each(["get","post"],function(e,i){k[i]=function(e,t,n,r){return m(t)&&(r=r||n,n=t,t=void 0),k.ajax(k.extend({url:e,type:i,dataType:r,data:t,success:n},k.isPlainObject(e)&&e))}}),k._evalUrl=function(e,t){return k.ajax({url:e,type:"GET",dataType:"script",cache:!0,async:!1,global:!1,converters:{"text script":function(){}},dataFilter:function(e){k.globalEval(e,t)}})},k.fn.extend({wrapAll:function(e){var t;return this[0]&&(m(e)&&(e=e.call(this[0])),t=k(e,this[0].ownerDocument).eq(0).clone(!0),this[0].parentNode&&t.insertBefore(this[0]),t.map(function(){var e=this;while(e.firstElementChild)e=e.firstElementChild;return e}).append(this)),this},wrapInner:function(n){return m(n)?this.each(function(e){k(this).wrapInner(n.call(this,e))}):this.each(function(){var e=k(this),t=e.contents();t.length?t.wrapAll(n):e.append(n)})},wrap:function(t){var n=m(t);return this.each(function(e){k(this).wrapAll(n?t.call(this,e):t)})},unwrap:function(e){return this.parent(e).not("body").each(function(){k(this).replaceWith(this.childNodes)}),this}}),k.expr.pseudos.hidden=function(e){return!k.expr.pseudos.visible(e)},k.expr.pseudos.visible=function(e){return!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)},k.ajaxSettings.xhr=function(){try{return new C.XMLHttpRequest}catch(e){}};var Ut={0:200,1223:204},Xt=k.ajaxSettings.xhr();y.cors=!!Xt&&"withCredentials"in Xt,y.ajax=Xt=!!Xt,k.ajaxTransport(function(i){var o,a;if(y.cors||Xt&&!i.crossDomain)return{send:function(e,t){var n,r=i.xhr();if(r.open(i.type,i.url,i.async,i.username,i.password),i.xhrFields)for(n in i.xhrFields)r[n]=i.xhrFields[n];for(n in i.mimeType&&r.overrideMimeType&&r.overrideMimeType(i.mimeType),i.crossDomain||e["X-Requested-With"]||(e["X-Requested-With"]="XMLHttpRequest"),e)r.setRequestHeader(n,e[n]);o=function(e){return function(){o&&(o=a=r.onload=r.onerror=r.onabort=r.ontimeout=r.onreadystatechange=null,"abort"===e?r.abort():"error"===e?"number"!=typeof r.status?t(0,"error"):t(r.status,r.statusText):t(Ut[r.status]||r.status,r.statusText,"text"!==(r.responseType||"text")||"string"!=typeof r.responseText?{binary:r.response}:{text:r.responseText},r.getAllResponseHeaders()))}},r.onload=o(),a=r.onerror=r.ontimeout=o("error"),void 0!==r.onabort?r.onabort=a:r.onreadystatechange=function(){4===r.readyState&&C.setTimeout(function(){o&&a()})},o=o("abort");try{r.send(i.hasContent&&i.data||null)}catch(e){if(o)throw e}},abort:function(){o&&o()}}}),k.ajaxPrefilter(function(e){e.crossDomain&&(e.contents.script=!1)}),k.ajaxSetup({accepts:{script:"text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"},contents:{script:/\b(?:java|ecma)script\b/},converters:{"text script":function(e){return k.globalEval(e),e}}}),k.ajaxPrefilter("script",function(e){void 0===e.cache&&(e.cache=!1),e.crossDomain&&(e.type="GET")}),k.ajaxTransport("script",function(n){var r,i;if(n.crossDomain||n.scriptAttrs)return{send:function(e,t){r=k("<script>").attr(n.scriptAttrs||{}).prop({charset:n.scriptCharset,src:n.url}).on("load error",i=function(e){r.remove(),i=null,e&&t("error"===e.type?404:200,e.type)}),E.head.appendChild(r[0])},abort:function(){i&&i()}}});var Vt,Gt=[],Yt=/(=)\?(?=&|$)|\?\?/;k.ajaxSetup({jsonp:"callback",jsonpCallback:function(){var e=Gt.pop()||k.expando+"_"+kt++;return this[e]=!0,e}}),k.ajaxPrefilter("json jsonp",function(e,t,n){var r,i,o,a=!1!==e.jsonp&&(Yt.test(e.url)?"url":"string"==typeof e.data&&0===(e.contentType||"").indexOf("application/x-www-form-urlencoded")&&Yt.test(e.data)&&"data");if(a||"jsonp"===e.dataTypes[0])return r=e.jsonpCallback=m(e.jsonpCallback)?e.jsonpCallback():e.jsonpCallback,a?e[a]=e[a].replace(Yt,"$1"+r):!1!==e.jsonp&&(e.url+=(St.test(e.url)?"&":"?")+e.jsonp+"="+r),e.converters["script json"]=function(){return o||k.error(r+" was not called"),o[0]},e.dataTypes[0]="json",i=C[r],C[r]=function(){o=arguments},n.always(function(){void 0===i?k(C).removeProp(r):C[r]=i,e[r]&&(e.jsonpCallback=t.jsonpCallback,Gt.push(r)),o&&m(i)&&i(o[0]),o=i=void 0}),"script"}),y.createHTMLDocument=((Vt=E.implementation.createHTMLDocument("").body).innerHTML="<form></form><form></form>",2===Vt.childNodes.length),k.parseHTML=function(e,t,n){return"string"!=typeof e?[]:("boolean"==typeof t&&(n=t,t=!1),t||(y.createHTMLDocument?((r=(t=E.implementation.createHTMLDocument("")).createElement("base")).href=E.location.href,t.head.appendChild(r)):t=E),o=!n&&[],(i=D.exec(e))?[t.createElement(i[1])]:(i=we([e],t,o),o&&o.length&&k(o).remove(),k.merge([],i.childNodes)));var r,i,o},k.fn.load=function(e,t,n){var r,i,o,a=this,s=e.indexOf(" ");return-1<s&&(r=mt(e.slice(s)),e=e.slice(0,s)),m(t)?(n=t,t=void 0):t&&"object"==typeof t&&(i="POST"),0<a.length&&k.ajax({url:e,type:i||"GET",dataType:"html",data:t}).done(function(e){o=arguments,a.html(r?k("<div>").append(k.parseHTML(e)).find(r):e)}).always(n&&function(e,t){a.each(function(){n.apply(this,o||[e.responseText,t,e])})}),this},k.each(["ajaxStart","ajaxStop","ajaxComplete","ajaxError","ajaxSuccess","ajaxSend"],function(e,t){k.fn[t]=function(e){return this.on(t,e)}}),k.expr.pseudos.animated=function(t){return k.grep(k.timers,function(e){return t===e.elem}).length},k.offset={setOffset:function(e,t,n){var r,i,o,a,s,u,l=k.css(e,"position"),c=k(e),f={};"static"===l&&(e.style.position="relative"),s=c.offset(),o=k.css(e,"top"),u=k.css(e,"left"),("absolute"===l||"fixed"===l)&&-1<(o+u).indexOf("auto")?(a=(r=c.position()).top,i=r.left):(a=parseFloat(o)||0,i=parseFloat(u)||0),m(t)&&(t=t.call(e,n,k.extend({},s))),null!=t.top&&(f.top=t.top-s.top+a),null!=t.left&&(f.left=t.left-s.left+i),"using"in t?t.using.call(e,f):c.css(f)}},k.fn.extend({offset:function(t){if(arguments.length)return void 0===t?this:this.each(function(e){k.offset.setOffset(this,t,e)});var e,n,r=this[0];return r?r.getClientRects().length?(e=r.getBoundingClientRect(),n=r.ownerDocument.defaultView,{top:e.top+n.pageYOffset,left:e.left+n.pageXOffset}):{top:0,left:0}:void 0},position:function(){if(this[0]){var e,t,n,r=this[0],i={top:0,left:0};if("fixed"===k.css(r,"position"))t=r.getBoundingClientRect();else{t=this.offset(),n=r.ownerDocument,e=r.offsetParent||n.documentElement;while(e&&(e===n.body||e===n.documentElement)&&"static"===k.css(e,"position"))e=e.parentNode;e&&e!==r&&1===e.nodeType&&((i=k(e).offset()).top+=k.css(e,"borderTopWidth",!0),i.left+=k.css(e,"borderLeftWidth",!0))}return{top:t.top-i.top-k.css(r,"marginTop",!0),left:t.left-i.left-k.css(r,"marginLeft",!0)}}},offsetParent:function(){return this.map(function(){var e=this.offsetParent;while(e&&"static"===k.css(e,"position"))e=e.offsetParent;return e||ie})}}),k.each({scrollLeft:"pageXOffset",scrollTop:"pageYOffset"},function(t,i){var o="pageYOffset"===i;k.fn[t]=function(e){return _(this,function(e,t,n){var r;if(x(e)?r=e:9===e.nodeType&&(r=e.defaultView),void 0===n)return r?r[i]:e[t];r?r.scrollTo(o?r.pageXOffset:n,o?n:r.pageYOffset):e[t]=n},t,e,arguments.length)}}),k.each(["top","left"],function(e,n){k.cssHooks[n]=ze(y.pixelPosition,function(e,t){if(t)return t=_e(e,n),$e.test(t)?k(e).position()[n]+"px":t})}),k.each({Height:"height",Width:"width"},function(a,s){k.each({padding:"inner"+a,content:s,"":"outer"+a},function(r,o){k.fn[o]=function(e,t){var n=arguments.length&&(r||"boolean"!=typeof e),i=r||(!0===e||!0===t?"margin":"border");return _(this,function(e,t,n){var r;return x(e)?0===o.indexOf("outer")?e["inner"+a]:e.document.documentElement["client"+a]:9===e.nodeType?(r=e.documentElement,Math.max(e.body["scroll"+a],r["scroll"+a],e.body["offset"+a],r["offset"+a],r["client"+a])):void 0===n?k.css(e,t,i):k.style(e,t,n,i)},s,n?e:void 0,n)}})}),k.each("blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(" "),function(e,n){k.fn[n]=function(e,t){return 0<arguments.length?this.on(n,null,e,t):this.trigger(n)}}),k.fn.extend({hover:function(e,t){return this.mouseenter(e).mouseleave(t||e)}}),k.fn.extend({bind:function(e,t,n){return this.on(e,null,t,n)},unbind:function(e,t){return this.off(e,null,t)},delegate:function(e,t,n,r){return this.on(t,e,n,r)},undelegate:function(e,t,n){return 1===arguments.length?this.off(e,"**"):this.off(t,e||"**",n)}}),k.proxy=function(e,t){var n,r,i;if("string"==typeof t&&(n=e[t],t=e,e=n),m(e))return r=s.call(arguments,2),(i=function(){return e.apply(t||this,r.concat(s.call(arguments)))}).guid=e.guid=e.guid||k.guid++,i},k.holdReady=function(e){e?k.readyWait++:k.ready(!0)},k.isArray=Array.isArray,k.parseJSON=JSON.parse,k.nodeName=A,k.isFunction=m,k.isWindow=x,k.camelCase=V,k.type=w,k.now=Date.now,k.isNumeric=function(e){var t=k.type(e);return("number"===t||"string"===t)&&!isNaN(e-parseFloat(e))},"function"==typeof define&&define.amd&&define("jquery",[],function(){return k});var Qt=C.jQuery,Jt=C.$;return k.noConflict=function(e){return C.$===k&&(C.$=Jt),e&&C.jQuery===k&&(C.jQuery=Qt),k},e||(C.jQuery=C.$=k),k});

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

define('js/pieces/Route',[], function() {

	var routes = [];

	var words = location.hash.substring(1).split("/");

	var changedHash = 0;

	var updating = 0;

	var route = new Route();

	addEventListener("hashchange", function() {

		if (changedHash) {

			changedHash--;

			return;
		}

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

			var oldHash = location.hash;
			var hash = wordList.join("/");

			// remove trailing slashes.
			hash = "#" + hash.replace(/\/+$/, "");

			if (oldHash != hash) {

				changedHash++;
			}

			words = wordList;
			location.hash = hash;
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
			changedHash = 0;
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

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			self.datumPiecesFirstPage = page;
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

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
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
				this.datumPiecesSecondPage = page;

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
				this.datumPiecesFirstPage = page;

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

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
			}

			if (self.datumPiecesNewPage == page) {

				return;
			}

			callback();
			self.datumPiecesNewPage = page;
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			var page = pages[index].page;

			if (typeof page == "function") {
				page = page();
				pages[index].page = page;
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
			this.datumPiecesNewPage = page;

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
	"./Library",
	"./Route",
	"./Subroute",
	"./Page"
], function ScrollNavPiece(
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

				var page = pages[i].page;

				if (typeof page == "function") {

					page = page();
				}

				this.datumPiecesPages.push(new Page(i, page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var pageElement = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";
			container.appendChild(pageElement);

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
					page: () => new Picture("photo-1513635269975-59663e0ac1ad")
				},
				{
					route: "berlin",
					page: () => new Picture("photo-1559564484-e48b3e040ff4")
				},
				{
					route: "delhi",
					page: () => new Picture("photo-1513014576558-921f00d80b77")
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
					page: () => new Picture("photo-1447175008436-054170c2e979")
				},
				{
					route: "cabbage",
					page: () => new Picture("photo-1550177564-5cf7f9279d8b")
				},
				{
					route: "squash",
					page: () => new Picture("photo-1507919181268-0a42063f9704")
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

define('js/Scroll',[
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/Cities",
	"js/Rainbow",
	"js/Space",
	"js/Vegetables",
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
				{ route: "space", page: new Space() }
			]);

		// Menu buttons.
		this.one = new NavButton(0, this.container);
		this.two = new NavButton(1, this.container);
		this.three = new NavButton(2, this.container);
		this.four = new NavButton(3, this.container);

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

				{ route: "router", page: () => new Router() },
				{ route: "fade", page: () => new Fade() },
				{ route: "scroll", page: () => new Scroll() },
				{ route: "code", page: () => new Links() }
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
 * # Semantic UI - 2.4.1
 * https://github.com/Semantic-Org/Semantic-UI
 * http://www.semantic-ui.com/
 *
 * Copyright 2014 Contributors
 * Released under the MIT license
 * http://opensource.org/licenses/MIT
 *
 */
!function(p,h,v,b){p.site=p.fn.site=function(e){var s,l,i=(new Date).getTime(),o=[],t=e,n="string"==typeof t,c=[].slice.call(arguments,1),u=p.isPlainObject(e)?p.extend(!0,{},p.site.settings,e):p.extend({},p.site.settings),a=u.namespace,d=u.error,r="module-"+a,f=p(v),m=this,g=f.data(r);return s={initialize:function(){s.instantiate()},instantiate:function(){s.verbose("Storing instance of site",s),g=s,f.data(r,s)},normalize:function(){s.fix.console(),s.fix.requestAnimationFrame()},fix:{console:function(){s.debug("Normalizing window.console"),console!==b&&console.log!==b||(s.verbose("Console not available, normalizing events"),s.disable.console()),void 0!==console.group&&void 0!==console.groupEnd&&void 0!==console.groupCollapsed||(s.verbose("Console group not available, normalizing events"),h.console.group=function(){},h.console.groupEnd=function(){},h.console.groupCollapsed=function(){}),void 0===console.markTimeline&&(s.verbose("Mark timeline not available, normalizing events"),h.console.markTimeline=function(){})},consoleClear:function(){s.debug("Disabling programmatic console clearing"),h.console.clear=function(){}},requestAnimationFrame:function(){s.debug("Normalizing requestAnimationFrame"),h.requestAnimationFrame===b&&(s.debug("RequestAnimationFrame not available, normalizing event"),h.requestAnimationFrame=h.requestAnimationFrame||h.mozRequestAnimationFrame||h.webkitRequestAnimationFrame||h.msRequestAnimationFrame||function(e){setTimeout(e,0)})}},moduleExists:function(e){return p.fn[e]!==b&&p.fn[e].settings!==b},enabled:{modules:function(e){var n=[];return e=e||u.modules,p.each(e,function(e,t){s.moduleExists(t)&&n.push(t)}),n}},disabled:{modules:function(e){var n=[];return e=e||u.modules,p.each(e,function(e,t){s.moduleExists(t)||n.push(t)}),n}},change:{setting:function(o,a,e,r){e="string"==typeof e?"all"===e?u.modules:[e]:e||u.modules,r=r===b||r,p.each(e,function(e,t){var n,i=!s.moduleExists(t)||(p.fn[t].settings.namespace||!1);s.moduleExists(t)&&(s.verbose("Changing default setting",o,a,t),p.fn[t].settings[o]=a,r&&i&&0<(n=p(":data(module-"+i+")")).length&&(s.verbose("Modifying existing settings",n),n[t]("setting",o,a)))})},settings:function(i,e,o){e="string"==typeof e?[e]:e||u.modules,o=o===b||o,p.each(e,function(e,t){var n;s.moduleExists(t)&&(s.verbose("Changing default setting",i,t),p.extend(!0,p.fn[t].settings,i),o&&a&&0<(n=p(":data(module-"+a+")")).length&&(s.verbose("Modifying existing settings",n),n[t]("setting",i)))})}},enable:{console:function(){s.console(!0)},debug:function(e,t){e=e||u.modules,s.debug("Enabling debug for modules",e),s.change.setting("debug",!0,e,t)},verbose:function(e,t){e=e||u.modules,s.debug("Enabling verbose debug for modules",e),s.change.setting("verbose",!0,e,t)}},disable:{console:function(){s.console(!1)},debug:function(e,t){e=e||u.modules,s.debug("Disabling debug for modules",e),s.change.setting("debug",!1,e,t)},verbose:function(e,t){e=e||u.modules,s.debug("Disabling verbose debug for modules",e),s.change.setting("verbose",!1,e,t)}},console:function(e){if(e){if(g.cache.console===b)return void s.error(d.console);s.debug("Restoring console function"),h.console=g.cache.console}else s.debug("Disabling console function"),g.cache.console=h.console,h.console={clear:function(){},error:function(){},group:function(){},groupCollapsed:function(){},groupEnd:function(){},info:function(){},log:function(){},markTimeline:function(){},warn:function(){}}},destroy:function(){s.verbose("Destroying previous site for",f),f.removeData(r)},cache:{},setting:function(e,t){if(p.isPlainObject(e))p.extend(!0,u,e);else{if(t===b)return u[e];u[e]=t}},internal:function(e,t){if(p.isPlainObject(e))p.extend(!0,s,e);else{if(t===b)return s[e];s[e]=t}},debug:function(){u.debug&&(u.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,u.name+":"),s.debug.apply(console,arguments)))},verbose:function(){u.verbose&&u.debug&&(u.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,u.name+":"),s.verbose.apply(console,arguments)))},error:function(){s.error=Function.prototype.bind.call(console.error,console,u.name+":"),s.error.apply(console,arguments)},performance:{log:function(e){var t,n;u.performance&&(n=(t=(new Date).getTime())-(i||t),i=t,o.push({Element:m,Name:e[0],Arguments:[].slice.call(e,1)||"","Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=u.name+":",n=0;i=!1,clearTimeout(s.performance.timer),p.each(o,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",(console.group!==b||console.table!==b)&&0<o.length&&(console.groupCollapsed(e),console.table?console.table(o):p.each(o,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),o=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||c,t=m||t,"string"==typeof i&&r!==b&&(i=i.split(/[\. ]/),o=i.length-1,p.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(p.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==b)return a=r[n],!1;if(!p.isPlainObject(r[t])||e==o)return r[t]!==b?a=r[t]:s.error(d.method,i),!1;r=r[t]}})),p.isFunction(a)?n=a.apply(t,e):a!==b&&(n=a),p.isArray(l)?l.push(n):l!==b?l=[l,n]:n!==b&&(l=n),a}},n?(g===b&&s.initialize(),s.invoke(t)):(g!==b&&s.destroy(),s.initialize()),l!==b?l:this},p.site.settings={name:"Site",namespace:"site",error:{console:"Console cannot be restored, most likely it was overwritten outside of module",method:"The method you called is not defined."},debug:!1,verbose:!1,performance:!0,modules:["accordion","api","checkbox","dimmer","dropdown","embed","form","modal","nag","popup","rating","shape","sidebar","state","sticky","tab","transition","visit","visibility"],siteNamespace:"site",namespaceStub:{cache:{},config:{},sections:{},section:{},utilities:{}}},p.extend(p.expr[":"],{data:p.expr.createPseudo?p.expr.createPseudo(function(t){return function(e){return!!p.data(e,t)}}):function(e,t,n){return!!p.data(e,n[3])}})}(jQuery,window,document),function(F,e,O,D){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),F.fn.form=function(x){var C,w=F(this),S=w.selector||"",k=(new Date).getTime(),T=[],A=x,R=arguments[1],P="string"==typeof A,E=[].slice.call(arguments,1);return w.each(function(){var n,l,t,e,d,c,u,f,m,i,s,o,a,g,p,h,r=F(this),v=this,b=[],y=!1;(h={initialize:function(){h.get.settings(),P?(p===D&&h.instantiate(),h.invoke(A)):(p!==D&&p.invoke("destroy"),h.verbose("Initializing form validation",r,d),h.bindEvents(),h.set.defaults(),h.instantiate())},instantiate:function(){h.verbose("Storing instance of module",h),p=h,r.data(a,h)},destroy:function(){h.verbose("Destroying previous module",p),h.removeEvents(),r.removeData(a)},refresh:function(){h.verbose("Refreshing selector cache"),n=r.find(f.field),l=r.find(f.group),t=r.find(f.message),r.find(f.prompt),e=r.find(f.submit),r.find(f.clear),r.find(f.reset)},submit:function(){h.verbose("Submitting form",r),r.submit()},attachEvents:function(e,t){t=t||"submit",F(e).on("click"+g,function(e){h[t](),e.preventDefault()})},bindEvents:function(){h.verbose("Attaching form events"),r.on("submit"+g,h.validate.form).on("blur"+g,f.field,h.event.field.blur).on("click"+g,f.submit,h.submit).on("click"+g,f.reset,h.reset).on("click"+g,f.clear,h.clear),d.keyboardShortcuts&&r.on("keydown"+g,f.field,h.event.field.keydown),n.each(function(){var e=F(this),t=e.prop("type"),n=h.get.changeEvent(t,e);F(this).on(n+g,h.event.field.change)})},clear:function(){n.each(function(){var e=F(this),t=e.parent(),n=e.closest(l),i=n.find(f.prompt),o=e.data(u.defaultValue)||"",a=t.is(f.uiCheckbox),r=t.is(f.uiDropdown);n.hasClass(m.error)&&(h.verbose("Resetting error on field",n),n.removeClass(m.error),i.remove()),r?(h.verbose("Resetting dropdown value",t,o),t.dropdown("clear")):a?e.prop("checked",!1):(h.verbose("Resetting field value",e,o),e.val(""))})},reset:function(){n.each(function(){var e=F(this),t=e.parent(),n=e.closest(l),i=n.find(f.prompt),o=e.data(u.defaultValue),a=t.is(f.uiCheckbox),r=t.is(f.uiDropdown),s=n.hasClass(m.error);o!==D&&(s&&(h.verbose("Resetting error on field",n),n.removeClass(m.error),i.remove()),r?(h.verbose("Resetting dropdown value",t,o),t.dropdown("restore defaults")):a?(h.verbose("Resetting checkbox value",t,o),e.prop("checked",o)):(h.verbose("Resetting field value",e,o),e.val(o)))})},determine:{isValid:function(){var n=!0;return F.each(c,function(e,t){h.validate.field(t,e,!0)||(n=!1)}),n}},is:{bracketedRule:function(e){return e.type&&e.type.match(d.regExp.bracket)},shorthandFields:function(e){var t=e[Object.keys(e)[0]];return h.is.shorthandRules(t)},shorthandRules:function(e){return"string"==typeof e||F.isArray(e)},empty:function(e){return!e||0===e.length||(e.is('input[type="checkbox"]')?!e.is(":checked"):h.is.blank(e))},blank:function(e){return""===F.trim(e.val())},valid:function(e){var n=!0;return e?(h.verbose("Checking if field is valid",e),h.validate.field(c[e],e,!1)):(h.verbose("Checking if form is valid"),F.each(c,function(e,t){h.is.valid(e)||(n=!1)}),n)}},removeEvents:function(){r.off(g),n.off(g),e.off(g),n.off(g)},event:{field:{keydown:function(e){var t=F(this),n=e.which,i=t.is(f.input),o=t.is(f.checkbox),a=0<t.closest(f.uiDropdown).length,r=13;n==27&&(h.verbose("Escape key pressed blurring field"),t.blur()),e.ctrlKey||n!=r||!i||a||o||(y||(t.one("keyup"+g,h.event.field.keyup),h.submit(),h.debug("Enter pressed on input submitting form")),y=!0)},keyup:function(){y=!1},blur:function(e){var t=F(this),n=t.closest(l),i=h.get.validation(t);n.hasClass(m.error)?(h.debug("Revalidating field",t,i),i&&h.validate.field(i)):"blur"==d.on&&i&&h.validate.field(i)},change:function(e){var t=F(this),n=t.closest(l),i=h.get.validation(t);i&&("change"==d.on||n.hasClass(m.error)&&d.revalidate)&&(clearTimeout(h.timer),h.timer=setTimeout(function(){h.debug("Revalidating field",t,h.get.validation(t)),h.validate.field(i)},d.delay))}}},get:{ancillaryValue:function(e){return!(!e.type||!e.value&&!h.is.bracketedRule(e))&&(e.value!==D?e.value:e.type.match(d.regExp.bracket)[1]+"")},ruleName:function(e){return h.is.bracketedRule(e)?e.type.replace(e.type.match(d.regExp.bracket)[0],""):e.type},changeEvent:function(e,t){return"checkbox"==e||"radio"==e||"hidden"==e||t.is("select")?"change":h.get.inputEvent()},inputEvent:function(){return O.createElement("input").oninput!==D?"input":O.createElement("input").onpropertychange!==D?"propertychange":"keyup"},fieldsFromShorthand:function(e){var i={};return F.each(e,function(n,e){"string"==typeof e&&(e=[e]),i[n]={rules:[]},F.each(e,function(e,t){i[n].rules.push({type:t})})}),i},prompt:function(e,t){var n,i,o=h.get.ruleName(e),a=h.get.ancillaryValue(e),r=h.get.field(t.identifier),s=r.val(),l=F.isFunction(e.prompt)?e.prompt(s):e.prompt||d.prompt[o]||d.text.unspecifiedRule,c=-1!==l.search("{value}"),u=-1!==l.search("{name}");return c&&(l=l.replace("{value}",r.val())),u&&(i=1==(n=r.closest(f.group).find("label").eq(0)).length?n.text():r.prop("placeholder")||d.text.unspecifiedField,l=l.replace("{name}",i)),l=(l=l.replace("{identifier}",t.identifier)).replace("{ruleValue}",a),e.prompt||h.verbose("Using default validation prompt for type",l,o),l},settings:function(){if(F.isPlainObject(x)){var e=Object.keys(x);0<e.length&&(x[e[0]].identifier!==D&&x[e[0]].rules!==D)?(d=F.extend(!0,{},F.fn.form.settings,R),c=F.extend({},F.fn.form.settings.defaults,x),h.error(d.error.oldSyntax,v),h.verbose("Extending settings from legacy parameters",c,d)):(x.fields&&h.is.shorthandFields(x.fields)&&(x.fields=h.get.fieldsFromShorthand(x.fields)),d=F.extend(!0,{},F.fn.form.settings,x),c=F.extend({},F.fn.form.settings.defaults,d.fields),h.verbose("Extending settings",c,d))}else d=F.fn.form.settings,c=F.fn.form.settings.defaults,h.verbose("Using default form validation",c,d);o=d.namespace,u=d.metadata,f=d.selector,m=d.className,i=d.regExp,s=d.error,a="module-"+o,g="."+o,p=r.data(a),h.refresh()},field:function(e){return h.verbose("Finding field with identifier",e),e=h.escape.string(e),0<n.filter("#"+e).length?n.filter("#"+e):0<n.filter('[name="'+e+'"]').length?n.filter('[name="'+e+'"]'):0<n.filter('[name="'+e+'[]"]').length?n.filter('[name="'+e+'[]"]'):0<n.filter("[data-"+u.validate+'="'+e+'"]').length?n.filter("[data-"+u.validate+'="'+e+'"]'):F("<input/>")},fields:function(e){var n=F();return F.each(e,function(e,t){n=n.add(h.get.field(t))}),n},validation:function(n){var i,o;return!!c&&(F.each(c,function(e,t){o=t.identifier||e,h.get.field(o)[0]==n[0]&&(t.identifier=o,i=t)}),i||!1)},value:function(e){var t=[];return t.push(e),h.get.values.call(v,t)[e]},values:function(e){var t=F.isArray(e)?h.get.fields(e):n,c={};return t.each(function(e,t){var n=F(t),i=(n.prop("type"),n.prop("name")),o=n.val(),a=n.is(f.checkbox),r=n.is(f.radio),s=-1!==i.indexOf("[]"),l=!!a&&n.is(":checked");i&&(s?(i=i.replace("[]",""),c[i]||(c[i]=[]),a?l?c[i].push(o||!0):c[i].push(!1):c[i].push(o)):r?c[i]!==D&&0!=c[i]||(c[i]=!!l&&(o||!0)):c[i]=a?!!l&&(o||!0):o)}),c}},has:{field:function(e){return h.verbose("Checking for existence of a field with identifier",e),"string"!=typeof(e=h.escape.string(e))&&h.error(s.identifier,e),0<n.filter("#"+e).length||(0<n.filter('[name="'+e+'"]').length||0<n.filter("[data-"+u.validate+'="'+e+'"]').length)}},escape:{string:function(e){return(e=String(e)).replace(i.escape,"\\$&")}},add:{rule:function(e,t){h.add.field(e,t)},field:function(n,e){var i={};h.is.shorthandRules(e)?(e=F.isArray(e)?e:[e],i[n]={rules:[]},F.each(e,function(e,t){i[n].rules.push({type:t})})):i[n]=e,c=F.extend({},c,i),h.debug("Adding rules",i,c)},fields:function(e){var t;t=e&&h.is.shorthandFields(e)?h.get.fieldsFromShorthand(e):e,c=F.extend({},c,t)},prompt:function(e,t){var n=h.get.field(e).closest(l),i=n.children(f.prompt),o=0!==i.length;t="string"==typeof t?[t]:t,h.verbose("Adding field error state",e),n.addClass(m.error),d.inline&&(o||(i=d.templates.prompt(t)).appendTo(n),i.html(t[0]),o?h.verbose("Inline errors are disabled, no inline error added",e):d.transition&&F.fn.transition!==D&&r.transition("is supported")?(h.verbose("Displaying error with css transition",d.transition),i.transition(d.transition+" in",d.duration)):(h.verbose("Displaying error with fallback javascript animation"),i.fadeIn(d.duration)))},errors:function(e){h.debug("Adding form error messages",e),h.set.error(),t.html(d.templates.error(e))}},remove:{rule:function(n,e){var i=F.isArray(e)?e:[e];if(e==D)return h.debug("Removed all rules"),void(c[n].rules=[]);c[n]!=D&&F.isArray(c[n].rules)&&F.each(c[n].rules,function(e,t){-1!==i.indexOf(t.type)&&(h.debug("Removed rule",t.type),c[n].rules.splice(e,1))})},field:function(e){var t=F.isArray(e)?e:[e];F.each(t,function(e,t){h.remove.rule(t)})},rules:function(e,n){F.isArray(e)?F.each(fields,function(e,t){h.remove.rule(t,n)}):h.remove.rule(e,n)},fields:function(e){h.remove.field(e)},prompt:function(e){var t=h.get.field(e).closest(l),n=t.children(f.prompt);t.removeClass(m.error),d.inline&&n.is(":visible")&&(h.verbose("Removing prompt for field",e),d.transition&&F.fn.transition!==D&&r.transition("is supported")?n.transition(d.transition+" out",d.duration,function(){n.remove()}):n.fadeOut(d.duration,function(){n.remove()}))}},set:{success:function(){r.removeClass(m.error).addClass(m.success)},defaults:function(){n.each(function(){var e=F(this),t=0<e.filter(f.checkbox).length?e.is(":checked"):e.val();e.data(u.defaultValue,t)})},error:function(){r.removeClass(m.success).addClass(m.error)},value:function(e,t){var n={};return n[e]=t,h.set.values.call(v,n)},values:function(e){F.isEmptyObject(e)||F.each(e,function(e,t){var n,i=h.get.field(e),o=i.parent(),a=F.isArray(t),r=o.is(f.uiCheckbox),s=o.is(f.uiDropdown),l=i.is(f.radio)&&r;0<i.length&&(a&&r?(h.verbose("Selecting multiple",t,i),o.checkbox("uncheck"),F.each(t,function(e,t){n=i.filter('[value="'+t+'"]'),o=n.parent(),0<n.length&&o.checkbox("check")})):l?(h.verbose("Selecting radio value",t,i),i.filter('[value="'+t+'"]').parent(f.uiCheckbox).checkbox("check")):r?(h.verbose("Setting checkbox value",t,o),!0===t?o.checkbox("check"):o.checkbox("uncheck")):s?(h.verbose("Setting dropdown value",t,o),o.dropdown("set selected",t)):(h.verbose("Setting field value",t,i),i.val(t)))})}},validate:{form:function(e,t){var n=h.get.values();if(y)return!1;if(b=[],h.determine.isValid()){if(h.debug("Form has no validation errors, submitting"),h.set.success(),!0!==t)return d.onSuccess.call(v,e,n)}else if(h.debug("Form has errors"),h.set.error(),d.inline||h.add.errors(b),r.data("moduleApi")!==D&&e.stopImmediatePropagation(),!0!==t)return d.onFailure.call(v,b,n)},field:function(n,e,t){t=t===D||t,"string"==typeof n&&(h.verbose("Validating field",n),n=c[e=n]);var i=n.identifier||e,o=h.get.field(i),a=!!n.depends&&h.get.field(n.depends),r=!0,s=[];return n.identifier||(h.debug("Using field name as identifier",i),n.identifier=i),o.prop("disabled")?(h.debug("Field is disabled. Skipping",i),r=!0):n.optional&&h.is.blank(o)?(h.debug("Field is optional and blank. Skipping",i),r=!0):n.depends&&h.is.empty(a)?(h.debug("Field depends on another value that is not present or empty. Skipping",a),r=!0):n.rules!==D&&F.each(n.rules,function(e,t){h.has.field(i)&&!h.validate.rule(n,t)&&(h.debug("Field is invalid",i,t.type),s.push(h.get.prompt(t,n)),r=!1)}),r?(t&&(h.remove.prompt(i,s),d.onValid.call(o)),!0):(t&&(b=b.concat(s),h.add.prompt(i,s),d.onInvalid.call(o,s)),!1)},rule:function(e,t){var n=h.get.field(e.identifier),i=(t.type,n.val()),o=h.get.ancillaryValue(t),a=h.get.ruleName(t),r=d.rules[a];if(F.isFunction(r))return i=i===D||""===i||null===i?"":F.trim(i+""),r.call(n,i,o);h.error(s.noRule,a)}},setting:function(e,t){if(F.isPlainObject(e))F.extend(!0,d,e);else{if(t===D)return d[e];d[e]=t}},internal:function(e,t){if(F.isPlainObject(e))F.extend(!0,h,e);else{if(t===D)return h[e];h[e]=t}},debug:function(){!d.silent&&d.debug&&(d.performance?h.performance.log(arguments):(h.debug=Function.prototype.bind.call(console.info,console,d.name+":"),h.debug.apply(console,arguments)))},verbose:function(){!d.silent&&d.verbose&&d.debug&&(d.performance?h.performance.log(arguments):(h.verbose=Function.prototype.bind.call(console.info,console,d.name+":"),h.verbose.apply(console,arguments)))},error:function(){d.silent||(h.error=Function.prototype.bind.call(console.error,console,d.name+":"),h.error.apply(console,arguments))},performance:{log:function(e){var t,n;d.performance&&(n=(t=(new Date).getTime())-(k||t),k=t,T.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:v,"Execution Time":n})),clearTimeout(h.performance.timer),h.performance.timer=setTimeout(h.performance.display,500)},display:function(){var e=d.name+":",n=0;k=!1,clearTimeout(h.performance.timer),F.each(T,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",S&&(e+=" '"+S+"'"),1<w.length&&(e+=" ("+w.length+")"),(console.group!==D||console.table!==D)&&0<T.length&&(console.groupCollapsed(e),console.table?console.table(T):F.each(T,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),T=[]}},invoke:function(i,e,t){var o,a,n,r=p;return e=e||E,t=v||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,F.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(F.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!F.isPlainObject(r[t])||e==o)return r[t]!==D&&(a=r[t]),!1;r=r[t]}})),F.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),F.isArray(C)?C.push(n):C!==D?C=[C,n]:n!==D&&(C=n),a}}).initialize()}),C!==D?C:this},F.fn.form.settings={name:"Form",namespace:"form",debug:!1,verbose:!1,performance:!0,fields:!1,keyboardShortcuts:!0,on:"submit",inline:!1,delay:200,revalidate:!0,transition:"scale",duration:200,onValid:function(){},onInvalid:function(){},onSuccess:function(){return!0},onFailure:function(){return!1},metadata:{defaultValue:"default",validate:"validate"},regExp:{htmlID:/^[a-zA-Z][\w:.-]*$/g,bracket:/\[(.*)\]/i,decimal:/^\d+\.?\d*$/,email:/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,escape:/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,flags:/^\/(.*)\/(.*)?/,integer:/^\-?\d+$/,number:/^\-?\d*(\.\d+)?$/,url:/(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i},text:{unspecifiedRule:"Please enter a valid value",unspecifiedField:"This field"},prompt:{empty:"{name} must have a value",checked:"{name} must be checked",email:"{name} must be a valid e-mail",url:"{name} must be a valid url",regExp:"{name} is not formatted correctly",integer:"{name} must be an integer",decimal:"{name} must be a decimal number",number:"{name} must be set to a number",is:'{name} must be "{ruleValue}"',isExactly:'{name} must be exactly "{ruleValue}"',not:'{name} cannot be set to "{ruleValue}"',notExactly:'{name} cannot be set to exactly "{ruleValue}"',contain:'{name} must contain "{ruleValue}"',containExactly:'{name} must contain exactly "{ruleValue}"',doesntContain:'{name} cannot contain  "{ruleValue}"',doesntContainExactly:'{name} cannot contain exactly "{ruleValue}"',minLength:"{name} must be at least {ruleValue} characters",length:"{name} must be at least {ruleValue} characters",exactLength:"{name} must be exactly {ruleValue} characters",maxLength:"{name} cannot be longer than {ruleValue} characters",match:"{name} must match {ruleValue} field",different:"{name} must have a different value than {ruleValue} field",creditCard:"{name} must be a valid credit card number",minCount:"{name} must have at least {ruleValue} choices",exactCount:"{name} must have exactly {ruleValue} choices",maxCount:"{name} must have {ruleValue} or less choices"},selector:{checkbox:'input[type="checkbox"], input[type="radio"]',clear:".clear",field:"input, textarea, select",group:".field",input:"input",message:".error.message",prompt:".prompt.label",radio:'input[type="radio"]',reset:'.reset:not([type="reset"])',submit:'.submit:not([type="submit"])',uiCheckbox:".ui.checkbox",uiDropdown:".ui.dropdown"},className:{error:"error",label:"ui prompt label",pressed:"down",success:"success"},error:{identifier:"You must specify a string identifier for each field",method:"The method you called is not defined.",noRule:"There is no rule matching the one you specified",oldSyntax:"Starting in 2.0 forms now only take a single settings object. Validation settings converted to new syntax automatically."},templates:{error:function(e){var n='<ul class="list">';return F.each(e,function(e,t){n+="<li>"+t+"</li>"}),F(n+="</ul>")},prompt:function(e){return F("<div/>").addClass("ui basic red pointing prompt label").html(e[0])}},rules:{empty:function(e){return!(e===D||""===e||F.isArray(e)&&0===e.length)},checked:function(){return 0<F(this).filter(":checked").length},email:function(e){return F.fn.form.settings.regExp.email.test(e)},url:function(e){return F.fn.form.settings.regExp.url.test(e)},regExp:function(e,t){if(t instanceof RegExp)return e.match(t);var n,i=t.match(F.fn.form.settings.regExp.flags);return i&&(t=2<=i.length?i[1]:t,n=3<=i.length?i[2]:""),e.match(new RegExp(t,n))},integer:function(e,t){var n,i,o,a=F.fn.form.settings.regExp.integer;return t&&-1===["",".."].indexOf(t)&&(-1==t.indexOf("..")?a.test(t)&&(n=i=t-0):(o=t.split("..",2),a.test(o[0])&&(n=o[0]-0),a.test(o[1])&&(i=o[1]-0))),a.test(e)&&(n===D||n<=e)&&(i===D||e<=i)},decimal:function(e){return F.fn.form.settings.regExp.decimal.test(e)},number:function(e){return F.fn.form.settings.regExp.number.test(e)},is:function(e,t){return t="string"==typeof t?t.toLowerCase():t,(e="string"==typeof e?e.toLowerCase():e)==t},isExactly:function(e,t){return e==t},not:function(e,t){return(e="string"==typeof e?e.toLowerCase():e)!=(t="string"==typeof t?t.toLowerCase():t)},notExactly:function(e,t){return e!=t},contains:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1!==e.search(new RegExp(t,"i"))},containsExactly:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1!==e.search(new RegExp(t))},doesntContain:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1===e.search(new RegExp(t,"i"))},doesntContainExactly:function(e,t){return t=t.replace(F.fn.form.settings.regExp.escape,"\\$&"),-1===e.search(new RegExp(t))},minLength:function(e,t){return e!==D&&e.length>=t},length:function(e,t){return e!==D&&e.length>=t},exactLength:function(e,t){return e!==D&&e.length==t},maxLength:function(e,t){return e!==D&&e.length<=t},match:function(e,t){var n;F(this);return 0<F('[data-validate="'+t+'"]').length?n=F('[data-validate="'+t+'"]').val():0<F("#"+t).length?n=F("#"+t).val():0<F('[name="'+t+'"]').length?n=F('[name="'+t+'"]').val():0<F('[name="'+t+'[]"]').length&&(n=F('[name="'+t+'[]"]')),n!==D&&e.toString()==n.toString()},different:function(e,t){var n;F(this);return 0<F('[data-validate="'+t+'"]').length?n=F('[data-validate="'+t+'"]').val():0<F("#"+t).length?n=F("#"+t).val():0<F('[name="'+t+'"]').length?n=F('[name="'+t+'"]').val():0<F('[name="'+t+'[]"]').length&&(n=F('[name="'+t+'[]"]')),n!==D&&e.toString()!==n.toString()},creditCard:function(n,e){var t,i,o={visa:{pattern:/^4/,length:[16]},amex:{pattern:/^3[47]/,length:[15]},mastercard:{pattern:/^5[1-5]/,length:[16]},discover:{pattern:/^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5]|64[4-9])|65)/,length:[16]},unionPay:{pattern:/^(62|88)/,length:[16,17,18,19]},jcb:{pattern:/^35(2[89]|[3-8][0-9])/,length:[16]},maestro:{pattern:/^(5018|5020|5038|6304|6759|676[1-3])/,length:[12,13,14,15,16,17,18,19]},dinersClub:{pattern:/^(30[0-5]|^36)/,length:[14]},laser:{pattern:/^(6304|670[69]|6771)/,length:[16,17,18,19]},visaElectron:{pattern:/^(4026|417500|4508|4844|491(3|7))/,length:[16]}},a={},r=!1,s="string"==typeof e&&e.split(",");if("string"==typeof n&&0!==n.length){if(n=n.replace(/[\-]/g,""),s&&(F.each(s,function(e,t){(i=o[t])&&(a={length:-1!==F.inArray(n.length,i.length),pattern:-1!==n.search(i.pattern)}).length&&a.pattern&&(r=!0)}),!r))return!1;if((t={number:-1!==F.inArray(n.length,o.unionPay.length),pattern:-1!==n.search(o.unionPay.pattern)}).number&&t.pattern)return!0;for(var l=n.length,c=0,u=[[0,1,2,3,4,5,6,7,8,9],[0,2,4,6,8,1,3,5,7,9]],d=0;l--;)d+=u[c][parseInt(n.charAt(l),10)],c^=1;return d%10==0&&0<d}},minCount:function(e,t){return 0==t||(1==t?""!==e:e.split(",").length>=t)},exactCount:function(e,t){return 0==t?""===e:1==t?""!==e&&-1===e.search(","):e.split(",").length==t},maxCount:function(e,t){return 0!=t&&(1==t?-1===e.search(","):e.split(",").length<=t)}}}}(jQuery,window,document),function(S,k,e,T){"use strict";k=void 0!==k&&k.Math==Math?k:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),S.fn.accordion=function(a){var v,r=S(this),b=(new Date).getTime(),y=[],x=a,C="string"==typeof x,w=[].slice.call(arguments,1);k.requestAnimationFrame||k.mozRequestAnimationFrame||k.webkitRequestAnimationFrame||k.msRequestAnimationFrame;return r.each(function(){var e,c,u=S.isPlainObject(a)?S.extend(!0,{},S.fn.accordion.settings,a):S.extend({},S.fn.accordion.settings),d=u.className,t=u.namespace,f=u.selector,s=u.error,n="."+t,i="module-"+t,o=r.selector||"",m=S(this),g=m.find(f.title),p=m.find(f.content),l=this,h=m.data(i);c={initialize:function(){c.debug("Initializing",m),c.bind.events(),u.observeChanges&&c.observeChanges(),c.instantiate()},instantiate:function(){h=c,m.data(i,c)},destroy:function(){c.debug("Destroying previous instance",m),m.off(n).removeData(i)},refresh:function(){g=m.find(f.title),p=m.find(f.content)},observeChanges:function(){"MutationObserver"in k&&((e=new MutationObserver(function(e){c.debug("DOM tree modified, updating selector cache"),c.refresh()})).observe(l,{childList:!0,subtree:!0}),c.debug("Setting up mutation observer",e))},bind:{events:function(){c.debug("Binding delegated events"),m.on(u.on+n,f.trigger,c.event.click)}},event:{click:function(){c.toggle.call(this)}},toggle:function(e){var t=e!==T?"number"==typeof e?g.eq(e):S(e).closest(f.title):S(this).closest(f.title),n=t.next(p),i=n.hasClass(d.animating),o=n.hasClass(d.active),a=o&&!i,r=!o&&i;c.debug("Toggling visibility of content",t),a||r?u.collapsible?c.close.call(t):c.debug("Cannot close accordion content collapsing is disabled"):c.open.call(t)},open:function(e){var t=e!==T?"number"==typeof e?g.eq(e):S(e).closest(f.title):S(this).closest(f.title),n=t.next(p),i=n.hasClass(d.animating);n.hasClass(d.active)||i?c.debug("Accordion already open, skipping",n):(c.debug("Opening accordion content",t),u.onOpening.call(n),u.onChanging.call(n),u.exclusive&&c.closeOthers.call(t),t.addClass(d.active),n.stop(!0,!0).addClass(d.animating),u.animateChildren&&(S.fn.transition!==T&&m.transition("is supported")?n.children().transition({animation:"fade in",queue:!1,useFailSafe:!0,debug:u.debug,verbose:u.verbose,duration:u.duration}):n.children().stop(!0,!0).animate({opacity:1},u.duration,c.resetOpacity)),n.slideDown(u.duration,u.easing,function(){n.removeClass(d.animating).addClass(d.active),c.reset.display.call(this),u.onOpen.call(this),u.onChange.call(this)}))},close:function(e){var t=e!==T?"number"==typeof e?g.eq(e):S(e).closest(f.title):S(this).closest(f.title),n=t.next(p),i=n.hasClass(d.animating),o=n.hasClass(d.active);!o&&!(!o&&i)||o&&i||(c.debug("Closing accordion content",n),u.onClosing.call(n),u.onChanging.call(n),t.removeClass(d.active),n.stop(!0,!0).addClass(d.animating),u.animateChildren&&(S.fn.transition!==T&&m.transition("is supported")?n.children().transition({animation:"fade out",queue:!1,useFailSafe:!0,debug:u.debug,verbose:u.verbose,duration:u.duration}):n.children().stop(!0,!0).animate({opacity:0},u.duration,c.resetOpacity)),n.slideUp(u.duration,u.easing,function(){n.removeClass(d.animating).removeClass(d.active),c.reset.display.call(this),u.onClose.call(this),u.onChange.call(this)}))},closeOthers:function(e){var t,n,i,o=e!==T?g.eq(e):S(this).closest(f.title),a=o.parents(f.content).prev(f.title),r=o.closest(f.accordion),s=f.title+"."+d.active+":visible",l=f.content+"."+d.active+":visible";i=u.closeNested?(t=r.find(s).not(a)).next(p):(t=r.find(s).not(a),n=r.find(l).find(s).not(a),(t=t.not(n)).next(p)),0<t.length&&(c.debug("Exclusive enabled, closing other content",t),t.removeClass(d.active),i.removeClass(d.animating).stop(!0,!0),u.animateChildren&&(S.fn.transition!==T&&m.transition("is supported")?i.children().transition({animation:"fade out",useFailSafe:!0,debug:u.debug,verbose:u.verbose,duration:u.duration}):i.children().stop(!0,!0).animate({opacity:0},u.duration,c.resetOpacity)),i.slideUp(u.duration,u.easing,function(){S(this).removeClass(d.active),c.reset.display.call(this)}))},reset:{display:function(){c.verbose("Removing inline display from element",this),S(this).css("display",""),""===S(this).attr("style")&&S(this).attr("style","").removeAttr("style")},opacity:function(){c.verbose("Removing inline opacity from element",this),S(this).css("opacity",""),""===S(this).attr("style")&&S(this).attr("style","").removeAttr("style")}},setting:function(e,t){if(c.debug("Changing setting",e,t),S.isPlainObject(e))S.extend(!0,u,e);else{if(t===T)return u[e];S.isPlainObject(u[e])?S.extend(!0,u[e],t):u[e]=t}},internal:function(e,t){if(c.debug("Changing internal",e,t),t===T)return c[e];S.isPlainObject(e)?S.extend(!0,c,e):c[e]=t},debug:function(){!u.silent&&u.debug&&(u.performance?c.performance.log(arguments):(c.debug=Function.prototype.bind.call(console.info,console,u.name+":"),c.debug.apply(console,arguments)))},verbose:function(){!u.silent&&u.verbose&&u.debug&&(u.performance?c.performance.log(arguments):(c.verbose=Function.prototype.bind.call(console.info,console,u.name+":"),c.verbose.apply(console,arguments)))},error:function(){u.silent||(c.error=Function.prototype.bind.call(console.error,console,u.name+":"),c.error.apply(console,arguments))},performance:{log:function(e){var t,n;u.performance&&(n=(t=(new Date).getTime())-(b||t),b=t,y.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(c.performance.timer),c.performance.timer=setTimeout(c.performance.display,500)},display:function(){var e=u.name+":",n=0;b=!1,clearTimeout(c.performance.timer),S.each(y,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",o&&(e+=" '"+o+"'"),(console.group!==T||console.table!==T)&&0<y.length&&(console.groupCollapsed(e),console.table?console.table(y):S.each(y,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),y=[]}},invoke:function(i,e,t){var o,a,n,r=h;return e=e||w,t=l||t,"string"==typeof i&&r!==T&&(i=i.split(/[\. ]/),o=i.length-1,S.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(S.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==T)return a=r[n],!1;if(!S.isPlainObject(r[t])||e==o)return r[t]!==T?a=r[t]:c.error(s.method,i),!1;r=r[t]}})),S.isFunction(a)?n=a.apply(t,e):a!==T&&(n=a),S.isArray(v)?v.push(n):v!==T?v=[v,n]:n!==T&&(v=n),a}},C?(h===T&&c.initialize(),c.invoke(x)):(h!==T&&h.invoke("destroy"),c.initialize())}),v!==T?v:this},S.fn.accordion.settings={name:"Accordion",namespace:"accordion",silent:!1,debug:!1,verbose:!1,performance:!0,on:"click",observeChanges:!0,exclusive:!0,collapsible:!0,closeNested:!1,animateChildren:!0,duration:350,easing:"easeOutQuad",onOpening:function(){},onClosing:function(){},onChanging:function(){},onOpen:function(){},onClose:function(){},onChange:function(){},error:{method:"The method you called is not defined"},className:{active:"active",animating:"animating"},selector:{accordion:".accordion",title:".title",trigger:".title",content:".content"}},S.extend(S.easing,{easeOutQuad:function(e,t,n,i,o){return-i*(t/=o)*(t-2)+n}})}(jQuery,window,document),function(T,A,R,P){"use strict";A=void 0!==A&&A.Math==Math?A:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),T.fn.checkbox=function(v){var b,e=T(this),y=e.selector||"",x=(new Date).getTime(),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1);return e.each(function(){var e,s,i=T.extend(!0,{},T.fn.checkbox.settings,v),t=i.className,n=i.namespace,o=i.selector,l=i.error,a="."+n,r="module-"+n,c=T(this),u=T(this).children(o.label),d=T(this).children(o.input),f=d[0],m=!1,g=!1,p=c.data(r),h=this;s={initialize:function(){s.verbose("Initializing checkbox",i),s.create.label(),s.bind.events(),s.set.tabbable(),s.hide.input(),s.observeChanges(),s.instantiate(),s.setup()},instantiate:function(){s.verbose("Storing instance of module",s),p=s,c.data(r,s)},destroy:function(){s.verbose("Destroying module"),s.unbind.events(),s.show.input(),c.removeData(r)},fix:{reference:function(){c.is(o.input)&&(s.debug("Behavior called on <input> adjusting invoked element"),c=c.closest(o.checkbox),s.refresh())}},setup:function(){s.set.initialLoad(),s.is.indeterminate()?(s.debug("Initial value is indeterminate"),s.indeterminate()):s.is.checked()?(s.debug("Initial value is checked"),s.check()):(s.debug("Initial value is unchecked"),s.uncheck()),s.remove.initialLoad()},refresh:function(){u=c.children(o.label),d=c.children(o.input),f=d[0]},hide:{input:function(){s.verbose("Modifying <input> z-index to be unselectable"),d.addClass(t.hidden)}},show:{input:function(){s.verbose("Modifying <input> z-index to be selectable"),d.removeClass(t.hidden)}},observeChanges:function(){"MutationObserver"in A&&((e=new MutationObserver(function(e){s.debug("DOM tree modified, updating selector cache"),s.refresh()})).observe(h,{childList:!0,subtree:!0}),s.debug("Setting up mutation observer",e))},attachEvents:function(e,t){var n=T(e);t=T.isFunction(s[t])?s[t]:s.toggle,0<n.length?(s.debug("Attaching checkbox events to element",e,t),n.on("click"+a,t)):s.error(l.notFound)},event:{click:function(e){var t=T(e.target);t.is(o.input)?s.verbose("Using default check action on initialized checkbox"):t.is(o.link)?s.debug("Clicking link inside checkbox, skipping toggle"):(s.toggle(),d.focus(),e.preventDefault())},keydown:function(e){var t=e.which,n=13,i=32;g=t==27?(s.verbose("Escape key pressed blurring field"),d.blur(),!0):!(e.ctrlKey||t!=i&&t!=n)&&(s.verbose("Enter/space key pressed, toggling checkbox"),s.toggle(),!0)},keyup:function(e){g&&e.preventDefault()}},check:function(){s.should.allowCheck()&&(s.debug("Checking checkbox",d),s.set.checked(),s.should.ignoreCallbacks()||(i.onChecked.call(f),i.onChange.call(f)))},uncheck:function(){s.should.allowUncheck()&&(s.debug("Unchecking checkbox"),s.set.unchecked(),s.should.ignoreCallbacks()||(i.onUnchecked.call(f),i.onChange.call(f)))},indeterminate:function(){s.should.allowIndeterminate()?s.debug("Checkbox is already indeterminate"):(s.debug("Making checkbox indeterminate"),s.set.indeterminate(),s.should.ignoreCallbacks()||(i.onIndeterminate.call(f),i.onChange.call(f)))},determinate:function(){s.should.allowDeterminate()?s.debug("Checkbox is already determinate"):(s.debug("Making checkbox determinate"),s.set.determinate(),s.should.ignoreCallbacks()||(i.onDeterminate.call(f),i.onChange.call(f)))},enable:function(){s.is.enabled()?s.debug("Checkbox is already enabled"):(s.debug("Enabling checkbox"),s.set.enabled(),i.onEnable.call(f),i.onEnabled.call(f))},disable:function(){s.is.disabled()?s.debug("Checkbox is already disabled"):(s.debug("Disabling checkbox"),s.set.disabled(),i.onDisable.call(f),i.onDisabled.call(f))},get:{radios:function(){var e=s.get.name();return T('input[name="'+e+'"]').closest(o.checkbox)},otherRadios:function(){return s.get.radios().not(c)},name:function(){return d.attr("name")}},is:{initialLoad:function(){return m},radio:function(){return d.hasClass(t.radio)||"radio"==d.attr("type")},indeterminate:function(){return d.prop("indeterminate")!==P&&d.prop("indeterminate")},checked:function(){return d.prop("checked")!==P&&d.prop("checked")},disabled:function(){return d.prop("disabled")!==P&&d.prop("disabled")},enabled:function(){return!s.is.disabled()},determinate:function(){return!s.is.indeterminate()},unchecked:function(){return!s.is.checked()}},should:{allowCheck:function(){return s.is.determinate()&&s.is.checked()&&!s.should.forceCallbacks()?(s.debug("Should not allow check, checkbox is already checked"),!1):!1!==i.beforeChecked.apply(f)||(s.debug("Should not allow check, beforeChecked cancelled"),!1)},allowUncheck:function(){return s.is.determinate()&&s.is.unchecked()&&!s.should.forceCallbacks()?(s.debug("Should not allow uncheck, checkbox is already unchecked"),!1):!1!==i.beforeUnchecked.apply(f)||(s.debug("Should not allow uncheck, beforeUnchecked cancelled"),!1)},allowIndeterminate:function(){return s.is.indeterminate()&&!s.should.forceCallbacks()?(s.debug("Should not allow indeterminate, checkbox is already indeterminate"),!1):!1!==i.beforeIndeterminate.apply(f)||(s.debug("Should not allow indeterminate, beforeIndeterminate cancelled"),!1)},allowDeterminate:function(){return s.is.determinate()&&!s.should.forceCallbacks()?(s.debug("Should not allow determinate, checkbox is already determinate"),!1):!1!==i.beforeDeterminate.apply(f)||(s.debug("Should not allow determinate, beforeDeterminate cancelled"),!1)},forceCallbacks:function(){return s.is.initialLoad()&&i.fireOnInit},ignoreCallbacks:function(){return m&&!i.fireOnInit}},can:{change:function(){return!(c.hasClass(t.disabled)||c.hasClass(t.readOnly)||d.prop("disabled")||d.prop("readonly"))},uncheck:function(){return"boolean"==typeof i.uncheckable?i.uncheckable:!s.is.radio()}},set:{initialLoad:function(){m=!0},checked:function(){s.verbose("Setting class to checked"),c.removeClass(t.indeterminate).addClass(t.checked),s.is.radio()&&s.uncheckOthers(),s.is.indeterminate()||!s.is.checked()?(s.verbose("Setting state to checked",f),d.prop("indeterminate",!1).prop("checked",!0),s.trigger.change()):s.debug("Input is already checked, skipping input property change")},unchecked:function(){s.verbose("Removing checked class"),c.removeClass(t.indeterminate).removeClass(t.checked),s.is.indeterminate()||!s.is.unchecked()?(s.debug("Setting state to unchecked"),d.prop("indeterminate",!1).prop("checked",!1),s.trigger.change()):s.debug("Input is already unchecked")},indeterminate:function(){s.verbose("Setting class to indeterminate"),c.addClass(t.indeterminate),s.is.indeterminate()?s.debug("Input is already indeterminate, skipping input property change"):(s.debug("Setting state to indeterminate"),d.prop("indeterminate",!0),s.trigger.change())},determinate:function(){s.verbose("Removing indeterminate class"),c.removeClass(t.indeterminate),s.is.determinate()?s.debug("Input is already determinate, skipping input property change"):(s.debug("Setting state to determinate"),d.prop("indeterminate",!1))},disabled:function(){s.verbose("Setting class to disabled"),c.addClass(t.disabled),s.is.disabled()?s.debug("Input is already disabled, skipping input property change"):(s.debug("Setting state to disabled"),d.prop("disabled","disabled"),s.trigger.change())},enabled:function(){s.verbose("Removing disabled class"),c.removeClass(t.disabled),s.is.enabled()?s.debug("Input is already enabled, skipping input property change"):(s.debug("Setting state to enabled"),d.prop("disabled",!1),s.trigger.change())},tabbable:function(){s.verbose("Adding tabindex to checkbox"),d.attr("tabindex")===P&&d.attr("tabindex",0)}},remove:{initialLoad:function(){m=!1}},trigger:{change:function(){var e=R.createEvent("HTMLEvents"),t=d[0];t&&(s.verbose("Triggering native change event"),e.initEvent("change",!0,!1),t.dispatchEvent(e))}},create:{label:function(){0<d.prevAll(o.label).length?(d.prev(o.label).detach().insertAfter(d),s.debug("Moving existing label",u)):s.has.label()||(u=T("<label>").insertAfter(d),s.debug("Creating label",u))}},has:{label:function(){return 0<u.length}},bind:{events:function(){s.verbose("Attaching checkbox events"),c.on("click"+a,s.event.click).on("keydown"+a,o.input,s.event.keydown).on("keyup"+a,o.input,s.event.keyup)}},unbind:{events:function(){s.debug("Removing events"),c.off(a)}},uncheckOthers:function(){var e=s.get.otherRadios();s.debug("Unchecking other radios",e),e.removeClass(t.checked)},toggle:function(){s.can.change()?s.is.indeterminate()||s.is.unchecked()?(s.debug("Currently unchecked"),s.check()):s.is.checked()&&s.can.uncheck()&&(s.debug("Currently checked"),s.uncheck()):s.is.radio()||s.debug("Checkbox is read-only or disabled, ignoring toggle")},setting:function(e,t){if(s.debug("Changing setting",e,t),T.isPlainObject(e))T.extend(!0,i,e);else{if(t===P)return i[e];T.isPlainObject(i[e])?T.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(T.isPlainObject(e))T.extend(!0,s,e);else{if(t===P)return s[e];s[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,i.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),s.verbose.apply(console,arguments)))},error:function(){i.silent||(s.error=Function.prototype.bind.call(console.error,console,i.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:h,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=i.name+":",n=0;x=!1,clearTimeout(s.performance.timer),T.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",y&&(e+=" '"+y+"'"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):T.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=p;return e=e||k,t=h||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,T.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(T.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!T.isPlainObject(r[t])||e==o)return r[t]!==P?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),T.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),T.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}},S?(p===P&&s.initialize(),s.invoke(w)):(p!==P&&p.invoke("destroy"),s.initialize())}),b!==P?b:this},T.fn.checkbox.settings={name:"Checkbox",namespace:"checkbox",silent:!1,debug:!1,verbose:!0,performance:!0,uncheckable:"auto",fireOnInit:!1,onChange:function(){},beforeChecked:function(){},beforeUnchecked:function(){},beforeDeterminate:function(){},beforeIndeterminate:function(){},onChecked:function(){},onUnchecked:function(){},onDeterminate:function(){},onIndeterminate:function(){},onEnable:function(){},onDisable:function(){},onEnabled:function(){},onDisabled:function(){},className:{checked:"checked",indeterminate:"indeterminate",disabled:"disabled",hidden:"hidden",radio:"radio",readOnly:"read-only"},error:{method:"The method you called is not defined"},selector:{checkbox:".ui.checkbox",label:"label, .box",input:'input[type="checkbox"], input[type="radio"]',link:"a[href]"}}}(jQuery,window,document),function(S,e,k,T){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),S.fn.dimmer=function(p){var h,v=S(this),b=(new Date).getTime(),y=[],x=p,C="string"==typeof x,w=[].slice.call(arguments,1);return v.each(function(){var a,t,s,r=S.isPlainObject(p)?S.extend(!0,{},S.fn.dimmer.settings,p):S.extend({},S.fn.dimmer.settings),n=r.selector,e=r.namespace,i=r.className,l=r.error,o="."+e,c="module-"+e,u=v.selector||"",d="ontouchstart"in k.documentElement?"touchstart":"click",f=S(this),m=this,g=f.data(c);(s={preinitialize:function(){a=s.is.dimmer()?(t=f.parent(),f):(t=f,s.has.dimmer()?r.dimmerName?t.find(n.dimmer).filter("."+r.dimmerName):t.find(n.dimmer):s.create())},initialize:function(){s.debug("Initializing dimmer",r),s.bind.events(),s.set.dimmable(),s.instantiate()},instantiate:function(){s.verbose("Storing instance of module",s),g=s,f.data(c,g)},destroy:function(){s.verbose("Destroying previous module",a),s.unbind.events(),s.remove.variation(),t.off(o)},bind:{events:function(){"hover"==r.on?t.on("mouseenter"+o,s.show).on("mouseleave"+o,s.hide):"click"==r.on&&t.on(d+o,s.toggle),s.is.page()&&(s.debug("Setting as a page dimmer",t),s.set.pageDimmer()),s.is.closable()&&(s.verbose("Adding dimmer close event",a),t.on(d+o,n.dimmer,s.event.click))}},unbind:{events:function(){f.removeData(c),t.off(o)}},event:{click:function(e){s.verbose("Determining if event occured on dimmer",e),(0===a.find(e.target).length||S(e.target).is(n.content))&&(s.hide(),e.stopImmediatePropagation())}},addContent:function(e){var t=S(e);s.debug("Add content to dimmer",t),t.parent()[0]!==a[0]&&t.detach().appendTo(a)},create:function(){var e=S(r.template.dimmer());return r.dimmerName&&(s.debug("Creating named dimmer",r.dimmerName),e.addClass(r.dimmerName)),e.appendTo(t),e},show:function(e){e=S.isFunction(e)?e:function(){},s.debug("Showing dimmer",a,r),s.set.variation(),s.is.dimmed()&&!s.is.animating()||!s.is.enabled()?s.debug("Dimmer is already shown or disabled"):(s.animate.show(e),r.onShow.call(m),r.onChange.call(m))},hide:function(e){e=S.isFunction(e)?e:function(){},s.is.dimmed()||s.is.animating()?(s.debug("Hiding dimmer",a),s.animate.hide(e),r.onHide.call(m),r.onChange.call(m)):s.debug("Dimmer is not visible")},toggle:function(){s.verbose("Toggling dimmer visibility",a),s.is.dimmed()?s.hide():s.show()},animate:{show:function(e){e=S.isFunction(e)?e:function(){},r.useCSS&&S.fn.transition!==T&&a.transition("is supported")?(r.useFlex?(s.debug("Using flex dimmer"),s.remove.legacy()):(s.debug("Using legacy non-flex dimmer"),s.set.legacy()),"auto"!==r.opacity&&s.set.opacity(),a.transition({displayType:r.useFlex?"flex":"block",animation:r.transition+" in",queue:!1,duration:s.get.duration(),useFailSafe:!0,onStart:function(){s.set.dimmed()},onComplete:function(){s.set.active(),e()}})):(s.verbose("Showing dimmer animation with javascript"),s.set.dimmed(),"auto"==r.opacity&&(r.opacity=.8),a.stop().css({opacity:0,width:"100%",height:"100%"}).fadeTo(s.get.duration(),r.opacity,function(){a.removeAttr("style"),s.set.active(),e()}))},hide:function(e){e=S.isFunction(e)?e:function(){},r.useCSS&&S.fn.transition!==T&&a.transition("is supported")?(s.verbose("Hiding dimmer with css"),a.transition({displayType:r.useFlex?"flex":"block",animation:r.transition+" out",queue:!1,duration:s.get.duration(),useFailSafe:!0,onStart:function(){s.remove.dimmed()},onComplete:function(){s.remove.variation(),s.remove.active(),e()}})):(s.verbose("Hiding dimmer with javascript"),s.remove.dimmed(),a.stop().fadeOut(s.get.duration(),function(){s.remove.active(),a.removeAttr("style"),e()}))}},get:{dimmer:function(){return a},duration:function(){return"object"==typeof r.duration?s.is.active()?r.duration.hide:r.duration.show:r.duration}},has:{dimmer:function(){return r.dimmerName?0<f.find(n.dimmer).filter("."+r.dimmerName).length:0<f.find(n.dimmer).length}},is:{active:function(){return a.hasClass(i.active)},animating:function(){return a.is(":animated")||a.hasClass(i.animating)},closable:function(){return"auto"==r.closable?"hover"!=r.on:r.closable},dimmer:function(){return f.hasClass(i.dimmer)},dimmable:function(){return f.hasClass(i.dimmable)},dimmed:function(){return t.hasClass(i.dimmed)},disabled:function(){return t.hasClass(i.disabled)},enabled:function(){return!s.is.disabled()},page:function(){return t.is("body")},pageDimmer:function(){return a.hasClass(i.pageDimmer)}},can:{show:function(){return!a.hasClass(i.disabled)}},set:{opacity:function(e){var t=a.css("background-color"),n=t.split(","),i=n&&3==n.length,o=n&&4==n.length;e=0===r.opacity?0:r.opacity||e,t=i||o?(n[3]=e+")",n.join(",")):"rgba(0, 0, 0, "+e+")",s.debug("Setting opacity to",e),a.css("background-color",t)},legacy:function(){a.addClass(i.legacy)},active:function(){a.addClass(i.active)},dimmable:function(){t.addClass(i.dimmable)},dimmed:function(){t.addClass(i.dimmed)},pageDimmer:function(){a.addClass(i.pageDimmer)},disabled:function(){a.addClass(i.disabled)},variation:function(e){(e=e||r.variation)&&a.addClass(e)}},remove:{active:function(){a.removeClass(i.active)},legacy:function(){a.removeClass(i.legacy)},dimmed:function(){t.removeClass(i.dimmed)},disabled:function(){a.removeClass(i.disabled)},variation:function(e){(e=e||r.variation)&&a.removeClass(e)}},setting:function(e,t){if(s.debug("Changing setting",e,t),S.isPlainObject(e))S.extend(!0,r,e);else{if(t===T)return r[e];S.isPlainObject(r[e])?S.extend(!0,r[e],t):r[e]=t}},internal:function(e,t){if(S.isPlainObject(e))S.extend(!0,s,e);else{if(t===T)return s[e];s[e]=t}},debug:function(){!r.silent&&r.debug&&(r.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,r.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!r.silent&&r.verbose&&r.debug&&(r.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,r.name+":"),s.verbose.apply(console,arguments)))},error:function(){r.silent||(s.error=Function.prototype.bind.call(console.error,console,r.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;r.performance&&(n=(t=(new Date).getTime())-(b||t),b=t,y.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:m,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=r.name+":",n=0;b=!1,clearTimeout(s.performance.timer),S.each(y,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",u&&(e+=" '"+u+"'"),1<v.length&&(e+=" ("+v.length+")"),(console.group!==T||console.table!==T)&&0<y.length&&(console.groupCollapsed(e),console.table?console.table(y):S.each(y,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),y=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||w,t=m||t,"string"==typeof i&&r!==T&&(i=i.split(/[\. ]/),o=i.length-1,S.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(S.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==T)return a=r[n],!1;if(!S.isPlainObject(r[t])||e==o)return r[t]!==T?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),S.isFunction(a)?n=a.apply(t,e):a!==T&&(n=a),S.isArray(h)?h.push(n):h!==T?h=[h,n]:n!==T&&(h=n),a}}).preinitialize(),C?(g===T&&s.initialize(),s.invoke(x)):(g!==T&&g.invoke("destroy"),s.initialize())}),h!==T?h:this},S.fn.dimmer.settings={name:"Dimmer",namespace:"dimmer",silent:!1,debug:!1,verbose:!1,performance:!0,useFlex:!0,dimmerName:!1,variation:!1,closable:"auto",useCSS:!0,transition:"fade",on:!1,opacity:"auto",duration:{show:500,hide:500},onChange:function(){},onShow:function(){},onHide:function(){},error:{method:"The method you called is not defined."},className:{active:"active",animating:"animating",dimmable:"dimmable",dimmed:"dimmed",dimmer:"dimmer",disabled:"disabled",hide:"hide",legacy:"legacy",pageDimmer:"page",show:"show"},selector:{dimmer:"> .ui.dimmer",content:".ui.dimmer > .content, .ui.dimmer > .content > .center"},template:{dimmer:function(){return S("<div />").attr("class","ui dimmer")}}}}(jQuery,window,document),function(Y,Z,K,J){"use strict";Z=void 0!==Z&&Z.Math==Math?Z:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),Y.fn.dropdown=function(M){var L,V=Y(this),N=Y(K),H=V.selector||"",U="ontouchstart"in K.documentElement,W=(new Date).getTime(),B=[],Q=M,X="string"==typeof Q,$=[].slice.call(arguments,1);return V.each(function(n){var e,t,i,o,a,r,s,g,p=Y.isPlainObject(M)?Y.extend(!0,{},Y.fn.dropdown.settings,M):Y.extend({},Y.fn.dropdown.settings),h=p.className,c=p.message,l=p.fields,v=p.keys,b=p.metadata,u=p.namespace,d=p.regExp,y=p.selector,f=p.error,m=p.templates,x="."+u,C="module-"+u,w=Y(this),S=Y(p.context),k=w.find(y.text),T=w.find(y.search),A=w.find(y.sizer),R=w.find(y.input),P=w.find(y.icon),E=0<w.prev().find(y.text).length?w.prev().find(y.text):w.prev(),F=w.children(y.menu),O=F.find(y.item),D=!1,q=!1,j=!1,z=this,I=w.data(C);g={initialize:function(){g.debug("Initializing dropdown",p),g.is.alreadySetup()?g.setup.reference():(g.setup.layout(),p.values&&g.change.values(p.values),g.refreshData(),g.save.defaults(),g.restore.selected(),g.create.id(),g.bind.events(),g.observeChanges(),g.instantiate())},instantiate:function(){g.verbose("Storing instance of dropdown",g),I=g,w.data(C,g)},destroy:function(){g.verbose("Destroying previous dropdown",w),g.remove.tabbable(),w.off(x).removeData(C),F.off(x),N.off(o),g.disconnect.menuObserver(),g.disconnect.selectObserver()},observeChanges:function(){"MutationObserver"in Z&&(r=new MutationObserver(g.event.select.mutation),s=new MutationObserver(g.event.menu.mutation),g.debug("Setting up mutation observer",r,s),g.observe.select(),g.observe.menu())},disconnect:{menuObserver:function(){s&&s.disconnect()},selectObserver:function(){r&&r.disconnect()}},observe:{select:function(){g.has.input()&&r.observe(w[0],{childList:!0,subtree:!0})},menu:function(){g.has.menu()&&s.observe(F[0],{childList:!0,subtree:!0})}},create:{id:function(){a=(Math.random().toString(16)+"000000000").substr(2,8),o="."+a,g.verbose("Creating unique id for element",a)},userChoice:function(e){var n,i,o;return!!(e=e||g.get.userValues())&&(e=Y.isArray(e)?e:[e],Y.each(e,function(e,t){!1===g.get.item(t)&&(o=p.templates.addition(g.add.variables(c.addResult,t)),i=Y("<div />").html(o).attr("data-"+b.value,t).attr("data-"+b.text,t).addClass(h.addition).addClass(h.item),p.hideAdditions&&i.addClass(h.hidden),n=n===J?i:n.add(i),g.verbose("Creating user choices for value",t,i))}),n)},userLabels:function(e){var t=g.get.userValues();t&&(g.debug("Adding user labels",t),Y.each(t,function(e,t){g.verbose("Adding custom user value"),g.add.label(t,t)}))},menu:function(){F=Y("<div />").addClass(h.menu).appendTo(w)},sizer:function(){A=Y("<span />").addClass(h.sizer).insertAfter(T)}},search:function(e){e=e!==J?e:g.get.query(),g.verbose("Searching for query",e),g.has.minCharacters(e)?g.filter(e):g.hide()},select:{firstUnfiltered:function(){g.verbose("Selecting first non-filtered element"),g.remove.selectedItem(),O.not(y.unselectable).not(y.addition+y.hidden).eq(0).addClass(h.selected)},nextAvailable:function(e){var t=(e=e.eq(0)).nextAll(y.item).not(y.unselectable).eq(0),n=e.prevAll(y.item).not(y.unselectable).eq(0);0<t.length?(g.verbose("Moving selection to",t),t.addClass(h.selected)):(g.verbose("Moving selection to",n),n.addClass(h.selected))}},setup:{api:function(){var e={debug:p.debug,urlData:{value:g.get.value(),query:g.get.query()},on:!1};g.verbose("First request, initializing API"),w.api(e)},layout:function(){w.is("select")&&(g.setup.select(),g.setup.returnedObject()),g.has.menu()||g.create.menu(),g.is.search()&&!g.has.search()&&(g.verbose("Adding search input"),T=Y("<input />").addClass(h.search).prop("autocomplete","off").insertBefore(k)),g.is.multiple()&&g.is.searchSelection()&&!g.has.sizer()&&g.create.sizer(),p.allowTab&&g.set.tabbable()},select:function(){var e=g.get.selectValues();g.debug("Dropdown initialized on a select",e),w.is("select")&&(R=w),0<R.parent(y.dropdown).length?(g.debug("UI dropdown already exists. Creating dropdown menu only"),w=R.closest(y.dropdown),g.has.menu()||g.create.menu(),F=w.children(y.menu),g.setup.menu(e)):(g.debug("Creating entire dropdown from select"),w=Y("<div />").attr("class",R.attr("class")).addClass(h.selection).addClass(h.dropdown).html(m.dropdown(e)).insertBefore(R),R.hasClass(h.multiple)&&!1===R.prop("multiple")&&(g.error(f.missingMultiple),R.prop("multiple",!0)),R.is("[multiple]")&&g.set.multiple(),R.prop("disabled")&&(g.debug("Disabling dropdown"),w.addClass(h.disabled)),R.removeAttr("class").detach().prependTo(w)),g.refresh()},menu:function(e){F.html(m.menu(e,l)),O=F.find(y.item)},reference:function(){g.debug("Dropdown behavior was called on select, replacing with closest dropdown"),w=w.parent(y.dropdown),I=w.data(C),z=w.get(0),g.refresh(),g.setup.returnedObject()},returnedObject:function(){var e=V.slice(0,n),t=V.slice(n+1);V=e.add(w).add(t)}},refresh:function(){g.refreshSelectors(),g.refreshData()},refreshItems:function(){O=F.find(y.item)},refreshSelectors:function(){g.verbose("Refreshing selector cache"),k=w.find(y.text),T=w.find(y.search),R=w.find(y.input),P=w.find(y.icon),E=0<w.prev().find(y.text).length?w.prev().find(y.text):w.prev(),F=w.children(y.menu),O=F.find(y.item)},refreshData:function(){g.verbose("Refreshing cached metadata"),O.removeData(b.text).removeData(b.value)},clearData:function(){g.verbose("Clearing metadata"),O.removeData(b.text).removeData(b.value),w.removeData(b.defaultText).removeData(b.defaultValue).removeData(b.placeholderText)},toggle:function(){g.verbose("Toggling menu visibility"),g.is.active()?g.hide():g.show()},show:function(e){if(e=Y.isFunction(e)?e:function(){},!g.can.show()&&g.is.remote()&&(g.debug("No API results retrieved, searching before show"),g.queryRemote(g.get.query(),g.show)),g.can.show()&&!g.is.active()){if(g.debug("Showing dropdown"),!g.has.message()||g.has.maxSelections()||g.has.allResultsFiltered()||g.remove.message(),g.is.allFiltered())return!0;!1!==p.onShow.call(z)&&g.animate.show(function(){g.can.click()&&g.bind.intent(),g.has.menuSearch()&&g.focusSearch(),g.set.visible(),e.call(z)})}},hide:function(e){e=Y.isFunction(e)?e:function(){},g.is.active()&&!g.is.animatingOutward()&&(g.debug("Hiding dropdown"),!1!==p.onHide.call(z)&&g.animate.hide(function(){g.remove.visible(),e.call(z)}))},hideOthers:function(){g.verbose("Finding other dropdowns to hide"),V.not(w).has(y.menu+"."+h.visible).dropdown("hide")},hideMenu:function(){g.verbose("Hiding menu  instantaneously"),g.remove.active(),g.remove.visible(),F.transition("hide")},hideSubMenus:function(){var e=F.children(y.item).find(y.menu);g.verbose("Hiding sub menus",e),e.transition("hide")},bind:{events:function(){U&&g.bind.touchEvents(),g.bind.keyboardEvents(),g.bind.inputEvents(),g.bind.mouseEvents()},touchEvents:function(){g.debug("Touch device detected binding additional touch events"),g.is.searchSelection()||g.is.single()&&w.on("touchstart"+x,g.event.test.toggle),F.on("touchstart"+x,y.item,g.event.item.mouseenter)},keyboardEvents:function(){g.verbose("Binding keyboard events"),w.on("keydown"+x,g.event.keydown),g.has.search()&&w.on(g.get.inputEvent()+x,y.search,g.event.input),g.is.multiple()&&N.on("keydown"+o,g.event.document.keydown)},inputEvents:function(){g.verbose("Binding input change events"),w.on("change"+x,y.input,g.event.change)},mouseEvents:function(){g.verbose("Binding mouse events"),g.is.multiple()&&w.on("click"+x,y.label,g.event.label.click).on("click"+x,y.remove,g.event.remove.click),g.is.searchSelection()?(w.on("mousedown"+x,g.event.mousedown).on("mouseup"+x,g.event.mouseup).on("mousedown"+x,y.menu,g.event.menu.mousedown).on("mouseup"+x,y.menu,g.event.menu.mouseup).on("click"+x,y.icon,g.event.icon.click).on("focus"+x,y.search,g.event.search.focus).on("click"+x,y.search,g.event.search.focus).on("blur"+x,y.search,g.event.search.blur).on("click"+x,y.text,g.event.text.focus),g.is.multiple()&&w.on("click"+x,g.event.click)):("click"==p.on?w.on("click"+x,g.event.test.toggle):"hover"==p.on?w.on("mouseenter"+x,g.delay.show).on("mouseleave"+x,g.delay.hide):w.on(p.on+x,g.toggle),w.on("click"+x,y.icon,g.event.icon.click).on("mousedown"+x,g.event.mousedown).on("mouseup"+x,g.event.mouseup).on("focus"+x,g.event.focus),g.has.menuSearch()?w.on("blur"+x,y.search,g.event.search.blur):w.on("blur"+x,g.event.blur)),F.on("mouseenter"+x,y.item,g.event.item.mouseenter).on("mouseleave"+x,y.item,g.event.item.mouseleave).on("click"+x,y.item,g.event.item.click)},intent:function(){g.verbose("Binding hide intent event to document"),U&&N.on("touchstart"+o,g.event.test.touch).on("touchmove"+o,g.event.test.touch),N.on("click"+o,g.event.test.hide)}},unbind:{intent:function(){g.verbose("Removing hide intent event from document"),U&&N.off("touchstart"+o).off("touchmove"+o),N.off("click"+o)}},filter:function(e){var t=e!==J?e:g.get.query(),n=function(){g.is.multiple()&&g.filterActive(),(e||!e&&0==g.get.activeItem().length)&&g.select.firstUnfiltered(),g.has.allResultsFiltered()?p.onNoResults.call(z,t)?p.allowAdditions?p.hideAdditions&&(g.verbose("User addition with no menu, setting empty style"),g.set.empty(),g.hideMenu()):(g.verbose("All items filtered, showing message",t),g.add.message(c.noResults)):(g.verbose("All items filtered, hiding dropdown",t),g.hideMenu()):(g.remove.empty(),g.remove.message()),p.allowAdditions&&g.add.userSuggestion(e),g.is.searchSelection()&&g.can.show()&&g.is.focusedOnSearch()&&g.show()};p.useLabels&&g.has.maxSelections()||(p.apiSettings?g.can.useAPI()?g.queryRemote(t,function(){p.filterRemoteData&&g.filterItems(t),n()}):g.error(f.noAPI):(g.filterItems(t),n()))},queryRemote:function(e,n){var t={errorDuration:!1,cache:"local",throttle:p.throttle,urlData:{query:e},onError:function(){g.add.message(c.serverError),n()},onFailure:function(){g.add.message(c.serverError),n()},onSuccess:function(e){var t=e[l.remoteValues];Y.isArray(t)&&0<t.length?(g.remove.message(),g.setup.menu({values:e[l.remoteValues]})):g.add.message(c.noResults),n()}};w.api("get request")||g.setup.api(),t=Y.extend(!0,{},t,p.apiSettings),w.api("setting",t).api("query")},filterItems:function(e){var i=e!==J?e:g.get.query(),o=null,t=g.escape.string(i),a=new RegExp("^"+t,"igm");g.has.query()&&(o=[],g.verbose("Searching for matching values",i),O.each(function(){var e,t,n=Y(this);if("both"==p.match||"text"==p.match){if(-1!==(e=String(g.get.choiceText(n,!1))).search(a))return o.push(this),!0;if("exact"===p.fullTextSearch&&g.exactSearch(i,e))return o.push(this),!0;if(!0===p.fullTextSearch&&g.fuzzySearch(i,e))return o.push(this),!0}if("both"==p.match||"value"==p.match){if(-1!==(t=String(g.get.choiceValue(n,e))).search(a))return o.push(this),!0;if("exact"===p.fullTextSearch&&g.exactSearch(i,t))return o.push(this),!0;if(!0===p.fullTextSearch&&g.fuzzySearch(i,t))return o.push(this),!0}})),g.debug("Showing only matched items",i),g.remove.filteredItem(),o&&O.not(o).addClass(h.filtered)},fuzzySearch:function(e,t){var n=t.length,i=e.length;if(e=e.toLowerCase(),t=t.toLowerCase(),n<i)return!1;if(i===n)return e===t;e:for(var o=0,a=0;o<i;o++){for(var r=e.charCodeAt(o);a<n;)if(t.charCodeAt(a++)===r)continue e;return!1}return!0},exactSearch:function(e,t){return e=e.toLowerCase(),-1<(t=t.toLowerCase()).indexOf(e)},filterActive:function(){p.useLabels&&O.filter("."+h.active).addClass(h.filtered)},focusSearch:function(e){g.has.search()&&!g.is.focusedOnSearch()&&(e?(w.off("focus"+x,y.search),T.focus(),w.on("focus"+x,y.search,g.event.search.focus)):T.focus())},forceSelection:function(){var e=O.not(h.filtered).filter("."+h.selected).eq(0),t=O.not(h.filtered).filter("."+h.active).eq(0),n=0<e.length?e:t;if(0<n.length&&!g.is.multiple())return g.debug("Forcing partial selection to selected item",n),void g.event.item.click.call(n,{},!0);p.allowAdditions&&g.set.selected(g.get.query()),g.remove.searchTerm()},change:{values:function(e){p.allowAdditions||g.clear(),g.debug("Creating dropdown with specified values",e),g.setup.menu({values:e}),Y.each(e,function(e,t){if(1==t.selected)return g.debug("Setting initial selection to",t.value),g.set.selected(t.value),!0})}},event:{change:function(){j||(g.debug("Input changed, updating selection"),g.set.selected())},focus:function(){p.showOnFocus&&!D&&g.is.hidden()&&!t&&g.show()},blur:function(e){t=K.activeElement===this,D||t||(g.remove.activeLabel(),g.hide())},mousedown:function(){g.is.searchSelection()?i=!0:D=!0},mouseup:function(){g.is.searchSelection()?i=!1:D=!1},click:function(e){Y(e.target).is(w)&&(g.is.focusedOnSearch()?g.show():g.focusSearch())},search:{focus:function(){D=!0,g.is.multiple()&&g.remove.activeLabel(),p.showOnFocus&&g.search()},blur:function(e){t=K.activeElement===this,g.is.searchSelection()&&!i&&(q||t||(p.forceSelection&&g.forceSelection(),g.hide())),i=!1}},icon:{click:function(e){P.hasClass(h.clear)?g.clear():g.can.click()&&g.toggle()}},text:{focus:function(e){D=!0,g.focusSearch()}},input:function(e){(g.is.multiple()||g.is.searchSelection())&&g.set.filtered(),clearTimeout(g.timer),g.timer=setTimeout(g.search,p.delay.search)},label:{click:function(e){var t=Y(this),n=w.find(y.label),i=n.filter("."+h.active),o=t.nextAll("."+h.active),a=t.prevAll("."+h.active),r=0<o.length?t.nextUntil(o).add(i).add(t):t.prevUntil(a).add(i).add(t);e.shiftKey?(i.removeClass(h.active),r.addClass(h.active)):e.ctrlKey?t.toggleClass(h.active):(i.removeClass(h.active),t.addClass(h.active)),p.onLabelSelect.apply(this,n.filter("."+h.active))}},remove:{click:function(){var e=Y(this).parent();e.hasClass(h.active)?g.remove.activeLabels():g.remove.activeLabels(e)}},test:{toggle:function(e){var t=g.is.multiple()?g.show:g.toggle;g.is.bubbledLabelClick(e)||g.is.bubbledIconClick(e)||g.determine.eventOnElement(e,t)&&e.preventDefault()},touch:function(e){g.determine.eventOnElement(e,function(){"touchstart"==e.type?g.timer=setTimeout(function(){g.hide()},p.delay.touch):"touchmove"==e.type&&clearTimeout(g.timer)}),e.stopPropagation()},hide:function(e){g.determine.eventInModule(e,g.hide)}},select:{mutation:function(e){g.debug("<select> modified, recreating menu");var n=!1;Y.each(e,function(e,t){if(Y(t.target).is("select")||Y(t.addedNodes).is("select"))return n=!0}),n&&(g.disconnect.selectObserver(),g.refresh(),g.setup.select(),g.set.selected(),g.observe.select())}},menu:{mutation:function(e){var t=e[0],n=t.addedNodes?Y(t.addedNodes[0]):Y(!1),i=t.removedNodes?Y(t.removedNodes[0]):Y(!1),o=n.add(i),a=o.is(y.addition)||0<o.closest(y.addition).length,r=o.is(y.message)||0<o.closest(y.message).length;a||r?(g.debug("Updating item selector cache"),g.refreshItems()):(g.debug("Menu modified, updating selector cache"),g.refresh())},mousedown:function(){q=!0},mouseup:function(){q=!1}},item:{mouseenter:function(e){var t=Y(e.target),n=Y(this),i=n.children(y.menu),o=n.siblings(y.item).children(y.menu),a=0<i.length;!(0<i.find(t).length)&&a&&(clearTimeout(g.itemTimer),g.itemTimer=setTimeout(function(){g.verbose("Showing sub-menu",i),Y.each(o,function(){g.animate.hide(!1,Y(this))}),g.animate.show(!1,i)},p.delay.show),e.preventDefault())},mouseleave:function(e){var t=Y(this).children(y.menu);0<t.length&&(clearTimeout(g.itemTimer),g.itemTimer=setTimeout(function(){g.verbose("Hiding sub-menu",t),g.animate.hide(!1,t)},p.delay.hide))},click:function(e,t){var n=Y(this),i=Y(e?e.target:""),o=n.find(y.menu),a=g.get.choiceText(n),r=g.get.choiceValue(n,a),s=0<o.length,l=0<o.find(i).length;g.has.menuSearch()&&Y(K.activeElement).blur(),l||s&&!p.allowCategorySelection||(g.is.searchSelection()&&(p.allowAdditions&&g.remove.userAddition(),g.remove.searchTerm(),g.is.focusedOnSearch()||1==t||g.focusSearch(!0)),p.useLabels||(g.remove.filteredItem(),g.set.scrollPosition(n)),g.determine.selectAction.call(this,a,r))}},document:{keydown:function(e){var t=e.which;if(g.is.inObject(t,v)){var n=w.find(y.label),i=n.filter("."+h.active),o=(i.data(b.value),n.index(i)),a=n.length,r=0<i.length,s=1<i.length,l=0===o,c=o+1==a,u=g.is.searchSelection(),d=g.is.focusedOnSearch(),f=g.is.focused(),m=d&&0===g.get.caretPosition();if(u&&!r&&!d)return;t==v.leftArrow?!f&&!m||r?r&&(e.shiftKey?g.verbose("Adding previous label to selection"):(g.verbose("Selecting previous label"),n.removeClass(h.active)),l&&!s?i.addClass(h.active):i.prev(y.siblingLabel).addClass(h.active).end(),e.preventDefault()):(g.verbose("Selecting previous label"),n.last().addClass(h.active)):t==v.rightArrow?(f&&!r&&n.first().addClass(h.active),r&&(e.shiftKey?g.verbose("Adding next label to selection"):(g.verbose("Selecting next label"),n.removeClass(h.active)),c?u?d?n.removeClass(h.active):g.focusSearch():s?i.next(y.siblingLabel).addClass(h.active):i.addClass(h.active):i.next(y.siblingLabel).addClass(h.active),e.preventDefault())):t==v.deleteKey||t==v.backspace?r?(g.verbose("Removing active labels"),c&&u&&!d&&g.focusSearch(),i.last().next(y.siblingLabel).addClass(h.active),g.remove.activeLabels(i),e.preventDefault()):m&&!r&&t==v.backspace&&(g.verbose("Removing last label on input backspace"),i=n.last().addClass(h.active),g.remove.activeLabels(i)):i.removeClass(h.active)}}},keydown:function(e){var t=e.which;if(g.is.inObject(t,v)){var n,i=O.not(y.unselectable).filter("."+h.selected).eq(0),o=F.children("."+h.active).eq(0),a=0<i.length?i:o,r=0<a.length?a.siblings(":not(."+h.filtered+")").addBack():F.children(":not(."+h.filtered+")"),s=a.children(y.menu),l=a.closest(y.menu),c=l.hasClass(h.visible)||l.hasClass(h.animating)||0<l.parent(y.menu).length,u=0<s.length,d=0<a.length,f=0<a.not(y.unselectable).length,m=t==v.delimiter&&p.allowAdditions&&g.is.multiple();if(p.allowAdditions&&p.hideAdditions&&(t==v.enter||m)&&f&&(g.verbose("Selecting item from keyboard shortcut",a),g.event.item.click.call(a,e),g.is.searchSelection()&&g.remove.searchTerm()),g.is.visible()){if((t==v.enter||m)&&(t==v.enter&&d&&u&&!p.allowCategorySelection?(g.verbose("Pressed enter on unselectable category, opening sub menu"),t=v.rightArrow):f&&(g.verbose("Selecting item from keyboard shortcut",a),g.event.item.click.call(a,e),g.is.searchSelection()&&g.remove.searchTerm()),e.preventDefault()),d&&(t==v.leftArrow&&l[0]!==F[0]&&(g.verbose("Left key pressed, closing sub-menu"),g.animate.hide(!1,l),a.removeClass(h.selected),l.closest(y.item).addClass(h.selected),e.preventDefault()),t==v.rightArrow&&u&&(g.verbose("Right key pressed, opening sub-menu"),g.animate.show(!1,s),a.removeClass(h.selected),s.find(y.item).eq(0).addClass(h.selected),e.preventDefault())),t==v.upArrow){if(n=d&&c?a.prevAll(y.item+":not("+y.unselectable+")").eq(0):O.eq(0),r.index(n)<0)return g.verbose("Up key pressed but reached top of current menu"),void e.preventDefault();g.verbose("Up key pressed, changing active item"),a.removeClass(h.selected),n.addClass(h.selected),g.set.scrollPosition(n),p.selectOnKeydown&&g.is.single()&&g.set.selectedItem(n),e.preventDefault()}if(t==v.downArrow){if(0===(n=d&&c?n=a.nextAll(y.item+":not("+y.unselectable+")").eq(0):O.eq(0)).length)return g.verbose("Down key pressed but reached bottom of current menu"),void e.preventDefault();g.verbose("Down key pressed, changing active item"),O.removeClass(h.selected),n.addClass(h.selected),g.set.scrollPosition(n),p.selectOnKeydown&&g.is.single()&&g.set.selectedItem(n),e.preventDefault()}t==v.pageUp&&(g.scrollPage("up"),e.preventDefault()),t==v.pageDown&&(g.scrollPage("down"),e.preventDefault()),t==v.escape&&(g.verbose("Escape key pressed, closing dropdown"),g.hide())}else m&&e.preventDefault(),t!=v.downArrow||g.is.visible()||(g.verbose("Down key pressed, showing dropdown"),g.show(),e.preventDefault())}else g.has.search()||g.set.selectedLetter(String.fromCharCode(t))}},trigger:{change:function(){var e=K.createEvent("HTMLEvents"),t=R[0];t&&(g.verbose("Triggering native change event"),e.initEvent("change",!0,!1),t.dispatchEvent(e))}},determine:{selectAction:function(e,t){g.verbose("Determining action",p.action),Y.isFunction(g.action[p.action])?(g.verbose("Triggering preset action",p.action,e,t),g.action[p.action].call(z,e,t,this)):Y.isFunction(p.action)?(g.verbose("Triggering user action",p.action,e,t),p.action.call(z,e,t,this)):g.error(f.action,p.action)},eventInModule:function(e,t){var n=Y(e.target),i=0<n.closest(K.documentElement).length,o=0<n.closest(w).length;return t=Y.isFunction(t)?t:function(){},i&&!o?(g.verbose("Triggering event",t),t(),!0):(g.verbose("Event occurred in dropdown, canceling callback"),!1)},eventOnElement:function(e,t){var n=Y(e.target),i=n.closest(y.siblingLabel),o=K.body.contains(e.target),a=0===w.find(i).length,r=0===n.closest(F).length;return t=Y.isFunction(t)?t:function(){},o&&a&&r?(g.verbose("Triggering event",t),t(),!0):(g.verbose("Event occurred in dropdown menu, canceling callback"),!1)}},action:{nothing:function(){},activate:function(e,t,n){if(t=t!==J?t:e,g.can.activate(Y(n))){if(g.set.selected(t,Y(n)),g.is.multiple()&&!g.is.allFiltered())return;g.hideAndClear()}},select:function(e,t,n){if(t=t!==J?t:e,g.can.activate(Y(n))){if(g.set.value(t,e,Y(n)),g.is.multiple()&&!g.is.allFiltered())return;g.hideAndClear()}},combo:function(e,t,n){t=t!==J?t:e,g.set.selected(t,Y(n)),g.hideAndClear()},hide:function(e,t,n){g.set.value(t,e,Y(n)),g.hideAndClear()}},get:{id:function(){return a},defaultText:function(){return w.data(b.defaultText)},defaultValue:function(){return w.data(b.defaultValue)},placeholderText:function(){return"auto"!=p.placeholder&&"string"==typeof p.placeholder?p.placeholder:w.data(b.placeholderText)||""},text:function(){return k.text()},query:function(){return Y.trim(T.val())},searchWidth:function(e){return e=e!==J?e:T.val(),A.text(e),Math.ceil(A.width()+1)},selectionCount:function(){var e=g.get.values();return g.is.multiple()?Y.isArray(e)?e.length:0:""!==g.get.value()?1:0},transition:function(e){return"auto"==p.transition?g.is.upward(e)?"slide up":"slide down":p.transition},userValues:function(){var e=g.get.values();return!!e&&(e=Y.isArray(e)?e:[e],Y.grep(e,function(e){return!1===g.get.item(e)}))},uniqueArray:function(n){return Y.grep(n,function(e,t){return Y.inArray(e,n)===t})},caretPosition:function(){var e,t,n=T.get(0);return"selectionStart"in n?n.selectionStart:K.selection?(n.focus(),t=(e=K.selection.createRange()).text.length,e.moveStart("character",-n.value.length),e.text.length-t):void 0},value:function(){var e=0<R.length?R.val():w.data(b.value),t=Y.isArray(e)&&1===e.length&&""===e[0];return e===J||t?"":e},values:function(){var e=g.get.value();return""===e?"":!g.has.selectInput()&&g.is.multiple()?"string"==typeof e?e.split(p.delimiter):"":e},remoteValues:function(){var e=g.get.values(),i=!1;return e&&("string"==typeof e&&(e=[e]),Y.each(e,function(e,t){var n=g.read.remoteData(t);g.verbose("Restoring value from session data",n,t),n&&(i||(i={}),i[t]=n)})),i},choiceText:function(e,t){if(t=t!==J?t:p.preserveHTML,e)return 0<e.find(y.menu).length&&(g.verbose("Retrieving text of element with sub-menu"),(e=e.clone()).find(y.menu).remove(),e.find(y.menuIcon).remove()),e.data(b.text)!==J?e.data(b.text):t?Y.trim(e.html()):Y.trim(e.text())},choiceValue:function(e,t){return t=t||g.get.choiceText(e),!!e&&(e.data(b.value)!==J?String(e.data(b.value)):"string"==typeof t?Y.trim(t.toLowerCase()):String(t))},inputEvent:function(){var e=T[0];return!!e&&(e.oninput!==J?"input":e.onpropertychange!==J?"propertychange":"keyup")},selectValues:function(){var o={values:[]};return w.find("option").each(function(){var e=Y(this),t=e.html(),n=e.attr("disabled"),i=e.attr("value")!==J?e.attr("value"):t;"auto"===p.placeholder&&""===i?o.placeholder=t:o.values.push({name:t,value:i,disabled:n})}),p.placeholder&&"auto"!==p.placeholder&&(g.debug("Setting placeholder value to",p.placeholder),o.placeholder=p.placeholder),p.sortSelect?(o.values.sort(function(e,t){return e.name>t.name?1:-1}),g.debug("Retrieved and sorted values from select",o)):g.debug("Retrieved values from select",o),o},activeItem:function(){return O.filter("."+h.active)},selectedItem:function(){var e=O.not(y.unselectable).filter("."+h.selected);return 0<e.length?e:O.eq(0)},itemWithAdditions:function(e){var t=g.get.item(e),n=g.create.userChoice(e);return n&&0<n.length&&(t=0<t.length?t.add(n):n),t},item:function(i,o){var e,a,r=!1;return i=i!==J?i:g.get.values()!==J?g.get.values():g.get.text(),e=a?0<i.length:i!==J&&null!==i,a=g.is.multiple()&&Y.isArray(i),o=""===i||0===i||(o||!1),e&&O.each(function(){var e=Y(this),t=g.get.choiceText(e),n=g.get.choiceValue(e,t);if(null!==n&&n!==J)if(a)-1===Y.inArray(String(n),i)&&-1===Y.inArray(t,i)||(r=r?r.add(e):e);else if(o){if(g.verbose("Ambiguous dropdown value using strict type check",e,i),n===i||t===i)return r=e,!0}else if(String(n)==String(i)||t==i)return g.verbose("Found select item by value",n,i),r=e,!0}),r}},check:{maxSelections:function(e){return!p.maxSelections||((e=e!==J?e:g.get.selectionCount())>=p.maxSelections?(g.debug("Maximum selection count reached"),p.useLabels&&(O.addClass(h.filtered),g.add.message(c.maxSelections)),!0):(g.verbose("No longer at maximum selection count"),g.remove.message(),g.remove.filteredItem(),g.is.searchSelection()&&g.filterItems(),!1))}},restore:{defaults:function(){g.clear(),g.restore.defaultText(),g.restore.defaultValue()},defaultText:function(){var e=g.get.defaultText();e===g.get.placeholderText?(g.debug("Restoring default placeholder text",e),g.set.placeholderText(e)):(g.debug("Restoring default text",e),g.set.text(e))},placeholderText:function(){g.set.placeholderText()},defaultValue:function(){var e=g.get.defaultValue();e!==J&&(g.debug("Restoring default value",e),""!==e?(g.set.value(e),g.set.selected()):(g.remove.activeItem(),g.remove.selectedItem()))},labels:function(){p.allowAdditions&&(p.useLabels||(g.error(f.labels),p.useLabels=!0),g.debug("Restoring selected values"),g.create.userLabels()),g.check.maxSelections()},selected:function(){g.restore.values(),g.is.multiple()?(g.debug("Restoring previously selected values and labels"),g.restore.labels()):g.debug("Restoring previously selected values")},values:function(){g.set.initialLoad(),p.apiSettings&&p.saveRemoteData&&g.get.remoteValues()?g.restore.remoteValues():g.set.selected(),g.remove.initialLoad()},remoteValues:function(){var e=g.get.remoteValues();g.debug("Recreating selected from session data",e),e&&(g.is.single()?Y.each(e,function(e,t){g.set.text(t)}):Y.each(e,function(e,t){g.add.label(e,t)}))}},read:{remoteData:function(e){var t;if(Z.Storage!==J)return(t=sessionStorage.getItem(e))!==J&&t;g.error(f.noStorage)}},save:{defaults:function(){g.save.defaultText(),g.save.placeholderText(),g.save.defaultValue()},defaultValue:function(){var e=g.get.value();g.verbose("Saving default value as",e),w.data(b.defaultValue,e)},defaultText:function(){var e=g.get.text();g.verbose("Saving default text as",e),w.data(b.defaultText,e)},placeholderText:function(){var e;!1!==p.placeholder&&k.hasClass(h.placeholder)&&(e=g.get.text(),g.verbose("Saving placeholder text as",e),w.data(b.placeholderText,e))},remoteData:function(e,t){Z.Storage!==J?(g.verbose("Saving remote data to session storage",t,e),sessionStorage.setItem(t,e)):g.error(f.noStorage)}},clear:function(){g.is.multiple()&&p.useLabels?g.remove.labels():(g.remove.activeItem(),g.remove.selectedItem()),g.set.placeholderText(),g.clearValue()},clearValue:function(){g.set.value("")},scrollPage:function(e,t){var n,i,o=t||g.get.selectedItem(),a=o.closest(y.menu),r=a.outerHeight(),s=a.scrollTop(),l=O.eq(0).outerHeight(),c=Math.floor(r/l),u=(a.prop("scrollHeight"),"up"==e?s-l*c:s+l*c),d=O.not(y.unselectable);i="up"==e?d.index(o)-c:d.index(o)+c,0<(n=("up"==e?0<=i:i<d.length)?d.eq(i):"up"==e?d.first():d.last()).length&&(g.debug("Scrolling page",e,n),o.removeClass(h.selected),n.addClass(h.selected),p.selectOnKeydown&&g.is.single()&&g.set.selectedItem(n),a.scrollTop(u))},set:{filtered:function(){var e=g.is.multiple(),t=g.is.searchSelection(),n=e&&t,i=t?g.get.query():"",o="string"==typeof i&&0<i.length,a=g.get.searchWidth(),r=""!==i;e&&o&&(g.verbose("Adjusting input width",a,p.glyphWidth),T.css("width",a)),o||n&&r?(g.verbose("Hiding placeholder text"),k.addClass(h.filtered)):(!e||n&&!r)&&(g.verbose("Showing placeholder text"),k.removeClass(h.filtered))},empty:function(){w.addClass(h.empty)},loading:function(){w.addClass(h.loading)},placeholderText:function(e){e=e||g.get.placeholderText(),g.debug("Setting placeholder text",e),g.set.text(e),k.addClass(h.placeholder)},tabbable:function(){g.is.searchSelection()?(g.debug("Added tabindex to searchable dropdown"),T.val("").attr("tabindex",0),F.attr("tabindex",-1)):(g.debug("Added tabindex to dropdown"),w.attr("tabindex")===J&&(w.attr("tabindex",0),F.attr("tabindex",-1)))},initialLoad:function(){g.verbose("Setting initial load"),e=!0},activeItem:function(e){p.allowAdditions&&0<e.filter(y.addition).length?e.addClass(h.filtered):e.addClass(h.active)},partialSearch:function(e){var t=g.get.query().length;T.val(e.substr(0,t))},scrollPosition:function(e,t){var n,i,o,a,r,s;n=(e=e||g.get.selectedItem()).closest(y.menu),i=e&&0<e.length,t=t!==J&&t,e&&0<n.length&&i&&(e.position().top,n.addClass(h.loading),o=(a=n.scrollTop())-n.offset().top+e.offset().top,t||(s=a+n.height()<o+5,r=o-5<a),g.debug("Scrolling to active item",o),(t||r||s)&&n.scrollTop(o),n.removeClass(h.loading))},text:function(e){"select"!==p.action&&("combo"==p.action?(g.debug("Changing combo button text",e,E),p.preserveHTML?E.html(e):E.text(e)):(e!==g.get.placeholderText()&&k.removeClass(h.placeholder),g.debug("Changing text",e,k),k.removeClass(h.filtered),p.preserveHTML?k.html(e):k.text(e)))},selectedItem:function(e){var t=g.get.choiceValue(e),n=g.get.choiceText(e,!1),i=g.get.choiceText(e,!0);g.debug("Setting user selection to item",e),g.remove.activeItem(),g.set.partialSearch(n),g.set.activeItem(e),g.set.selected(t,e),g.set.text(i)},selectedLetter:function(e){var t,n=O.filter("."+h.selected),i=0<n.length&&g.has.firstLetter(n,e),o=!1;i&&(t=n.nextAll(O).eq(0),g.has.firstLetter(t,e)&&(o=t)),o||O.each(function(){if(g.has.firstLetter(Y(this),e))return o=Y(this),!1}),o&&(g.verbose("Scrolling to next value with letter",e),g.set.scrollPosition(o),n.removeClass(h.selected),o.addClass(h.selected),p.selectOnKeydown&&g.is.single()&&g.set.selectedItem(o))},direction:function(e){"auto"==p.direction?(g.remove.upward(),g.can.openDownward(e)?g.remove.upward(e):g.set.upward(e),g.is.leftward(e)||g.can.openRightward(e)||g.set.leftward(e)):"upward"==p.direction&&g.set.upward(e)},upward:function(e){(e||w).addClass(h.upward)},leftward:function(e){(e||F).addClass(h.leftward)},value:function(e,t,n){var i=g.escape.value(e),o=0<R.length,a=g.get.values(),r=e!==J?String(e):e;if(o){if(!p.allowReselection&&r==a&&(g.verbose("Skipping value update already same value",e,a),!g.is.initialLoad()))return;g.is.single()&&g.has.selectInput()&&g.can.extendSelect()&&(g.debug("Adding user option",e),g.add.optionValue(e)),g.debug("Updating input value",i,a),j=!0,R.val(i),!1===p.fireOnInit&&g.is.initialLoad()?g.debug("Input native change event ignored on initial load"):g.trigger.change(),j=!1}else g.verbose("Storing value in metadata",i,R),i!==a&&w.data(b.value,r);g.is.single()&&p.clearable&&(i?g.set.clearable():g.remove.clearable()),!1===p.fireOnInit&&g.is.initialLoad()?g.verbose("No callback on initial load",p.onChange):p.onChange.call(z,e,t,n)},active:function(){w.addClass(h.active)},multiple:function(){w.addClass(h.multiple)},visible:function(){w.addClass(h.visible)},exactly:function(e,t){g.debug("Setting selected to exact values"),g.clear(),g.set.selected(e,t)},selected:function(e,s){var l=g.is.multiple();(s=p.allowAdditions?s||g.get.itemWithAdditions(e):s||g.get.item(e))&&(g.debug("Setting selected menu item to",s),g.is.multiple()&&g.remove.searchWidth(),g.is.single()?(g.remove.activeItem(),g.remove.selectedItem()):p.useLabels&&g.remove.selectedItem(),s.each(function(){var e=Y(this),t=g.get.choiceText(e),n=g.get.choiceValue(e,t),i=e.hasClass(h.filtered),o=e.hasClass(h.active),a=e.hasClass(h.addition),r=l&&1==s.length;l?!o||a?(p.apiSettings&&p.saveRemoteData&&g.save.remoteData(t,n),p.useLabels?(g.add.label(n,t,r),g.add.value(n,t,e),g.set.activeItem(e),g.filterActive(),g.select.nextAvailable(s)):(g.add.value(n,t,e),g.set.text(g.add.variables(c.count)),g.set.activeItem(e))):i||(g.debug("Selected active value, removing label"),g.remove.selected(n)):(p.apiSettings&&p.saveRemoteData&&g.save.remoteData(t,n),g.set.text(t),g.set.value(n,t,e),e.addClass(h.active).addClass(h.selected))}))},clearable:function(){P.addClass(h.clear)}},add:{label:function(e,t,n){var i,o=g.is.searchSelection()?T:k,a=g.escape.value(e);p.ignoreCase&&(a=a.toLowerCase()),i=Y("<a />").addClass(h.label).attr("data-"+b.value,a).html(m.label(a,t)),i=p.onLabelCreate.call(i,a,t),g.has.label(e)?g.debug("User selection already exists, skipping",a):(p.label.variation&&i.addClass(p.label.variation),!0===n?(g.debug("Animating in label",i),i.addClass(h.hidden).insertBefore(o).transition(p.label.transition,p.label.duration)):(g.debug("Adding selection label",i),i.insertBefore(o)))},message:function(e){var t=F.children(y.message),n=p.templates.message(g.add.variables(e));0<t.length?t.html(n):t=Y("<div/>").html(n).addClass(h.message).appendTo(F)},optionValue:function(e){var t=g.escape.value(e);0<R.find('option[value="'+g.escape.string(t)+'"]').length||(g.disconnect.selectObserver(),g.is.single()&&(g.verbose("Removing previous user addition"),R.find("option."+h.addition).remove()),Y("<option/>").prop("value",t).addClass(h.addition).html(e).appendTo(R),g.verbose("Adding user addition as an <option>",e),g.observe.select())},userSuggestion:function(e){var t,n=F.children(y.addition),i=g.get.item(e),o=i&&i.not(y.addition).length,a=0<n.length;p.useLabels&&g.has.maxSelections()||(""===e||o?n.remove():(a?(n.data(b.value,e).data(b.text,e).attr("data-"+b.value,e).attr("data-"+b.text,e).removeClass(h.filtered),p.hideAdditions||(t=p.templates.addition(g.add.variables(c.addResult,e)),n.html(t)),g.verbose("Replacing user suggestion with new value",n)):((n=g.create.userChoice(e)).prependTo(F),g.verbose("Adding item choice to menu corresponding with user choice addition",n)),p.hideAdditions&&!g.is.allFiltered()||n.addClass(h.selected).siblings().removeClass(h.selected),g.refreshItems()))},variables:function(e,t){var n,i,o=-1!==e.search("{count}"),a=-1!==e.search("{maxCount}"),r=-1!==e.search("{term}");return g.verbose("Adding templated variables to message",e),o&&(n=g.get.selectionCount(),e=e.replace("{count}",n)),a&&(n=g.get.selectionCount(),e=e.replace("{maxCount}",p.maxSelections)),r&&(i=t||g.get.query(),e=e.replace("{term}",i)),e},value:function(e,t,n){var i,o=g.get.values();g.has.value(e)?g.debug("Value already selected"):""!==e?(i=Y.isArray(o)?(i=o.concat([e]),g.get.uniqueArray(i)):[e],g.has.selectInput()?g.can.extendSelect()&&(g.debug("Adding value to select",e,i,R),g.add.optionValue(e)):(i=i.join(p.delimiter),g.debug("Setting hidden input to delimited value",i,R)),!1===p.fireOnInit&&g.is.initialLoad()?g.verbose("Skipping onadd callback on initial load",p.onAdd):p.onAdd.call(z,e,t,n),g.set.value(i,e,t,n),g.check.maxSelections()):g.debug("Cannot select blank values from multiselect")}},remove:{active:function(){w.removeClass(h.active)},activeLabel:function(){w.find(y.label).removeClass(h.active)},empty:function(){w.removeClass(h.empty)},loading:function(){w.removeClass(h.loading)},initialLoad:function(){e=!1},upward:function(e){(e||w).removeClass(h.upward)},leftward:function(e){(e||F).removeClass(h.leftward)},visible:function(){w.removeClass(h.visible)},activeItem:function(){O.removeClass(h.active)},filteredItem:function(){p.useLabels&&g.has.maxSelections()||(p.useLabels&&g.is.multiple()?O.not("."+h.active).removeClass(h.filtered):O.removeClass(h.filtered),g.remove.empty())},optionValue:function(e){var t=g.escape.value(e),n=R.find('option[value="'+g.escape.string(t)+'"]');0<n.length&&n.hasClass(h.addition)&&(r&&(r.disconnect(),g.verbose("Temporarily disconnecting mutation observer")),n.remove(),g.verbose("Removing user addition as an <option>",t),r&&r.observe(R[0],{childList:!0,subtree:!0}))},message:function(){F.children(y.message).remove()},searchWidth:function(){T.css("width","")},searchTerm:function(){g.verbose("Cleared search term"),T.val(""),g.set.filtered()},userAddition:function(){O.filter(y.addition).remove()},selected:function(e,t){if(!(t=p.allowAdditions?t||g.get.itemWithAdditions(e):t||g.get.item(e)))return!1;t.each(function(){var e=Y(this),t=g.get.choiceText(e),n=g.get.choiceValue(e,t);g.is.multiple()?p.useLabels?(g.remove.value(n,t,e),g.remove.label(n)):(g.remove.value(n,t,e),0===g.get.selectionCount()?g.set.placeholderText():g.set.text(g.add.variables(c.count))):g.remove.value(n,t,e),e.removeClass(h.filtered).removeClass(h.active),p.useLabels&&e.removeClass(h.selected)})},selectedItem:function(){O.removeClass(h.selected)},value:function(e,t,n){var i,o=g.get.values();g.has.selectInput()?(g.verbose("Input is <select> removing selected option",e),i=g.remove.arrayValue(e,o),g.remove.optionValue(e)):(g.verbose("Removing from delimited values",e),i=(i=g.remove.arrayValue(e,o)).join(p.delimiter)),!1===p.fireOnInit&&g.is.initialLoad()?g.verbose("No callback on initial load",p.onRemove):p.onRemove.call(z,e,t,n),g.set.value(i,t,n),g.check.maxSelections()},arrayValue:function(t,e){return Y.isArray(e)||(e=[e]),e=Y.grep(e,function(e){return t!=e}),g.verbose("Removed value from delimited string",t,e),e},label:function(e,t){var n=w.find(y.label).filter("[data-"+b.value+'="'+g.escape.string(e)+'"]');g.verbose("Removing label",n),n.remove()},activeLabels:function(e){e=e||w.find(y.label).filter("."+h.active),g.verbose("Removing active label selections",e),g.remove.labels(e)},labels:function(e){e=e||w.find(y.label),g.verbose("Removing labels",e),e.each(function(){var e=Y(this),t=e.data(b.value),n=t!==J?String(t):t,i=g.is.userValue(n);!1!==p.onLabelRemove.call(e,t)?(g.remove.message(),i?(g.remove.value(n),g.remove.label(n)):g.remove.selected(n)):g.debug("Label remove callback cancelled removal")})},tabbable:function(){g.is.searchSelection()?(g.debug("Searchable dropdown initialized"),T.removeAttr("tabindex")):(g.debug("Simple selection dropdown initialized"),w.removeAttr("tabindex")),F.removeAttr("tabindex")},clearable:function(){P.removeClass(h.clear)}},has:{menuSearch:function(){return g.has.search()&&0<T.closest(F).length},search:function(){return 0<T.length},sizer:function(){return 0<A.length},selectInput:function(){return R.is("select")},minCharacters:function(e){return!p.minCharacters||(e=e!==J?String(e):String(g.get.query())).length>=p.minCharacters},firstLetter:function(e,t){var n;return!(!e||0===e.length||"string"!=typeof t)&&(n=g.get.choiceText(e,!1),(t=t.toLowerCase())==String(n).charAt(0).toLowerCase())},input:function(){return 0<R.length},items:function(){return 0<O.length},menu:function(){return 0<F.length},message:function(){return 0!==F.children(y.message).length},label:function(e){var t=g.escape.value(e),n=w.find(y.label);return p.ignoreCase&&(t=t.toLowerCase()),0<n.filter("[data-"+b.value+'="'+g.escape.string(t)+'"]').length},maxSelections:function(){return p.maxSelections&&g.get.selectionCount()>=p.maxSelections},allResultsFiltered:function(){var e=O.not(y.addition);return e.filter(y.unselectable).length===e.length},userSuggestion:function(){return 0<F.children(y.addition).length},query:function(){return""!==g.get.query()},value:function(e){return p.ignoreCase?g.has.valueIgnoringCase(e):g.has.valueMatchingCase(e)},valueMatchingCase:function(e){var t=g.get.values();return!!(Y.isArray(t)?t&&-1!==Y.inArray(e,t):t==e)},valueIgnoringCase:function(n){var e=g.get.values(),i=!1;return Y.isArray(e)||(e=[e]),Y.each(e,function(e,t){if(String(n).toLowerCase()==String(t).toLowerCase())return!(i=!0)}),i}},is:{active:function(){return w.hasClass(h.active)},animatingInward:function(){return F.transition("is inward")},animatingOutward:function(){return F.transition("is outward")},bubbledLabelClick:function(e){return Y(e.target).is("select, input")&&0<w.closest("label").length},bubbledIconClick:function(e){return 0<Y(e.target).closest(P).length},alreadySetup:function(){return w.is("select")&&w.parent(y.dropdown).data(C)!==J&&0===w.prev().length},animating:function(e){return e?e.transition&&e.transition("is animating"):F.transition&&F.transition("is animating")},leftward:function(e){return(e||F).hasClass(h.leftward)},disabled:function(){return w.hasClass(h.disabled)},focused:function(){return K.activeElement===w[0]},focusedOnSearch:function(){return K.activeElement===T[0]},allFiltered:function(){return(g.is.multiple()||g.has.search())&&!(0==p.hideAdditions&&g.has.userSuggestion())&&!g.has.message()&&g.has.allResultsFiltered()},hidden:function(e){return!g.is.visible(e)},initialLoad:function(){return e},inObject:function(n,e){var i=!1;return Y.each(e,function(e,t){if(t==n)return i=!0}),i},multiple:function(){return w.hasClass(h.multiple)},remote:function(){return p.apiSettings&&g.can.useAPI()},single:function(){return!g.is.multiple()},selectMutation:function(e){var n=!1;return Y.each(e,function(e,t){if(t.target&&Y(t.target).is("select"))return n=!0}),n},search:function(){return w.hasClass(h.search)},searchSelection:function(){return g.has.search()&&1===T.parent(y.dropdown).length},selection:function(){return w.hasClass(h.selection)},userValue:function(e){return-1!==Y.inArray(e,g.get.userValues())},upward:function(e){return(e||w).hasClass(h.upward)},visible:function(e){return e?e.hasClass(h.visible):F.hasClass(h.visible)},verticallyScrollableContext:function(){var e=S.get(0)!==Z&&S.css("overflow-y");return"auto"==e||"scroll"==e},horizontallyScrollableContext:function(){var e=S.get(0)!==Z&&S.css("overflow-X");return"auto"==e||"scroll"==e}},can:{activate:function(e){return!!p.useLabels||(!g.has.maxSelections()||!(!g.has.maxSelections()||!e.hasClass(h.active)))},openDownward:function(e){var t,n,i=e||F,o=!0;return i.addClass(h.loading),n={context:{offset:S.get(0)===Z?{top:0,left:0}:S.offset(),scrollTop:S.scrollTop(),height:S.outerHeight()},menu:{offset:i.offset(),height:i.outerHeight()}},g.is.verticallyScrollableContext()&&(n.menu.offset.top+=n.context.scrollTop),o=(t={above:n.context.scrollTop<=n.menu.offset.top-n.context.offset.top-n.menu.height,below:n.context.scrollTop+n.context.height>=n.menu.offset.top-n.context.offset.top+n.menu.height}).below?(g.verbose("Dropdown can fit in context downward",t),!0):t.below||t.above?(g.verbose("Dropdown cannot fit below, opening upward",t),!1):(g.verbose("Dropdown cannot fit in either direction, favoring downward",t),!0),i.removeClass(h.loading),o},openRightward:function(e){var t,n,i=e||F,o=!0;return i.addClass(h.loading),n={context:{offset:S.get(0)===Z?{top:0,left:0}:S.offset(),scrollLeft:S.scrollLeft(),width:S.outerWidth()},menu:{offset:i.offset(),width:i.outerWidth()}},g.is.horizontallyScrollableContext()&&(n.menu.offset.left+=n.context.scrollLeft),(t=n.menu.offset.left-n.context.offset.left+n.menu.width>=n.context.scrollLeft+n.context.width)&&(g.verbose("Dropdown cannot fit in context rightward",t),o=!1),i.removeClass(h.loading),o},click:function(){return U||"click"==p.on},extendSelect:function(){return p.allowAdditions||p.apiSettings},show:function(){return!g.is.disabled()&&(g.has.items()||g.has.message())},useAPI:function(){return Y.fn.api!==J}},animate:{show:function(e,t){var n,i=t||F,o=t?function(){}:function(){g.hideSubMenus(),g.hideOthers(),g.set.active()};e=Y.isFunction(e)?e:function(){},g.verbose("Doing menu show animation",i),g.set.direction(t),n=g.get.transition(t),g.is.selection()&&g.set.scrollPosition(g.get.selectedItem(),!0),(g.is.hidden(i)||g.is.animating(i))&&("none"==n?(o(),i.transition("show"),e.call(z)):Y.fn.transition!==J&&w.transition("is supported")?i.transition({animation:n+" in",debug:p.debug,verbose:p.verbose,duration:p.duration,queue:!0,onStart:o,onComplete:function(){e.call(z)}}):g.error(f.noTransition,n))},hide:function(e,t){var n=t||F,i=(t?p.duration:p.duration,t?function(){}:function(){g.can.click()&&g.unbind.intent(),g.remove.active()}),o=g.get.transition(t);e=Y.isFunction(e)?e:function(){},(g.is.visible(n)||g.is.animating(n))&&(g.verbose("Doing menu hide animation",n),"none"==o?(i(),n.transition("hide"),e.call(z)):Y.fn.transition!==J&&w.transition("is supported")?n.transition({animation:o+" out",duration:p.duration,debug:p.debug,verbose:p.verbose,queue:!1,onStart:i,onComplete:function(){e.call(z)}}):g.error(f.transition))}},hideAndClear:function(){g.remove.searchTerm(),g.has.maxSelections()||(g.has.search()?g.hide(function(){g.remove.filteredItem()}):g.hide())},delay:{show:function(){g.verbose("Delaying show event to ensure user intent"),clearTimeout(g.timer),g.timer=setTimeout(g.show,p.delay.show)},hide:function(){g.verbose("Delaying hide event to ensure user intent"),clearTimeout(g.timer),g.timer=setTimeout(g.hide,p.delay.hide)}},escape:{value:function(e){var t=Y.isArray(e),n="string"==typeof e,i=!n&&!t,o=n&&-1!==e.search(d.quote),a=[];return i||!o?e:(g.debug("Encoding quote values for use in select",e),t?(Y.each(e,function(e,t){a.push(t.replace(d.quote,"&quot;"))}),a):e.replace(d.quote,"&quot;"))},string:function(e){return(e=String(e)).replace(d.escape,"\\$&")}},setting:function(e,t){if(g.debug("Changing setting",e,t),Y.isPlainObject(e))Y.extend(!0,p,e);else{if(t===J)return p[e];Y.isPlainObject(p[e])?Y.extend(!0,p[e],t):p[e]=t}},internal:function(e,t){if(Y.isPlainObject(e))Y.extend(!0,g,e);else{if(t===J)return g[e];g[e]=t}},debug:function(){!p.silent&&p.debug&&(p.performance?g.performance.log(arguments):(g.debug=Function.prototype.bind.call(console.info,console,p.name+":"),g.debug.apply(console,arguments)))},verbose:function(){!p.silent&&p.verbose&&p.debug&&(p.performance?g.performance.log(arguments):(g.verbose=Function.prototype.bind.call(console.info,console,p.name+":"),g.verbose.apply(console,arguments)))},error:function(){p.silent||(g.error=Function.prototype.bind.call(console.error,console,p.name+":"),g.error.apply(console,arguments))},performance:{log:function(e){var t,n;p.performance&&(n=(t=(new Date).getTime())-(W||t),W=t,B.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:z,"Execution Time":n})),clearTimeout(g.performance.timer),g.performance.timer=setTimeout(g.performance.display,500)},display:function(){var e=p.name+":",n=0;W=!1,clearTimeout(g.performance.timer),Y.each(B,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",H&&(e+=" '"+H+"'"),(console.group!==J||console.table!==J)&&0<B.length&&(console.groupCollapsed(e),console.table?console.table(B):Y.each(B,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),B=[]}},invoke:function(i,e,t){var o,a,n,r=I;return e=e||$,t=z||t,"string"==typeof i&&r!==J&&(i=i.split(/[\. ]/),o=i.length-1,Y.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(Y.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==J)return a=r[n],!1;if(!Y.isPlainObject(r[t])||e==o)return r[t]!==J?a=r[t]:g.error(f.method,i),!1;r=r[t]}})),Y.isFunction(a)?n=a.apply(t,e):a!==J&&(n=a),Y.isArray(L)?L.push(n):L!==J?L=[L,n]:n!==J&&(L=n),a}},X?(I===J&&g.initialize(),g.invoke(Q)):(I!==J&&I.invoke("destroy"),g.initialize())}),L!==J?L:V},Y.fn.dropdown.settings={silent:!1,debug:!1,verbose:!1,performance:!0,on:"click",action:"activate",values:!1,clearable:!1,apiSettings:!1,selectOnKeydown:!0,minCharacters:0,filterRemoteData:!1,saveRemoteData:!0,throttle:200,context:Z,direction:"auto",keepOnScreen:!0,match:"both",fullTextSearch:!1,placeholder:"auto",preserveHTML:!0,sortSelect:!1,forceSelection:!0,allowAdditions:!1,ignoreCase:!1,hideAdditions:!0,maxSelections:!1,useLabels:!0,delimiter:",",showOnFocus:!0,allowReselection:!1,allowTab:!0,allowCategorySelection:!1,fireOnInit:!1,transition:"auto",duration:200,glyphWidth:1.037,label:{transition:"scale",duration:200,variation:!1},delay:{hide:300,show:200,search:20,touch:50},onChange:function(e,t,n){},onAdd:function(e,t,n){},onRemove:function(e,t,n){},onLabelSelect:function(e){},onLabelCreate:function(e,t){return Y(this)},onLabelRemove:function(e){return!0},onNoResults:function(e){return!0},onShow:function(){},onHide:function(){},name:"Dropdown",namespace:"dropdown",message:{addResult:"Add <b>{term}</b>",count:"{count} selected",maxSelections:"Max {maxCount} selections",noResults:"No results found.",serverError:"There was an error contacting the server"},error:{action:"You called a dropdown action that was not defined",alreadySetup:"Once a select has been initialized behaviors must be called on the created ui dropdown",labels:"Allowing user additions currently requires the use of labels.",missingMultiple:"<select> requires multiple property to be set to correctly preserve multiple values",method:"The method you called is not defined.",noAPI:"The API module is required to load resources remotely",noStorage:"Saving remote data requires session storage",noTransition:"This module requires ui transitions <https://github.com/Semantic-Org/UI-Transition>"},regExp:{escape:/[-[\]{}()*+?.,\\^$|#\s]/g,quote:/"/g},metadata:{defaultText:"defaultText",defaultValue:"defaultValue",placeholderText:"placeholder",text:"text",value:"value"},fields:{remoteValues:"results",values:"values",disabled:"disabled",name:"name",value:"value",text:"text"},keys:{backspace:8,delimiter:188,deleteKey:46,enter:13,escape:27,pageUp:33,pageDown:34,leftArrow:37,upArrow:38,rightArrow:39,downArrow:40},selector:{addition:".addition",dropdown:".ui.dropdown",hidden:".hidden",icon:"> .dropdown.icon",input:'> input[type="hidden"], > select',item:".item",label:"> .label",remove:"> .label > .delete.icon",siblingLabel:".label",menu:".menu",message:".message",menuIcon:".dropdown.icon",search:"input.search, .menu > .search > input, .menu input.search",sizer:"> input.sizer",text:"> .text:not(.icon)",unselectable:".disabled, .filtered"},className:{active:"active",addition:"addition",animating:"animating",clear:"clear",disabled:"disabled",empty:"empty",dropdown:"ui dropdown",filtered:"filtered",hidden:"hidden transition",item:"item",label:"ui label",loading:"loading",menu:"menu",message:"message",multiple:"multiple",placeholder:"default",sizer:"sizer",search:"search",selected:"selected",selection:"selection",upward:"upward",leftward:"left",visible:"visible"}},Y.fn.dropdown.settings.templates={dropdown:function(e){var t=e.placeholder||!1,n=(e.values,"");return n+='<i class="dropdown icon"></i>',e.placeholder?n+='<div class="default text">'+t+"</div>":n+='<div class="text"></div>',n+='<div class="menu">',Y.each(e.values,function(e,t){n+=t.disabled?'<div class="disabled item" data-value="'+t.value+'">'+t.name+"</div>":'<div class="item" data-value="'+t.value+'">'+t.name+"</div>"}),n+="</div>"},menu:function(e,o){var t=e[o.values]||{},a="";return Y.each(t,function(e,t){var n=t[o.text]?'data-text="'+t[o.text]+'"':"",i=t[o.disabled]?"disabled ":"";a+='<div class="'+i+'item" data-value="'+t[o.value]+'"'+n+">",a+=t[o.name],a+="</div>"}),a},label:function(e,t){return t+'<i class="delete icon"></i>'},message:function(e){return e},addition:function(e){return e}}}(jQuery,window,document),function(k,T,e,A){"use strict";T=void 0!==T&&T.Math==Math?T:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),k.fn.embed=function(p){var h,v=k(this),b=v.selector||"",y=(new Date).getTime(),x=[],C=p,w="string"==typeof C,S=[].slice.call(arguments,1);return v.each(function(){var s,i=k.isPlainObject(p)?k.extend(!0,{},k.fn.embed.settings,p):k.extend({},k.fn.embed.settings),e=i.selector,t=i.className,o=i.sources,l=i.error,a=i.metadata,n=i.namespace,r=i.templates,c="."+n,u="module-"+n,d=(k(T),k(this)),f=(d.find(e.placeholder),d.find(e.icon),d.find(e.embed)),m=this,g=d.data(u);s={initialize:function(){s.debug("Initializing embed"),s.determine.autoplay(),s.create(),s.bind.events(),s.instantiate()},instantiate:function(){s.verbose("Storing instance of module",s),g=s,d.data(u,s)},destroy:function(){s.verbose("Destroying previous instance of embed"),s.reset(),d.removeData(u).off(c)},refresh:function(){s.verbose("Refreshing selector cache"),d.find(e.placeholder),d.find(e.icon),f=d.find(e.embed)},bind:{events:function(){s.has.placeholder()&&(s.debug("Adding placeholder events"),d.on("click"+c,e.placeholder,s.createAndShow).on("click"+c,e.icon,s.createAndShow))}},create:function(){s.get.placeholder()?s.createPlaceholder():s.createAndShow()},createPlaceholder:function(e){var t=s.get.icon(),n=s.get.url();s.generate.embed(n);e=e||s.get.placeholder(),d.html(r.placeholder(e,t)),s.debug("Creating placeholder for embed",e,t)},createEmbed:function(e){s.refresh(),e=e||s.get.url(),f=k("<div/>").addClass(t.embed).html(s.generate.embed(e)).appendTo(d),i.onCreate.call(m,e),s.debug("Creating embed object",f)},changeEmbed:function(e){f.html(s.generate.embed(e))},createAndShow:function(){s.createEmbed(),s.show()},change:function(e,t,n){s.debug("Changing video to ",e,t,n),d.data(a.source,e).data(a.id,t),n?d.data(a.url,n):d.removeData(a.url),s.has.embed()?s.changeEmbed():s.create()},reset:function(){s.debug("Clearing embed and showing placeholder"),s.remove.data(),s.remove.active(),s.remove.embed(),s.showPlaceholder(),i.onReset.call(m)},show:function(){s.debug("Showing embed"),s.set.active(),i.onDisplay.call(m)},hide:function(){s.debug("Hiding embed"),s.showPlaceholder()},showPlaceholder:function(){s.debug("Showing placeholder image"),s.remove.active(),i.onPlaceholderDisplay.call(m)},get:{id:function(){return i.id||d.data(a.id)},placeholder:function(){return i.placeholder||d.data(a.placeholder)},icon:function(){return i.icon?i.icon:d.data(a.icon)!==A?d.data(a.icon):s.determine.icon()},source:function(e){return i.source?i.source:d.data(a.source)!==A?d.data(a.source):s.determine.source()},type:function(){var e=s.get.source();return o[e]!==A&&o[e].type},url:function(){return i.url?i.url:d.data(a.url)!==A?d.data(a.url):s.determine.url()}},determine:{autoplay:function(){s.should.autoplay()&&(i.autoplay=!0)},source:function(n){var i=!1;return(n=n||s.get.url())&&k.each(o,function(e,t){if(-1!==n.search(t.domain))return i=e,!1}),i},icon:function(){var e=s.get.source();return o[e]!==A&&o[e].icon},url:function(){var e,t=i.id||d.data(a.id),n=i.source||d.data(a.source);return(e=o[n]!==A&&o[n].url.replace("{id}",t))&&d.data(a.url,e),e}},set:{active:function(){d.addClass(t.active)}},remove:{data:function(){d.removeData(a.id).removeData(a.icon).removeData(a.placeholder).removeData(a.source).removeData(a.url)},active:function(){d.removeClass(t.active)},embed:function(){f.empty()}},encode:{parameters:function(e){var t,n=[];for(t in e)n.push(encodeURIComponent(t)+"="+encodeURIComponent(e[t]));return n.join("&amp;")}},generate:{embed:function(e){s.debug("Generating embed html");var t,n,i=s.get.source();return(e=s.get.url(e))?(n=s.generate.parameters(i),t=r.iframe(e,n)):s.error(l.noURL,d),t},parameters:function(e,t){var n=o[e]&&o[e].parameters!==A?o[e].parameters(i):{};return(t=t||i.parameters)&&(n=k.extend({},n,t)),n=i.onEmbed(n),s.encode.parameters(n)}},has:{embed:function(){return 0<f.length},placeholder:function(){return i.placeholder||d.data(a.placeholder)}},should:{autoplay:function(){return"auto"===i.autoplay?i.placeholder||d.data(a.placeholder)!==A:i.autoplay}},is:{video:function(){return"video"==s.get.type()}},setting:function(e,t){if(s.debug("Changing setting",e,t),k.isPlainObject(e))k.extend(!0,i,e);else{if(t===A)return i[e];k.isPlainObject(i[e])?k.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(k.isPlainObject(e))k.extend(!0,s,e);else{if(t===A)return s[e];s[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,i.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),s.verbose.apply(console,arguments)))},error:function(){i.silent||(s.error=Function.prototype.bind.call(console.error,console,i.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(y||t),y=t,x.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:m,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=i.name+":",n=0;y=!1,clearTimeout(s.performance.timer),k.each(x,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",b&&(e+=" '"+b+"'"),1<v.length&&(e+=" ("+v.length+")"),(console.group!==A||console.table!==A)&&0<x.length&&(console.groupCollapsed(e),console.table?console.table(x):k.each(x,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),x=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||S,t=m||t,"string"==typeof i&&r!==A&&(i=i.split(/[\. ]/),o=i.length-1,k.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(k.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==A)return a=r[n],!1;if(!k.isPlainObject(r[t])||e==o)return r[t]!==A?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),k.isFunction(a)?n=a.apply(t,e):a!==A&&(n=a),k.isArray(h)?h.push(n):h!==A?h=[h,n]:n!==A&&(h=n),a}},w?(g===A&&s.initialize(),s.invoke(C)):(g!==A&&g.invoke("destroy"),s.initialize())}),h!==A?h:this},k.fn.embed.settings={name:"Embed",namespace:"embed",silent:!1,debug:!1,verbose:!1,performance:!0,icon:!1,source:!1,url:!1,id:!1,autoplay:"auto",color:"#444444",hd:!0,brandedUI:!1,parameters:!1,onDisplay:function(){},onPlaceholderDisplay:function(){},onReset:function(){},onCreate:function(e){},onEmbed:function(e){return e},metadata:{id:"id",icon:"icon",placeholder:"placeholder",source:"source",url:"url"},error:{noURL:"No URL specified",method:"The method you called is not defined"},className:{active:"active",embed:"embed"},selector:{embed:".embed",placeholder:".placeholder",icon:".icon"},sources:{youtube:{name:"youtube",type:"video",icon:"video play",domain:"youtube.com",url:"//www.youtube.com/embed/{id}",parameters:function(e){return{autohide:!e.brandedUI,autoplay:e.autoplay,color:e.color||A,hq:e.hd,jsapi:e.api,modestbranding:!e.brandedUI}}},vimeo:{name:"vimeo",type:"video",icon:"video play",domain:"vimeo.com",url:"//player.vimeo.com/video/{id}",parameters:function(e){return{api:e.api,autoplay:e.autoplay,byline:e.brandedUI,color:e.color||A,portrait:e.brandedUI,title:e.brandedUI}}}},templates:{iframe:function(e,t){var n=e;return t&&(n+="?"+t),'<iframe src="'+n+'" width="100%" height="100%" frameborder="0" scrolling="no" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>'},placeholder:function(e,t){var n="";return t&&(n+='<i class="'+t+' icon"></i>'),e&&(n+='<img class="placeholder" src="'+e+'">'),n}},api:!1,onPause:function(){},onPlay:function(){},onStop:function(){}}}(jQuery,window,document),function(j,z,I,M){"use strict";z=void 0!==z&&z.Math==Math?z:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),j.fn.modal=function(w){var S,e=j(this),k=j(z),T=j(I),A=j("body"),R=e.selector||"",P=(new Date).getTime(),E=[],F=w,O="string"==typeof F,D=[].slice.call(arguments,1),q=z.requestAnimationFrame||z.mozRequestAnimationFrame||z.webkitRequestAnimationFrame||z.msRequestAnimationFrame||function(e){setTimeout(e,0)};return e.each(function(){var n,i,e,o,a,t,r,s,l,c=j.isPlainObject(w)?j.extend(!0,{},j.fn.modal.settings,w):j.extend({},j.fn.modal.settings),u=c.selector,d=c.className,f=c.namespace,m=c.error,g="."+f,p="module-"+f,h=j(this),v=j(c.context),b=h.find(u.close),y=this,x=h.data(p),C=!1;l={initialize:function(){l.verbose("Initializing dimmer",v),l.create.id(),l.create.dimmer(),l.refreshModals(),l.bind.events(),c.observeChanges&&l.observeChanges(),l.instantiate()},instantiate:function(){l.verbose("Storing instance of modal"),x=l,h.data(p,x)},create:{dimmer:function(){var e={debug:c.debug,variation:!c.centered&&"top aligned",dimmerName:"modals"},t=j.extend(!0,e,c.dimmerSettings);j.fn.dimmer!==M?(l.debug("Creating dimmer"),o=v.dimmer(t),c.detachable?(l.verbose("Modal is detachable, moving content into dimmer"),o.dimmer("add content",h)):l.set.undetached(),a=o.dimmer("get dimmer")):l.error(m.dimmer)},id:function(){r=(Math.random().toString(16)+"000000000").substr(2,8),t="."+r,l.verbose("Creating unique id for element",r)}},destroy:function(){l.verbose("Destroying previous modal"),h.removeData(p).off(g),k.off(t),a.off(t),b.off(g),v.dimmer("destroy")},observeChanges:function(){"MutationObserver"in z&&((s=new MutationObserver(function(e){l.debug("DOM tree modified, refreshing"),l.refresh()})).observe(y,{childList:!0,subtree:!0}),l.debug("Setting up mutation observer",s))},refresh:function(){l.remove.scrolling(),l.cacheSizes(),l.can.useFlex()||l.set.modalOffset(),l.set.screenHeight(),l.set.type()},refreshModals:function(){i=h.siblings(u.modal),n=i.add(h)},attachEvents:function(e,t){var n=j(e);t=j.isFunction(l[t])?l[t]:l.toggle,0<n.length?(l.debug("Attaching modal events to element",e,t),n.off(g).on("click"+g,t)):l.error(m.notFound,e)},bind:{events:function(){l.verbose("Attaching events"),h.on("click"+g,u.close,l.event.close).on("click"+g,u.approve,l.event.approve).on("click"+g,u.deny,l.event.deny),k.on("resize"+t,l.event.resize)},scrollLock:function(){o.get(0).addEventListener("touchmove",l.event.preventScroll,{passive:!1})}},unbind:{scrollLock:function(){o.get(0).removeEventListener("touchmove",l.event.preventScroll,{passive:!1})}},get:{id:function(){return(Math.random().toString(16)+"000000000").substr(2,8)}},event:{approve:function(){C||!1===c.onApprove.call(y,j(this))?l.verbose("Approve callback returned false cancelling hide"):(C=!0,l.hide(function(){C=!1}))},preventScroll:function(e){e.preventDefault()},deny:function(){C||!1===c.onDeny.call(y,j(this))?l.verbose("Deny callback returned false cancelling hide"):(C=!0,l.hide(function(){C=!1}))},close:function(){l.hide()},click:function(e){if(c.closable){var t=0<j(e.target).closest(u.modal).length,n=j.contains(I.documentElement,e.target);!t&&n&&l.is.active()&&(l.debug("Dimmer clicked, hiding all modals"),l.remove.clickaway(),c.allowMultiple?l.hide():l.hideAll())}else l.verbose("Dimmer clicked but closable setting is disabled")},debounce:function(e,t){clearTimeout(l.timer),l.timer=setTimeout(e,t)},keyboard:function(e){27==e.which&&(c.closable?(l.debug("Escape key pressed hiding modal"),l.hide()):l.debug("Escape key pressed, but closable is set to false"),e.preventDefault())},resize:function(){o.dimmer("is active")&&(l.is.animating()||l.is.active())&&q(l.refresh)}},toggle:function(){l.is.active()||l.is.animating()?l.hide():l.show()},show:function(e){e=j.isFunction(e)?e:function(){},l.refreshModals(),l.set.dimmerSettings(),l.set.dimmerStyles(),l.showModal(e)},hide:function(e){e=j.isFunction(e)?e:function(){},l.refreshModals(),l.hideModal(e)},showModal:function(e){e=j.isFunction(e)?e:function(){},l.is.animating()||!l.is.active()?(l.showDimmer(),l.cacheSizes(),l.can.useFlex()?l.remove.legacy():(l.set.legacy(),l.set.modalOffset(),l.debug("Using non-flex legacy modal positioning.")),l.set.screenHeight(),l.set.type(),l.set.clickaway(),!c.allowMultiple&&l.others.active()?l.hideOthers(l.showModal):(c.allowMultiple&&c.detachable&&h.detach().appendTo(a),c.onShow.call(y),c.transition&&j.fn.transition!==M&&h.transition("is supported")?(l.debug("Showing modal with css animations"),h.transition({debug:c.debug,animation:c.transition+" in",queue:c.queue,duration:c.duration,useFailSafe:!0,onComplete:function(){c.onVisible.apply(y),c.keyboardShortcuts&&l.add.keyboardShortcuts(),l.save.focus(),l.set.active(),c.autofocus&&l.set.autofocus(),e()}})):l.error(m.noTransition))):l.debug("Modal is already visible")},hideModal:function(e,t){e=j.isFunction(e)?e:function(){},l.debug("Hiding modal"),!1!==c.onHide.call(y,j(this))?(l.is.animating()||l.is.active())&&(c.transition&&j.fn.transition!==M&&h.transition("is supported")?(l.remove.active(),h.transition({debug:c.debug,animation:c.transition+" out",queue:c.queue,duration:c.duration,useFailSafe:!0,onStart:function(){l.others.active()||t||l.hideDimmer(),c.keyboardShortcuts&&l.remove.keyboardShortcuts()},onComplete:function(){c.onHidden.call(y),l.remove.dimmerStyles(),l.restore.focus(),e()}})):l.error(m.noTransition)):l.verbose("Hide callback returned false cancelling hide")},showDimmer:function(){o.dimmer("is animating")||!o.dimmer("is active")?(l.debug("Showing dimmer"),o.dimmer("show")):l.debug("Dimmer already visible")},hideDimmer:function(){o.dimmer("is animating")||o.dimmer("is active")?(l.unbind.scrollLock(),o.dimmer("hide",function(){l.remove.clickaway(),l.remove.screenHeight()})):l.debug("Dimmer is not visible cannot hide")},hideAll:function(e){var t=n.filter("."+d.active+", ."+d.animating);e=j.isFunction(e)?e:function(){},0<t.length&&(l.debug("Hiding all visible modals"),l.hideDimmer(),t.modal("hide modal",e))},hideOthers:function(e){var t=i.filter("."+d.active+", ."+d.animating);e=j.isFunction(e)?e:function(){},0<t.length&&(l.debug("Hiding other modals",i),t.modal("hide modal",e,!0))},others:{active:function(){return 0<i.filter("."+d.active).length},animating:function(){return 0<i.filter("."+d.animating).length}},add:{keyboardShortcuts:function(){l.verbose("Adding keyboard shortcuts"),T.on("keyup"+g,l.event.keyboard)}},save:{focus:function(){0<j(I.activeElement).closest(h).length||(e=j(I.activeElement).blur())}},restore:{focus:function(){e&&0<e.length&&e.focus()}},remove:{active:function(){h.removeClass(d.active)},legacy:function(){h.removeClass(d.legacy)},clickaway:function(){a.off("click"+t)},dimmerStyles:function(){a.removeClass(d.inverted),o.removeClass(d.blurring)},bodyStyle:function(){""===A.attr("style")&&(l.verbose("Removing style attribute"),A.removeAttr("style"))},screenHeight:function(){l.debug("Removing page height"),A.css("height","")},keyboardShortcuts:function(){l.verbose("Removing keyboard shortcuts"),T.off("keyup"+g)},scrolling:function(){o.removeClass(d.scrolling),h.removeClass(d.scrolling)}},cacheSizes:function(){h.addClass(d.loading);var e=h.prop("scrollHeight"),t=h.outerWidth(),n=h.outerHeight();l.cache!==M&&0===n||(l.cache={pageHeight:j(I).outerHeight(),width:t,height:n+c.offset,scrollHeight:e+c.offset,contextHeight:"body"==c.context?j(z).height():o.height()},l.cache.topOffset=-l.cache.height/2),h.removeClass(d.loading),l.debug("Caching modal and container sizes",l.cache)},can:{useFlex:function(){return"auto"==c.useFlex?c.detachable&&!l.is.ie():c.useFlex},fit:function(){var e=l.cache.contextHeight,t=l.cache.contextHeight/2,n=l.cache.topOffset,i=l.cache.scrollHeight,o=l.cache.height,a=c.padding;return o<i?t+n+i+a<e:o+2*a<e}},is:{active:function(){return h.hasClass(d.active)},ie:function(){return!z.ActiveXObject&&"ActiveXObject"in z||"ActiveXObject"in z},animating:function(){return h.transition("is supported")?h.transition("is animating"):h.is(":visible")},scrolling:function(){return o.hasClass(d.scrolling)},modernBrowser:function(){return!(z.ActiveXObject||"ActiveXObject"in z)}},set:{autofocus:function(){var e=h.find("[tabindex], :input").filter(":visible"),t=e.filter("[autofocus]"),n=0<t.length?t.first():e.first();0<n.length&&n.focus()},clickaway:function(){a.on("click"+t,l.event.click)},dimmerSettings:function(){if(j.fn.dimmer!==M){var e={debug:c.debug,dimmerName:"modals",closable:"auto",useFlex:l.can.useFlex(),variation:!c.centered&&"top aligned",duration:{show:c.duration,hide:c.duration}},t=j.extend(!0,e,c.dimmerSettings);c.inverted&&(t.variation=t.variation!==M?t.variation+" inverted":"inverted"),v.dimmer("setting",t)}else l.error(m.dimmer)},dimmerStyles:function(){c.inverted?a.addClass(d.inverted):a.removeClass(d.inverted),c.blurring?o.addClass(d.blurring):o.removeClass(d.blurring)},modalOffset:function(){var e=l.cache.width,t=l.cache.height;h.css({marginTop:c.centered&&l.can.fit()?-t/2:0,marginLeft:-e/2}),l.verbose("Setting modal offset for legacy mode")},screenHeight:function(){l.can.fit()?A.css("height",""):(l.debug("Modal is taller than page content, resizing page height"),A.css("height",l.cache.height+2*c.padding))},active:function(){h.addClass(d.active)},scrolling:function(){o.addClass(d.scrolling),h.addClass(d.scrolling),l.unbind.scrollLock()},legacy:function(){h.addClass(d.legacy)},type:function(){l.can.fit()?(l.verbose("Modal fits on screen"),l.others.active()||l.others.animating()||(l.remove.scrolling(),l.bind.scrollLock())):(l.verbose("Modal cannot fit on screen setting to scrolling"),l.set.scrolling())},undetached:function(){o.addClass(d.undetached)}},setting:function(e,t){if(l.debug("Changing setting",e,t),j.isPlainObject(e))j.extend(!0,c,e);else{if(t===M)return c[e];j.isPlainObject(c[e])?j.extend(!0,c[e],t):c[e]=t}},internal:function(e,t){if(j.isPlainObject(e))j.extend(!0,l,e);else{if(t===M)return l[e];l[e]=t}},debug:function(){!c.silent&&c.debug&&(c.performance?l.performance.log(arguments):(l.debug=Function.prototype.bind.call(console.info,console,c.name+":"),l.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?l.performance.log(arguments):(l.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),l.verbose.apply(console,arguments)))},error:function(){c.silent||(l.error=Function.prototype.bind.call(console.error,console,c.name+":"),l.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(P||t),P=t,E.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:y,"Execution Time":n})),clearTimeout(l.performance.timer),l.performance.timer=setTimeout(l.performance.display,500)},display:function(){var e=c.name+":",n=0;P=!1,clearTimeout(l.performance.timer),j.each(E,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",R&&(e+=" '"+R+"'"),(console.group!==M||console.table!==M)&&0<E.length&&(console.groupCollapsed(e),console.table?console.table(E):j.each(E,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),E=[]}},invoke:function(i,e,t){var o,a,n,r=x;return e=e||D,t=y||t,"string"==typeof i&&r!==M&&(i=i.split(/[\. ]/),o=i.length-1,j.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(j.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==M)return a=r[n],!1;if(!j.isPlainObject(r[t])||e==o)return r[t]!==M&&(a=r[t]),!1;r=r[t]}})),j.isFunction(a)?n=a.apply(t,e):a!==M&&(n=a),j.isArray(S)?S.push(n):S!==M?S=[S,n]:n!==M&&(S=n),a}},O?(x===M&&l.initialize(),l.invoke(F)):(x!==M&&x.invoke("destroy"),l.initialize())}),S!==M?S:this},j.fn.modal.settings={name:"Modal",namespace:"modal",useFlex:"auto",offset:0,silent:!1,debug:!1,verbose:!1,performance:!0,observeChanges:!1,allowMultiple:!1,detachable:!0,closable:!0,autofocus:!0,inverted:!1,blurring:!1,centered:!0,dimmerSettings:{closable:!1,useCSS:!0},keyboardShortcuts:!0,context:"body",queue:!1,duration:500,transition:"scale",padding:50,onShow:function(){},onVisible:function(){},onHide:function(){return!0},onHidden:function(){},onApprove:function(){return!0},onDeny:function(){return!0},selector:{close:"> .close",approve:".actions .positive, .actions .approve, .actions .ok",deny:".actions .negative, .actions .deny, .actions .cancel",modal:".ui.modal"},error:{dimmer:"UI Dimmer, a required component is not included in this page",method:"The method you called is not defined.",notFound:"The element you specified could not be found"},className:{active:"active",animating:"animating",blurring:"blurring",inverted:"inverted",legacy:"legacy",loading:"loading",scrolling:"scrolling",undetached:"undetached"}}}(jQuery,window,document),function(y,x,e,C){"use strict";x=void 0!==x&&x.Math==Math?x:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),y.fn.nag=function(d){var f,e=y(this),m=e.selector||"",g=(new Date).getTime(),p=[],h=d,v="string"==typeof h,b=[].slice.call(arguments,1);return e.each(function(){var s,i=y.isPlainObject(d)?y.extend(!0,{},y.fn.nag.settings,d):y.extend({},y.fn.nag.settings),e=(i.className,i.selector),l=i.error,t=i.namespace,n="."+t,o=t+"-module",a=y(this),r=(a.find(e.close),i.context?y(i.context):y("body")),c=this,u=a.data(o);x.requestAnimationFrame||x.mozRequestAnimationFrame||x.webkitRequestAnimationFrame||x.msRequestAnimationFrame;s={initialize:function(){s.verbose("Initializing element"),a.on("click"+n,e.close,s.dismiss).data(o,s),i.detachable&&a.parent()[0]!==r[0]&&a.detach().prependTo(r),0<i.displayTime&&setTimeout(s.hide,i.displayTime),s.show()},destroy:function(){s.verbose("Destroying instance"),a.removeData(o).off(n)},show:function(){s.should.show()&&!a.is(":visible")&&(s.debug("Showing nag",i.animation.show),"fade"==i.animation.show?a.fadeIn(i.duration,i.easing):a.slideDown(i.duration,i.easing))},hide:function(){s.debug("Showing nag",i.animation.hide),"fade"==i.animation.show?a.fadeIn(i.duration,i.easing):a.slideUp(i.duration,i.easing)},onHide:function(){s.debug("Removing nag",i.animation.hide),a.remove(),i.onHide&&i.onHide()},dismiss:function(e){i.storageMethod&&s.storage.set(i.key,i.value),s.hide(),e.stopImmediatePropagation(),e.preventDefault()},should:{show:function(){return i.persist?(s.debug("Persistent nag is set, can show nag"),!0):s.storage.get(i.key)!=i.value.toString()?(s.debug("Stored value is not set, can show nag",s.storage.get(i.key)),!0):(s.debug("Stored value is set, cannot show nag",s.storage.get(i.key)),!1)}},get:{storageOptions:function(){var e={};return i.expires&&(e.expires=i.expires),i.domain&&(e.domain=i.domain),i.path&&(e.path=i.path),e}},clear:function(){s.storage.remove(i.key)},storage:{set:function(e,t){var n=s.get.storageOptions();if("localstorage"==i.storageMethod&&x.localStorage!==C)x.localStorage.setItem(e,t),s.debug("Value stored using local storage",e,t);else if("sessionstorage"==i.storageMethod&&x.sessionStorage!==C)x.sessionStorage.setItem(e,t),s.debug("Value stored using session storage",e,t);else{if(y.cookie===C)return void s.error(l.noCookieStorage);y.cookie(e,t,n),s.debug("Value stored using cookie",e,t,n)}},get:function(e,t){var n;return"localstorage"==i.storageMethod&&x.localStorage!==C?n=x.localStorage.getItem(e):"sessionstorage"==i.storageMethod&&x.sessionStorage!==C?n=x.sessionStorage.getItem(e):y.cookie!==C?n=y.cookie(e):s.error(l.noCookieStorage),"undefined"!=n&&"null"!=n&&n!==C&&null!==n||(n=C),n},remove:function(e){var t=s.get.storageOptions();"localstorage"==i.storageMethod&&x.localStorage!==C?x.localStorage.removeItem(e):"sessionstorage"==i.storageMethod&&x.sessionStorage!==C?x.sessionStorage.removeItem(e):y.cookie!==C?y.removeCookie(e,t):s.error(l.noStorage)}},setting:function(e,t){if(s.debug("Changing setting",e,t),y.isPlainObject(e))y.extend(!0,i,e);else{if(t===C)return i[e];y.isPlainObject(i[e])?y.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(y.isPlainObject(e))y.extend(!0,s,e);else{if(t===C)return s[e];s[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,i.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),s.verbose.apply(console,arguments)))},error:function(){i.silent||(s.error=Function.prototype.bind.call(console.error,console,i.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(g||t),g=t,p.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:c,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=i.name+":",n=0;g=!1,clearTimeout(s.performance.timer),y.each(p,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",m&&(e+=" '"+m+"'"),(console.group!==C||console.table!==C)&&0<p.length&&(console.groupCollapsed(e),console.table?console.table(p):y.each(p,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),p=[]}},invoke:function(i,e,t){var o,a,n,r=u;return e=e||b,t=c||t,"string"==typeof i&&r!==C&&(i=i.split(/[\. ]/),o=i.length-1,y.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(y.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==C)return a=r[n],!1;if(!y.isPlainObject(r[t])||e==o)return r[t]!==C?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),y.isFunction(a)?n=a.apply(t,e):a!==C&&(n=a),y.isArray(f)?f.push(n):f!==C?f=[f,n]:n!==C&&(f=n),a}},v?(u===C&&s.initialize(),s.invoke(h)):(u!==C&&u.invoke("destroy"),s.initialize())}),f!==C?f:this},y.fn.nag.settings={name:"Nag",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"Nag",persist:!1,displayTime:0,animation:{show:"slide",hide:"slide"},context:!1,detachable:!1,expires:30,domain:!1,path:"/",storageMethod:"cookie",key:"nag",value:"dismiss",error:{noCookieStorage:"$.cookie is not included. A storage solution is required.",noStorage:"Neither $.cookie or store is defined. A storage solution is required for storing state",method:"The method you called is not defined."},className:{bottom:"bottom",fixed:"fixed"},selector:{close:".close.icon"},speed:500,easing:"easeOutQuad",onHide:function(){}},y.extend(y.easing,{easeOutQuad:function(e,t,n,i,o){return-i*(t/=o)*(t-2)+n}})}(jQuery,window,document),function(z,I,M,L){"use strict";I=void 0!==I&&I.Math==Math?I:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),z.fn.popup=function(k){var T,e=z(this),A=z(M),R=z(I),P=z("body"),E=e.selector||"",F=(new Date).getTime(),O=[],D=k,q="string"==typeof D,j=[].slice.call(arguments,1);return e.each(function(){var u,c,e,t,n,d,f=z.isPlainObject(k)?z.extend(!0,{},z.fn.popup.settings,k):z.extend({},z.fn.popup.settings),o=f.selector,m=f.className,g=f.error,p=f.metadata,i=f.namespace,a="."+f.namespace,r="module-"+i,h=z(this),s=z(f.context),l=z(f.scrollContext),v=z(f.boundary),b=f.target?z(f.target):h,y=0,x=!1,C=!1,w=this,S=h.data(r);d={initialize:function(){d.debug("Initializing",h),d.createID(),d.bind.events(),!d.exists()&&f.preserve&&d.create(),f.observeChanges&&d.observeChanges(),d.instantiate()},instantiate:function(){d.verbose("Storing instance",d),S=d,h.data(r,S)},observeChanges:function(){"MutationObserver"in I&&((e=new MutationObserver(d.event.documentChanged)).observe(M,{childList:!0,subtree:!0}),d.debug("Setting up mutation observer",e))},refresh:function(){f.popup?u=z(f.popup).eq(0):f.inline&&(u=b.nextAll(o.popup).eq(0),f.popup=u),f.popup?(u.addClass(m.loading),c=d.get.offsetParent(),u.removeClass(m.loading),f.movePopup&&d.has.popup()&&d.get.offsetParent(u)[0]!==c[0]&&(d.debug("Moving popup to the same offset parent as target"),u.detach().appendTo(c))):c=f.inline?d.get.offsetParent(b):d.has.popup()?d.get.offsetParent(u):P,c.is("html")&&c[0]!==P[0]&&(d.debug("Setting page as offset parent"),c=P),d.get.variation()&&d.set.variation()},reposition:function(){d.refresh(),d.set.position()},destroy:function(){d.debug("Destroying previous module"),e&&e.disconnect(),u&&!f.preserve&&d.removePopup(),clearTimeout(d.hideTimer),clearTimeout(d.showTimer),d.unbind.close(),d.unbind.events(),h.removeData(r)},event:{start:function(e){var t=z.isPlainObject(f.delay)?f.delay.show:f.delay;clearTimeout(d.hideTimer),C||(d.showTimer=setTimeout(d.show,t))},end:function(){var e=z.isPlainObject(f.delay)?f.delay.hide:f.delay;clearTimeout(d.showTimer),d.hideTimer=setTimeout(d.hide,e)},touchstart:function(e){C=!0,d.show()},resize:function(){d.is.visible()&&d.set.position()},documentChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==w||0<z(e).find(w).length)&&(d.debug("Element removed from DOM, tearing down events"),d.destroy())})})},hideGracefully:function(e){var t=z(e.target),n=z.contains(M.documentElement,e.target),i=0<t.closest(o.popup).length;e&&!i&&n?(d.debug("Click occurred outside popup hiding popup"),d.hide()):d.debug("Click was inside popup, keeping popup open")}},create:function(){var e=d.get.html(),t=d.get.title(),n=d.get.content();e||n||t?(d.debug("Creating pop-up html"),e||(e=f.templates.popup({title:t,content:n})),u=z("<div/>").addClass(m.popup).data(p.activator,h).html(e),f.inline?(d.verbose("Inserting popup element inline",u),u.insertAfter(h)):(d.verbose("Appending popup element to body",u),u.appendTo(s)),d.refresh(),d.set.variation(),f.hoverable&&d.bind.popup(),f.onCreate.call(u,w)):0!==b.next(o.popup).length?(d.verbose("Pre-existing popup found"),f.inline=!0,f.popup=b.next(o.popup).data(p.activator,h),d.refresh(),f.hoverable&&d.bind.popup()):f.popup?(z(f.popup).data(p.activator,h),d.verbose("Used popup specified in settings"),d.refresh(),f.hoverable&&d.bind.popup()):d.debug("No content specified skipping display",w)},createID:function(){n=(Math.random().toString(16)+"000000000").substr(2,8),t="."+n,d.verbose("Creating unique id for element",n)},toggle:function(){d.debug("Toggling pop-up"),d.is.hidden()?(d.debug("Popup is hidden, showing pop-up"),d.unbind.close(),d.show()):(d.debug("Popup is visible, hiding pop-up"),d.hide())},show:function(e){if(e=e||function(){},d.debug("Showing pop-up",f.transition),d.is.hidden()&&(!d.is.active()||!d.is.dropdown())){if(d.exists()||d.create(),!1===f.onShow.call(u,w))return void d.debug("onShow callback returned false, cancelling popup animation");f.preserve||f.popup||d.refresh(),u&&d.set.position()&&(d.save.conditions(),f.exclusive&&d.hideAll(),d.animate.show(e))}},hide:function(e){if(e=e||function(){},d.is.visible()||d.is.animating()){if(!1===f.onHide.call(u,w))return void d.debug("onHide callback returned false, cancelling popup animation");d.remove.visible(),d.unbind.close(),d.restore.conditions(),d.animate.hide(e)}},hideAll:function(){z(o.popup).filter("."+m.popupVisible).each(function(){z(this).data(p.activator).popup("hide")})},exists:function(){return!!u&&(f.inline||f.popup?d.has.popup():1<=u.closest(s).length)},removePopup:function(){d.has.popup()&&!f.popup&&(d.debug("Removing popup",u),u.remove(),u=L,f.onRemove.call(u,w))},save:{conditions:function(){d.cache={title:h.attr("title")},d.cache.title&&h.removeAttr("title"),d.verbose("Saving original attributes",d.cache.title)}},restore:{conditions:function(){return d.cache&&d.cache.title&&(h.attr("title",d.cache.title),d.verbose("Restoring original attributes",d.cache.title)),!0}},supports:{svg:function(){return"undefined"==typeof SVGGraphicsElement}},animate:{show:function(e){e=z.isFunction(e)?e:function(){},f.transition&&z.fn.transition!==L&&h.transition("is supported")?(d.set.visible(),u.transition({animation:f.transition+" in",queue:!1,debug:f.debug,verbose:f.verbose,duration:f.duration,onComplete:function(){d.bind.close(),e.call(u,w),f.onVisible.call(u,w)}})):d.error(g.noTransition)},hide:function(e){e=z.isFunction(e)?e:function(){},d.debug("Hiding pop-up"),!1!==f.onHide.call(u,w)?f.transition&&z.fn.transition!==L&&h.transition("is supported")?u.transition({animation:f.transition+" out",queue:!1,duration:f.duration,debug:f.debug,verbose:f.verbose,onComplete:function(){d.reset(),e.call(u,w),f.onHidden.call(u,w)}}):d.error(g.noTransition):d.debug("onHide callback returned false, cancelling popup animation")}},change:{content:function(e){u.html(e)}},get:{html:function(){return h.removeData(p.html),h.data(p.html)||f.html},title:function(){return h.removeData(p.title),h.data(p.title)||f.title},content:function(){return h.removeData(p.content),h.data(p.content)||f.content||h.attr("title")},variation:function(){return h.removeData(p.variation),h.data(p.variation)||f.variation},popup:function(){return u},popupOffset:function(){return u.offset()},calculations:function(){var e,t=d.get.offsetParent(u),n=b[0],i=v[0]==I,o=f.inline||f.popup&&f.movePopup?b.position():b.offset(),a=i?{top:0,left:0}:v.offset(),r={},s=i?{top:R.scrollTop(),left:R.scrollLeft()}:{top:0,left:0};if(r={target:{element:b[0],width:b.outerWidth(),height:b.outerHeight(),top:o.top,left:o.left,margin:{}},popup:{width:u.outerWidth(),height:u.outerHeight()},parent:{width:c.outerWidth(),height:c.outerHeight()},screen:{top:a.top,left:a.left,scroll:{top:s.top,left:s.left},width:v.width(),height:v.height()}},t.get(0)!==c.get(0)){var l=t.offset();r.target.top-=l.top,r.target.left-=l.left,r.parent.width=t.outerWidth(),r.parent.height=t.outerHeight()}return f.setFluidWidth&&d.is.fluid()&&(r.container={width:u.parent().outerWidth()},r.popup.width=r.container.width),r.target.margin.top=f.inline?parseInt(I.getComputedStyle(n).getPropertyValue("margin-top"),10):0,r.target.margin.left=f.inline?d.is.rtl()?parseInt(I.getComputedStyle(n).getPropertyValue("margin-right"),10):parseInt(I.getComputedStyle(n).getPropertyValue("margin-left"),10):0,e=r.screen,r.boundary={top:e.top+e.scroll.top,bottom:e.top+e.scroll.top+e.height,left:e.left+e.scroll.left,right:e.left+e.scroll.left+e.width},r},id:function(){return n},startEvent:function(){return"hover"==f.on?"mouseenter":"focus"==f.on&&"focus"},scrollEvent:function(){return"scroll"},endEvent:function(){return"hover"==f.on?"mouseleave":"focus"==f.on&&"blur"},distanceFromBoundary:function(e,t){var n,i,o={};return n=(t=t||d.get.calculations()).popup,i=t.boundary,e&&(o={top:e.top-i.top,left:e.left-i.left,right:i.right-(e.left+n.width),bottom:i.bottom-(e.top+n.height)},d.verbose("Distance from boundaries determined",e,o)),o},offsetParent:function(e){var t=(e!==L?e[0]:b[0]).parentNode,n=z(t);if(t)for(var i="none"===n.css("transform"),o="static"===n.css("position"),a=n.is("body");t&&!a&&o&&i;)t=t.parentNode,i="none"===(n=z(t)).css("transform"),o="static"===n.css("position"),a=n.is("body");return n&&0<n.length?n:z()},positions:function(){return{"top left":!1,"top center":!1,"top right":!1,"bottom left":!1,"bottom center":!1,"bottom right":!1,"left center":!1,"right center":!1}},nextPosition:function(e){var t=e.split(" "),n=t[0],i=t[1],o="top"==n||"bottom"==n,a=!1,r=!1,s=!1;return x||(d.verbose("All available positions available"),x=d.get.positions()),d.debug("Recording last position tried",e),x[e]=!0,"opposite"===f.prefer&&(s=(s=[{top:"bottom",bottom:"top",left:"right",right:"left"}[n],i]).join(" "),a=!0===x[s],d.debug("Trying opposite strategy",s)),"adjacent"===f.prefer&&o&&(s=(s=[n,{left:"center",center:"right",right:"left"}[i]]).join(" "),r=!0===x[s],d.debug("Trying adjacent strategy",s)),(r||a)&&(d.debug("Using backup position",s),s={"top left":"top center","top center":"top right","top right":"right center","right center":"bottom right","bottom right":"bottom center","bottom center":"bottom left","bottom left":"left center","left center":"top left"}[e]),s}},set:{position:function(e,t){if(0!==b.length&&0!==u.length){var n,i,o,a,r,s,l,c;if(t=t||d.get.calculations(),e=e||h.data(p.position)||f.position,n=h.data(p.offset)||f.offset,i=f.distanceAway,o=t.target,a=t.popup,r=t.parent,d.should.centerArrow(t)&&(d.verbose("Adjusting offset to center arrow on small target element"),"top left"!=e&&"bottom left"!=e||(n+=o.width/2,n-=f.arrowPixelsFromEdge),"top right"!=e&&"bottom right"!=e||(n-=o.width/2,n+=f.arrowPixelsFromEdge)),0===o.width&&0===o.height&&!d.is.svg(o.element))return d.debug("Popup target is hidden, no action taken"),!1;switch(f.inline&&(d.debug("Adding margin to calculation",o.margin),"left center"==e||"right center"==e?(n+=o.margin.top,i+=-o.margin.left):"top left"==e||"top center"==e||"top right"==e?(n+=o.margin.left,i-=o.margin.top):(n+=o.margin.left,i+=o.margin.top)),d.debug("Determining popup position from calculations",e,t),d.is.rtl()&&(e=e.replace(/left|right/g,function(e){return"left"==e?"right":"left"}),d.debug("RTL: Popup position updated",e)),y==f.maxSearchDepth&&"string"==typeof f.lastResort&&(e=f.lastResort),e){case"top left":s={top:"auto",bottom:r.height-o.top+i,left:o.left+n,right:"auto"};break;case"top center":s={bottom:r.height-o.top+i,left:o.left+o.width/2-a.width/2+n,top:"auto",right:"auto"};break;case"top right":s={bottom:r.height-o.top+i,right:r.width-o.left-o.width-n,top:"auto",left:"auto"};break;case"left center":s={top:o.top+o.height/2-a.height/2+n,right:r.width-o.left+i,left:"auto",bottom:"auto"};break;case"right center":s={top:o.top+o.height/2-a.height/2+n,left:o.left+o.width+i,bottom:"auto",right:"auto"};break;case"bottom left":s={top:o.top+o.height+i,left:o.left+n,bottom:"auto",right:"auto"};break;case"bottom center":s={top:o.top+o.height+i,left:o.left+o.width/2-a.width/2+n,bottom:"auto",right:"auto"};break;case"bottom right":s={top:o.top+o.height+i,right:r.width-o.left-o.width-n,left:"auto",bottom:"auto"}}if(s===L&&d.error(g.invalidPosition,e),d.debug("Calculated popup positioning values",s),u.css(s).removeClass(m.position).addClass(e).addClass(m.loading),l=d.get.popupOffset(),c=d.get.distanceFromBoundary(l,t),d.is.offstage(c,e)){if(d.debug("Position is outside viewport",e),y<f.maxSearchDepth)return y++,e=d.get.nextPosition(e),d.debug("Trying new position",e),!!u&&d.set.position(e,t);if(!f.lastResort)return d.debug("Popup could not find a position to display",u),d.error(g.cannotPlace,w),d.remove.attempts(),d.remove.loading(),d.reset(),f.onUnplaceable.call(u,w),!1;d.debug("No position found, showing with last position")}return d.debug("Position is on stage",e),d.remove.attempts(),d.remove.loading(),f.setFluidWidth&&d.is.fluid()&&d.set.fluidWidth(t),!0}d.error(g.notFound)},fluidWidth:function(e){e=e||d.get.calculations(),d.debug("Automatically setting element width to parent width",e.parent.width),u.css("width",e.container.width)},variation:function(e){(e=e||d.get.variation())&&d.has.popup()&&(d.verbose("Adding variation to popup",e),u.addClass(e))},visible:function(){h.addClass(m.visible)}},remove:{loading:function(){u.removeClass(m.loading)},variation:function(e){(e=e||d.get.variation())&&(d.verbose("Removing variation",e),u.removeClass(e))},visible:function(){h.removeClass(m.visible)},attempts:function(){d.verbose("Resetting all searched positions"),y=0,x=!1}},bind:{events:function(){d.debug("Binding popup events to module"),"click"==f.on&&h.on("click"+a,d.toggle),"hover"==f.on&&h.on("touchstart"+a,d.event.touchstart),d.get.startEvent()&&h.on(d.get.startEvent()+a,d.event.start).on(d.get.endEvent()+a,d.event.end),f.target&&d.debug("Target set to element",b),R.on("resize"+t,d.event.resize)},popup:function(){d.verbose("Allowing hover events on popup to prevent closing"),u&&d.has.popup()&&u.on("mouseenter"+a,d.event.start).on("mouseleave"+a,d.event.end)},close:function(){(!0===f.hideOnScroll||"auto"==f.hideOnScroll&&"click"!=f.on)&&d.bind.closeOnScroll(),d.is.closable()?d.bind.clickaway():"hover"==f.on&&C&&d.bind.touchClose()},closeOnScroll:function(){d.verbose("Binding scroll close event to document"),l.one(d.get.scrollEvent()+t,d.event.hideGracefully)},touchClose:function(){d.verbose("Binding popup touchclose event to document"),A.on("touchstart"+t,function(e){d.verbose("Touched away from popup"),d.event.hideGracefully.call(w,e)})},clickaway:function(){d.verbose("Binding popup close event to document"),A.on("click"+t,function(e){d.verbose("Clicked away from popup"),d.event.hideGracefully.call(w,e)})}},unbind:{events:function(){R.off(t),h.off(a)},close:function(){A.off(t),l.off(t)}},has:{popup:function(){return u&&0<u.length}},should:{centerArrow:function(e){return!d.is.basic()&&e.target.width<=2*f.arrowPixelsFromEdge}},is:{closable:function(){return"auto"==f.closable?"hover"!=f.on:f.closable},offstage:function(e,n){var i=[];return z.each(e,function(e,t){t<-f.jitter&&(d.debug("Position exceeds allowable distance from edge",e,t,n),i.push(e))}),0<i.length},svg:function(e){return d.supports.svg()&&e instanceof SVGGraphicsElement},basic:function(){return h.hasClass(m.basic)},active:function(){return h.hasClass(m.active)},animating:function(){return u!==L&&u.hasClass(m.animating)},fluid:function(){return u!==L&&u.hasClass(m.fluid)},visible:function(){return u!==L&&u.hasClass(m.popupVisible)},dropdown:function(){return h.hasClass(m.dropdown)},hidden:function(){return!d.is.visible()},rtl:function(){return"rtl"==h.css("direction")}},reset:function(){d.remove.visible(),f.preserve?z.fn.transition!==L&&u.transition("remove transition"):d.removePopup()},setting:function(e,t){if(z.isPlainObject(e))z.extend(!0,f,e);else{if(t===L)return f[e];f[e]=t}},internal:function(e,t){if(z.isPlainObject(e))z.extend(!0,d,e);else{if(t===L)return d[e];d[e]=t}},debug:function(){!f.silent&&f.debug&&(f.performance?d.performance.log(arguments):(d.debug=Function.prototype.bind.call(console.info,console,f.name+":"),d.debug.apply(console,arguments)))},verbose:function(){!f.silent&&f.verbose&&f.debug&&(f.performance?d.performance.log(arguments):(d.verbose=Function.prototype.bind.call(console.info,console,f.name+":"),d.verbose.apply(console,arguments)))},error:function(){f.silent||(d.error=Function.prototype.bind.call(console.error,console,f.name+":"),d.error.apply(console,arguments))},performance:{log:function(e){var t,n;f.performance&&(n=(t=(new Date).getTime())-(F||t),F=t,O.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:w,"Execution Time":n})),clearTimeout(d.performance.timer),d.performance.timer=setTimeout(d.performance.display,500)},display:function(){var e=f.name+":",n=0;F=!1,clearTimeout(d.performance.timer),z.each(O,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",E&&(e+=" '"+E+"'"),(console.group!==L||console.table!==L)&&0<O.length&&(console.groupCollapsed(e),console.table?console.table(O):z.each(O,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),O=[]}},invoke:function(i,e,t){var o,a,n,r=S;return e=e||j,t=w||t,"string"==typeof i&&r!==L&&(i=i.split(/[\. ]/),o=i.length-1,z.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(z.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==L)return a=r[n],!1;if(!z.isPlainObject(r[t])||e==o)return r[t]!==L&&(a=r[t]),!1;r=r[t]}})),z.isFunction(a)?n=a.apply(t,e):a!==L&&(n=a),z.isArray(T)?T.push(n):T!==L?T=[T,n]:n!==L&&(T=n),a}},q?(S===L&&d.initialize(),d.invoke(D)):(S!==L&&S.invoke("destroy"),d.initialize())}),T!==L?T:this},z.fn.popup.settings={name:"Popup",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"popup",observeChanges:!0,onCreate:function(){},onRemove:function(){},onShow:function(){},onVisible:function(){},onHide:function(){},onUnplaceable:function(){},onHidden:function(){},on:"hover",boundary:I,addTouchEvents:!0,position:"top left",variation:"",movePopup:!0,target:!1,popup:!1,inline:!1,preserve:!1,hoverable:!1,content:!1,html:!1,title:!1,closable:!0,hideOnScroll:"auto",exclusive:!1,context:"body",scrollContext:I,prefer:"opposite",lastResort:!1,arrowPixelsFromEdge:20,delay:{show:50,hide:70},setFluidWidth:!0,duration:200,transition:"scale",distanceAway:0,jitter:2,offset:0,maxSearchDepth:15,error:{invalidPosition:"The position you specified is not a valid position",cannotPlace:"Popup does not fit within the boundaries of the viewport",method:"The method you called is not defined.",noTransition:"This module requires ui transitions <https://github.com/Semantic-Org/UI-Transition>",notFound:"The target or popup you specified does not exist on the page"},metadata:{activator:"activator",content:"content",html:"html",offset:"offset",position:"position",title:"title",variation:"variation"},className:{active:"active",basic:"basic",animating:"animating",dropdown:"dropdown",fluid:"fluid",loading:"loading",popup:"ui popup",position:"top left center bottom right",visible:"visible",popupVisible:"visible"},selector:{popup:".ui.popup"},templates:{escape:function(e){var t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"};return/[&<>"'`]/.test(e)?e.replace(/[&<>"'`]/g,function(e){return t[e]}):e},popup:function(e){var t="",n=z.fn.popup.settings.templates.escape;return typeof e!==L&&(typeof e.title!==L&&e.title&&(e.title=n(e.title),t+='<div class="header">'+e.title+"</div>"),typeof e.content!==L&&e.content&&(e.content=n(e.content),t+='<div class="content">'+e.content+"</div>")),t}}}}(jQuery,window,document),function(k,e,T,A){"use strict";void 0!==(e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")())&&e.Math==Math||("undefined"!=typeof self&&self.Math==Math?self:Function("return this")());k.fn.progress=function(h){var v,e=k(this),b=e.selector||"",y=(new Date).getTime(),x=[],C=h,w="string"==typeof C,S=[].slice.call(arguments,1);return e.each(function(){var s,i=k.isPlainObject(h)?k.extend(!0,{},k.fn.progress.settings,h):k.extend({},k.fn.progress.settings),t=i.className,n=i.metadata,e=i.namespace,o=i.selector,l=i.error,a="."+e,r="module-"+e,c=k(this),u=k(this).find(o.bar),d=k(this).find(o.progress),f=k(this).find(o.label),m=this,g=c.data(r),p=!1;s={initialize:function(){s.debug("Initializing progress bar",i),s.set.duration(),s.set.transitionEvent(),s.read.metadata(),s.read.settings(),s.instantiate()},instantiate:function(){s.verbose("Storing instance of progress",s),g=s,c.data(r,s)},destroy:function(){s.verbose("Destroying previous progress for",c),clearInterval(g.interval),s.remove.state(),c.removeData(r),g=A},reset:function(){s.remove.nextValue(),s.update.progress(0)},complete:function(){(s.percent===A||s.percent<100)&&(s.remove.progressPoll(),s.set.percent(100))},read:{metadata:function(){var e={percent:c.data(n.percent),total:c.data(n.total),value:c.data(n.value)};e.percent&&(s.debug("Current percent value set from metadata",e.percent),s.set.percent(e.percent)),e.total&&(s.debug("Total value set from metadata",e.total),s.set.total(e.total)),e.value&&(s.debug("Current value set from metadata",e.value),s.set.value(e.value),s.set.progress(e.value))},settings:function(){!1!==i.total&&(s.debug("Current total set in settings",i.total),s.set.total(i.total)),!1!==i.value&&(s.debug("Current value set in settings",i.value),s.set.value(i.value),s.set.progress(s.value)),!1!==i.percent&&(s.debug("Current percent set in settings",i.percent),s.set.percent(i.percent))}},bind:{transitionEnd:function(t){var e=s.get.transitionEnd();u.one(e+a,function(e){clearTimeout(s.failSafeTimer),t.call(this,e)}),s.failSafeTimer=setTimeout(function(){u.triggerHandler(e)},i.duration+i.failSafeDelay),s.verbose("Adding fail safe timer",s.timer)}},increment:function(e){var t,n;s.has.total()?n=(t=s.get.value())+(e=e||1):(n=(t=s.get.percent())+(e=e||s.get.randomValue()),100,s.debug("Incrementing percentage by",t,n)),n=s.get.normalizedValue(n),s.set.progress(n)},decrement:function(e){var t,n;s.get.total()?(n=(t=s.get.value())-(e=e||1),s.debug("Decrementing value by",e,t)):(n=(t=s.get.percent())-(e=e||s.get.randomValue()),s.debug("Decrementing percentage by",e,t)),n=s.get.normalizedValue(n),s.set.progress(n)},has:{progressPoll:function(){return s.progressPoll},total:function(){return!1!==s.get.total()}},get:{text:function(e){var t=s.value||0,n=s.total||0,i=p?s.get.displayPercent():s.percent||0,o=0<s.total?n-t:100-i;return e=(e=e||"").replace("{value}",t).replace("{total}",n).replace("{left}",o).replace("{percent}",i),s.verbose("Adding variables to progress bar text",e),e},normalizedValue:function(e){if(e<0)return s.debug("Value cannot decrement below 0"),0;if(s.has.total()){if(e>s.total)return s.debug("Value cannot increment above total",s.total),s.total}else if(100<e)return s.debug("Value cannot increment above 100 percent"),100;return e},updateInterval:function(){return"auto"==i.updateInterval?i.duration:i.updateInterval},randomValue:function(){return s.debug("Generating random increment percentage"),Math.floor(Math.random()*i.random.max+i.random.min)},numericValue:function(e){return"string"==typeof e?""!==e.replace(/[^\d.]/g,"")&&+e.replace(/[^\d.]/g,""):e},transitionEnd:function(){var e,t=T.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==A)return n[e]},displayPercent:function(){var e=u.width(),t=c.width(),n=parseInt(u.css("min-width"),10)<e?e/t*100:s.percent;return 0<i.precision?Math.round(n*(10*i.precision))/(10*i.precision):Math.round(n)},percent:function(){return s.percent||0},value:function(){return s.nextValue||s.value||0},total:function(){return s.total||!1}},create:{progressPoll:function(){s.progressPoll=setTimeout(function(){s.update.toNextValue(),s.remove.progressPoll()},s.get.updateInterval())}},is:{complete:function(){return s.is.success()||s.is.warning()||s.is.error()},success:function(){return c.hasClass(t.success)},warning:function(){return c.hasClass(t.warning)},error:function(){return c.hasClass(t.error)},active:function(){return c.hasClass(t.active)},visible:function(){return c.is(":visible")}},remove:{progressPoll:function(){s.verbose("Removing progress poll timer"),s.progressPoll&&(clearTimeout(s.progressPoll),delete s.progressPoll)},nextValue:function(){s.verbose("Removing progress value stored for next update"),delete s.nextValue},state:function(){s.verbose("Removing stored state"),delete s.total,delete s.percent,delete s.value},active:function(){s.verbose("Removing active state"),c.removeClass(t.active)},success:function(){s.verbose("Removing success state"),c.removeClass(t.success)},warning:function(){s.verbose("Removing warning state"),c.removeClass(t.warning)},error:function(){s.verbose("Removing error state"),c.removeClass(t.error)}},set:{barWidth:function(e){100<e?s.error(l.tooHigh,e):e<0?s.error(l.tooLow,e):(u.css("width",e+"%"),c.attr("data-percent",parseInt(e,10)))},duration:function(e){e="number"==typeof(e=e||i.duration)?e+"ms":e,s.verbose("Setting progress bar transition duration",e),u.css({"transition-duration":e})},percent:function(e){e="string"==typeof e?+e.replace("%",""):e,e=0<i.precision?Math.round(e*(10*i.precision))/(10*i.precision):Math.round(e),s.percent=e,s.has.total()||(s.value=0<i.precision?Math.round(e/100*s.total*(10*i.precision))/(10*i.precision):Math.round(e/100*s.total*10)/10,i.limitValues&&(s.value=100<s.value?100:s.value<0?0:s.value)),s.set.barWidth(e),s.set.labelInterval(),s.set.labels(),i.onChange.call(m,e,s.value,s.total)},labelInterval:function(){clearInterval(s.interval),s.bind.transitionEnd(function(){s.verbose("Bar finished animating, removing continuous label updates"),clearInterval(s.interval),p=!1,s.set.labels()}),p=!0,s.interval=setInterval(function(){k.contains(T.documentElement,m)||(clearInterval(s.interval),p=!1),s.set.labels()},i.framerate)},labels:function(){s.verbose("Setting both bar progress and outer label text"),s.set.barLabel(),s.set.state()},label:function(e){(e=e||"")&&(e=s.get.text(e),s.verbose("Setting label to text",e),f.text(e))},state:function(e){100===(e=e!==A?e:s.percent)?i.autoSuccess&&!(s.is.warning()||s.is.error()||s.is.success())?(s.set.success(),s.debug("Automatically triggering success at 100%")):(s.verbose("Reached 100% removing active state"),s.remove.active(),s.remove.progressPoll()):0<e?(s.verbose("Adjusting active progress bar label",e),s.set.active()):(s.remove.active(),s.set.label(i.text.active))},barLabel:function(e){e!==A?d.text(s.get.text(e)):"ratio"==i.label&&s.total?(s.verbose("Adding ratio to bar label"),d.text(s.get.text(i.text.ratio))):"percent"==i.label&&(s.verbose("Adding percentage to bar label"),d.text(s.get.text(i.text.percent)))},active:function(e){e=e||i.text.active,s.debug("Setting active state"),i.showActivity&&!s.is.active()&&c.addClass(t.active),s.remove.warning(),s.remove.error(),s.remove.success(),(e=i.onLabelUpdate("active",e,s.value,s.total))&&s.set.label(e),s.bind.transitionEnd(function(){i.onActive.call(m,s.value,s.total)})},success:function(e){e=e||i.text.success||i.text.active,s.debug("Setting success state"),c.addClass(t.success),s.remove.active(),s.remove.warning(),s.remove.error(),s.complete(),e=i.text.success?i.onLabelUpdate("success",e,s.value,s.total):i.onLabelUpdate("active",e,s.value,s.total),s.set.label(e),s.bind.transitionEnd(function(){i.onSuccess.call(m,s.total)})},warning:function(e){e=e||i.text.warning,s.debug("Setting warning state"),c.addClass(t.warning),s.remove.active(),s.remove.success(),s.remove.error(),s.complete(),(e=i.onLabelUpdate("warning",e,s.value,s.total))&&s.set.label(e),s.bind.transitionEnd(function(){i.onWarning.call(m,s.value,s.total)})},error:function(e){e=e||i.text.error,s.debug("Setting error state"),c.addClass(t.error),s.remove.active(),s.remove.success(),s.remove.warning(),s.complete(),(e=i.onLabelUpdate("error",e,s.value,s.total))&&s.set.label(e),s.bind.transitionEnd(function(){i.onError.call(m,s.value,s.total)})},transitionEvent:function(){s.get.transitionEnd()},total:function(e){s.total=e},value:function(e){s.value=e},progress:function(e){s.has.progressPoll()?(s.debug("Updated within interval, setting next update to use new value",e),s.set.nextValue(e)):(s.debug("First update in progress update interval, immediately updating",e),s.update.progress(e),s.create.progressPoll())},nextValue:function(e){s.nextValue=e}},update:{toNextValue:function(){var e=s.nextValue;e&&(s.debug("Update interval complete using last updated value",e),s.update.progress(e),s.remove.nextValue())},progress:function(e){var t;!1===(e=s.get.numericValue(e))&&s.error(l.nonNumeric,e),e=s.get.normalizedValue(e),s.has.total()?(s.set.value(e),t=e/s.total*100,s.debug("Calculating percent complete from total",t)):(t=e,s.debug("Setting value to exact percentage value",t)),s.set.percent(t)}},setting:function(e,t){if(s.debug("Changing setting",e,t),k.isPlainObject(e))k.extend(!0,i,e);else{if(t===A)return i[e];k.isPlainObject(i[e])?k.extend(!0,i[e],t):i[e]=t}},internal:function(e,t){if(k.isPlainObject(e))k.extend(!0,s,e);else{if(t===A)return s[e];s[e]=t}},debug:function(){!i.silent&&i.debug&&(i.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,i.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!i.silent&&i.verbose&&i.debug&&(i.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,i.name+":"),s.verbose.apply(console,arguments)))},error:function(){i.silent||(s.error=Function.prototype.bind.call(console.error,console,i.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;i.performance&&(n=(t=(new Date).getTime())-(y||t),y=t,x.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:m,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=i.name+":",n=0;y=!1,clearTimeout(s.performance.timer),k.each(x,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",b&&(e+=" '"+b+"'"),(console.group!==A||console.table!==A)&&0<x.length&&(console.groupCollapsed(e),console.table?console.table(x):k.each(x,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),x=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||S,t=m||t,"string"==typeof i&&r!==A&&(i=i.split(/[\. ]/),o=i.length-1,k.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(k.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==A)return a=r[n],!1;if(!k.isPlainObject(r[t])||e==o)return r[t]!==A?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),k.isFunction(a)?n=a.apply(t,e):a!==A&&(n=a),k.isArray(v)?v.push(n):v!==A?v=[v,n]:n!==A&&(v=n),a}},w?(g===A&&s.initialize(),s.invoke(C)):(g!==A&&g.invoke("destroy"),s.initialize())}),v!==A?v:this},k.fn.progress.settings={name:"Progress",namespace:"progress",silent:!1,debug:!1,verbose:!1,performance:!0,random:{min:2,max:5},duration:300,updateInterval:"auto",autoSuccess:!0,showActivity:!0,limitValues:!0,label:"percent",precision:0,framerate:1e3/30,percent:!1,total:!1,value:!1,failSafeDelay:100,onLabelUpdate:function(e,t,n,i){return t},onChange:function(e,t,n){},onSuccess:function(e){},onActive:function(e,t){},onError:function(e,t){},onWarning:function(e,t){},error:{method:"The method you called is not defined.",nonNumeric:"Progress value is non numeric",tooHigh:"Value specified is above 100%",tooLow:"Value specified is below 0%"},regExp:{variable:/\{\$*[A-z0-9]+\}/g},metadata:{percent:"percent",total:"total",value:"value"},selector:{bar:"> .bar",label:"> .label",progress:".bar > .progress"},text:{active:!1,error:!1,success:!1,warning:!1,percent:"{percent}%",ratio:"{value} of {total}"},className:{active:"active",error:"error",success:"success",warning:"warning"}}}(jQuery,window,document),function(w,e,t,S){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),w.fn.rating=function(m){var g,p=w(this),h=p.selector||"",v=(new Date).getTime(),b=[],y=m,x="string"==typeof y,C=[].slice.call(arguments,1);return p.each(function(){var e,i,o=w.isPlainObject(m)?w.extend(!0,{},w.fn.rating.settings,m):w.extend({},w.fn.rating.settings),t=o.namespace,a=o.className,n=o.metadata,r=o.selector,s=(o.error,"."+t),l="module-"+t,c=this,u=w(this).data(l),d=w(this),f=d.find(r.icon);i={initialize:function(){i.verbose("Initializing rating module",o),0===f.length&&i.setup.layout(),o.interactive?i.enable():i.disable(),i.set.initialLoad(),i.set.rating(i.get.initialRating()),i.remove.initialLoad(),i.instantiate()},instantiate:function(){i.verbose("Instantiating module",o),u=i,d.data(l,i)},destroy:function(){i.verbose("Destroying previous instance",u),i.remove.events(),d.removeData(l)},refresh:function(){f=d.find(r.icon)},setup:{layout:function(){var e=i.get.maxRating(),t=w.fn.rating.settings.templates.icon(e);i.debug("Generating icon html dynamically"),d.html(t),i.refresh()}},event:{mouseenter:function(){var e=w(this);e.nextAll().removeClass(a.selected),d.addClass(a.selected),e.addClass(a.selected).prevAll().addClass(a.selected)},mouseleave:function(){d.removeClass(a.selected),f.removeClass(a.selected)},click:function(){var e=w(this),t=i.get.rating(),n=f.index(e)+1;("auto"==o.clearable?1===f.length:o.clearable)&&t==n?i.clearRating():i.set.rating(n)}},clearRating:function(){i.debug("Clearing current rating"),i.set.rating(0)},bind:{events:function(){i.verbose("Binding events"),d.on("mouseenter"+s,r.icon,i.event.mouseenter).on("mouseleave"+s,r.icon,i.event.mouseleave).on("click"+s,r.icon,i.event.click)}},remove:{events:function(){i.verbose("Removing events"),d.off(s)},initialLoad:function(){e=!1}},enable:function(){i.debug("Setting rating to interactive mode"),i.bind.events(),d.removeClass(a.disabled)},disable:function(){i.debug("Setting rating to read-only mode"),i.remove.events(),d.addClass(a.disabled)},is:{initialLoad:function(){return e}},get:{initialRating:function(){return d.data(n.rating)!==S?(d.removeData(n.rating),d.data(n.rating)):o.initialRating},maxRating:function(){return d.data(n.maxRating)!==S?(d.removeData(n.maxRating),d.data(n.maxRating)):o.maxRating},rating:function(){var e=f.filter("."+a.active).length;return i.verbose("Current rating retrieved",e),e}},set:{rating:function(e){var t=0<=e-1?e-1:0,n=f.eq(t);d.removeClass(a.selected),f.removeClass(a.selected).removeClass(a.active),0<e&&(i.verbose("Setting current rating to",e),n.prevAll().addBack().addClass(a.active)),i.is.initialLoad()||o.onRate.call(c,e)},initialLoad:function(){e=!0}},setting:function(e,t){if(i.debug("Changing setting",e,t),w.isPlainObject(e))w.extend(!0,o,e);else{if(t===S)return o[e];w.isPlainObject(o[e])?w.extend(!0,o[e],t):o[e]=t}},internal:function(e,t){if(w.isPlainObject(e))w.extend(!0,i,e);else{if(t===S)return i[e];i[e]=t}},debug:function(){!o.silent&&o.debug&&(o.performance?i.performance.log(arguments):(i.debug=Function.prototype.bind.call(console.info,console,o.name+":"),i.debug.apply(console,arguments)))},verbose:function(){!o.silent&&o.verbose&&o.debug&&(o.performance?i.performance.log(arguments):(i.verbose=Function.prototype.bind.call(console.info,console,o.name+":"),i.verbose.apply(console,arguments)))},error:function(){o.silent||(i.error=Function.prototype.bind.call(console.error,console,o.name+":"),i.error.apply(console,arguments))},performance:{log:function(e){var t,n;o.performance&&(n=(t=(new Date).getTime())-(v||t),v=t,b.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:c,"Execution Time":n})),clearTimeout(i.performance.timer),i.performance.timer=setTimeout(i.performance.display,500)},display:function(){var e=o.name+":",n=0;v=!1,clearTimeout(i.performance.timer),w.each(b,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",h&&(e+=" '"+h+"'"),1<p.length&&(e+=" ("+p.length+")"),(console.group!==S||console.table!==S)&&0<b.length&&(console.groupCollapsed(e),console.table?console.table(b):w.each(b,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),b=[]}},invoke:function(i,e,t){var o,a,n,r=u;return e=e||C,t=c||t,"string"==typeof i&&r!==S&&(i=i.split(/[\. ]/),o=i.length-1,w.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(w.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==S)return a=r[n],!1;if(!w.isPlainObject(r[t])||e==o)return r[t]!==S&&(a=r[t]),!1;r=r[t]}})),w.isFunction(a)?n=a.apply(t,e):a!==S&&(n=a),w.isArray(g)?g.push(n):g!==S?g=[g,n]:n!==S&&(g=n),a}},x?(u===S&&i.initialize(),i.invoke(y)):(u!==S&&u.invoke("destroy"),i.initialize())}),g!==S?g:this},w.fn.rating.settings={name:"Rating",namespace:"rating",slent:!1,debug:!1,verbose:!1,performance:!0,initialRating:0,interactive:!0,maxRating:4,clearable:"auto",fireOnInit:!1,onRate:function(e){},error:{method:"The method you called is not defined",noMaximum:"No maximum rating specified. Cannot generate HTML automatically"},metadata:{rating:"rating",maxRating:"maxRating"},className:{active:"active",disabled:"disabled",selected:"selected",loading:"loading"},selector:{icon:".icon"},templates:{icon:function(e){for(var t=1,n="";t<=e;)n+='<i class="icon"></i>',t++;return n}}}}(jQuery,window,document),function(E,F,O,D){"use strict";F=void 0!==F&&F.Math==Math?F:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),E.fn.search=function(l){var C,w=E(this),S=w.selector||"",k=(new Date).getTime(),T=[],A=l,R="string"==typeof A,P=[].slice.call(arguments,1);return E(this).each(function(){var f,c=E.isPlainObject(l)?E.extend(!0,{},E.fn.search.settings,l):E.extend({},E.fn.search.settings),m=c.className,u=c.metadata,d=c.regExp,a=c.fields,g=c.selector,p=c.error,e=c.namespace,i="."+e,t=e+"-module",h=E(this),v=h.find(g.prompt),n=h.find(g.searchButton),o=h.find(g.results),r=h.find(g.result),b=(h.find(g.category),this),s=h.data(t),y=!1,x=!1;f={initialize:function(){f.verbose("Initializing module"),f.get.settings(),f.determine.searchFields(),f.bind.events(),f.set.type(),f.create.results(),f.instantiate()},instantiate:function(){f.verbose("Storing instance of module",f),s=f,h.data(t,f)},destroy:function(){f.verbose("Destroying instance"),h.off(i).removeData(t)},refresh:function(){f.debug("Refreshing selector cache"),v=h.find(g.prompt),n=h.find(g.searchButton),h.find(g.category),o=h.find(g.results),r=h.find(g.result)},refreshResults:function(){o=h.find(g.results),r=h.find(g.result)},bind:{events:function(){f.verbose("Binding events to search"),c.automatic&&(h.on(f.get.inputEvent()+i,g.prompt,f.event.input),v.attr("autocomplete","off")),h.on("focus"+i,g.prompt,f.event.focus).on("blur"+i,g.prompt,f.event.blur).on("keydown"+i,g.prompt,f.handleKeyboard).on("click"+i,g.searchButton,f.query).on("mousedown"+i,g.results,f.event.result.mousedown).on("mouseup"+i,g.results,f.event.result.mouseup).on("click"+i,g.result,f.event.result.click)}},determine:{searchFields:function(){l&&l.searchFields!==D&&(c.searchFields=l.searchFields)}},event:{input:function(){c.searchDelay?(clearTimeout(f.timer),f.timer=setTimeout(function(){f.is.focused()&&f.query()},c.searchDelay)):f.query()},focus:function(){f.set.focus(),c.searchOnFocus&&f.has.minimumCharacters()&&f.query(function(){f.can.show()&&f.showResults()})},blur:function(e){var t=O.activeElement===this,n=function(){f.cancel.query(),f.remove.focus(),f.timer=setTimeout(f.hideResults,c.hideDelay)};t||(x=!1,f.resultsClicked?(f.debug("Determining if user action caused search to close"),h.one("click.close"+i,g.results,function(e){f.is.inMessage(e)||y?v.focus():(y=!1,f.is.animating()||f.is.hidden()||n())})):(f.debug("Input blurred without user action, closing results"),n()))},result:{mousedown:function(){f.resultsClicked=!0},mouseup:function(){f.resultsClicked=!1},click:function(e){f.debug("Search result selected");var t=E(this),n=t.find(g.title).eq(0),i=t.is("a[href]")?t:t.find("a[href]").eq(0),o=i.attr("href")||!1,a=i.attr("target")||!1,r=(n.html(),0<n.length&&n.text()),s=f.get.results(),l=t.data(u.result)||f.get.result(r,s);if(E.isFunction(c.onSelect)&&!1===c.onSelect.call(b,l,s))return f.debug("Custom onSelect callback cancelled default select action"),void(y=!0);f.hideResults(),r&&f.set.value(r),o&&(f.verbose("Opening search link found in result",i),"_blank"==a||e.ctrlKey?F.open(o):F.location.href=o)}}},handleKeyboard:function(e){var t,n=h.find(g.result),i=h.find(g.category),o=n.filter("."+m.active),a=n.index(o),r=n.length,s=0<o.length,l=e.which,c=13,u=38,d=40;if(l==27&&(f.verbose("Escape key pressed, blurring search field"),f.hideResults(),x=!0),f.is.visible())if(l==c){if(f.verbose("Enter key pressed, selecting active result"),0<n.filter("."+m.active).length)return f.event.result.click.call(n.filter("."+m.active),e),e.preventDefault(),!1}else l==u&&s?(f.verbose("Up key pressed, changing active result"),t=a-1<0?a:a-1,i.removeClass(m.active),n.removeClass(m.active).eq(t).addClass(m.active).closest(i).addClass(m.active),e.preventDefault()):l==d&&(f.verbose("Down key pressed, changing active result"),t=r<=a+1?a:a+1,i.removeClass(m.active),n.removeClass(m.active).eq(t).addClass(m.active).closest(i).addClass(m.active),e.preventDefault());else l==c&&(f.verbose("Enter key pressed, executing query"),f.query(),f.set.buttonPressed(),v.one("keyup",f.remove.buttonFocus))},setup:{api:function(t,n){var e={debug:c.debug,on:!1,cache:c.cache,action:"search",urlData:{query:t},onSuccess:function(e){f.parse.response.call(b,e,t),n()},onFailure:function(){f.displayMessage(p.serverError),n()},onAbort:function(e){},onError:f.error};E.extend(!0,e,c.apiSettings),f.verbose("Setting up API request",e),h.api(e)}},can:{useAPI:function(){return E.fn.api!==D},show:function(){return f.is.focused()&&!f.is.visible()&&!f.is.empty()},transition:function(){return c.transition&&E.fn.transition!==D&&h.transition("is supported")}},is:{animating:function(){return o.hasClass(m.animating)},hidden:function(){return o.hasClass(m.hidden)},inMessage:function(e){if(e.target){var t=E(e.target);return E.contains(O.documentElement,e.target)&&0<t.closest(g.message).length}},empty:function(){return""===o.html()},visible:function(){return 0<o.filter(":visible").length},focused:function(){return 0<v.filter(":focus").length}},get:{settings:function(){E.isPlainObject(l)&&l.searchFullText&&(c.fullTextSearch=l.searchFullText,f.error(c.error.oldSearchSyntax,b))},inputEvent:function(){var e=v[0];return e!==D&&e.oninput!==D?"input":e!==D&&e.onpropertychange!==D?"propertychange":"keyup"},value:function(){return v.val()},results:function(){return h.data(u.results)},result:function(n,e){var i=["title","id"],o=!1;return n=n!==D?n:f.get.value(),e=e!==D?e:f.get.results(),"category"===c.type?(f.debug("Finding result that matches",n),E.each(e,function(e,t){if(E.isArray(t.results)&&(o=f.search.object(n,t.results,i)[0]))return!1})):(f.debug("Finding result in results object",n),o=f.search.object(n,e,i)[0]),o||!1}},select:{firstResult:function(){f.verbose("Selecting first result"),r.first().addClass(m.active)}},set:{focus:function(){h.addClass(m.focus)},loading:function(){h.addClass(m.loading)},value:function(e){f.verbose("Setting search input value",e),v.val(e)},type:function(e){e=e||c.type,"category"==c.type&&h.addClass(c.type)},buttonPressed:function(){n.addClass(m.pressed)}},remove:{loading:function(){h.removeClass(m.loading)},focus:function(){h.removeClass(m.focus)},buttonPressed:function(){n.removeClass(m.pressed)}},query:function(e){e=E.isFunction(e)?e:function(){};var t=f.get.value(),n=f.read.cache(t);e=e||function(){},f.has.minimumCharacters()?(n?(f.debug("Reading result from cache",t),f.save.results(n.results),f.addResults(n.html),f.inject.id(n.results),e()):(f.debug("Querying for",t),E.isPlainObject(c.source)||E.isArray(c.source)?(f.search.local(t),e()):f.can.useAPI()?f.search.remote(t,e):(f.error(p.source),e())),c.onSearchQuery.call(b,t)):f.hideResults()},search:{local:function(e){var t,n=f.search.object(e,c.content);f.set.loading(),f.save.results(n),f.debug("Returned full local search results",n),0<c.maxResults&&(f.debug("Using specified max results",n),n=n.slice(0,c.maxResults)),"category"==c.type&&(n=f.create.categoryResults(n)),t=f.generateResults({results:n}),f.remove.loading(),f.addResults(t),f.inject.id(n),f.write.cache(e,{html:t,results:n})},remote:function(e,t){t=E.isFunction(t)?t:function(){},h.api("is loading")&&h.api("abort"),f.setup.api(e,t),h.api("query")},object:function(i,t,e){var a=[],r=[],s=[],n=i.toString().replace(d.escape,"\\$&"),o=new RegExp(d.beginsWith+n,"i"),l=function(e,t){var n=-1==E.inArray(t,a),i=-1==E.inArray(t,s),o=-1==E.inArray(t,r);n&&i&&o&&e.push(t)};return t=t||c.source,e=e!==D?e:c.searchFields,E.isArray(e)||(e=[e]),t===D||!1===t?(f.error(p.source),[]):(E.each(e,function(e,n){E.each(t,function(e,t){"string"==typeof t[n]&&(-1!==t[n].search(o)?l(a,t):"exact"===c.fullTextSearch&&f.exactSearch(i,t[n])?l(r,t):1==c.fullTextSearch&&f.fuzzySearch(i,t[n])&&l(s,t))})}),E.merge(r,s),E.merge(a,r),a)}},exactSearch:function(e,t){return e=e.toLowerCase(),-1<(t=t.toLowerCase()).indexOf(e)},fuzzySearch:function(e,t){var n=t.length,i=e.length;if("string"!=typeof e)return!1;if(e=e.toLowerCase(),t=t.toLowerCase(),n<i)return!1;if(i===n)return e===t;e:for(var o=0,a=0;o<i;o++){for(var r=e.charCodeAt(o);a<n;)if(t.charCodeAt(a++)===r)continue e;return!1}return!0},parse:{response:function(e,t){var n=f.generateResults(e);f.verbose("Parsing server response",e),e!==D&&t!==D&&e[a.results]!==D&&(f.addResults(n),f.inject.id(e[a.results]),f.write.cache(t,{html:n,results:e[a.results]}),f.save.results(e[a.results]))}},cancel:{query:function(){f.can.useAPI()&&h.api("abort")}},has:{minimumCharacters:function(){return f.get.value().length>=c.minCharacters},results:function(){return 0!==o.length&&""!=o.html()}},clear:{cache:function(e){var t=h.data(u.cache);e?e&&t&&t[e]&&(f.debug("Removing value from cache",e),delete t[e],h.data(u.cache,t)):(f.debug("Clearing cache",e),h.removeData(u.cache))}},read:{cache:function(e){var t=h.data(u.cache);return!!c.cache&&(f.verbose("Checking cache for generated html for query",e),"object"==typeof t&&t[e]!==D&&t[e])}},create:{categoryResults:function(e){var n={};return E.each(e,function(e,t){t.category&&(n[t.category]===D?(f.verbose("Creating new category of results",t.category),n[t.category]={name:t.category,results:[t]}):n[t.category].results.push(t))}),n},id:function(e,t){var n,i=e+1;return t!==D?(n=String.fromCharCode(97+t)+i,f.verbose("Creating category result id",n)):(n=i,f.verbose("Creating result id",n)),n},results:function(){0===o.length&&(o=E("<div />").addClass(m.results).appendTo(h))}},inject:{result:function(e,t,n){f.verbose("Injecting result into results");var i=n!==D?o.children().eq(n).children(g.results).first().children(g.result).eq(t):o.children(g.result).eq(t);f.verbose("Injecting results metadata",i),i.data(u.result,e)},id:function(i){f.debug("Injecting unique ids into results");var o=0,a=0;return"category"===c.type?E.each(i,function(e,i){a=0,E.each(i.results,function(e,t){var n=i.results[e];n.id===D&&(n.id=f.create.id(a,o)),f.inject.result(n,a,o),a++}),o++}):E.each(i,function(e,t){var n=i[e];n.id===D&&(n.id=f.create.id(a)),f.inject.result(n,a),a++}),i}},save:{results:function(e){f.verbose("Saving current search results to metadata",e),h.data(u.results,e)}},write:{cache:function(e,t){var n=h.data(u.cache)!==D?h.data(u.cache):{};c.cache&&(f.verbose("Writing generated html to cache",e,t),n[e]=t,h.data(u.cache,n))}},addResults:function(e){if(E.isFunction(c.onResultsAdd)&&!1===c.onResultsAdd.call(o,e))return f.debug("onResultsAdd callback cancelled default action"),!1;e?(o.html(e),f.refreshResults(),c.selectFirstResult&&f.select.firstResult(),f.showResults()):f.hideResults(function(){o.empty()})},showResults:function(e){e=E.isFunction(e)?e:function(){},x||!f.is.visible()&&f.has.results()&&(f.can.transition()?(f.debug("Showing results with css animations"),o.transition({animation:c.transition+" in",debug:c.debug,verbose:c.verbose,duration:c.duration,onComplete:function(){e()},queue:!0})):(f.debug("Showing results with javascript"),o.stop().fadeIn(c.duration,c.easing)),c.onResultsOpen.call(o))},hideResults:function(e){e=E.isFunction(e)?e:function(){},f.is.visible()&&(f.can.transition()?(f.debug("Hiding results with css animations"),o.transition({animation:c.transition+" out",debug:c.debug,verbose:c.verbose,duration:c.duration,onComplete:function(){e()},queue:!0})):(f.debug("Hiding results with javascript"),o.stop().fadeOut(c.duration,c.easing)),c.onResultsClose.call(o))},generateResults:function(e){f.debug("Generating html from response",e);var t=c.templates[c.type],n=E.isPlainObject(e[a.results])&&!E.isEmptyObject(e[a.results]),i=E.isArray(e[a.results])&&0<e[a.results].length,o="";return n||i?(0<c.maxResults&&(n?"standard"==c.type&&f.error(p.maxResults):e[a.results]=e[a.results].slice(0,c.maxResults)),E.isFunction(t)?o=t(e,a):f.error(p.noTemplate,!1)):c.showNoResults&&(o=f.displayMessage(p.noResults,"empty")),c.onResults.call(b,e),o},displayMessage:function(e,t){return t=t||"standard",f.debug("Displaying message",e,t),f.addResults(c.templates.message(e,t)),c.templates.message(e,t)},setting:function(e,t){if(E.isPlainObject(e))E.extend(!0,c,e);else{if(t===D)return c[e];c[e]=t}},internal:function(e,t){if(E.isPlainObject(e))E.extend(!0,f,e);else{if(t===D)return f[e];f[e]=t}},debug:function(){!c.silent&&c.debug&&(c.performance?f.performance.log(arguments):(f.debug=Function.prototype.bind.call(console.info,console,c.name+":"),f.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?f.performance.log(arguments):(f.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),f.verbose.apply(console,arguments)))},error:function(){c.silent||(f.error=Function.prototype.bind.call(console.error,console,c.name+":"),f.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(k||t),k=t,T.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:b,"Execution Time":n})),clearTimeout(f.performance.timer),f.performance.timer=setTimeout(f.performance.display,500)},display:function(){var e=c.name+":",n=0;k=!1,clearTimeout(f.performance.timer),E.each(T,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",S&&(e+=" '"+S+"'"),1<w.length&&(e+=" ("+w.length+")"),(console.group!==D||console.table!==D)&&0<T.length&&(console.groupCollapsed(e),console.table?console.table(T):E.each(T,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),T=[]}},invoke:function(i,e,t){var o,a,n,r=s;return e=e||P,t=b||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,E.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(E.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!E.isPlainObject(r[t])||e==o)return r[t]!==D&&(a=r[t]),!1;r=r[t]}})),E.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),E.isArray(C)?C.push(n):C!==D?C=[C,n]:n!==D&&(C=n),a}},R?(s===D&&f.initialize(),f.invoke(A)):(s!==D&&s.invoke("destroy"),f.initialize())}),C!==D?C:this},E.fn.search.settings={name:"Search",namespace:"search",silent:!1,debug:!1,verbose:!1,performance:!0,type:"standard",minCharacters:1,selectFirstResult:!1,apiSettings:!1,source:!1,searchOnFocus:!0,searchFields:["title","description"],displayField:"",fullTextSearch:"exact",automatic:!0,hideDelay:0,searchDelay:200,maxResults:7,cache:!0,showNoResults:!0,transition:"scale",duration:200,easing:"easeOutExpo",onSelect:!1,onResultsAdd:!1,onSearchQuery:function(e){},onResults:function(e){},onResultsOpen:function(){},onResultsClose:function(){},className:{animating:"animating",active:"active",empty:"empty",focus:"focus",hidden:"hidden",loading:"loading",results:"results",pressed:"down"},error:{source:"Cannot search. No source used, and Semantic API module was not included",noResults:"Your search returned no results",logging:"Error in debug logging, exiting.",noEndpoint:"No search endpoint was specified",noTemplate:"A valid template name was not specified.",oldSearchSyntax:"searchFullText setting has been renamed fullTextSearch for consistency, please adjust your settings.",serverError:"There was an issue querying the server.",maxResults:"Results must be an array to use maxResults setting",method:"The method you called is not defined."},metadata:{cache:"cache",results:"results",result:"result"},regExp:{escape:/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,beginsWith:"(?:s|^)"},fields:{categories:"results",categoryName:"name",categoryResults:"results",description:"description",image:"image",price:"price",results:"results",title:"title",url:"url",action:"action",actionText:"text",actionURL:"url"},selector:{prompt:".prompt",searchButton:".search.button",results:".results",message:".results > .message",category:".category",result:".result",title:".title, .name"},templates:{escape:function(e){var t={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"};return/[&<>"'`]/.test(e)?e.replace(/[&<>"'`]/g,function(e){return t[e]}):e},message:function(e,t){var n="";return e!==D&&t!==D&&(n+='<div class="message '+t+'">',n+="empty"==t?'<div class="header">No Results</div class="header"><div class="description">'+e+'</div class="description">':' <div class="description">'+e+"</div>",n+="</div>"),n},category:function(e,n){var i="";E.fn.search.settings.templates.escape;return e[n.categoryResults]!==D&&(E.each(e[n.categoryResults],function(e,t){t[n.results]!==D&&0<t.results.length&&(i+='<div class="category">',t[n.categoryName]!==D&&(i+='<div class="name">'+t[n.categoryName]+"</div>"),i+='<div class="results">',E.each(t.results,function(e,t){t[n.url]?i+='<a class="result" href="'+t[n.url]+'">':i+='<a class="result">',t[n.image]!==D&&(i+='<div class="image"> <img src="'+t[n.image]+'"></div>'),i+='<div class="content">',t[n.price]!==D&&(i+='<div class="price">'+t[n.price]+"</div>"),t[n.title]!==D&&(i+='<div class="title">'+t[n.title]+"</div>"),t[n.description]!==D&&(i+='<div class="description">'+t[n.description]+"</div>"),i+="</div>",i+="</a>"}),i+="</div>",i+="</div>")}),e[n.action]&&(i+='<a href="'+e[n.action][n.actionURL]+'" class="action">'+e[n.action][n.actionText]+"</a>"),i)},standard:function(e,n){var i="";return e[n.results]!==D&&(E.each(e[n.results],function(e,t){t[n.url]?i+='<a class="result" href="'+t[n.url]+'">':i+='<a class="result">',t[n.image]!==D&&(i+='<div class="image"> <img src="'+t[n.image]+'"></div>'),i+='<div class="content">',t[n.price]!==D&&(i+='<div class="price">'+t[n.price]+"</div>"),t[n.title]!==D&&(i+='<div class="title">'+t[n.title]+"</div>"),t[n.description]!==D&&(i+='<div class="description">'+t[n.description]+"</div>"),i+="</div>",i+="</a>"}),e[n.action]&&(i+='<a href="'+e[n.action][n.actionURL]+'" class="action">'+e[n.action][n.actionText]+"</a>"),i)}}}}(jQuery,window,document),function(A,e,R,P){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),A.fn.shape=function(v){var b,y=A(this),x=(A("body"),(new Date).getTime()),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1),T=e.requestAnimationFrame||e.mozRequestAnimationFrame||e.webkitRequestAnimationFrame||e.msRequestAnimationFrame||function(e){setTimeout(e,0)};return y.each(function(){var i,o,a,t=y.selector||"",r=A.isPlainObject(v)?A.extend(!0,{},A.fn.shape.settings,v):A.extend({},A.fn.shape.settings),e=r.namespace,s=r.selector,n=r.error,l=r.className,c="."+e,u="module-"+e,d=A(this),f=d.find(s.sides),m=d.find(s.side),g=!1,p=this,h=d.data(u);a={initialize:function(){a.verbose("Initializing module for",p),a.set.defaultSide(),a.instantiate()},instantiate:function(){a.verbose("Storing instance of module",a),h=a,d.data(u,h)},destroy:function(){a.verbose("Destroying previous module for",p),d.removeData(u).off(c)},refresh:function(){a.verbose("Refreshing selector cache for",p),d=A(p),f=A(this).find(s.shape),m=A(this).find(s.side)},repaint:function(){a.verbose("Forcing repaint event");(f[0]||R.createElement("div")).offsetWidth},animate:function(e,t){a.verbose("Animating box with properties",e),t=t||function(e){a.verbose("Executing animation callback"),e!==P&&e.stopPropagation(),a.reset(),a.set.active()},r.beforeChange.call(o[0]),a.get.transitionEvent()?(a.verbose("Starting CSS animation"),d.addClass(l.animating),f.css(e).one(a.get.transitionEvent(),t),a.set.duration(r.duration),T(function(){d.addClass(l.animating),i.addClass(l.hidden)})):t()},queue:function(e){a.debug("Queueing animation of",e),f.one(a.get.transitionEvent(),function(){a.debug("Executing queued animation"),setTimeout(function(){d.shape(e)},0)})},reset:function(){a.verbose("Animating states reset"),d.removeClass(l.animating).attr("style","").removeAttr("style"),f.attr("style","").removeAttr("style"),m.attr("style","").removeAttr("style").removeClass(l.hidden),o.removeClass(l.animating).attr("style","").removeAttr("style")},is:{complete:function(){return m.filter("."+l.active)[0]==o[0]},animating:function(){return d.hasClass(l.animating)}},set:{defaultSide:function(){i=d.find("."+r.className.active),o=0<i.next(s.side).length?i.next(s.side):d.find(s.side).first(),g=!1,a.verbose("Active side set to",i),a.verbose("Next side set to",o)},duration:function(e){e="number"==typeof(e=e||r.duration)?e+"ms":e,a.verbose("Setting animation duration",e),(r.duration||0===r.duration)&&f.add(m).css({"-webkit-transition-duration":e,"-moz-transition-duration":e,"-ms-transition-duration":e,"-o-transition-duration":e,"transition-duration":e})},currentStageSize:function(){var e=d.find("."+r.className.active),t=e.outerWidth(!0),n=e.outerHeight(!0);d.css({width:t,height:n})},stageSize:function(){var e=d.clone().addClass(l.loading),t=e.find("."+r.className.active),n=g?e.find(s.side).eq(g):0<t.next(s.side).length?t.next(s.side):e.find(s.side).first(),i="next"==r.width?n.outerWidth(!0):"initial"==r.width?d.width():r.width,o="next"==r.height?n.outerHeight(!0):"initial"==r.height?d.height():r.height;t.removeClass(l.active),n.addClass(l.active),e.insertAfter(d),e.remove(),"auto"!=r.width&&(d.css("width",i+r.jitter),a.verbose("Specifying width during animation",i)),"auto"!=r.height&&(d.css("height",o+r.jitter),a.verbose("Specifying height during animation",o))},nextSide:function(e){g=e,o=m.filter(e),g=m.index(o),0===o.length&&(a.set.defaultSide(),a.error(n.side)),a.verbose("Next side manually set to",o)},active:function(){a.verbose("Setting new side to active",o),m.removeClass(l.active),o.addClass(l.active),r.onChange.call(o[0]),a.set.defaultSide()}},flip:{up:function(){if(!a.is.complete()||a.is.animating()||r.allowRepeats)if(a.is.animating())a.queue("flip up");else{a.debug("Flipping up",o);var e=a.get.transform.up();a.set.stageSize(),a.stage.above(),a.animate(e)}else a.debug("Side already visible",o)},down:function(){if(!a.is.complete()||a.is.animating()||r.allowRepeats)if(a.is.animating())a.queue("flip down");else{a.debug("Flipping down",o);var e=a.get.transform.down();a.set.stageSize(),a.stage.below(),a.animate(e)}else a.debug("Side already visible",o)},left:function(){if(!a.is.complete()||a.is.animating()||r.allowRepeats)if(a.is.animating())a.queue("flip left");else{a.debug("Flipping left",o);var e=a.get.transform.left();a.set.stageSize(),a.stage.left(),a.animate(e)}else a.debug("Side already visible",o)},right:function(){if(!a.is.complete()||a.is.animating()||r.allowRepeats)if(a.is.animating())a.queue("flip right");else{a.debug("Flipping right",o);var e=a.get.transform.right();a.set.stageSize(),a.stage.right(),a.animate(e)}else a.debug("Side already visible",o)},over:function(){!a.is.complete()||a.is.animating()||r.allowRepeats?a.is.animating()?a.queue("flip over"):(a.debug("Flipping over",o),a.set.stageSize(),a.stage.behind(),a.animate(a.get.transform.over())):a.debug("Side already visible",o)},back:function(){!a.is.complete()||a.is.animating()||r.allowRepeats?a.is.animating()?a.queue("flip back"):(a.debug("Flipping back",o),a.set.stageSize(),a.stage.behind(),a.animate(a.get.transform.back())):a.debug("Side already visible",o)}},get:{transform:{up:function(){return{transform:"translateY("+-(i.outerHeight(!0)-o.outerHeight(!0))/2+"px) translateZ("+-i.outerHeight(!0)/2+"px) rotateX(-90deg)"}},down:function(){return{transform:"translateY("+-(i.outerHeight(!0)-o.outerHeight(!0))/2+"px) translateZ("+-i.outerHeight(!0)/2+"px) rotateX(90deg)"}},left:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) translateZ("+-i.outerWidth(!0)/2+"px) rotateY(90deg)"}},right:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) translateZ("+-i.outerWidth(!0)/2+"px) rotateY(-90deg)"}},over:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) rotateY(180deg)"}},back:function(){return{transform:"translateX("+-(i.outerWidth(!0)-o.outerWidth(!0))/2+"px) rotateY(-180deg)"}}},transitionEvent:function(){var e,t=R.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==P)return n[e]},nextSide:function(){return 0<i.next(s.side).length?i.next(s.side):d.find(s.side).first()}},stage:{above:function(){var e={origin:(i.outerHeight(!0)-o.outerHeight(!0))/2,depth:{active:o.outerHeight(!0)/2,next:i.outerHeight(!0)/2}};a.verbose("Setting the initial animation position as above",o,e),f.css({transform:"translateZ(-"+e.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+e.depth.active+"px)"}),o.addClass(l.animating).css({top:e.origin+"px",transform:"rotateX(90deg) translateZ("+e.depth.next+"px)"})},below:function(){var e={origin:(i.outerHeight(!0)-o.outerHeight(!0))/2,depth:{active:o.outerHeight(!0)/2,next:i.outerHeight(!0)/2}};a.verbose("Setting the initial animation position as below",o,e),f.css({transform:"translateZ(-"+e.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+e.depth.active+"px)"}),o.addClass(l.animating).css({top:e.origin+"px",transform:"rotateX(-90deg) translateZ("+e.depth.next+"px)"})},left:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};a.verbose("Setting the initial animation position as left",o,n),f.css({transform:"translateZ(-"+n.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+n.depth.active+"px)"}),o.addClass(l.animating).css({left:n.origin+"px",transform:"rotateY(-90deg) translateZ("+n.depth.next+"px)"})},right:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};a.verbose("Setting the initial animation position as left",o,n),f.css({transform:"translateZ(-"+n.depth.active+"px)"}),i.css({transform:"rotateY(0deg) translateZ("+n.depth.active+"px)"}),o.addClass(l.animating).css({left:n.origin+"px",transform:"rotateY(90deg) translateZ("+n.depth.next+"px)"})},behind:function(){var e=i.outerWidth(!0),t=o.outerWidth(!0),n={origin:(e-t)/2,depth:{active:t/2,next:e/2}};a.verbose("Setting the initial animation position as behind",o,n),i.css({transform:"rotateY(0deg)"}),o.addClass(l.animating).css({left:n.origin+"px",transform:"rotateY(-180deg)"})}},setting:function(e,t){if(a.debug("Changing setting",e,t),A.isPlainObject(e))A.extend(!0,r,e);else{if(t===P)return r[e];A.isPlainObject(r[e])?A.extend(!0,r[e],t):r[e]=t}},internal:function(e,t){if(A.isPlainObject(e))A.extend(!0,a,e);else{if(t===P)return a[e];a[e]=t}},debug:function(){!r.silent&&r.debug&&(r.performance?a.performance.log(arguments):(a.debug=Function.prototype.bind.call(console.info,console,r.name+":"),a.debug.apply(console,arguments)))},verbose:function(){!r.silent&&r.verbose&&r.debug&&(r.performance?a.performance.log(arguments):(a.verbose=Function.prototype.bind.call(console.info,console,r.name+":"),a.verbose.apply(console,arguments)))},error:function(){r.silent||(a.error=Function.prototype.bind.call(console.error,console,r.name+":"),a.error.apply(console,arguments))},performance:{log:function(e){var t,n;r.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:p,"Execution Time":n})),clearTimeout(a.performance.timer),a.performance.timer=setTimeout(a.performance.display,500)},display:function(){var e=r.name+":",n=0;x=!1,clearTimeout(a.performance.timer),A.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",t&&(e+=" '"+t+"'"),1<y.length&&(e+=" ("+y.length+")"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):A.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=h;return e=e||k,t=p||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,A.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(A.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!A.isPlainObject(r[t])||e==o)return r[t]!==P&&(a=r[t]),!1;r=r[t]}})),A.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),A.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}},S?(h===P&&a.initialize(),a.invoke(w)):(h!==P&&h.invoke("destroy"),a.initialize())}),b!==P?b:this},A.fn.shape.settings={name:"Shape",silent:!1,debug:!1,verbose:!1,jitter:0,performance:!0,namespace:"shape",width:"initial",height:"initial",beforeChange:function(){},onChange:function(){},allowRepeats:!1,duration:!1,error:{side:"You tried to switch to a side that does not exist.",method:"The method you called is not defined"},className:{animating:"animating",hidden:"hidden",loading:"loading",active:"active"},selector:{sides:".sides",side:".side"}}}(jQuery,window,document),function(q,j,z,I){"use strict";j=void 0!==j&&j.Math==Math?j:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),q.fn.sidebar=function(x){var C,e=q(this),w=q(j),S=q(z),k=q("html"),T=q("head"),A=e.selector||"",R=(new Date).getTime(),P=[],E=x,F="string"==typeof E,O=[].slice.call(arguments,1),D=j.requestAnimationFrame||j.mozRequestAnimationFrame||j.webkitRequestAnimationFrame||j.msRequestAnimationFrame||function(e){setTimeout(e,0)};return e.each(function(){var r,s,e,t,l,c,u=q.isPlainObject(x)?q.extend(!0,{},q.fn.sidebar.settings,x):q.extend({},q.fn.sidebar.settings),n=u.selector,a=u.className,i=u.namespace,o=u.regExp,d=u.error,f="."+i,m="module-"+i,g=q(this),p=q(u.context),h=g.children(n.sidebar),v=(p.children(n.fixed),p.children(n.pusher)),b=this,y=g.data(m);c={initialize:function(){c.debug("Initializing sidebar",x),c.create.id(),l=c.get.transitionEvent(),u.delaySetup?D(c.setup.layout):c.setup.layout(),D(function(){c.setup.cache()}),c.instantiate()},instantiate:function(){c.verbose("Storing instance of module",c),y=c,g.data(m,c)},create:{id:function(){e=(Math.random().toString(16)+"000000000").substr(2,8),s="."+e,c.verbose("Creating unique id for element",e)}},destroy:function(){c.verbose("Destroying previous module for",g),g.off(f).removeData(m),c.is.ios()&&c.remove.ios(),p.off(s),w.off(s),S.off(s)},event:{clickaway:function(e){var t=0<v.find(e.target).length||v.is(e.target),n=p.is(e.target);t&&(c.verbose("User clicked on dimmed page"),c.hide()),n&&(c.verbose("User clicked on dimmable context (scaled out page)"),c.hide())},touch:function(e){},containScroll:function(e){b.scrollTop<=0&&(b.scrollTop=1),b.scrollTop+b.offsetHeight>=b.scrollHeight&&(b.scrollTop=b.scrollHeight-b.offsetHeight-1)},scroll:function(e){0===q(e.target).closest(n.sidebar).length&&e.preventDefault()}},bind:{clickaway:function(){c.verbose("Adding clickaway events to context",p),u.closable&&p.on("click"+s,c.event.clickaway).on("touchend"+s,c.event.clickaway)},scrollLock:function(){u.scrollLock&&(c.debug("Disabling page scroll"),w.on("DOMMouseScroll"+s,c.event.scroll)),c.verbose("Adding events to contain sidebar scroll"),S.on("touchmove"+s,c.event.touch),g.on("scroll"+f,c.event.containScroll)}},unbind:{clickaway:function(){c.verbose("Removing clickaway events from context",p),p.off(s)},scrollLock:function(){c.verbose("Removing scroll lock from page"),S.off(s),w.off(s),g.off("scroll"+f)}},add:{inlineCSS:function(){var e,t=c.cache.width||g.outerWidth(),n=c.cache.height||g.outerHeight(),i=c.is.rtl(),o=c.get.direction(),a={left:t,right:-t,top:n,bottom:-n};i&&(c.verbose("RTL detected, flipping widths"),a.left=-t,a.right=t),e="<style>","left"===o||"right"===o?(c.debug("Adding CSS rules for animation distance",t),e+=" .ui.visible."+o+".sidebar ~ .fixed, .ui.visible."+o+".sidebar ~ .pusher {   -webkit-transform: translate3d("+a[o]+"px, 0, 0);           transform: translate3d("+a[o]+"px, 0, 0); }"):"top"!==o&&"bottom"!=o||(e+=" .ui.visible."+o+".sidebar ~ .fixed, .ui.visible."+o+".sidebar ~ .pusher {   -webkit-transform: translate3d(0, "+a[o]+"px, 0);           transform: translate3d(0, "+a[o]+"px, 0); }"),c.is.ie()&&("left"===o||"right"===o?(c.debug("Adding CSS rules for animation distance",t),e+=" body.pushable > .ui.visible."+o+".sidebar ~ .pusher:after {   -webkit-transform: translate3d("+a[o]+"px, 0, 0);           transform: translate3d("+a[o]+"px, 0, 0); }"):"top"!==o&&"bottom"!=o||(e+=" body.pushable > .ui.visible."+o+".sidebar ~ .pusher:after {   -webkit-transform: translate3d(0, "+a[o]+"px, 0);           transform: translate3d(0, "+a[o]+"px, 0); }"),e+=" body.pushable > .ui.visible.left.sidebar ~ .ui.visible.right.sidebar ~ .pusher:after, body.pushable > .ui.visible.right.sidebar ~ .ui.visible.left.sidebar ~ .pusher:after {   -webkit-transform: translate3d(0px, 0, 0);           transform: translate3d(0px, 0, 0); }"),r=q(e+="</style>").appendTo(T),c.debug("Adding sizing css to head",r)}},refresh:function(){c.verbose("Refreshing selector cache"),p=q(u.context),h=p.children(n.sidebar),v=p.children(n.pusher),p.children(n.fixed),c.clear.cache()},refreshSidebars:function(){c.verbose("Refreshing other sidebars"),h=p.children(n.sidebar)},repaint:function(){c.verbose("Forcing repaint event"),b.style.display="none";b.offsetHeight;b.scrollTop=b.scrollTop,b.style.display=""},setup:{cache:function(){c.cache={width:g.outerWidth(),height:g.outerHeight(),rtl:"rtl"==g.css("direction")}},layout:function(){0===p.children(n.pusher).length&&(c.debug("Adding wrapper element for sidebar"),c.error(d.pusher),v=q('<div class="pusher" />'),p.children().not(n.omitted).not(h).wrapAll(v),c.refresh()),0!==g.nextAll(n.pusher).length&&g.nextAll(n.pusher)[0]===v[0]||(c.debug("Moved sidebar to correct parent element"),c.error(d.movedSidebar,b),g.detach().prependTo(p),c.refresh()),c.clear.cache(),c.set.pushable(),c.set.direction()}},attachEvents:function(e,t){var n=q(e);t=q.isFunction(c[t])?c[t]:c.toggle,0<n.length?(c.debug("Attaching sidebar events to element",e,t),n.on("click"+f,t)):c.error(d.notFound,e)},show:function(e){if(e=q.isFunction(e)?e:function(){},c.is.hidden()){if(c.refreshSidebars(),u.overlay&&(c.error(d.overlay),u.transition="overlay"),c.refresh(),c.othersActive())if(c.debug("Other sidebars currently visible"),u.exclusive){if("overlay"!=u.transition)return void c.hideOthers(c.show);c.hideOthers()}else u.transition="overlay";c.pushPage(function(){e.call(b),u.onShow.call(b)}),u.onChange.call(b),u.onVisible.call(b)}else c.debug("Sidebar is already visible")},hide:function(e){e=q.isFunction(e)?e:function(){},(c.is.visible()||c.is.animating())&&(c.debug("Hiding sidebar",e),c.refreshSidebars(),c.pullPage(function(){e.call(b),u.onHidden.call(b)}),u.onChange.call(b),u.onHide.call(b))},othersAnimating:function(){return 0<h.not(g).filter("."+a.animating).length},othersVisible:function(){return 0<h.not(g).filter("."+a.visible).length},othersActive:function(){return c.othersVisible()||c.othersAnimating()},hideOthers:function(e){var t=h.not(g).filter("."+a.visible),n=t.length,i=0;e=e||function(){},t.sidebar("hide",function(){++i==n&&e()})},toggle:function(){c.verbose("Determining toggled direction"),c.is.hidden()?c.show():c.hide()},pushPage:function(t){var e,n,i,o=c.get.transition(),a="overlay"===o||c.othersActive()?g:v;t=q.isFunction(t)?t:function(){},"scale down"==u.transition&&c.scrollToTop(),c.set.transition(o),c.repaint(),e=function(){c.bind.clickaway(),c.add.inlineCSS(),c.set.animating(),c.set.visible()},n=function(){c.set.dimmed()},i=function(e){e.target==a[0]&&(a.off(l+s,i),c.remove.animating(),c.bind.scrollLock(),t.call(b))},a.off(l+s),a.on(l+s,i),D(e),u.dimPage&&!c.othersVisible()&&D(n)},pullPage:function(t){var e,n,i=c.get.transition(),o="overlay"==i||c.othersActive()?g:v;t=q.isFunction(t)?t:function(){},c.verbose("Removing context push state",c.get.direction()),c.unbind.clickaway(),c.unbind.scrollLock(),e=function(){c.set.transition(i),c.set.animating(),c.remove.visible(),u.dimPage&&!c.othersVisible()&&v.removeClass(a.dimmed)},n=function(e){e.target==o[0]&&(o.off(l+s,n),c.remove.animating(),c.remove.transition(),c.remove.inlineCSS(),("scale down"==i||u.returnScroll&&c.is.mobile())&&c.scrollBack(),t.call(b))},o.off(l+s),o.on(l+s,n),D(e)},scrollToTop:function(){c.verbose("Scrolling to top of page to avoid animation issues"),t=q(j).scrollTop(),g.scrollTop(0),j.scrollTo(0,0)},scrollBack:function(){c.verbose("Scrolling back to original page position"),j.scrollTo(0,t)},clear:{cache:function(){c.verbose("Clearing cached dimensions"),c.cache={}}},set:{ios:function(){k.addClass(a.ios)},pushed:function(){p.addClass(a.pushed)},pushable:function(){p.addClass(a.pushable)},dimmed:function(){v.addClass(a.dimmed)},active:function(){g.addClass(a.active)},animating:function(){g.addClass(a.animating)},transition:function(e){e=e||c.get.transition(),g.addClass(e)},direction:function(e){e=e||c.get.direction(),g.addClass(a[e])},visible:function(){g.addClass(a.visible)},overlay:function(){g.addClass(a.overlay)}},remove:{inlineCSS:function(){c.debug("Removing inline css styles",r),r&&0<r.length&&r.remove()},ios:function(){k.removeClass(a.ios)},pushed:function(){p.removeClass(a.pushed)},pushable:function(){p.removeClass(a.pushable)},active:function(){g.removeClass(a.active)},animating:function(){g.removeClass(a.animating)},transition:function(e){e=e||c.get.transition(),g.removeClass(e)},direction:function(e){e=e||c.get.direction(),g.removeClass(a[e])},visible:function(){g.removeClass(a.visible)},overlay:function(){g.removeClass(a.overlay)}},get:{direction:function(){return g.hasClass(a.top)?a.top:g.hasClass(a.right)?a.right:g.hasClass(a.bottom)?a.bottom:a.left},transition:function(){var e,t=c.get.direction();return e=c.is.mobile()?"auto"==u.mobileTransition?u.defaultTransition.mobile[t]:u.mobileTransition:"auto"==u.transition?u.defaultTransition.computer[t]:u.transition,c.verbose("Determined transition",e),e},transitionEvent:function(){var e,t=z.createElement("element"),n={transition:"transitionend",OTransition:"oTransitionEnd",MozTransition:"transitionend",WebkitTransition:"webkitTransitionEnd"};for(e in n)if(t.style[e]!==I)return n[e]}},is:{ie:function(){return!j.ActiveXObject&&"ActiveXObject"in j||"ActiveXObject"in j},ios:function(){var e=navigator.userAgent,t=e.match(o.ios),n=e.match(o.mobileChrome);return!(!t||n)&&(c.verbose("Browser was found to be iOS",e),!0)},mobile:function(){var e=navigator.userAgent;return e.match(o.mobile)?(c.verbose("Browser was found to be mobile",e),!0):(c.verbose("Browser is not mobile, using regular transition",e),!1)},hidden:function(){return!c.is.visible()},visible:function(){return g.hasClass(a.visible)},open:function(){return c.is.visible()},closed:function(){return c.is.hidden()},vertical:function(){return g.hasClass(a.top)},animating:function(){return p.hasClass(a.animating)},rtl:function(){return c.cache.rtl===I&&(c.cache.rtl="rtl"==g.css("direction")),c.cache.rtl}},setting:function(e,t){if(c.debug("Changing setting",e,t),q.isPlainObject(e))q.extend(!0,u,e);else{if(t===I)return u[e];q.isPlainObject(u[e])?q.extend(!0,u[e],t):u[e]=t}},internal:function(e,t){if(q.isPlainObject(e))q.extend(!0,c,e);else{if(t===I)return c[e];c[e]=t}},debug:function(){!u.silent&&u.debug&&(u.performance?c.performance.log(arguments):(c.debug=Function.prototype.bind.call(console.info,console,u.name+":"),c.debug.apply(console,arguments)))},verbose:function(){!u.silent&&u.verbose&&u.debug&&(u.performance?c.performance.log(arguments):(c.verbose=Function.prototype.bind.call(console.info,console,u.name+":"),c.verbose.apply(console,arguments)))},error:function(){u.silent||(c.error=Function.prototype.bind.call(console.error,console,u.name+":"),c.error.apply(console,arguments))},performance:{log:function(e){var t,n;u.performance&&(n=(t=(new Date).getTime())-(R||t),R=t,P.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:b,"Execution Time":n})),clearTimeout(c.performance.timer),c.performance.timer=setTimeout(c.performance.display,500)},display:function(){var e=u.name+":",n=0;R=!1,clearTimeout(c.performance.timer),q.each(P,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",A&&(e+=" '"+A+"'"),(console.group!==I||console.table!==I)&&0<P.length&&(console.groupCollapsed(e),console.table?console.table(P):q.each(P,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),P=[]}},invoke:function(i,e,t){var o,a,n,r=y;return e=e||O,t=b||t,"string"==typeof i&&r!==I&&(i=i.split(/[\. ]/),o=i.length-1,q.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(q.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==I)return a=r[n],!1;if(!q.isPlainObject(r[t])||e==o)return r[t]!==I?a=r[t]:c.error(d.method,i),!1;r=r[t]}})),q.isFunction(a)?n=a.apply(t,e):a!==I&&(n=a),q.isArray(C)?C.push(n):C!==I?C=[C,n]:n!==I&&(C=n),a}},F?(y===I&&c.initialize(),c.invoke(E)):(y!==I&&c.invoke("destroy"),c.initialize())}),C!==I?C:this},q.fn.sidebar.settings={name:"Sidebar",namespace:"sidebar",silent:!1,debug:!1,verbose:!1,performance:!0,transition:"auto",mobileTransition:"auto",defaultTransition:{computer:{left:"uncover",right:"uncover",top:"overlay",bottom:"overlay"},mobile:{left:"uncover",right:"uncover",top:"overlay",bottom:"overlay"}},context:"body",exclusive:!1,closable:!0,dimPage:!0,scrollLock:!1,returnScroll:!1,delaySetup:!1,duration:500,onChange:function(){},onShow:function(){},onHide:function(){},onHidden:function(){},onVisible:function(){},className:{active:"active",animating:"animating",dimmed:"dimmed",ios:"ios",pushable:"pushable",pushed:"pushed",right:"right",top:"top",left:"left",bottom:"bottom",visible:"visible"},selector:{fixed:".fixed",omitted:"script, link, style, .ui.modal, .ui.dimmer, .ui.nag, .ui.fixed",pusher:".pusher",sidebar:".ui.sidebar"},regExp:{ios:/(iPad|iPhone|iPod)/g,mobileChrome:/(CriOS)/g,mobile:/Mobile|iP(hone|od|ad)|Android|BlackBerry|IEMobile|Kindle|NetFront|Silk-Accelerated|(hpw|web)OS|Fennec|Minimo|Opera M(obi|ini)|Blazer|Dolfin|Dolphin|Skyfire|Zune/g},error:{method:"The method you called is not defined.",pusher:"Had to add pusher element. For optimal performance make sure body content is inside a pusher element",movedSidebar:"Had to move sidebar. For optimal performance make sure sidebar and pusher are direct children of your body tag",overlay:"The overlay setting is no longer supported, use animation: overlay",notFound:"There were no elements that matched the specified selector"}}}(jQuery,window,document),function(T,A,R,P){"use strict";A=void 0!==A&&A.Math==Math?A:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),T.fn.sticky=function(v){var b,e=T(this),y=e.selector||"",x=(new Date).getTime(),C=[],w=v,S="string"==typeof w,k=[].slice.call(arguments,1);return e.each(function(){var i,o,e,t,d,f=T.isPlainObject(v)?T.extend(!0,{},T.fn.sticky.settings,v):T.extend({},T.fn.sticky.settings),n=f.className,a=f.namespace,r=f.error,s="."+a,l="module-"+a,c=T(this),u=T(A),m=T(f.scrollContext),g=(c.selector,c.data(l)),p=A.requestAnimationFrame||A.mozRequestAnimationFrame||A.webkitRequestAnimationFrame||A.msRequestAnimationFrame||function(e){setTimeout(e,0)},h=this;d={initialize:function(){d.determineContainer(),d.determineContext(),d.verbose("Initializing sticky",f,i),d.save.positions(),d.checkErrors(),d.bind.events(),f.observeChanges&&d.observeChanges(),d.instantiate()},instantiate:function(){d.verbose("Storing instance of module",d),g=d,c.data(l,d)},destroy:function(){d.verbose("Destroying previous instance"),d.reset(),e&&e.disconnect(),t&&t.disconnect(),u.off("load"+s,d.event.load).off("resize"+s,d.event.resize),m.off("scrollchange"+s,d.event.scrollchange),c.removeData(l)},observeChanges:function(){"MutationObserver"in A&&(e=new MutationObserver(d.event.documentChanged),t=new MutationObserver(d.event.changed),e.observe(R,{childList:!0,subtree:!0}),t.observe(h,{childList:!0,subtree:!0}),t.observe(o[0],{childList:!0,subtree:!0}),d.debug("Setting up mutation observer",t))},determineContainer:function(){i=f.container?T(f.container):c.offsetParent()},determineContext:function(){0!==(o=f.context?T(f.context):i).length||d.error(r.invalidContext,f.context,c)},checkErrors:function(){if(d.is.hidden()&&d.error(r.visible,c),d.cache.element.height>d.cache.context.height)return d.reset(),void d.error(r.elementSize,c)},bind:{events:function(){u.on("load"+s,d.event.load).on("resize"+s,d.event.resize),m.off("scroll"+s).on("scroll"+s,d.event.scroll).on("scrollchange"+s,d.event.scrollchange)}},event:{changed:function(e){clearTimeout(d.timer),d.timer=setTimeout(function(){d.verbose("DOM tree modified, updating sticky menu",e),d.refresh()},100)},documentChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==h||0<T(e).find(h).length)&&(d.debug("Element removed from DOM, tearing down events"),d.destroy())})})},load:function(){d.verbose("Page contents finished loading"),p(d.refresh)},resize:function(){d.verbose("Window resized"),p(d.refresh)},scroll:function(){p(function(){m.triggerHandler("scrollchange"+s,m.scrollTop())})},scrollchange:function(e,t){d.stick(t),f.onScroll.call(h)}},refresh:function(e){d.reset(),f.context||d.determineContext(),e&&d.determineContainer(),d.save.positions(),d.stick(),f.onReposition.call(h)},supports:{sticky:function(){var e=T("<div/>");e[0];return e.addClass(n.supported),e.css("position").match("sticky")}},save:{lastScroll:function(e){d.lastScroll=e},elementScroll:function(e){d.elementScroll=e},positions:function(){var e={height:m.height()},t={margin:{top:parseInt(c.css("margin-top"),10),bottom:parseInt(c.css("margin-bottom"),10)},offset:c.offset(),width:c.outerWidth(),height:c.outerHeight()},n={offset:o.offset(),height:o.outerHeight()};i.outerHeight();d.is.standardScroll()||(d.debug("Non-standard scroll. Removing scroll offset from element offset"),e.top=m.scrollTop(),e.left=m.scrollLeft(),t.offset.top+=e.top,n.offset.top+=e.top,t.offset.left+=e.left,n.offset.left+=e.left),d.cache={fits:t.height+f.offset<=e.height,sameHeight:t.height==n.height,scrollContext:{height:e.height},element:{margin:t.margin,top:t.offset.top-t.margin.top,left:t.offset.left,width:t.width,height:t.height,bottom:t.offset.top+t.height},context:{top:n.offset.top,height:n.height,bottom:n.offset.top+n.height}},d.set.containerSize(),d.stick(),d.debug("Caching element positions",d.cache)}},get:{direction:function(e){var t="down";return e=e||m.scrollTop(),d.lastScroll!==P&&(d.lastScroll<e?t="down":d.lastScroll>e&&(t="up")),t},scrollChange:function(e){return e=e||m.scrollTop(),d.lastScroll?e-d.lastScroll:0},currentElementScroll:function(){return d.elementScroll?d.elementScroll:d.is.top()?Math.abs(parseInt(c.css("top"),10))||0:Math.abs(parseInt(c.css("bottom"),10))||0},elementScroll:function(e){e=e||m.scrollTop();var t=d.cache.element,n=d.cache.scrollContext,i=d.get.scrollChange(e),o=t.height-n.height+f.offset,a=d.get.currentElementScroll(),r=a+i;return a=d.cache.fits||r<0?0:o<r?o:r}},remove:{lastScroll:function(){delete d.lastScroll},elementScroll:function(e){delete d.elementScroll},minimumSize:function(){i.css("min-height","")},offset:function(){c.css("margin-top","")}},set:{offset:function(){d.verbose("Setting offset on element",f.offset),c.css("margin-top",f.offset)},containerSize:function(){var e=i.get(0).tagName;"HTML"===e||"body"==e?d.determineContainer():Math.abs(i.outerHeight()-d.cache.context.height)>f.jitter&&(d.debug("Context has padding, specifying exact height for container",d.cache.context.height),i.css({height:d.cache.context.height}))},minimumSize:function(){var e=d.cache.element;i.css("min-height",e.height)},scroll:function(e){d.debug("Setting scroll on element",e),d.elementScroll!=e&&(d.is.top()&&c.css("bottom","").css("top",-e),d.is.bottom()&&c.css("top","").css("bottom",e))},size:function(){0!==d.cache.element.height&&0!==d.cache.element.width&&(h.style.setProperty("width",d.cache.element.width+"px","important"),h.style.setProperty("height",d.cache.element.height+"px","important"))}},is:{standardScroll:function(){return m[0]==A},top:function(){return c.hasClass(n.top)},bottom:function(){return c.hasClass(n.bottom)},initialPosition:function(){return!d.is.fixed()&&!d.is.bound()},hidden:function(){return!c.is(":visible")},bound:function(){return c.hasClass(n.bound)},fixed:function(){return c.hasClass(n.fixed)}},stick:function(e){var t=e||m.scrollTop(),n=d.cache,i=n.fits,o=n.sameHeight,a=n.element,r=n.scrollContext,s=n.context,l=d.is.bottom()&&f.pushing?f.bottomOffset:f.offset,c=(e={top:t+l,bottom:t+l+r.height},d.get.direction(e.top),i?0:d.get.elementScroll(e.top)),u=!i;0!==a.height&&!o&&(d.is.initialPosition()?e.top>=s.bottom?(d.debug("Initial element position is bottom of container"),d.bindBottom()):e.top>a.top&&(a.height+e.top-c>=s.bottom?(d.debug("Initial element position is bottom of container"),d.bindBottom()):(d.debug("Initial element position is fixed"),d.fixTop())):d.is.fixed()?d.is.top()?e.top<=a.top?(d.debug("Fixed element reached top of container"),d.setInitialPosition()):a.height+e.top-c>=s.bottom?(d.debug("Fixed element reached bottom of container"),d.bindBottom()):u&&(d.set.scroll(c),d.save.lastScroll(e.top),d.save.elementScroll(c)):d.is.bottom()&&(e.bottom-a.height<=a.top?(d.debug("Bottom fixed rail has reached top of container"),d.setInitialPosition()):e.bottom>=s.bottom?(d.debug("Bottom fixed rail has reached bottom of container"),d.bindBottom()):u&&(d.set.scroll(c),d.save.lastScroll(e.top),d.save.elementScroll(c))):d.is.bottom()&&(e.top<=a.top?(d.debug("Jumped from bottom fixed to top fixed, most likely used home/end button"),d.setInitialPosition()):f.pushing?d.is.bound()&&e.bottom<=s.bottom&&(d.debug("Fixing bottom attached element to bottom of browser."),d.fixBottom()):d.is.bound()&&e.top<=s.bottom-a.height&&(d.debug("Fixing bottom attached element to top of browser."),d.fixTop())))},bindTop:function(){d.debug("Binding element to top of parent container"),d.remove.offset(),c.css({left:"",top:"",marginBottom:""}).removeClass(n.fixed).removeClass(n.bottom).addClass(n.bound).addClass(n.top),f.onTop.call(h),f.onUnstick.call(h)},bindBottom:function(){d.debug("Binding element to bottom of parent container"),d.remove.offset(),c.css({left:"",top:""}).removeClass(n.fixed).removeClass(n.top).addClass(n.bound).addClass(n.bottom),f.onBottom.call(h),f.onUnstick.call(h)},setInitialPosition:function(){d.debug("Returning to initial position"),d.unfix(),d.unbind()},fixTop:function(){d.debug("Fixing element to top of page"),f.setSize&&d.set.size(),d.set.minimumSize(),d.set.offset(),c.css({left:d.cache.element.left,bottom:"",marginBottom:""}).removeClass(n.bound).removeClass(n.bottom).addClass(n.fixed).addClass(n.top),f.onStick.call(h)},fixBottom:function(){d.debug("Sticking element to bottom of page"),f.setSize&&d.set.size(),d.set.minimumSize(),d.set.offset(),c.css({left:d.cache.element.left,bottom:"",marginBottom:""}).removeClass(n.bound).removeClass(n.top).addClass(n.fixed).addClass(n.bottom),f.onStick.call(h)},unbind:function(){d.is.bound()&&(d.debug("Removing container bound position on element"),d.remove.offset(),c.removeClass(n.bound).removeClass(n.top).removeClass(n.bottom))},unfix:function(){d.is.fixed()&&(d.debug("Removing fixed position on element"),d.remove.minimumSize(),d.remove.offset(),c.removeClass(n.fixed).removeClass(n.top).removeClass(n.bottom),f.onUnstick.call(h))},reset:function(){d.debug("Resetting elements position"),d.unbind(),d.unfix(),d.resetCSS(),d.remove.offset(),d.remove.lastScroll()},resetCSS:function(){c.css({width:"",height:""}),i.css({height:""})},setting:function(e,t){if(T.isPlainObject(e))T.extend(!0,f,e);else{if(t===P)return f[e];f[e]=t}},internal:function(e,t){if(T.isPlainObject(e))T.extend(!0,d,e);else{if(t===P)return d[e];d[e]=t}},debug:function(){!f.silent&&f.debug&&(f.performance?d.performance.log(arguments):(d.debug=Function.prototype.bind.call(console.info,console,f.name+":"),d.debug.apply(console,arguments)))},verbose:function(){!f.silent&&f.verbose&&f.debug&&(f.performance?d.performance.log(arguments):(d.verbose=Function.prototype.bind.call(console.info,console,f.name+":"),d.verbose.apply(console,arguments)))},error:function(){f.silent||(d.error=Function.prototype.bind.call(console.error,console,f.name+":"),d.error.apply(console,arguments))},performance:{log:function(e){var t,n;f.performance&&(n=(t=(new Date).getTime())-(x||t),x=t,C.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:h,"Execution Time":n})),clearTimeout(d.performance.timer),d.performance.timer=setTimeout(d.performance.display,0)},display:function(){var e=f.name+":",n=0;x=!1,clearTimeout(d.performance.timer),T.each(C,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",y&&(e+=" '"+y+"'"),(console.group!==P||console.table!==P)&&0<C.length&&(console.groupCollapsed(e),console.table?console.table(C):T.each(C,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),C=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||k,t=h||t,"string"==typeof i&&r!==P&&(i=i.split(/[\. ]/),o=i.length-1,T.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(T.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==P)return a=r[n],!1;if(!T.isPlainObject(r[t])||e==o)return r[t]!==P&&(a=r[t]),!1;r=r[t]}})),T.isFunction(a)?n=a.apply(t,e):a!==P&&(n=a),T.isArray(b)?b.push(n):b!==P?b=[b,n]:n!==P&&(b=n),a}},S?(g===P&&d.initialize(),d.invoke(w)):(g!==P&&g.invoke("destroy"),d.initialize())}),b!==P?b:this},T.fn.sticky.settings={name:"Sticky",namespace:"sticky",silent:!1,debug:!1,verbose:!0,performance:!0,pushing:!1,context:!1,container:!1,scrollContext:A,offset:0,bottomOffset:0,jitter:5,setSize:!0,observeChanges:!1,onReposition:function(){},onScroll:function(){},onStick:function(){},onUnstick:function(){},onTop:function(){},onBottom:function(){},error:{container:"Sticky element must be inside a relative container",visible:"Element is hidden, you must call refresh after element becomes visible. Use silent setting to surpress this warning in production.",method:"The method you called is not defined.",invalidContext:"Context specified does not exist",elementSize:"Sticky element is larger than its container, cannot create sticky."},className:{bound:"bound",fixed:"fixed",supported:"native",top:"top",bottom:"bottom"}}}(jQuery,window,document),function(E,F,O,D){"use strict";F=void 0!==F&&F.Math==Math?F:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),E.fn.tab=function(r){var c,u=E.isFunction(this)?E(F):E(this),d=u.selector||"",f=(new Date).getTime(),m=[],g=r,A="string"==typeof g,R=[].slice.call(arguments,1),P=!1;return u.each(function(){var p,a,h,v,b,y,x=E.isPlainObject(r)?E.extend(!0,{},E.fn.tab.settings,r):E.extend({},E.fn.tab.settings),C=x.className,w=x.metadata,t=x.selector,S=x.error,e="."+x.namespace,n="module-"+x.namespace,k=E(this),i={},T=!0,o=0,s=this,l=k.data(n);b={initialize:function(){b.debug("Initializing tab menu item",k),b.fix.callbacks(),b.determineTabs(),b.debug("Determining tabs",x.context,a),x.auto&&b.set.auto(),b.bind.events(),x.history&&!P&&(b.initializeHistory(),P=!0),b.instantiate()},instantiate:function(){b.verbose("Storing instance of module",b),l=b,k.data(n,b)},destroy:function(){b.debug("Destroying tabs",k),k.removeData(n).off(e)},bind:{events:function(){E.isWindow(s)||(b.debug("Attaching tab activation events to element",k),k.on("click"+e,b.event.click))}},determineTabs:function(){var e;"parent"===x.context?(0<k.closest(t.ui).length?(e=k.closest(t.ui),b.verbose("Using closest UI element as parent",e)):e=k,p=e.parent(),b.verbose("Determined parent element for creating context",p)):x.context?(p=E(x.context),b.verbose("Using selector for tab context",x.context,p)):p=E("body"),x.childrenOnly?(a=p.children(t.tabs),b.debug("Searching tab context children for tabs",p,a)):(a=p.find(t.tabs),b.debug("Searching tab context for tabs",p,a))},fix:{callbacks:function(){E.isPlainObject(r)&&(r.onTabLoad||r.onTabInit)&&(r.onTabLoad&&(r.onLoad=r.onTabLoad,delete r.onTabLoad,b.error(S.legacyLoad,r.onLoad)),r.onTabInit&&(r.onFirstLoad=r.onTabInit,delete r.onTabInit,b.error(S.legacyInit,r.onFirstLoad)),x=E.extend(!0,{},E.fn.tab.settings,r))}},initializeHistory:function(){if(b.debug("Initializing page state"),E.address===D)return b.error(S.state),!1;if("state"==x.historyType){if(b.debug("Using HTML5 to manage state"),!1===x.path)return b.error(S.path),!1;E.address.history(!0).state(x.path)}E.address.bind("change",b.event.history.change)},event:{click:function(e){var t=E(this).data(w.tab);t!==D?(x.history?(b.verbose("Updating page state",e),E.address.value(t)):(b.verbose("Changing tab",e),b.changeTab(t)),e.preventDefault()):b.debug("No tab specified")},history:{change:function(e){var t=e.pathNames.join("/")||b.get.initialPath(),n=x.templates.determineTitle(t)||!1;b.performance.display(),b.debug("History change event",t,e),y=e,t!==D&&b.changeTab(t),n&&E.address.title(n)}}},refresh:function(){h&&(b.debug("Refreshing tab",h),b.changeTab(h))},cache:{read:function(e){return e!==D&&i[e]},add:function(e,t){e=e||h,b.debug("Adding cached content for",e),i[e]=t},remove:function(e){e=e||h,b.debug("Removing cached content for",e),delete i[e]}},set:{auto:function(){var e="string"==typeof x.path?x.path.replace(/\/$/,"")+"/{$tab}":"/{$tab}";b.verbose("Setting up automatic tab retrieval from server",e),E.isPlainObject(x.apiSettings)?x.apiSettings.url=e:x.apiSettings={url:e}},loading:function(e){var t=b.get.tabElement(e);t.hasClass(C.loading)||(b.verbose("Setting loading state for",t),t.addClass(C.loading).siblings(a).removeClass(C.active+" "+C.loading),0<t.length&&x.onRequest.call(t[0],e))},state:function(e){E.address.value(e)}},changeTab:function(d){var f=F.history&&F.history.pushState&&x.ignoreFirstLoad&&T,m=x.auto||E.isPlainObject(x.apiSettings),g=m&&!f?b.utilities.pathToArray(d):b.get.defaultPathArray(d);d=b.utilities.arrayToPath(g),E.each(g,function(e,t){var n,i,o,a,r=g.slice(0,e+1),s=b.utilities.arrayToPath(r),l=b.is.tab(s),c=e+1==g.length,u=b.get.tabElement(s);if(b.verbose("Looking for tab",t),l){if(b.verbose("Tab was found",t),h=s,v=b.utilities.filterArray(g,r),c?a=!0:(i=g.slice(0,e+2),o=b.utilities.arrayToPath(i),(a=!b.is.tab(o))&&b.verbose("Tab parameters found",i)),a&&m)return f?(b.debug("Ignoring remote content on first tab load",s),T=!1,b.cache.add(d,u.html()),b.activate.all(s),x.onFirstLoad.call(u[0],s,v,y),x.onLoad.call(u[0],s,v,y)):(b.activate.navigation(s),b.fetch.content(s,d)),!1;b.debug("Opened local tab",s),b.activate.all(s),b.cache.read(s)||(b.cache.add(s,!0),b.debug("First time tab loaded calling tab init"),x.onFirstLoad.call(u[0],s,v,y)),x.onLoad.call(u[0],s,v,y)}else{if(-1!=d.search("/")||""===d)return b.error(S.missingTab,k,p,s),!1;if(s=(n=E("#"+d+', a[name="'+d+'"]')).closest("[data-tab]").data(w.tab),u=b.get.tabElement(s),n&&0<n.length&&s)return b.debug("Anchor link used, opening parent tab",u,n),u.hasClass(C.active)||setTimeout(function(){b.scrollTo(n)},0),b.activate.all(s),b.cache.read(s)||(b.cache.add(s,!0),b.debug("First time tab loaded calling tab init"),x.onFirstLoad.call(u[0],s,v,y)),x.onLoad.call(u[0],s,v,y),!1}})},scrollTo:function(e){var t=!!(e&&0<e.length)&&e.offset().top;!1!==t&&(b.debug("Forcing scroll to an in-page link in a hidden tab",t,e),E(O).scrollTop(t))},update:{content:function(e,t,n){var i=b.get.tabElement(e),o=i[0];n=n!==D?n:x.evaluateScripts,"string"==typeof x.cacheType&&"dom"==x.cacheType.toLowerCase()&&"string"!=typeof t?i.empty().append(E(t).clone(!0)):n?(b.debug("Updating HTML and evaluating inline scripts",e,t),i.html(t)):(b.debug("Updating HTML",e,t),o.innerHTML=t)}},fetch:{content:function(t,n){var e,i,o=b.get.tabElement(t),a={dataType:"html",encodeParameters:!1,on:"now",cache:x.alwaysRefresh,headers:{"X-Remote":!0},onSuccess:function(e){"response"==x.cacheType&&b.cache.add(n,e),b.update.content(t,e),t==h?(b.debug("Content loaded",t),b.activate.tab(t)):b.debug("Content loaded in background",t),x.onFirstLoad.call(o[0],t,v,y),x.onLoad.call(o[0],t,v,y),x.loadOnce?b.cache.add(n,!0):"string"==typeof x.cacheType&&"dom"==x.cacheType.toLowerCase()&&0<o.children().length?setTimeout(function(){var e=o.children().clone(!0);e=e.not("script"),b.cache.add(n,e)},0):b.cache.add(n,o.html())},urlData:{tab:n}},r=o.api("get request")||!1,s=r&&"pending"===r.state();n=n||t,i=b.cache.read(n),x.cache&&i?(b.activate.tab(t),b.debug("Adding cached content",n),x.loadOnce||("once"==x.evaluateScripts?b.update.content(t,i,!1):b.update.content(t,i)),x.onLoad.call(o[0],t,v,y)):s?(b.set.loading(t),b.debug("Content is already loading",n)):E.api!==D?(e=E.extend(!0,{},x.apiSettings,a),b.debug("Retrieving remote content",n,e),b.set.loading(t),o.api(e)):b.error(S.api)}},activate:{all:function(e){b.activate.tab(e),b.activate.navigation(e)},tab:function(e){var t=b.get.tabElement(e),n="siblings"==x.deactivate?t.siblings(a):a.not(t),i=t.hasClass(C.active);b.verbose("Showing tab content for",t),i||(t.addClass(C.active),n.removeClass(C.active+" "+C.loading),0<t.length&&x.onVisible.call(t[0],e))},navigation:function(e){var t=b.get.navElement(e),n="siblings"==x.deactivate?t.siblings(u):u.not(t),i=t.hasClass(C.active);b.verbose("Activating tab navigation for",t,e),i||(t.addClass(C.active),n.removeClass(C.active+" "+C.loading))}},deactivate:{all:function(){b.deactivate.navigation(),b.deactivate.tabs()},navigation:function(){u.removeClass(C.active)},tabs:function(){a.removeClass(C.active+" "+C.loading)}},is:{tab:function(e){return e!==D&&0<b.get.tabElement(e).length}},get:{initialPath:function(){return u.eq(0).data(w.tab)||a.eq(0).data(w.tab)},path:function(){return E.address.value()},defaultPathArray:function(e){return b.utilities.pathToArray(b.get.defaultPath(e))},defaultPath:function(e){var t=u.filter("[data-"+w.tab+'^="'+e+'/"]').eq(0).data(w.tab)||!1;if(t){if(b.debug("Found default tab",t),o<x.maxDepth)return o++,b.get.defaultPath(t);b.error(S.recursion)}else b.debug("No default tabs found for",e,a);return o=0,e},navElement:function(e){return e=e||h,u.filter("[data-"+w.tab+'="'+e+'"]')},tabElement:function(e){var t,n,i,o;return e=e||h,i=b.utilities.pathToArray(e),o=b.utilities.last(i),t=a.filter("[data-"+w.tab+'="'+e+'"]'),n=a.filter("[data-"+w.tab+'="'+o+'"]'),0<t.length?t:n},tab:function(){return h}},utilities:{filterArray:function(e,t){return E.grep(e,function(e){return-1==E.inArray(e,t)})},last:function(e){return!!E.isArray(e)&&e[e.length-1]},pathToArray:function(e){return e===D&&(e=h),"string"==typeof e?e.split("/"):[e]},arrayToPath:function(e){return!!E.isArray(e)&&e.join("/")}},setting:function(e,t){if(b.debug("Changing setting",e,t),E.isPlainObject(e))E.extend(!0,x,e);else{if(t===D)return x[e];E.isPlainObject(x[e])?E.extend(!0,x[e],t):x[e]=t}},internal:function(e,t){if(E.isPlainObject(e))E.extend(!0,b,e);else{if(t===D)return b[e];b[e]=t}},debug:function(){!x.silent&&x.debug&&(x.performance?b.performance.log(arguments):(b.debug=Function.prototype.bind.call(console.info,console,x.name+":"),b.debug.apply(console,arguments)))},verbose:function(){!x.silent&&x.verbose&&x.debug&&(x.performance?b.performance.log(arguments):(b.verbose=Function.prototype.bind.call(console.info,console,x.name+":"),b.verbose.apply(console,arguments)))},error:function(){x.silent||(b.error=Function.prototype.bind.call(console.error,console,x.name+":"),b.error.apply(console,arguments))},performance:{log:function(e){var t,n;x.performance&&(n=(t=(new Date).getTime())-(f||t),f=t,m.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:s,"Execution Time":n})),clearTimeout(b.performance.timer),b.performance.timer=setTimeout(b.performance.display,500)},display:function(){var e=x.name+":",n=0;f=!1,clearTimeout(b.performance.timer),E.each(m,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",d&&(e+=" '"+d+"'"),(console.group!==D||console.table!==D)&&0<m.length&&(console.groupCollapsed(e),console.table?console.table(m):E.each(m,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),m=[]}},invoke:function(i,e,t){var o,a,n,r=l;return e=e||R,t=s||t,"string"==typeof i&&r!==D&&(i=i.split(/[\. ]/),o=i.length-1,E.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(E.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==D)return a=r[n],!1;if(!E.isPlainObject(r[t])||e==o)return r[t]!==D?a=r[t]:b.error(S.method,i),!1;r=r[t]}})),E.isFunction(a)?n=a.apply(t,e):a!==D&&(n=a),E.isArray(c)?c.push(n):c!==D?c=[c,n]:n!==D&&(c=n),a}},A?(l===D&&b.initialize(),b.invoke(g)):(l!==D&&l.invoke("destroy"),b.initialize())}),c!==D?c:this},E.tab=function(){E(F).tab.apply(this,arguments)},E.fn.tab.settings={name:"Tab",namespace:"tab",silent:!1,debug:!1,verbose:!1,performance:!0,auto:!1,history:!1,historyType:"hash",path:!1,context:!1,childrenOnly:!1,maxDepth:25,deactivate:"siblings",alwaysRefresh:!1,cache:!0,loadOnce:!1,cacheType:"response",ignoreFirstLoad:!1,apiSettings:!1,evaluateScripts:"once",onFirstLoad:function(e,t,n){},onLoad:function(e,t,n){},onVisible:function(e,t,n){},onRequest:function(e,t,n){},templates:{determineTitle:function(e){}},error:{api:"You attempted to load content without API module",method:"The method you called is not defined",missingTab:"Activated tab cannot be found. Tabs are case-sensitive.",noContent:"The tab you specified is missing a content url.",path:"History enabled, but no path was specified",recursion:"Max recursive depth reached",legacyInit:"onTabInit has been renamed to onFirstLoad in 2.0, please adjust your code.",legacyLoad:"onTabLoad has been renamed to onLoad in 2.0. Please adjust your code",state:"History requires Asual's Address library <https://github.com/asual/jquery-address>"},metadata:{tab:"tab",loaded:"loaded",promise:"promise"},className:{loading:"loading",active:"active"},selector:{tabs:".ui.tab",ui:".ui"}}}(jQuery,window,document),function(C,e,w,S){"use strict";e=void 0!==e&&e.Math==Math?e:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),C.fn.transition=function(){var c,r=C(this),g=r.selector||"",p=(new Date).getTime(),h=[],v=arguments,b=v[0],y=[].slice.call(arguments,1),x="string"==typeof b;e.requestAnimationFrame||e.mozRequestAnimationFrame||e.webkitRequestAnimationFrame||e.msRequestAnimationFrame;return r.each(function(i){var u,s,t,d,n,o,e,a,f,m=C(this),l=this;(f={initialize:function(){u=f.get.settings.apply(l,v),d=u.className,t=u.error,n=u.metadata,a="."+u.namespace,e="module-"+u.namespace,s=m.data(e)||f,o=f.get.animationEndEvent(),x&&(x=f.invoke(b)),!1===x&&(f.verbose("Converted arguments into settings object",u),u.interval?f.delay(u.animate):f.animate(),f.instantiate())},instantiate:function(){f.verbose("Storing instance of module",f),s=f,m.data(e,s)},destroy:function(){f.verbose("Destroying previous module for",l),m.removeData(e)},refresh:function(){f.verbose("Refreshing display type on next animation"),delete f.displayType},forceRepaint:function(){f.verbose("Forcing element repaint");var e=m.parent(),t=m.next();0===t.length?m.detach().appendTo(e):m.detach().insertBefore(t)},repaint:function(){f.verbose("Repainting element");l.offsetWidth},delay:function(e){var t,n=f.get.animationDirection();n||(n=f.can.transition()?f.get.direction():"static"),e=e!==S?e:u.interval,t="auto"==u.reverse&&n==d.outward||1==u.reverse?(r.length-i)*u.interval:i*u.interval,f.debug("Delaying animation by",t),setTimeout(f.animate,t)},animate:function(e){if(u=e||u,!f.is.supported())return f.error(t.support),!1;if(f.debug("Preparing animation",u.animation),f.is.animating()){if(u.queue)return!u.allowRepeats&&f.has.direction()&&f.is.occurring()&&!0!==f.queuing?f.debug("Animation is currently occurring, preventing queueing same animation",u.animation):f.queue(u.animation),!1;if(!u.allowRepeats&&f.is.occurring())return f.debug("Animation is already occurring, will not execute repeated animation",u.animation),!1;f.debug("New animation started, completing previous early",u.animation),s.complete()}f.can.animate()?f.set.animating(u.animation):f.error(t.noAnimation,u.animation,l)},reset:function(){f.debug("Resetting animation to beginning conditions"),f.remove.animationCallbacks(),f.restore.conditions(),f.remove.animating()},queue:function(e){f.debug("Queueing animation of",e),f.queuing=!0,m.one(o+".queue"+a,function(){f.queuing=!1,f.repaint(),f.animate.apply(this,u)})},complete:function(e){f.debug("Animation complete",u.animation),f.remove.completeCallback(),f.remove.failSafe(),f.is.looping()||(f.is.outward()?(f.verbose("Animation is outward, hiding element"),f.restore.conditions(),f.hide()):f.is.inward()?(f.verbose("Animation is outward, showing element"),f.restore.conditions(),f.show()):(f.verbose("Static animation completed"),f.restore.conditions(),u.onComplete.call(l)))},force:{visible:function(){var e=m.attr("style"),t=f.get.userStyle(),n=f.get.displayType(),i=t+"display: "+n+" !important;",o=m.css("display"),a=e===S||""===e;o!==n?(f.verbose("Overriding default display to show element",n),m.attr("style",i)):a&&m.removeAttr("style")},hidden:function(){var e=m.attr("style"),t=m.css("display"),n=e===S||""===e;"none"===t||f.is.hidden()?n&&m.removeAttr("style"):(f.verbose("Overriding default display to hide element"),m.css("display","none"))}},has:{direction:function(e){var n=!1;return"string"==typeof(e=e||u.animation)&&(e=e.split(" "),C.each(e,function(e,t){t!==d.inward&&t!==d.outward||(n=!0)})),n},inlineDisplay:function(){var e=m.attr("style")||"";return C.isArray(e.match(/display.*?;/,""))}},set:{animating:function(e){var t;f.remove.completeCallback(),e=e||u.animation,t=f.get.animationClass(e),f.save.animation(t),f.force.visible(),f.remove.hidden(),f.remove.direction(),f.start.animation(t)},duration:function(e,t){((t="number"==typeof(t=t||u.duration)?t+"ms":t)||0===t)&&(f.verbose("Setting animation duration",t),m.css({"animation-duration":t}))},direction:function(e){(e=e||f.get.direction())==d.inward?f.set.inward():f.set.outward()},looping:function(){f.debug("Transition set to loop"),m.addClass(d.looping)},hidden:function(){m.addClass(d.transition).addClass(d.hidden)},inward:function(){f.debug("Setting direction to inward"),m.removeClass(d.outward).addClass(d.inward)},outward:function(){f.debug("Setting direction to outward"),m.removeClass(d.inward).addClass(d.outward)},visible:function(){m.addClass(d.transition).addClass(d.visible)}},start:{animation:function(e){e=e||f.get.animationClass(),f.debug("Starting tween",e),m.addClass(e).one(o+".complete"+a,f.complete),u.useFailSafe&&f.add.failSafe(),f.set.duration(u.duration),u.onStart.call(l)}},save:{animation:function(e){f.cache||(f.cache={}),f.cache.animation=e},displayType:function(e){"none"!==e&&m.data(n.displayType,e)},transitionExists:function(e,t){C.fn.transition.exists[e]=t,f.verbose("Saving existence of transition",e,t)}},restore:{conditions:function(){var e=f.get.currentAnimation();e&&(m.removeClass(e),f.verbose("Removing animation class",f.cache)),f.remove.duration()}},add:{failSafe:function(){var e=f.get.duration();f.timer=setTimeout(function(){m.triggerHandler(o)},e+u.failSafeDelay),f.verbose("Adding fail safe timer",f.timer)}},remove:{animating:function(){m.removeClass(d.animating)},animationCallbacks:function(){f.remove.queueCallback(),f.remove.completeCallback()},queueCallback:function(){m.off(".queue"+a)},completeCallback:function(){m.off(".complete"+a)},display:function(){m.css("display","")},direction:function(){m.removeClass(d.inward).removeClass(d.outward)},duration:function(){m.css("animation-duration","")},failSafe:function(){f.verbose("Removing fail safe timer",f.timer),f.timer&&clearTimeout(f.timer)},hidden:function(){m.removeClass(d.hidden)},visible:function(){m.removeClass(d.visible)},looping:function(){f.debug("Transitions are no longer looping"),f.is.looping()&&(f.reset(),m.removeClass(d.looping))},transition:function(){m.removeClass(d.visible).removeClass(d.hidden)}},get:{settings:function(e,t,n){return"object"==typeof e?C.extend(!0,{},C.fn.transition.settings,e):"function"==typeof n?C.extend({},C.fn.transition.settings,{animation:e,onComplete:n,duration:t}):"string"==typeof t||"number"==typeof t?C.extend({},C.fn.transition.settings,{animation:e,duration:t}):"object"==typeof t?C.extend({},C.fn.transition.settings,t,{animation:e}):"function"==typeof t?C.extend({},C.fn.transition.settings,{animation:e,onComplete:t}):C.extend({},C.fn.transition.settings,{animation:e})},animationClass:function(e){var t=e||u.animation,n=f.can.transition()&&!f.has.direction()?f.get.direction()+" ":"";return d.animating+" "+d.transition+" "+n+t},currentAnimation:function(){return!(!f.cache||f.cache.animation===S)&&f.cache.animation},currentDirection:function(){return f.is.inward()?d.inward:d.outward},direction:function(){return f.is.hidden()||!f.is.visible()?d.inward:d.outward},animationDirection:function(e){var n;return"string"==typeof(e=e||u.animation)&&(e=e.split(" "),C.each(e,function(e,t){t===d.inward?n=d.inward:t===d.outward&&(n=d.outward)})),n||!1},duration:function(e){return!1===(e=e||u.duration)&&(e=m.css("animation-duration")||0),"string"==typeof e?-1<e.indexOf("ms")?parseFloat(e):1e3*parseFloat(e):e},displayType:function(e){return e=e===S||e,u.displayType?u.displayType:(e&&m.data(n.displayType)===S&&f.can.transition(!0),m.data(n.displayType))},userStyle:function(e){return(e=e||m.attr("style")||"").replace(/display.*?;/,"")},transitionExists:function(e){return C.fn.transition.exists[e]},animationStartEvent:function(){var e,t=w.createElement("div"),n={animation:"animationstart",OAnimation:"oAnimationStart",MozAnimation:"mozAnimationStart",WebkitAnimation:"webkitAnimationStart"};for(e in n)if(t.style[e]!==S)return n[e];return!1},animationEndEvent:function(){var e,t=w.createElement("div"),n={animation:"animationend",OAnimation:"oAnimationEnd",MozAnimation:"mozAnimationEnd",WebkitAnimation:"webkitAnimationEnd"};for(e in n)if(t.style[e]!==S)return n[e];return!1}},can:{transition:function(e){var t,n,i,o,a,r,s=u.animation,l=f.get.transitionExists(s),c=f.get.displayType(!1);if(l===S||e){if(f.verbose("Determining whether animation exists"),t=m.attr("class"),n=m.prop("tagName"),o=(i=C("<"+n+" />").addClass(t).insertAfter(m)).addClass(s).removeClass(d.inward).removeClass(d.outward).addClass(d.animating).addClass(d.transition).css("animationName"),a=i.addClass(d.inward).css("animationName"),c||(c=i.attr("class",t).removeAttr("style").removeClass(d.hidden).removeClass(d.visible).show().css("display"),f.verbose("Determining final display state",c),f.save.displayType(c)),i.remove(),o!=a)f.debug("Direction exists for animation",s),r=!0;else{if("none"==o||!o)return void f.debug("No animation defined in css",s);f.debug("Static animation found",s,c),r=!1}f.save.transitionExists(s,r)}return l!==S?l:r},animate:function(){return f.can.transition()!==S}},is:{animating:function(){return m.hasClass(d.animating)},inward:function(){return m.hasClass(d.inward)},outward:function(){return m.hasClass(d.outward)},looping:function(){return m.hasClass(d.looping)},occurring:function(e){return e="."+(e=e||u.animation).replace(" ","."),0<m.filter(e).length},visible:function(){return m.is(":visible")},hidden:function(){return"hidden"===m.css("visibility")},supported:function(){return!1!==o}},hide:function(){f.verbose("Hiding element"),f.is.animating()&&f.reset(),l.blur(),f.remove.display(),f.remove.visible(),f.set.hidden(),f.force.hidden(),u.onHide.call(l),u.onComplete.call(l)},show:function(e){f.verbose("Showing element",e),f.remove.hidden(),f.set.visible(),f.force.visible(),u.onShow.call(l),u.onComplete.call(l)},toggle:function(){f.is.visible()?f.hide():f.show()},stop:function(){f.debug("Stopping current animation"),m.triggerHandler(o)},stopAll:function(){f.debug("Stopping all animation"),f.remove.queueCallback(),m.triggerHandler(o)},clear:{queue:function(){f.debug("Clearing animation queue"),f.remove.queueCallback()}},enable:function(){f.verbose("Starting animation"),m.removeClass(d.disabled)},disable:function(){f.debug("Stopping animation"),m.addClass(d.disabled)},setting:function(e,t){if(f.debug("Changing setting",e,t),C.isPlainObject(e))C.extend(!0,u,e);else{if(t===S)return u[e];C.isPlainObject(u[e])?C.extend(!0,u[e],t):u[e]=t}},internal:function(e,t){if(C.isPlainObject(e))C.extend(!0,f,e);else{if(t===S)return f[e];f[e]=t}},debug:function(){!u.silent&&u.debug&&(u.performance?f.performance.log(arguments):(f.debug=Function.prototype.bind.call(console.info,console,u.name+":"),f.debug.apply(console,arguments)))},verbose:function(){!u.silent&&u.verbose&&u.debug&&(u.performance?f.performance.log(arguments):(f.verbose=Function.prototype.bind.call(console.info,console,u.name+":"),f.verbose.apply(console,arguments)))},error:function(){u.silent||(f.error=Function.prototype.bind.call(console.error,console,u.name+":"),f.error.apply(console,arguments))},performance:{log:function(e){var t,n;u.performance&&(n=(t=(new Date).getTime())-(p||t),p=t,h.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:l,"Execution Time":n})),clearTimeout(f.performance.timer),f.performance.timer=setTimeout(f.performance.display,500)},display:function(){var e=u.name+":",n=0;p=!1,clearTimeout(f.performance.timer),C.each(h,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",g&&(e+=" '"+g+"'"),1<r.length&&(e+=" ("+r.length+")"),(console.group!==S||console.table!==S)&&0<h.length&&(console.groupCollapsed(e),console.table?console.table(h):C.each(h,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),h=[]}},invoke:function(i,e,t){var o,a,n,r=s;return e=e||y,t=l||t,"string"==typeof i&&r!==S&&(i=i.split(/[\. ]/),o=i.length-1,C.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(C.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==S)return a=r[n],!1;if(!C.isPlainObject(r[t])||e==o)return r[t]!==S&&(a=r[t]),!1;r=r[t]}})),C.isFunction(a)?n=a.apply(t,e):a!==S&&(n=a),C.isArray(c)?c.push(n):c!==S?c=[c,n]:n!==S&&(c=n),a!==S&&a}}).initialize()}),c!==S?c:this},C.fn.transition.exists={},C.fn.transition.settings={name:"Transition",silent:!1,debug:!1,verbose:!1,performance:!0,namespace:"transition",interval:0,reverse:"auto",onStart:function(){},onComplete:function(){},onShow:function(){},onHide:function(){},useFailSafe:!0,failSafeDelay:100,allowRepeats:!1,displayType:!1,animation:"fade",duration:!1,queue:!0,metadata:{displayType:"display"},className:{animating:"animating",disabled:"disabled",hidden:"hidden",inward:"in",loading:"loading",looping:"looping",outward:"out",transition:"transition",visible:"visible"},error:{noAnimation:"Element is no longer attached to DOM. Unable to animate.  Use silent setting to surpress this warning in production.",repeated:"That animation is already occurring, cancelling repeated animation",method:"The method you called is not defined",support:"This browser does not support CSS animations"}}}(jQuery,window,document),function(P,E,e,F){"use strict";E=void 0!==E&&E.Math==Math?E:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")();P.api=P.fn.api=function(x){var C,e=P.isFunction(this)?P(E):P(this),w=e.selector||"",S=(new Date).getTime(),k=[],T=x,A="string"==typeof T,R=[].slice.call(arguments,1);return e.each(function(){var a,r,n,e,s,l,c=P.isPlainObject(x)?P.extend(!0,{},P.fn.api.settings,x):P.extend({},P.fn.api.settings),t=c.namespace,i=c.metadata,o=c.selector,u=c.error,d=c.className,f="."+t,m="module-"+t,g=P(this),p=g.closest(o.form),h=c.stateContext?P(c.stateContext):g,v=this,b=h[0],y=g.data(m);l={initialize:function(){A||l.bind.events(),l.instantiate()},instantiate:function(){l.verbose("Storing instance of module",l),y=l,g.data(m,y)},destroy:function(){l.verbose("Destroying previous module for",v),g.removeData(m).off(f)},bind:{events:function(){var e=l.get.event();e?(l.verbose("Attaching API events to element",e),g.on(e+f,l.event.trigger)):"now"==c.on&&(l.debug("Querying API endpoint immediately"),l.query())}},decode:{json:function(e){if(e!==F&&"string"==typeof e)try{e=JSON.parse(e)}catch(e){}return e}},read:{cachedResponse:function(e){var t;if(E.Storage!==F)return t=sessionStorage.getItem(e),l.debug("Using cached response",e,t),t=l.decode.json(t);l.error(u.noStorage)}},write:{cachedResponse:function(e,t){t&&""===t?l.debug("Response empty, not caching",t):E.Storage!==F?(P.isPlainObject(t)&&(t=JSON.stringify(t)),sessionStorage.setItem(e,t),l.verbose("Storing cached response for url",e,t)):l.error(u.noStorage)}},query:function(){if(l.is.disabled())l.debug("Element is disabled API request aborted");else{if(l.is.loading()){if(!c.interruptRequests)return void l.debug("Cancelling request, previous request is still pending");l.debug("Interrupting previous request"),l.abort()}if(c.defaultData&&P.extend(!0,c.urlData,l.get.defaultData()),c.serializeForm&&(c.data=l.add.formData(c.data)),!1===(r=l.get.settings()))return l.cancelled=!0,void l.error(u.beforeSend);if(l.cancelled=!1,(n=l.get.templatedURL())||l.is.mocked()){if((n=l.add.urlData(n))||l.is.mocked()){if(r.url=c.base+n,a=P.extend(!0,{},c,{type:c.method||c.type,data:e,url:c.base+n,beforeSend:c.beforeXHR,success:function(){},failure:function(){},complete:function(){}}),l.debug("Querying URL",a.url),l.verbose("Using AJAX settings",a),"local"===c.cache&&l.read.cachedResponse(n))return l.debug("Response returned from local cache"),l.request=l.create.request(),void l.request.resolveWith(b,[l.read.cachedResponse(n)]);c.throttle?c.throttleFirstRequest||l.timer?(l.debug("Throttling request",c.throttle),clearTimeout(l.timer),l.timer=setTimeout(function(){l.timer&&delete l.timer,l.debug("Sending throttled request",e,a.method),l.send.request()},c.throttle)):(l.debug("Sending request",e,a.method),l.send.request(),l.timer=setTimeout(function(){},c.throttle)):(l.debug("Sending request",e,a.method),l.send.request())}}else l.error(u.missingURL)}},should:{removeError:function(){return!0===c.hideError||"auto"===c.hideError&&!l.is.form()}},is:{disabled:function(){return 0<g.filter(o.disabled).length},expectingJSON:function(){return"json"===c.dataType||"jsonp"===c.dataType},form:function(){return g.is("form")||h.is("form")},mocked:function(){return c.mockResponse||c.mockResponseAsync||c.response||c.responseAsync},input:function(){return g.is("input")},loading:function(){return!!l.request&&"pending"==l.request.state()},abortedRequest:function(e){return e&&e.readyState!==F&&0===e.readyState?(l.verbose("XHR request determined to be aborted"),!0):(l.verbose("XHR request was not aborted"),!1)},validResponse:function(e){return l.is.expectingJSON()&&P.isFunction(c.successTest)?(l.debug("Checking JSON returned success",c.successTest,e),c.successTest(e)?(l.debug("Response passed success test",e),!0):(l.debug("Response failed success test",e),!1)):(l.verbose("Response is not JSON, skipping validation",c.successTest,e),!0)}},was:{cancelled:function(){return l.cancelled||!1},succesful:function(){return l.request&&"resolved"==l.request.state()},failure:function(){return l.request&&"rejected"==l.request.state()},complete:function(){return l.request&&("resolved"==l.request.state()||"rejected"==l.request.state())}},add:{urlData:function(o,a){var e,t;return o&&(e=o.match(c.regExp.required),t=o.match(c.regExp.optional),a=a||c.urlData,e&&(l.debug("Looking for required URL variables",e),P.each(e,function(e,t){var n=-1!==t.indexOf("$")?t.substr(2,t.length-3):t.substr(1,t.length-2),i=P.isPlainObject(a)&&a[n]!==F?a[n]:g.data(n)!==F?g.data(n):h.data(n)!==F?h.data(n):a[n];if(i===F)return l.error(u.requiredParameter,n,o),o=!1;l.verbose("Found required variable",n,i),i=c.encodeParameters?l.get.urlEncodedValue(i):i,o=o.replace(t,i)})),t&&(l.debug("Looking for optional URL variables",e),P.each(t,function(e,t){var n=-1!==t.indexOf("$")?t.substr(3,t.length-4):t.substr(2,t.length-3),i=P.isPlainObject(a)&&a[n]!==F?a[n]:g.data(n)!==F?g.data(n):h.data(n)!==F?h.data(n):a[n];o=i!==F?(l.verbose("Optional variable Found",n,i),o.replace(t,i)):(l.verbose("Optional variable not found",n),-1!==o.indexOf("/"+t)?o.replace("/"+t,""):o.replace(t,""))}))),o},formData:function(e){var t=P.fn.serializeObject!==F,n=t?p.serializeObject():p.serialize();return e=e||c.data,e=P.isPlainObject(e)?t?(l.debug("Extending existing data with form data",e,n),P.extend(!0,{},e,n)):(l.error(u.missingSerialize),l.debug("Cant extend data. Replacing data with form data",e,n),n):(l.debug("Adding form data",n),n)}},send:{request:function(){l.set.loading(),l.request=l.create.request(),l.is.mocked()?l.mockedXHR=l.create.mockedXHR():l.xhr=l.create.xhr(),c.onRequest.call(b,l.request,l.xhr)}},event:{trigger:function(e){l.query(),"submit"!=e.type&&"click"!=e.type||e.preventDefault()},xhr:{always:function(){},done:function(e,t,n){var i=this,o=(new Date).getTime()-s,a=c.loadingDuration-o,r=!!P.isFunction(c.onResponse)&&(l.is.expectingJSON()?c.onResponse.call(i,P.extend(!0,{},e)):c.onResponse.call(i,e));a=0<a?a:0,r&&(l.debug("Modified API response in onResponse callback",c.onResponse,r,e),e=r),0<a&&l.debug("Response completed early delaying state change by",a),setTimeout(function(){l.is.validResponse(e)?l.request.resolveWith(i,[e,n]):l.request.rejectWith(i,[n,"invalid"])},a)},fail:function(e,t,n){var i=this,o=(new Date).getTime()-s,a=c.loadingDuration-o;0<(a=0<a?a:0)&&l.debug("Response completed early delaying state change by",a),setTimeout(function(){l.is.abortedRequest(e)?l.request.rejectWith(i,[e,"aborted",n]):l.request.rejectWith(i,[e,"error",t,n])},a)}},request:{done:function(e,t){l.debug("Successful API Response",e),"local"===c.cache&&n&&(l.write.cachedResponse(n,e),l.debug("Saving server response locally",l.cache)),c.onSuccess.call(b,e,g,t)},complete:function(e,t){var n,i;l.was.succesful()?(i=e,n=t):(n=e,i=l.get.responseFromXHR(n)),l.remove.loading(),c.onComplete.call(b,i,g,n)},fail:function(e,t,n){var i=l.get.responseFromXHR(e),o=l.get.errorFromRequest(i,t,n);if("aborted"==t)return l.debug("XHR Aborted (Most likely caused by page navigation or CORS Policy)",t,n),c.onAbort.call(b,t,g,e),!0;"invalid"==t?l.debug("JSON did not pass success test. A server-side error has most likely occurred",i):"error"==t&&e!==F&&(l.debug("XHR produced a server error",t,n),200!=e.status&&n!==F&&""!==n&&l.error(u.statusMessage+n,a.url),c.onError.call(b,o,g,e)),c.errorDuration&&"aborted"!==t&&(l.debug("Adding error state"),l.set.error(),l.should.removeError()&&setTimeout(l.remove.error,c.errorDuration)),l.debug("API Request failed",o,e),c.onFailure.call(b,i,g,e)}}},create:{request:function(){return P.Deferred().always(l.event.request.complete).done(l.event.request.done).fail(l.event.request.fail)},mockedXHR:function(){var e,t,n,i=c.mockResponse||c.response,o=c.mockResponseAsync||c.responseAsync;return n=P.Deferred().always(l.event.xhr.complete).done(l.event.xhr.done).fail(l.event.xhr.fail),i?(t=P.isFunction(i)?(l.debug("Using specified synchronous callback",i),i.call(b,r)):(l.debug("Using settings specified response",i),i),n.resolveWith(b,[t,!1,{responseText:t}])):P.isFunction(o)&&(e=function(e){l.debug("Async callback returned response",e),e?n.resolveWith(b,[e,!1,{responseText:e}]):n.rejectWith(b,[{responseText:e},!1,!1])},l.debug("Using specified async response callback",o),o.call(b,r,e)),n},xhr:function(){var e;return e=P.ajax(a).always(l.event.xhr.always).done(l.event.xhr.done).fail(l.event.xhr.fail),l.verbose("Created server request",e,a),e}},set:{error:function(){l.verbose("Adding error state to element",h),h.addClass(d.error)},loading:function(){l.verbose("Adding loading state to element",h),h.addClass(d.loading),s=(new Date).getTime()}},remove:{error:function(){l.verbose("Removing error state from element",h),h.removeClass(d.error)},loading:function(){l.verbose("Removing loading state from element",h),h.removeClass(d.loading)}},get:{responseFromXHR:function(e){return!!P.isPlainObject(e)&&(l.is.expectingJSON()?l.decode.json(e.responseText):e.responseText)},errorFromRequest:function(e,t,n){return P.isPlainObject(e)&&e.error!==F?e.error:c.error[t]!==F?c.error[t]:n},request:function(){return l.request||!1},xhr:function(){return l.xhr||!1},settings:function(){var e;return(e=c.beforeSend.call(b,c))&&(e.success!==F&&(l.debug("Legacy success callback detected",e),l.error(u.legacyParameters,e.success),e.onSuccess=e.success),e.failure!==F&&(l.debug("Legacy failure callback detected",e),l.error(u.legacyParameters,e.failure),e.onFailure=e.failure),e.complete!==F&&(l.debug("Legacy complete callback detected",e),l.error(u.legacyParameters,e.complete),e.onComplete=e.complete)),e===F&&l.error(u.noReturnedValue),!1===e?e:e!==F?P.extend(!0,{},e):P.extend(!0,{},c)},urlEncodedValue:function(e){var t=E.decodeURIComponent(e),n=E.encodeURIComponent(e);return t!==e?(l.debug("URL value is already encoded, avoiding double encoding",e),e):(l.verbose("Encoding value using encodeURIComponent",e,n),n)},defaultData:function(){var e={};return P.isWindow(v)||(l.is.input()?e.value=g.val():l.is.form()||(e.text=g.text())),e},event:function(){return P.isWindow(v)||"now"==c.on?(l.debug("API called without element, no events attached"),!1):"auto"==c.on?g.is("input")?v.oninput!==F?"input":v.onpropertychange!==F?"propertychange":"keyup":g.is("form")?"submit":"click":c.on},templatedURL:function(e){if(e=e||g.data(i.action)||c.action||!1,n=g.data(i.url)||c.url||!1)return l.debug("Using specified url",n),n;if(e){if(l.debug("Looking up url for action",e,c.api),c.api[e]===F&&!l.is.mocked())return void l.error(u.missingAction,c.action,c.api);n=c.api[e]}else l.is.form()&&(n=g.attr("action")||h.attr("action")||!1,l.debug("No url or action specified, defaulting to form action",n));return n}},abort:function(){var e=l.get.xhr();e&&"resolved"!==e.state()&&(l.debug("Cancelling API request"),e.abort())},reset:function(){l.remove.error(),l.remove.loading()},setting:function(e,t){if(l.debug("Changing setting",e,t),P.isPlainObject(e))P.extend(!0,c,e);else{if(t===F)return c[e];P.isPlainObject(c[e])?P.extend(!0,c[e],t):c[e]=t}},internal:function(e,t){if(P.isPlainObject(e))P.extend(!0,l,e);else{if(t===F)return l[e];l[e]=t}},debug:function(){!c.silent&&c.debug&&(c.performance?l.performance.log(arguments):(l.debug=Function.prototype.bind.call(console.info,console,c.name+":"),l.debug.apply(console,arguments)))},verbose:function(){!c.silent&&c.verbose&&c.debug&&(c.performance?l.performance.log(arguments):(l.verbose=Function.prototype.bind.call(console.info,console,c.name+":"),l.verbose.apply(console,arguments)))},error:function(){c.silent||(l.error=Function.prototype.bind.call(console.error,console,c.name+":"),l.error.apply(console,arguments))},performance:{log:function(e){var t,n;c.performance&&(n=(t=(new Date).getTime())-(S||t),S=t,k.push({Name:e[0],Arguments:[].slice.call(e,1)||"","Execution Time":n})),clearTimeout(l.performance.timer),l.performance.timer=setTimeout(l.performance.display,500)},display:function(){var e=c.name+":",n=0;S=!1,clearTimeout(l.performance.timer),P.each(k,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",w&&(e+=" '"+w+"'"),(console.group!==F||console.table!==F)&&0<k.length&&(console.groupCollapsed(e),console.table?console.table(k):P.each(k,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),k=[]}},invoke:function(i,e,t){var o,a,n,r=y;return e=e||R,t=v||t,"string"==typeof i&&r!==F&&(i=i.split(/[\. ]/),o=i.length-1,P.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(P.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==F)return a=r[n],!1;if(!P.isPlainObject(r[t])||e==o)return r[t]!==F?a=r[t]:l.error(u.method,i),!1;r=r[t]}})),P.isFunction(a)?n=a.apply(t,e):a!==F&&(n=a),P.isArray(C)?C.push(n):C!==F?C=[C,n]:n!==F&&(C=n),a}},A?(y===F&&l.initialize(),l.invoke(T)):(y!==F&&y.invoke("destroy"),l.initialize())}),C!==F?C:this},P.api.settings={name:"API",namespace:"api",debug:!1,verbose:!1,performance:!0,api:{},cache:!0,interruptRequests:!0,on:"auto",stateContext:!1,loadingDuration:0,hideError:"auto",errorDuration:2e3,encodeParameters:!0,action:!1,url:!1,base:"",urlData:{},defaultData:!0,serializeForm:!1,throttle:0,throttleFirstRequest:!0,method:"get",data:{},dataType:"json",mockResponse:!1,mockResponseAsync:!1,response:!1,responseAsync:!1,beforeSend:function(e){return e},beforeXHR:function(e){},onRequest:function(e,t){},onResponse:!1,onSuccess:function(e,t){},onComplete:function(e,t){},onFailure:function(e,t){},onError:function(e,t){},onAbort:function(e,t){},successTest:!1,error:{beforeSend:"The before send function has aborted the request",error:"There was an error with your request",exitConditions:"API Request Aborted. Exit conditions met",JSONParse:"JSON could not be parsed during error handling",legacyParameters:"You are using legacy API success callback names",method:"The method you called is not defined",missingAction:"API action used but no url was defined",missingSerialize:"jquery-serialize-object is required to add form data to an existing data object",missingURL:"No URL specified for api event",noReturnedValue:"The beforeSend callback must return a settings object, beforeSend ignored.",noStorage:"Caching responses locally requires session storage",parseError:"There was an error parsing your request",requiredParameter:"Missing a required URL parameter: ",statusMessage:"Server gave an error: ",timeout:"Your request timed out"},regExp:{required:/\{\$*[A-z0-9]+\}/g,optional:/\{\/\$*[A-z0-9]+\}/g},className:{loading:"loading",error:"error"},selector:{disabled:".disabled",form:"form"},metadata:{action:"action",url:"url"}}}(jQuery,window,document),function(P,E,F,O){"use strict";E=void 0!==E&&E.Math==Math?E:"undefined"!=typeof self&&self.Math==Math?self:Function("return this")(),P.fn.visibility=function(b){var y,e=P(this),x=e.selector||"",C=(new Date).getTime(),w=[],S=b,k="string"==typeof S,T=[].slice.call(arguments,1),A=e.length,R=0;return e.each(function(){var e,t,n,s,o=P.isPlainObject(b)?P.extend(!0,{},P.fn.visibility.settings,b):P.extend({},P.fn.visibility.settings),i=o.className,a=o.namespace,l=o.error,r=o.metadata,c="."+a,u="module-"+a,d=P(E),f=P(this),m=P(o.context),g=(f.selector,f.data(u)),p=E.requestAnimationFrame||E.mozRequestAnimationFrame||E.webkitRequestAnimationFrame||E.msRequestAnimationFrame||function(e){setTimeout(e,0)},h=this,v=!1;s={initialize:function(){s.debug("Initializing",o),s.setup.cache(),s.should.trackChanges()&&("image"==o.type&&s.setup.image(),"fixed"==o.type&&s.setup.fixed(),o.observeChanges&&s.observeChanges(),s.bind.events()),s.save.position(),s.is.visible()||s.error(l.visible,f),o.initialCheck&&s.checkVisibility(),s.instantiate()},instantiate:function(){s.debug("Storing instance",s),f.data(u,s),g=s},destroy:function(){s.verbose("Destroying previous module"),n&&n.disconnect(),t&&t.disconnect(),d.off("load"+c,s.event.load).off("resize"+c,s.event.resize),m.off("scroll"+c,s.event.scroll).off("scrollchange"+c,s.event.scrollchange),"fixed"==o.type&&(s.resetFixed(),s.remove.placeholder()),f.off(c).removeData(u)},observeChanges:function(){"MutationObserver"in E&&(t=new MutationObserver(s.event.contextChanged),n=new MutationObserver(s.event.changed),t.observe(F,{childList:!0,subtree:!0}),n.observe(h,{childList:!0,subtree:!0}),s.debug("Setting up mutation observer",n))},bind:{events:function(){s.verbose("Binding visibility events to scroll and resize"),o.refreshOnLoad&&d.on("load"+c,s.event.load),d.on("resize"+c,s.event.resize),m.off("scroll"+c).on("scroll"+c,s.event.scroll).on("scrollchange"+c,s.event.scrollchange)}},event:{changed:function(e){s.verbose("DOM tree modified, updating visibility calculations"),s.timer=setTimeout(function(){s.verbose("DOM tree modified, updating sticky menu"),s.refresh()},100)},contextChanged:function(e){[].forEach.call(e,function(e){e.removedNodes&&[].forEach.call(e.removedNodes,function(e){(e==h||0<P(e).find(h).length)&&(s.debug("Element removed from DOM, tearing down events"),s.destroy())})})},resize:function(){s.debug("Window resized"),o.refreshOnResize&&p(s.refresh)},load:function(){s.debug("Page finished loading"),p(s.refresh)},scroll:function(){o.throttle?(clearTimeout(s.timer),s.timer=setTimeout(function(){m.triggerHandler("scrollchange"+c,[m.scrollTop()])},o.throttle)):p(function(){m.triggerHandler("scrollchange"+c,[m.scrollTop()])})},scrollchange:function(e,t){s.checkVisibility(t)}},precache:function(e,t){e instanceof Array||(e=[e]);for(var n=e.length,i=0,o=[],a=F.createElement("img"),r=function(){++i>=e.length&&P.isFunction(t)&&t()};n--;)(a=F.createElement("img")).onload=r,a.onerror=r,a.src=e[n],o.push(a)},enableCallbacks:function(){s.debug("Allowing callbacks to occur"),v=!1},disableCallbacks:function(){s.debug("Disabling all callbacks temporarily"),v=!0},should:{trackChanges:function(){return k?(s.debug("One time query, no need to bind events"),!1):(s.debug("Callbacks being attached"),!0)}},setup:{cache:function(){s.cache={occurred:{},screen:{},element:{}}},image:function(){var e=f.data(r.src);e&&(s.verbose("Lazy loading image",e),o.once=!0,o.observeChanges=!1,o.onOnScreen=function(){s.debug("Image on screen",h),s.precache(e,function(){s.set.image(e,function(){++R==A&&o.onAllLoaded.call(this),o.onLoad.call(this)})})})},fixed:function(){s.debug("Setting up fixed"),o.once=!1,o.observeChanges=!1,o.initialCheck=!0,o.refreshOnLoad=!0,b.transition||(o.transition=!1),s.create.placeholder(),s.debug("Added placeholder",e),o.onTopPassed=function(){s.debug("Element passed, adding fixed position",f),s.show.placeholder(),s.set.fixed(),o.transition&&P.fn.transition!==O&&f.transition(o.transition,o.duration)},o.onTopPassedReverse=function(){s.debug("Element returned to position, removing fixed",f),s.hide.placeholder(),s.remove.fixed()}}},create:{placeholder:function(){s.verbose("Creating fixed position placeholder"),e=f.clone(!1).css("display","none").addClass(i.placeholder).insertAfter(f)}},show:{placeholder:function(){s.verbose("Showing placeholder"),e.css("display","block").css("visibility","hidden")}},hide:{placeholder:function(){s.verbose("Hiding placeholder"),e.css("display","none").css("visibility","")}},set:{fixed:function(){s.verbose("Setting element to fixed position"),f.addClass(i.fixed).css({position:"fixed",top:o.offset+"px",left:"auto",zIndex:o.zIndex}),o.onFixed.call(h)},image:function(e,t){if(f.attr("src",e),o.transition)if(P.fn.transition!==O){if(f.hasClass(i.visible))return void s.debug("Transition already occurred on this image, skipping animation");f.transition(o.transition,o.duration,t)}else f.fadeIn(o.duration,t);else f.show()}},is:{onScreen:function(){return s.get.elementCalculations().onScreen},offScreen:function(){return s.get.elementCalculations().offScreen},visible:function(){return!(!s.cache||!s.cache.element)&&!(0===s.cache.element.width&&0===s.cache.element.offset.top)},verticallyScrollableContext:function(){var e=m.get(0)!==E&&m.css("overflow-y");return"auto"==e||"scroll"==e},horizontallyScrollableContext:function(){var e=m.get(0)!==E&&m.css("overflow-x");return"auto"==e||"scroll"==e}},refresh:function(){s.debug("Refreshing constants (width/height)"),"fixed"==o.type&&s.resetFixed(),s.reset(),s.save.position(),o.checkOnRefresh&&s.checkVisibility(),o.onRefresh.call(h)},resetFixed:function(){s.remove.fixed(),s.remove.occurred()},reset:function(){s.verbose("Resetting all cached values"),P.isPlainObject(s.cache)&&(s.cache.screen={},s.cache.element={})},checkVisibility:function(e){s.verbose("Checking visibility of element",s.cache.element),!v&&s.is.visible()&&(s.save.scroll(e),s.save.calculations(),s.passed(),s.passingReverse(),s.topVisibleReverse(),s.bottomVisibleReverse(),s.topPassedReverse(),s.bottomPassedReverse(),s.onScreen(),s.offScreen(),s.passing(),s.topVisible(),s.bottomVisible(),s.topPassed(),s.bottomPassed(),o.onUpdate&&o.onUpdate.call(h,s.get.elementCalculations()))},passed:function(e,t){var n=s.get.elementCalculations();if(e&&t)o.onPassed[e]=t;else{if(e!==O)return s.get.pixelsPassed(e)>n.pixelsPassed;n.passing&&P.each(o.onPassed,function(e,t){n.bottomVisible||n.pixelsPassed>s.get.pixelsPassed(e)?s.execute(t,e):o.once||s.remove.occurred(t)})}},onScreen:function(e){var t=s.get.elementCalculations(),n=e||o.onOnScreen,i="onScreen";if(e&&(s.debug("Adding callback for onScreen",e),o.onOnScreen=e),t.onScreen?s.execute(n,i):o.once||s.remove.occurred(i),e!==O)return t.onOnScreen},offScreen:function(e){var t=s.get.elementCalculations(),n=e||o.onOffScreen,i="offScreen";if(e&&(s.debug("Adding callback for offScreen",e),o.onOffScreen=e),t.offScreen?s.execute(n,i):o.once||s.remove.occurred(i),e!==O)return t.onOffScreen},passing:function(e){var t=s.get.elementCalculations(),n=e||o.onPassing,i="passing";if(e&&(s.debug("Adding callback for passing",e),o.onPassing=e),t.passing?s.execute(n,i):o.once||s.remove.occurred(i),e!==O)return t.passing},topVisible:function(e){var t=s.get.elementCalculations(),n=e||o.onTopVisible,i="topVisible";if(e&&(s.debug("Adding callback for top visible",e),o.onTopVisible=e),t.topVisible?s.execute(n,i):o.once||s.remove.occurred(i),e===O)return t.topVisible},bottomVisible:function(e){var t=s.get.elementCalculations(),n=e||o.onBottomVisible,i="bottomVisible";if(e&&(s.debug("Adding callback for bottom visible",e),o.onBottomVisible=e),t.bottomVisible?s.execute(n,i):o.once||s.remove.occurred(i),e===O)return t.bottomVisible},topPassed:function(e){var t=s.get.elementCalculations(),n=e||o.onTopPassed,i="topPassed";if(e&&(s.debug("Adding callback for top passed",e),o.onTopPassed=e),t.topPassed?s.execute(n,i):o.once||s.remove.occurred(i),e===O)return t.topPassed},bottomPassed:function(e){var t=s.get.elementCalculations(),n=e||o.onBottomPassed,i="bottomPassed";if(e&&(s.debug("Adding callback for bottom passed",e),o.onBottomPassed=e),t.bottomPassed?s.execute(n,i):o.once||s.remove.occurred(i),e===O)return t.bottomPassed},passingReverse:function(e){var t=s.get.elementCalculations(),n=e||o.onPassingReverse,i="passingReverse";if(e&&(s.debug("Adding callback for passing reverse",e),o.onPassingReverse=e),t.passing?o.once||s.remove.occurred(i):s.get.occurred("passing")&&s.execute(n,i),e!==O)return!t.passing},topVisibleReverse:function(e){var t=s.get.elementCalculations(),n=e||o.onTopVisibleReverse,i="topVisibleReverse";if(e&&(s.debug("Adding callback for top visible reverse",e),o.onTopVisibleReverse=e),t.topVisible?o.once||s.remove.occurred(i):s.get.occurred("topVisible")&&s.execute(n,i),e===O)return!t.topVisible},bottomVisibleReverse:function(e){var t=s.get.elementCalculations(),n=e||o.onBottomVisibleReverse,i="bottomVisibleReverse";if(e&&(s.debug("Adding callback for bottom visible reverse",e),o.onBottomVisibleReverse=e),t.bottomVisible?o.once||s.remove.occurred(i):s.get.occurred("bottomVisible")&&s.execute(n,i),e===O)return!t.bottomVisible},topPassedReverse:function(e){var t=s.get.elementCalculations(),n=e||o.onTopPassedReverse,i="topPassedReverse";if(e&&(s.debug("Adding callback for top passed reverse",e),o.onTopPassedReverse=e),t.topPassed?o.once||s.remove.occurred(i):s.get.occurred("topPassed")&&s.execute(n,i),e===O)return!t.onTopPassed},bottomPassedReverse:function(e){var t=s.get.elementCalculations(),n=e||o.onBottomPassedReverse,i="bottomPassedReverse";if(e&&(s.debug("Adding callback for bottom passed reverse",e),o.onBottomPassedReverse=e),t.bottomPassed?o.once||s.remove.occurred(i):s.get.occurred("bottomPassed")&&s.execute(n,i),e===O)return!t.bottomPassed},execute:function(e,t){var n=s.get.elementCalculations(),i=s.get.screenCalculations();(e=e||!1)&&(o.continuous?(s.debug("Callback being called continuously",t,n),e.call(h,n,i)):s.get.occurred(t)||(s.debug("Conditions met",t,n),e.call(h,n,i))),s.save.occurred(t)},remove:{fixed:function(){s.debug("Removing fixed position"),f.removeClass(i.fixed).css({position:"",top:"",left:"",zIndex:""}),o.onUnfixed.call(h)},placeholder:function(){s.debug("Removing placeholder content"),e&&e.remove()},occurred:function(e){if(e){var t=s.cache.occurred;t[e]!==O&&!0===t[e]&&(s.debug("Callback can now be called again",e),s.cache.occurred[e]=!1)}else s.cache.occurred={}}},save:{calculations:function(){s.verbose("Saving all calculations necessary to determine positioning"),s.save.direction(),s.save.screenCalculations(),s.save.elementCalculations()},occurred:function(e){e&&(s.cache.occurred[e]!==O&&!0===s.cache.occurred[e]||(s.verbose("Saving callback occurred",e),s.cache.occurred[e]=!0))},scroll:function(e){e=e+o.offset||m.scrollTop()+o.offset,s.cache.scroll=e},direction:function(){var e,t=s.get.scroll(),n=s.get.lastScroll();return e=n<t&&n?"down":t<n&&n?"up":"static",s.cache.direction=e,s.cache.direction},elementPosition:function(){var e=s.cache.element,t=s.get.screenSize();return s.verbose("Saving element position"),e.fits=e.height<t.height,e.offset=f.offset(),e.width=f.outerWidth(),e.height=f.outerHeight(),s.is.verticallyScrollableContext()&&(e.offset.top+=m.scrollTop()-m.offset().top),s.is.horizontallyScrollableContext()&&(e.offset.left+=m.scrollLeft-m.offset().left),s.cache.element=e},elementCalculations:function(){var e=s.get.screenCalculations(),t=s.get.elementPosition();return o.includeMargin?(t.margin={},t.margin.top=parseInt(f.css("margin-top"),10),t.margin.bottom=parseInt(f.css("margin-bottom"),10),t.top=t.offset.top-t.margin.top,t.bottom=t.offset.top+t.height+t.margin.bottom):(t.top=t.offset.top,t.bottom=t.offset.top+t.height),t.topPassed=e.top>=t.top,t.bottomPassed=e.top>=t.bottom,t.topVisible=e.bottom>=t.top&&!t.topPassed,t.bottomVisible=e.bottom>=t.bottom&&!t.bottomPassed,t.pixelsPassed=0,t.percentagePassed=0,t.onScreen=(t.topVisible||t.passing)&&!t.bottomPassed,t.passing=t.topPassed&&!t.bottomPassed,t.offScreen=!t.onScreen,t.passing&&(t.pixelsPassed=e.top-t.top,t.percentagePassed=(e.top-t.top)/t.height),s.cache.element=t,s.verbose("Updated element calculations",t),t},screenCalculations:function(){var e=s.get.scroll();return s.save.direction(),s.cache.screen.top=e,s.cache.screen.bottom=e+s.cache.screen.height,s.cache.screen},screenSize:function(){s.verbose("Saving window position"),s.cache.screen={height:m.height()}},position:function(){s.save.screenSize(),s.save.elementPosition()}},get:{pixelsPassed:function(e){var t=s.get.elementCalculations();return-1<e.search("%")?t.height*(parseInt(e,10)/100):parseInt(e,10)},occurred:function(e){return s.cache.occurred!==O&&s.cache.occurred[e]||!1},direction:function(){return s.cache.direction===O&&s.save.direction(),s.cache.direction},elementPosition:function(){return s.cache.element===O&&s.save.elementPosition(),s.cache.element},elementCalculations:function(){return s.cache.element===O&&s.save.elementCalculations(),s.cache.element},screenCalculations:function(){return s.cache.screen===O&&s.save.screenCalculations(),s.cache.screen},screenSize:function(){return s.cache.screen===O&&s.save.screenSize(),s.cache.screen},scroll:function(){return s.cache.scroll===O&&s.save.scroll(),s.cache.scroll},lastScroll:function(){return s.cache.screen===O?(s.debug("First scroll event, no last scroll could be found"),!1):s.cache.screen.top}},setting:function(e,t){if(P.isPlainObject(e))P.extend(!0,o,e);else{if(t===O)return o[e];o[e]=t}},internal:function(e,t){if(P.isPlainObject(e))P.extend(!0,s,e);else{if(t===O)return s[e];s[e]=t}},debug:function(){!o.silent&&o.debug&&(o.performance?s.performance.log(arguments):(s.debug=Function.prototype.bind.call(console.info,console,o.name+":"),s.debug.apply(console,arguments)))},verbose:function(){!o.silent&&o.verbose&&o.debug&&(o.performance?s.performance.log(arguments):(s.verbose=Function.prototype.bind.call(console.info,console,o.name+":"),s.verbose.apply(console,arguments)))},error:function(){o.silent||(s.error=Function.prototype.bind.call(console.error,console,o.name+":"),s.error.apply(console,arguments))},performance:{log:function(e){var t,n;o.performance&&(n=(t=(new Date).getTime())-(C||t),C=t,w.push({Name:e[0],Arguments:[].slice.call(e,1)||"",Element:h,"Execution Time":n})),clearTimeout(s.performance.timer),s.performance.timer=setTimeout(s.performance.display,500)},display:function(){var e=o.name+":",n=0;C=!1,clearTimeout(s.performance.timer),P.each(w,function(e,t){n+=t["Execution Time"]}),e+=" "+n+"ms",x&&(e+=" '"+x+"'"),(console.group!==O||console.table!==O)&&0<w.length&&(console.groupCollapsed(e),console.table?console.table(w):P.each(w,function(e,t){console.log(t.Name+": "+t["Execution Time"]+"ms")}),console.groupEnd()),w=[]}},invoke:function(i,e,t){var o,a,n,r=g;return e=e||T,t=h||t,"string"==typeof i&&r!==O&&(i=i.split(/[\. ]/),o=i.length-1,P.each(i,function(e,t){var n=e!=o?t+i[e+1].charAt(0).toUpperCase()+i[e+1].slice(1):i;if(P.isPlainObject(r[n])&&e!=o)r=r[n];else{if(r[n]!==O)return a=r[n],!1;if(!P.isPlainObject(r[t])||e==o)return r[t]!==O?a=r[t]:s.error(l.method,i),!1;r=r[t]}})),P.isFunction(a)?n=a.apply(t,e):a!==O&&(n=a),P.isArray(y)?y.push(n):y!==O?y=[y,n]:n!==O&&(y=n),a}},k?(g===O&&s.initialize(),g.save.scroll(),g.save.calculations(),s.invoke(S)):(g!==O&&g.invoke("destroy"),s.initialize())}),y!==O?y:this},P.fn.visibility.settings={name:"Visibility",namespace:"visibility",debug:!1,verbose:!1,performance:!0,observeChanges:!0,initialCheck:!0,refreshOnLoad:!0,refreshOnResize:!0,checkOnRefresh:!0,once:!0,continuous:!1,offset:0,includeMargin:!1,context:E,throttle:!1,type:!1,zIndex:"10",transition:"fade in",duration:1e3,onPassed:{},onOnScreen:!1,onOffScreen:!1,onPassing:!1,onTopVisible:!1,onBottomVisible:!1,onTopPassed:!1,onBottomPassed:!1,onPassingReverse:!1,onTopVisibleReverse:!1,onBottomVisibleReverse:!1,onTopPassedReverse:!1,onBottomPassedReverse:!1,onLoad:function(){},onAllLoaded:function(){},onFixed:function(){},onUnfixed:function(){},onUpdate:!1,onRefresh:function(){},metadata:{src:"src"},className:{fixed:"fixed",placeholder:"placeholder",visible:"visible"},error:{method:"The method you called is not defined.",visible:"Element is hidden, you must call refresh after element becomes visible"}}}(jQuery,window,document);
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

