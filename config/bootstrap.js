/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#!/documentation/reference/sails.config/sails.config.bootstrap.html
 */

module.exports.bootstrap = function(cb) {
  var fs = require('fs');
  _ = require('lodash'); //override Lodash to use the latest version
  //We override this here because this way we can skip unnecessary JSON file conversions - 
  //config files can't reference each other, as they are being loaded on startup.
  sails.config.azure.EncodingPreset = sails.config.encodingpreset || fs.readFileSync('config/EncPreset.xml', 'ucs2');
  // It's very important to trigger this callback method when you are finished
  // with the bootstrap!  (otherwise your server will never lift, since it's waiting on the bootstrap)
  if(sails.config.azure.EncodingPreset) cb()
  else cb('ERROR! Can not run this service without an encoding preset. Please check your encoding preset filenames and validity.');
};
