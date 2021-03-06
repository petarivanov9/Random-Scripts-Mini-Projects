'use strict';

/**
 * Usage: node upload_video.js PATH_TO_VIDEO_FILE
 */

const { google } = require('googleapis');
const OAuth2Client = google.auth.OAuth2;

var fs = require('fs');
var readline = require('readline');

const FILENAME = process.argv[2];


var SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube'
];
var TOKEN_DIR = '/Users/petarivanov/Projects/My-Random-Scripts/youtube-js/';
var TOKEN_PATH = TOKEN_DIR + 'test_youtube_parlamak_credentials.json';
// var TOKEN_PATH = TOKEN_DIR + 'youtube_parlamak_token.json';


var videoParams = {
  'params':
    {
      'part': 'id,snippet,status'
    },
  'properties':
    {
      'snippet.title': 'Test video upload.',
      'snippet.description': 'Description of uploaded video.',
      'status.privacyStatus': 'unlisted',
    },
  'mediaFilename': FILENAME
};


// Load client secrets from a local file.
fs.readFile(TOKEN_DIR + 'client_secret.json', function processClientSecrets(err, content) {
// fs.readFile(TOKEN_DIR + 'client_secret_youtube_parlamak.json', function processClientSecrets(err, content) {
  if (err) {
    console.log('Error loading client secret file: ' + err);
    return;
  }
  // Authorize a client with the loaded credentials, then call the YouTube API.
  authorize(JSON.parse(content), uploadVideo, videoParams);
})


/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback, requestData) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  // var auth = new googleAuth();
  var oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, function(err, token) {
    if (err) {
      getNewToken(oauth2Client, callback);
    } else {
      oauth2Client.credentials = JSON.parse(token);
      callback(oauth2Client, requestData);
    }
  });
}


/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback, requestData) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client, requestData);
    });
  });
}


/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(TOKEN_DIR);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFile(TOKEN_PATH, JSON.stringify(token));
  console.log('Token stored to ' + TOKEN_PATH);
}


/**
 * Remove parameters that do not have values.
 *
 * @param {Object} params A list of key-value pairs representing request
 *                        parameters and their values.
 * @return {Object} The params object minus parameters with no values set.
 */
function removeEmptyParameters(params) {
  for (var p in params) {
    if (!params[p] || params[p] == 'undefined') {
      delete params[p];
    }
  }
  return params;
}


/**
 * Create a JSON object, representing an API resource, from a list of
 * properties and their values.
 *
 * @param {Object} properties A list of key-value pairs representing resource
 *                            properties and their values.
 * @return {Object} A JSON object. The function nests properties based on
 *                  periods (.) in property names.
 */
function createResource(properties) {
  var resource = {};
  var normalizedProps = properties;
  for (var p in properties) {
    var value = properties[p];
    if (p && p.substr(-2, 2) == '[]') {
      var adjustedName = p.replace('[]', '');
      if (value) {
        normalizedProps[adjustedName] = value.split(',');
      }
      delete normalizedProps[p];
    }
  }
  for (var p in normalizedProps) {
    // Leave properties that don't have values out of inserted resource.
    if (normalizedProps.hasOwnProperty(p) && normalizedProps[p]) {
      var propArray = p.split('.');
      var ref = resource;
      for (var pa = 0; pa < propArray.length; pa++) {
        var key = propArray[pa];
        if (pa == propArray.length - 1) {
          ref[key] = normalizedProps[p];
        } else {
          ref = ref[key] = ref[key] || {};
        }
      }
    };
  }
  return resource;
}


/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function uploadVideo(auth, requestData) {
  var service = google.youtube('v3');
  var parameters = removeEmptyParameters(requestData['params']);;
  parameters['auth'] = auth;
  parameters['media'] = { body: fs.createReadStream(requestData['mediaFilename']) };
  parameters['notifySubscribers'] = false;
  parameters['resource'] = createResource(requestData['properties']);

  var req = service.videos.insert(parameters, (err, response) => {
    if (err) {
      console.log('Error uploading ... ', err);

      saveResultToFile(response, err);

      throw err;
    }

    console.log('-------------------------------------');

    if (response.data.status.uploadStatus !== 'uploaded') {
      saveResultToFile(response, response.data.status.failureReason);
    } else {
      var videoId = response.data.id
      var youtubeURL = 'https://www.youtube.com/watch?v='
      var url = youtubeURL + videoId;

      var status = response.status;

      console.log('URL >> ', url);
      console.log('status >> ', status);

      saveResultToFile(response);
    }

    saveVideIdToFile(response.data.id);

    process.exit();
  });

  console.log('REQ >>>> ', req);

  // var fileSize = fs.statSync(FILENAME).size;
  // // show some progress
  // var id = setInterval(function () {
  //   var uploadedBytes = req.req.connection._bytesDispatched;
  //   var uploadedMBytes = uploadedBytes / 1000000;
  //   var progress = uploadedBytes > fileSize
  //       ? 100 : (uploadedBytes / fileSize) * 100;
  //   process.stdout.clearLine();
  //   process.stdout.cursorTo(0);
  //   process.stdout.write(uploadedMBytes.toFixed(2) + ' MBs uploaded. ' +
  //      progress.toFixed(2) + '% completed.');
  //   if (progress === 100) {
  //     process.stdout.write('Done uploading, waiting for response...');
  //     clearInterval(id);
  //   }
  // }, 250);
}


function saveResultToFile(response, error="") {
  let status = response.status;
  let videoStatus = "";
  let videoId = "";
  let url = "";
  let newLine = "";

  if (response.data.status) {
    videoStatus = response.data.status.uploadStatus;
  }

  const videoFilename = FILENAME.split('/').pop();
  const resultFilepath = FILENAME.substring(0, FILENAME.lastIndexOf("/")) + '/';
  const resultFilename = resultFilepath + 'result.txt';

  if (status === '200' && error.length === 0) {
    videoId = response.data.id;
    url = 'https://www.youtube.com/watch?v=' + videoId;

    newLine = `${videoFilename},${status},${videoStatus},${url}`;
  } else {
    newLine = `${videoFilename},${status},${videoStatus},${error}`;
  }

  newLine += '\r\n';
  console.log('newLine >>> ', newLine);

  fs.appendFileSync(resultFilename, newLine, function(err) {
    if (err) {
      console.error("write error:  " + err.message);
    } else {
      console.log("Successful Write to " + resultFilename);
    }
  });
}


function saveVideIdToFile(videoId) {
  const resultFilepath = FILENAME.substring(0, FILENAME.lastIndexOf("/")) + '/';

  const resultFilename = resultFilepath + 'videosIdsToUpload.txt';

  fs.appendFileSync(resultFilename, videoId + ',', function(err) {
    if (err) {
      console.error("write error:  " + err.message);
    } else {
      console.log("Successful Write to " + resultFilename);
    }
  });
}
