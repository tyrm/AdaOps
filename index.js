var config = require('./config');

// create http client
var opsClient;
if (config.opscenter.schema == 'https') {
  opsClient = require('https');
}
else {
  opsClient = require('http');
}

var aioClient = require('https');

// global variables
var opscenter_sessionid = '';
var feed_last           = {};

var aio = {
  hostname: 'io.adafruit.com',
  port    : 443
};

/**
 * login to opscenter and store sessionid
 * @param done
 */
function login(done) {
  var options = {
    hostname          : config.opscenter.hostname,
    port              : config.opscenter.port,
    path              : '/login',
    method            : 'POST',
    rejectUnauthorized: false
  };

  var req = opsClient.request(options, function (res) {
    res.on('data', function (data) {
      var err = null;
      if (res.statusCode > 299) {
        err = res.statusCode;
      }

      var jsonRes;
      try {
        jsonRes = JSON.parse(data);
      } catch (e) {
        console.log('login JSON packet is malformed')
      }

      opscenter_sessionid = jsonRes['sessionid'];

      done(err, data);
    });
  });

  req.on('error', function (err) {
    done(err);
  });

  // post the data
  var post_data = JSON.stringify({'username': config.opscenter.username, 'password': config.opscenter.password});
  req.write(post_data);
  req.end();
}

/**
 * get node loads from opscenter
 * @param done
 */
function getOpsNodeLoad(done) {
  var options = {
    hostname          : config.opscenter.hostname,
    port              : config.opscenter.port,
    path              : '/' + config.opscenter.cluster + '/nodes/all/load',
    method            : 'GET',
    rejectUnauthorized: false,
    headers           : {
      'opscenter-session': opscenter_sessionid
    }
  };

  var req = opsClient.request(options, function (res) {
    res.on('data', function (data) {
      var err = null;
      if (res.statusCode > 299) {
        err = res.statusCode;
      }

      var jsonRes = data.toString();
      try {
        jsonRes = JSON.parse(data);
      } catch (e) {
        console.log('node load JSON packet is malformed')
      }

      done(err, jsonRes);
    });
  });

  req.on('error', function (err) {
    done(err);
  });

  req.end();
}

/**
 *
 * @param feed
 * @param value
 * @param done
 */
function setAioValue(feed, value, done) {
  var options = {
    hostname: aio.hostname,
    port    : aio.port,
    path    : '/api/feeds/' + feed + '/data',
    method  : 'POST',
    headers : {
      'X-AIO-Key'   : config.aio.key,
      'Content-Type': 'application/json'
    }
  };

  var req = aioClient.request(options, function (res) {
    res.on('data', function (data) {
      var err = null;
      if (res.statusCode > 299) {
        err = res.statusCode;
      }

      var jsonRes = data.toString();
      try {
        jsonRes = JSON.parse(data);
      } catch (e) {
        console.log('aio JSON packet is malformed')
      }

      done(err, jsonRes);
    });
  });

  req.on('error', function (err) {
    done(err);
  });

  // post the data
  var post_data = JSON.stringify({
    "value": value.toString(),
    "lat"  : null,
    "lon"  : null,
    "ele"  : null
  });

  req.write(post_data);
  req.end();
}

function pushNewValue(feed, value, done) {
  var roundedValue = (value).toFixed(1);

  console.log(feed + ": " + roundedValue);
  if (feed_last[feed] != roundedValue) {
    setAioValue(feed, roundedValue, function (err, res) {
      console.log(err);
      console.log(res);

      feed_last[feed] = roundedValue;

    })
  }
}

// Start Program
function runTask() {
  console.log("checking");
  getOpsNodeLoad(function (err, res) {
    if (err) {
      if (err == 401) {
        login(function (err, res) {
          if (err) {
            console.log(err);
          }
          else {
            getOpsNodeLoad(function (err, res) {
              if (err) {
                console.log(err)
              }
              else {
                var nodes = Object.keys(config.aio.feeds);
                nodes.forEach(function (element) {
                  if (res[element]) {
                    pushNewValue(config.aio.feeds[element], res[element]);
                  }
                  else {
                    pushNewValue(config.aio.feeds[element], -1);
                  }
                });
              }
            })
          }
        });
      }
      else {
        console.log(err);
      }
    }
    else {
      var nodes = Object.keys(config.aio.feeds);
      nodes.forEach(function (element) {
        if (res[element]) {
          pushNewValue(config.aio.feeds[element], res[element]);
        }
        else {
          pushNewValue(config.aio.feeds[element], -1);
        }
      });
    }
  });
}

setInterval(runTask, 5000);
runTask();
