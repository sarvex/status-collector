var Promise = require('bluebird'),
    minimatch = require('minimatch'),
    _ = require('lodash');
/**
 * A collector for obtaining and presenting stats of various 
 * elements of a system
 */
function StatusCollector() {
  this.reset();
}

function Collector(name, fn) {
  this.name = name;
  this.fn = fn;
}

/**
 * resets the collectors to a null state so that there are no collectors
 * useful in testing
 * @private
 */
StatusCollector.prototype.reset = function() {
  this._collectors = {};
};

StatusCollector.prototype.info = function() {
  var keys = Object.keys(this._collectors).sort();
  process.stdout.write("Registered status collectors (" + keys.length + "):\n" + keys.join("\n") + "\n");
};

StatusCollector.prototype.inspect = function() {
  var keys = Object.keys(this._collectors).sort();
  return "<StatusCollector collectors=[" + keys.join(", ") + "]>"
}


Collector.prototype.execute = function() {
  var self = this;
  return Promise.resolve().then(function() { return self.fn(); })
  .then(function(results) {
    var success = true;

    if(_.isObject(results)) success = results.success;

    return { name: self.name, success: success, results: results };
  })
  .catch(function(err) {
    return {name: self.name, success: false, error: err};
  });
};

/**
 * Registers a status collector
 * @param {string} name - the name of the collector. Should be a '.' seperated topographical name.
 * @param {function} fn - The function. Should return an object (or a promise that resolves to an object) that includes a key of  :success as a boolean
 * @public
 */
StatusCollector.prototype.register = function(name, fn) {
  return this._collectors[name] = new Collector(name, fn);
};

/**
 * Executes matching collectors and gathers the results
 * @param {string} glob - A glob to match collectors
 * @public
 */
StatusCollector.prototype.execute = function(glob) {
  var self = this,
      collectors = this.collectors(glob),
      proms = collectors.map(function(c) { return c.execute(); });

  return Promise.all(proms);
};


/**
 * @param {string} glob - A glob to match collectors by
 * @return {array} - An array of collectors
 * @public
 */
StatusCollector.prototype.collectors = function(glob) {
  var self = this;
  if(!glob) {
    return _.values(this._collectors);
  } else {
    return Object.keys(this._collectors).filter(function(key) {
      return minimatch(key, glob)
    }).map(function(key) { return self._collectors[key]; });
  }
};

StatusCollector.prototype.expressApp = function(basePath, expressApp) {
  var self = this,
      reg;

  basePath = basePath || '/status';

  expressApp.get(basePath + '-list', function(req, res, next) {
    res.json(Object.keys(module.exports._collectors).sort());
  });

  expressApp.get(new RegExp('^' + basePath + '(\/(.+)?)?$'), function(req, res, next) {
    var path = req.params[1] || '';
    path = path.replace(/\//, '.') + '*';
    self.execute(path)
    .then(function(results) {
      var status = 200;
      if(_.some(results, {'success': false})) status = 500;

      res.json(status, results);
    });
  });
  return expressApp;
};

module.exports = new StatusCollector();
