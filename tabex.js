(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.tabex = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

module.exports = require('./lib');

},{"./lib":3}],2:[function(require,module,exports){
// Base client class
//
'use strict';


var $$ = require('./utils');


// Client
//
// options:
//
//  - router (RouterLS)
//
function Client(options) {
  var self = this;

  // Filers
  this.__filters_in__ = [];
  this.__filters_out__ = [];

  // Subscriptions
  this.__subscriptions__ = [];

  // Current node id
  this.__node_id__ = Math.floor(Math.random() * 1e10) + 1;

  // Message incremental counter
  this.__last_message_cnt__ = 0;

  // List of ignoring messages
  this.__ignore_list__ = {};

  // Router
  this.__router__ = options.router;

  this.__router__.onmessage(function (channel, message) {
    self.__onmessage__(channel, message);
  });
}


// Send message
//
// - channel (String) - channel name
// - message (Object) - message data
// - toSelf (Boolean) - optional, send message also to current client, default false
//
Client.prototype.emit = function (channel, message, toSelf) {
  var self = this;

  var wrappedMessage = {
    id: this.__node_id__ + '_' + (this.__last_message_cnt__++),
    node_id: this.__node_id__,
    data: message
  };

  if (!toSelf) {
    this.__ignore_list__[wrappedMessage.id] = true;
  }

  // Apply out filters
  $$.asyncEach(this.__filters_out__, channel, wrappedMessage, function (ch, msg) {
    self.__router__.broadcast(ch, msg);
  });
};


// Subscribe channel
//
// - channel (String) - channel name
// - handler (Function) - channel handler
//
Client.prototype.on = function (channel, handler) {
  this.__subscriptions__.push({
    channel: channel,
    handler: handler
  });

  this.emit('!sys.channels.add', { channel: channel });

  return this;
};


// Unsubscribe channel
//
// - channel (String) - channel name
// - handler (Function) - optional, all if not set
//
Client.prototype.off = function (channel, handler) {
  var self = this;

  this.__subscriptions__ = this.__subscriptions__.reduce(function (result, subscription) {
    if (subscription.channel === channel && (!handler || handler === subscription.handler)) {
      self.emit('!sys.channels.remove', { channel: channel });
      return result;
    }

    result.push(subscription);

    return result;
  }, []);
};


// Filter input messages
//
// - fn (Function) - `function (channel, message, callback)`, handler for each input message
//   - callback (Function) - `function (channel, message)`
//
Client.prototype.filterIn = function (fn) {
  this.__filters_in__.push(fn);

  return this;
};


// Filter output messages
//
// - fn (Function) - `function (channel, message, callback)`, handler for each output message
//   - callback (Function) - `function (channel, message)`
//
Client.prototype.filterOut = function (fn) {
  this.__filters_out__.push(fn);

  return this;
};


// Receive message from router
//
Client.prototype.__onmessage__ = function (channel, message) {
  var self = this;

  // Apply in filters
  $$.asyncEach(this.__filters_in__, channel, message, function (ch, msg) {
    if (self.__ignore_list__[msg.id]) {
      return;
    }

    self.__subscriptions__.forEach(function (subscription) {
      if (subscription.channel === ch) {
        subscription.handler(msg.data, ch);
      }
    });
  });
};


module.exports = Client;

},{"./utils":7}],3:[function(require,module,exports){
'use strict';


var Router = require('./router');
var Client = require('./client');
var Tunnel = require('./tunnel');


var routerInstances = {};


var Tabex = { _: {} };


// Expose classes for testing
//
Tabex._.Router = Router;
Tabex._.Client = Client;
Tabex._.Tunnel = Tunnel;


// Create client
//
Tabex.client = function (options) {
  options = options || {};

  var namespace = options.namespace || 'tabex_default_';

  var router;

  // If router in iframe (cross-domain) - create tunnel
  if (options.iframe) {
    router = new Tunnel.TunnelClient(options);

  // If router is local (single-domain) - try to reuse existing router
  } else {
    if (!routerInstances[namespace]) {
      routerInstances[namespace] = new Router({
        namespace: namespace
      });
    }

    router = routerInstances[namespace];
  }

  return new Client({ router: router });
};


// Create router
//
Tabex.router = function (options) {
  options = options || {};

  var namespace = options.namespace || 'tabex_default_';

  // Try to reuse existing router
  if (!routerInstances[namespace]) {
    routerInstances[namespace] = new Router({
      namespace: namespace
    });
  }

  // Create tunnel to communicate between router and client
  /* eslint-disable no-new */
  new Tunnel.TunnelRouter({
    router: routerInstances[namespace],
    namespace: namespace,
    origin: options.origin
  });

  return routerInstances[namespace];
};


module.exports = Tabex;

},{"./client":2,"./router":5,"./tunnel":6}],4:[function(require,module,exports){
// localStorage wrapper with fallback to memory emulation
//
'use strict';


/* global document, window */
var localStorage = window.localStorage;


var fake_storage = {};

// Check is `localStorage` available and writable
//
var LS_OK = (function () {
  // IE 8 does not send `key` and `newValue` in event
  if (document.documentMode && document.documentMode < 9) { return false; }

  if (!localStorage) { return false; }

  try {
    localStorage.setItem('live_local_storage_is_writable_test', '');
    localStorage.removeItem('live_local_storage_is_writable_test');
  } catch (__) { return false; }

  return true;
})();


function LocalStorage() {
}


Object.defineProperty(LocalStorage.prototype, 'length', {
  get: function () {
    return LS_OK ? localStorage.length : Object.keys(fake_storage).length;
  }
});


LocalStorage.prototype.getItem = function (key) {
  return LS_OK ? localStorage.getItem(key) : fake_storage.hasOwnProperty(key) ? fake_storage[key] : null;
};


LocalStorage.prototype.setItem = function (key, val) {
  if (LS_OK) {
    localStorage.setItem(key, val);
  } else {
    fake_storage[key] = val;
  }
};


LocalStorage.prototype.removeItem = function (key) {
  if (LS_OK) {
    localStorage.removeItem(key);
  } else {
    fake_storage[key] = null;
  }
};


LocalStorage.prototype.key = function (index) {
  return LS_OK ? localStorage.key(index) : Object.keys(fake_storage)[index];
};


module.exports = LocalStorage;

},{}],5:[function(require,module,exports){
// LocalStorage router
//
'use strict';


/* global window */
var LocalStorage = require('./local_storage');
var $$ = require('./utils');


var TIMEOUT = 4000;
var UPDATE_INTERVAL = TIMEOUT / 4;


// Constructor
//
// options:
//
//  - namespace (String) - optional, localStorage keys prefix, default 'tabex_default_'
//
function Router(options) {
  var self = this;

  options = options || {};

  this.__namespace__ = options.namespace || 'tabex_default_';
  this.__node_id__ = Math.floor(Math.random() * 1e10) + 1;
  this.__last_message_cnt__ = 0;
  this.__handlers__ = [];
  this.__router_id_prefix__ = this.__namespace__ + 'router_';
  this.__router_channels_prefix__ = this.__namespace__ + 'subscribed_';
  this.__router_channels__ = {};

  // IE broadcasts storage events also to the same window, we should filter that messages
  this.__storage_events_filter__ = [];

  for (var i = 0; i < 100; i++) {
    this.__storage_events_filter__.push('');
  }

  this.__ls__ = new LocalStorage();

  // Id of master tab
  this.__master_id__ = null;

  // Handle `localStorage` update
  $$.addEvent(window, 'storage', function (e) {
    // In IE 9 without delay `e.newValue` will be broken
    // http://stackoverflow.com/questions/9292576/localstorage-getitem-returns-old-data-in-ie-9
    setTimeout(function () {
      self.__on_changed__(e);
    }, 1);
  });

  // Handle page unload (listen `onbeforeunload` and `onunload` to ensure that data is stored successfully)
  // http://stackoverflow.com/questions/3775566/javascript-question-onbeforeunload-or-onunload
  //
  this.__destroyed__ = false;
  $$.addEvent(window, 'beforeunload', function () {
    self.__destroy__();
  });
  $$.addEvent(window, 'unload', function () {
    self.__destroy__();
  });

  // Update current tab info and check master alive
  this.__check_master__();
  setInterval(function () {
    self.__check_master__();
  }, UPDATE_INTERVAL);
}


// Broadcast message between all clients
//
// - channel (String) - channel name
// - message (Object) - message data
//
Router.prototype.broadcast = function (channel, message) {
  // If it is system subscribe message - update channels list
  if (channel === '!sys.channels.add') {
    this.__router_channels__[message.data.channel] = this.__router_channels__[message.data.channel] || 0;
    this.__router_channels__[message.data.channel]++;
    this.__update_channels_list__();

    return;
  }

  // If it is system unsubscribe message - update channels list
  if (channel === '!sys.channels.remove') {
    this.__router_channels__[message.data.channel] = this.__router_channels__[message.data.channel] || 0;
    this.__router_channels__[message.data.channel]--;
    this.__update_channels_list__();

    return;
  }

  var serializedMessage = JSON.stringify({
    channel: channel,
    message: message,

    // Add random to be sure that `localStorage` sent event even new massage is same than previous
    random: Math.floor(Math.random() * 1e10)
  });

  // Add message to `localStorage` to distribute over Router instances
  this.__storage_events_filter__.shift();
  this.__storage_events_filter__.push(this.__namespace__ + 'broadcast' + '_' + serializedMessage);
  this.__ls__.setItem(this.__namespace__ + 'broadcast', serializedMessage);

  // Emit message for all clients and proxies registered on this router
  this.__handlers__.forEach(function (handler) {
    handler(channel, message);
  });
};


// Subscribe handler to all messages
//
Router.prototype.onmessage = function (handler) {
  var self = this;

  this.__handlers__.push(handler);

  // Delay sending events to next tick to allow client initialize handlers
  setTimeout(function () {
    // Sent master info for every new client
    handler('!sys.master', {
      data: {
        node_id: self.__node_id__,
        master_id: self.__master_id__
      },
      node_id: self.__node_id__,
      id: self.__node_id__ + '_' + (self.__last_message_cnt__++)
    });

    // Send channels info
    self.__on_channels_list_changed__();
  }, 0);
};


// Update master id, if current tab is master - init connect and subscribe channels
//
Router.prototype.__on_master_changed__ = function (newMasterID) {
  var self = this;

  // If master tab closed
  if (!newMasterID) {
    // Select random master (tab with smallest ID becomes master)
    if (this.__get_alive_router_ids__().sort()[0] === this.__node_id__) {
      this.__storage_events_filter__.pop();
      this.__storage_events_filter__.push(this.__namespace__ + 'master' + '_' + this.__node_id__);
      this.__ls__.setItem(this.__namespace__ + 'master', this.__node_id__);
      this.__on_master_changed__(this.__node_id__);
    }
    return;
  }

  this.__master_id__ = +newMasterID;

  this.__handlers__.forEach(function (handler) {
    handler('!sys.master', {
      data: {
        node_id: self.__node_id__,
        master_id: self.__master_id__
      },
      node_id: self.__node_id__,
      id: self.__node_id__ + '_' + (self.__last_message_cnt__++)
    });
  });
};


// localStorage change handler. Updates master ID, receive subscribe requests
//
Router.prototype.__on_changed__ = function (e) {

  // IE broadcasts storage events also to the same window, we should filter that messages
  if (this.__storage_events_filter__.indexOf(e.key + '_' + e.newValue) !== -1) {
    return;
  }

  // Master changed
  if (e.key === this.__namespace__ + 'master') {
    this.__on_master_changed__(e.newValue);
  }

  // Channels list changed
  if (e.key.indexOf(this.__router_channels_prefix__) === 0) {
    this.__on_channels_list_changed__();
  }

  // Emit message for all clients and proxies registered on this router
  if (e.key === this.__namespace__ + 'broadcast') {
    var data = JSON.parse(e.newValue);

    this.__handlers__.forEach(function (handler) {
      handler(data.channel, data.message);
    });
  }
};


// Page unload handler. Remove tab data from store
//
Router.prototype.__destroy__ = function () {
  if (this.__destroyed__) {
    return;
  }

  this.__destroyed__ = true;

  this.__ls__.removeItem(this.__router_id_prefix__ + this.__node_id__);
  this.__ls__.removeItem(this.__router_channels_prefix__ + this.__node_id__);

  if (this.__master_id__ === this.__node_id__) {
    this.__ls__.removeItem(this.__namespace__ + 'master');
  }
};


// Get alive tabs IDs and remove timeouted tabs
//
Router.prototype.__get_alive_router_ids__ = function () {
  var maxTime = Date.now() - TIMEOUT;
  var id;
  var routersIDs = [];

  for (var i = 0, key; i < this.__ls__.length; i++) {
    key = this.__ls__.key(i);

    // Filter localStorage records by prefix
    if (key.indexOf(this.__router_id_prefix__) !== 0) {
      continue;
    }

    id = +key.substr(this.__router_id_prefix__.length);

    // Check router is alive and remove if not
    if (this.__ls__.getItem(key) < maxTime) {
      this.__ls__.removeItem(key);
      this.__ls__.removeItem(this.__router_channels_prefix__ + id);
      continue;
    }

    routersIDs.push(id);
  }

  return routersIDs;
};


// Update tab channels list
//
Router.prototype.__update_channels_list__ = function () {
  var self = this;
  var channels = [];

  Object.keys(this.__router_channels__).forEach(function (channel) {
    if (self.__router_channels__[channel] > 0) {
      channels.push(channel);
    }
  });

  var serializedChannels = JSON.stringify(channels.sort());

  // Update channels list if changed
  if (this.__ls__.getItem(this.__router_channels_prefix__ + this.__node_id__) !== serializedChannels) {
    this.__storage_events_filter__.pop();
    this.__storage_events_filter__.push(this.__router_channels_prefix__ + this.__node_id__ + '_' + serializedChannels);
    this.__ls__.setItem(this.__router_channels_prefix__ + this.__node_id__, serializedChannels);
    this.__on_channels_list_changed__();
  }
};


// Update subscribes if channels list changed (run only on master)
//
Router.prototype.__on_channels_list_changed__ = function () {
  var self = this;
  var channels = [];

  for (var i = 0, key; i < this.__ls__.length; i++) {
    key = this.__ls__.key(i);

    // Filter localStorage records by prefix
    if (key.indexOf(this.__router_channels_prefix__) !== 0) {
      continue;
    }

    channels = channels.concat(JSON.parse(this.__ls__.getItem(key)));
  }

  // Get unique channels names
  channels = channels.reduce(function (result, item) {
    if (result.indexOf(item) === -1) {
      result.push(item);
    }
    return result;
  }, []);

  this.__handlers__.forEach(function (handler) {
    handler('!sys.channels.refresh', {
      id: self.__node_id__ + '_' + (self.__last_message_cnt__++),
      node_id: self.__node_id__,
      data: {
        channels: channels
      }
    });
  });
};


// Update tab livetime and become master if not exists
//
Router.prototype.__check_master__ = function () {
  // Update current tab time
  this.__ls__.setItem(this.__router_id_prefix__ + this.__node_id__, Date.now());

  // Update local value of master ID
  this.__master_id__ = +this.__ls__.getItem(this.__namespace__ + 'master');

  // If master tab not found - become master
  if (this.__get_alive_router_ids__().indexOf(this.__master_id__) === -1) {
    this.__storage_events_filter__.pop();
    this.__storage_events_filter__.push(this.__namespace__ + 'master' + '_' + this.__node_id__);
    this.__ls__.setItem(this.__namespace__ + 'master', this.__node_id__);
    this.__on_master_changed__(this.__node_id__);
  }
};


module.exports = Router;

},{"./local_storage":4,"./utils":7}],6:[function(require,module,exports){
// Tunnel to communicate between client in root window and router in iframe
//
'use strict';


/* global document, window */
var $$ = require('./utils');


///////////////////////////////////////////////////////////////////////////////
// Tunnel for client
//
// options:
//
//  - iframe (String) - iframe url
//  - namespace (String) - optional, messages namespace, default 'tabex_default_'
//
function TunnelClient(options) {
  var self = this;

  this.__namespace__ = options.namespace || 'tabex_default_';
  this.__handlers__ = [];

  this.__iframe_url__ = options.iframe;
  this.__iframe_done__ = false;

  // Pending emits before iframe ready
  this.__pending__ = [];

  // Create iframe and hide it
  this.__iframe__ = document.createElement('iframe');
  this.__iframe__.style.left = '-1000px';
  this.__iframe__.style.position = 'absolute';

  // When iframe loaded - send all pending messages
  this.__iframe__.onload = function () {

    // Setup target for messages from iframe (we should not use `*` for security reasons)
    self.__iframe__.contentWindow.postMessage(JSON.stringify({
      // `window.location.origin` available from IE 11
      origin: window.location.origin || window.location.protocol + '//' + window.location.host,
      namespace: self.__namespace__
    }), self.__iframe_url__);

    self.__iframe_done__ = true;

    // Send all pending messages
    self.__pending__.forEach(function (data) {
      self.__iframe__.contentWindow.postMessage(JSON.stringify(data), self.__iframe_url__);
    });

    self.__pending__ = null;
  };

  // Listen messages from iframe
  $$.addEvent(window, 'message', function (event) {
    // Check sender origin
    if (self.__iframe_url__.indexOf(event.origin) !== 0) {
      return;
    }

    var data;

    try {
      data = JSON.parse(event.data);
    } catch (__) {
      return;
    }

    // Ignore messages from another namespace (and messages from other possible senders)
    if (data.namespace !== self.__namespace__) {
      return;
    }

    self.__handlers__.forEach(function (handler) {
      handler(data.channel, data.message);
    });
  });

  this.__iframe__.src = this.__iframe_url__;

  $$.addEvent(document, 'DOMContentLoaded', function () {
    document.querySelector('body').appendChild(self.__iframe__);
  });
}


// (Same as router API) Broadcast message between all clients
//
// - channel (String) - channel name
// - message (Object) - message data
//
TunnelClient.prototype.broadcast = function (channel, message) {
  // If iframe not loaded - save message locally
  if (!this.__iframe_done__) {
    this.__pending__.push({ channel: channel, message: message, namespace: this.__namespace__ });

  // Send message to iframe
  } else {
    this.__iframe__.contentWindow.postMessage(JSON.stringify({
      channel: channel,
      message: message,
      namespace: this.__namespace__
    }), this.__iframe_url__);
  }
};


// (Same as router API) Subscribe handler to all messages
//
TunnelClient.prototype.onmessage = function (handler) {
  this.__handlers__.push(handler);
};


///////////////////////////////////////////////////////////////////////////////
// Tunnel for router (in iframe)
//
// options:
//
//  - router (RouterLS)
//  - namespace (String) - optional, messages namespace, default 'tabex_default_'
//  - origin (String|Array) - optional, parent window origin to filter messages.
//    You can set `*` to allow everything, but that's not recommended for security
//    reasons. Default iframe origin
//
function TunnelRouter(options) {
  var self = this, i;

  this.__namespace__ = options.namespace || 'tabex_default_';

  // `window.location.origin` available from IE 11
  this.__origin_first_check__ = options.origin ||
                                (window.location.origin || window.location.protocol + '//' + window.location.host);

  // Always convert origin list to array
  if (!Array.isArray(this.__origin_first_check__)) {
    this.__origin_first_check__ = [ this.__origin_first_check__ ];
  }

  for (i = 0; i < this.__origin_first_check__.length; i++) {
    // Escape regexp special chars exclude '*'
    this.__origin_first_check__[i] = this.__origin_first_check__[i].replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&');
    // Replace '*' to '.+' pattern
    this.__origin_first_check__[i] = this.__origin_first_check__[i].replace(/[*]/g, '.+?');
    // Create regexp
    this.__origin_first_check__[i] = new RegExp(this.__origin_first_check__[i]);
  }

  // Origin of parent window (target), will be setup by initial message
  this.__origin__ = null;
  this.__router__ = options.router;

  // Handle messages from parent window
  $$.addEvent(window, 'message', function (event) {
    var isOriginValid = false;

    // Check origin
    if (!self.__origin__ || self.__origin__ !== event.origin) {

      // Check origin by pattern
      for (i = 0; i < self.__origin_first_check__.length; i++) {
        if (self.__origin_first_check__[i].test(event.origin)) {
          isOriginValid = true;
          break;
        }
      }

      if (!isOriginValid) {
        return;
      }
    }

    var data;

    try {
      data = JSON.parse(event.data);
    } catch (__) {
      return;
    }

    // Ignore messages from another namespace (and messages from other possible senders)
    if (data.namespace !== self.__namespace__) {
      return;
    }

    // Save real origin from parent window and start routing
    if (!self.__origin__ && data.origin) {
      self.__origin__ = data.origin;

      self.__router__.onmessage(function (channel, message) {
        window.parent.postMessage(JSON.stringify({
          channel: channel,
          message: message,
          namespace: self.__namespace__
        }), self.__origin__);
      });

      return;
    }

    self.__router__.broadcast(data.channel, data.message);
  });
}


exports.TunnelClient = TunnelClient;
exports.TunnelRouter = TunnelRouter;

},{"./utils":7}],7:[function(require,module,exports){
'use strict';


/* global document */


// Run each function with params and callback after all
//
// - functions ([Function]) - array of functions to run
// - params... - params for functions and callback
// - callback (Function) - execute after all
//
exports.asyncEach = function (functions/* , params..., callback */) {
  functions = functions.slice(0);

  var callback = arguments[arguments.length - 1];
  var params = Array.prototype.slice.call(arguments, 1);

  // Remove callback from params
  params.pop();

  function next() {
    if (functions.length === 0) {
      callback.apply(this, arguments);
      return;
    }

    var fn = functions.shift();

    fn.apply(this, Array.prototype.slice.call(arguments, 0).concat(next));
  }

  next.apply(this, params);
};


// `addEventListener` not supported in IE <= 8, fallback to `attachEvent`
//
exports.addEvent = function (target, type, listener) {
  if (document.addEventListener) {
    target.addEventListener(type, listener);
    return;
  }

  target.attachEvent('on' + type, listener);
};

},{}]},{},[1])(1)
});