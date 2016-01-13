var AzureMedia = require('azure-media');
var BlobStorage = require('azure-storage');
var request = require('request');
var moment = require('moment');
var url = require('url');
var cluster = require('cluster');
var _ = require('lodash');
//This service is a hub for all azure-related node packages. In order to access a defined API use
//Azure.api-name-here: e.g. Azure.AMS will access Azure Media Services api.
var AMS = new AzureMedia(sails.config.azure.MediaServicesConfig); //define AMS api
/*!!!IMPORTANT!!!
 * Important definitions:
 * AMS :: Azure Media Services
 * assetId :: ID of the asset on Azure Media Services (stored in 'locator' or 'manifest' property)
 * asset :: VeryModel (NOT traditional Javascript Object) type AMS asset entity
 * assetIndex :: local asset index entry (traditional Javascript Object) stored in Media Service own database
 * job :: VeryModel type AMS job entity. Be sure to ALWAYS convert it to normal object with "job.toJSON()" before storing
 * processor :: AMS encoder entity. Recommended one is Media Encoder Standard, so that's the one used here.
 * cit :: Content Identification Type. Azure REST api requires every ID to be prefixed with its corresponding cit. Not sure if this is needed anymore
 * encodingstates :: Azure returns a code when asked for state. This maps codes to human-readable strings
 *
 * Note:
 * Before using any AMS api functions you have to first do
 * Azure.AMS.init(function(err) {
 * if(!err){
 *   //use api here
 * }
 * This implements the configuration from rootfolder/config/local.azure.MediaServicesConfig and gets proper access token
 * */


//the whole process of creating an encoding job and setting up a progress monitor
AMS.encode = function(settings, callback) {
  var api = this;
  //validate input settings
  settings = {
    assetIndex: settings.assetIndex || null,
    encodingPreset: settings.encodingPreset || sails.config.encodingpreset, //default encoding preset - feel free to modify according to https://msdn.microsoft.com/en-us/library/azure/mt269937.aspx
    encoderTaskBody: sails.config.azure.EncoderTaskBody, //this defines this like output asset name on Azure
    asset: settings.asset || null
  };
  if(_.contains(_.values(settings), null)) { //if there are any null values after validation
    return callback("Encoding settings contain null values: \n"+ JSON.stringify(settings)); //exit with error
  }
  api.rest.mediaprocessor.getCurrentByName('Media Encoder Standard', function(err, processor) {
    if(!err && processor) {
      var jobconfig = { //encoding job configuration
        Name: 'EncodeVideo-' + settings.asset.Name,
        InputMediaAssets: [{'__metadata': {uri: settings.asset.__metadata.uri}}],
        Tasks: [{
          Configuration: JSON.stringify(settings.encodingPreset),
          MediaProcessorId: processor.Id,
          TaskBody:  settings.encoderTaskBody
        }]
      }
    } else {
      return callback("Could not get media processor by name \"Media Encoder Standard\"");
    }
    //TODO: fetch a list of jobs and if it exceeds a certain limit, send a lovely 503 ┌∩┐(◣_◢)┌∩┐
    sails.log.verbose(jobconfig.Tasks[0].Configuration);
    api.rest.job.create(jobconfig, function (err, job) { //https://www.youtube.com/watch?v=kPy3SvINufA
      var meta = {
        encodingStatus: _.get(api.statemap, 7)
      }
      if (!err && job) { //if nothing bad happened and we get a jooj back, means encoding is underway
        setTimeout(function(){api.pingJobForStatusChange(job, settings.assetIndex)},1000); //recursive timouts are probably not the best solution to monitor this...
        return callback(null, job);
      } else { //if no job was returned
        meta.encodingStatus = 'Error';
        meta.encodingError = err || 'Couldn\'t retrieve the job'; //record it for future reference
        Asset.update(settings.assetIndex, {metadata: meta}).exec(function (err, updatedIndex) { //update index with the current situation
          if (!err && updatedIndex) { //if at least updating succeded...
            return callback("Failed to retrieve job. Index updated with this info. Check management portal.");
          } else { //damn, EVERYTHING failed...
            err.msg = "Job could not be created. Index also failed to update. The asset index will likely be unusable.";
            return callback(err);
          }
        });
      }
    });
  });
};
//recursive async function that setTimout-s itself every x seconds until it detects a job reaching it's final state.
//there may be a better way to do this. For example you could create an API app just for this, but this is just for demonstration,
//so production efficiency was not a priority.
AMS.pingJobForStatusChange = function(job, assetIndex) {
  var api = this;
  var oldJob = job;
  var newJob;
  api.rest.job.get(oldJob.Id, function(err, job){
    if (!err && job) {
      newJob = job;
      if(_.contains([3,4,5], job.State)){ ////3 - Finished; 4 - Error; 5 - Cancelled
        sails.log.verbose('Clearing job status checker for '+job.Name);
        api.rest.job.listOutputMediaAssets(job.Id, function(err, assets){
          if(!err && assets.length>0) {
            var index = {
              metadata: {
                encodingStatus:_.get(api.statemap,job.State),
                job:job.toJSON()
              },
              manifest: (_.includes(api.failedEncodingStates, _.get(api.statemap,job.State))) ? null : assets[0].Id
            }
            api.media.getThumbnails(index.manifest, function(err, thumbnails){ //get urls for thumbnails
              if(!err){
                index.thumbnail = thumbnails[0];
              }
              Asset.update({id:assetIndex.id},index).exec(function(err, updatedIndex){
                if(!err && updatedIndex.length>0) {
                  sails.log('Encoding for asset '+updatedIndex[0].title+' completed with status '+_.get(api.statemap,job.State)+'.');
                  if(!_.includes(api.failedEncodingStates, _.get(api.statemap,job.State))){ //if the status is success (Finished or Cancelled)
                    api.rest.job.delete(job.Id, function(err){ //remove the job(azure only allows 50000 job entries per account)
                      if(!err){
                        sails.log.verbose('Job reached final status and was deleted. '+job.toJSON()); //remove completed job.
                        //TODO: sails.sockets.emit(assetIndex.author...) Check that the author is logged in and connected and emit progress only to them if they are.
                        sails.sockets.blast({message: 'Finished encoding for '+updatedIndex[0].title, media: updatedIndex[0]});
                      }
                    });
                  } else {
                    //job failed. We shouldn't remove it so admins can inspect the error on the portal
                    sails.log.verbose('Job '+job.Name+' completed, but with an error. Check management portal for details.');
                    sails.sockets.blast({error: assetIndex.title+' encoding has failed!. ' +
                    'Please remove the asset and try again. If this persists, contact the service administrator.', media: assetIndex});
                  }
                  //TODO: send email to the author that their video is finished processing
                } else {
                  sails.log.verbose('Job '+job.Name+' finished, but could not update index metadata. The index may have been deleted. Job status: '+_.get(api.statemap,job.State));
                }
              });
            });
          } else {
            sails.log.error(err);
          }
        });
      } else {
        api.rest.job.listTasks(job.Id,function(err, tasks){
          if(!err && tasks && tasks.length>0){
            sails.log.verbose('Job '+job.Name+' in progress. Current status: '+_.get(AMS.statemap, job.State)+'. '+
              ((tasks[0].Progress)?tasks[0].Progress:' No progress reported.'));
            //TODO: sails.sockets.emit(assetIndex.author...) Check that the author is logged in and connected and emit progress only to them if they are.
            if(_.get(AMS.statemap, job.State) == 'Qued'){
              sails.sockets.blast({message: assetIndex.title+' is qued for encoding.', task: tasks[0], media: assetIndex});
            } else {
              sails.sockets.blast({message:'Encoding '+assetIndex.title+'. '+parseInt(tasks[0].Progress)+'% complete.', task: tasks[0], media: assetIndex});
            }
          } else {
            sails.log.verbose(err || 'Job '+job.Name+' in progress. Current status: '+_.get(AMS.statemap, job.State));
          }
          setTimeout(function(){api.pingJobForStatusChange(newJob,assetIndex);}, 5000);
        });
      }
    } else {
      api.failureCount = 1;
      if(api.failureCount < 3) {
        sails.log.verbose('Failed to get job '+oldJob.Name+'. Will retry 2 more times before aborting.');
        api.failureCount++;
        setTimeout(function(){api.pingJobForStatusChange(oldJob, assetIndex);}, 5000);
      }
      var meta = {
        job: oldJob.toJSON()
      }
      if(err) {
        meta.encodingError = err;
      }
      Asset.update({id:assetIndex.id},{metadata:meta}).exec(function(err, updatedIndex){
        if(!err && updatedIndex) {
          sails.log.verbose('Job status for '+updatedIndex[0].title+' could not be fetched.');
          //TODO: send email that video encoding status could not be updated.
        } else {
          //yo dawg we herd you like failures so we failed to follow up on the failure so you can fail while you fail
          sails.log.error(err);
        }
      });
    }
  });
};
//removes all jobs (running, failed and finished) before the 'until' date or older than 2 weeks from the time it was called
AMS.purgeOldJobs = function(callback,until) {
  var callback = callback || function() {};
  var api = this;
  var until = Date.parse(until);
  if(until == NaN){ //if we don't specify the last date
    until = moment().subtract(14, 'days'); //delete all jobs that are older than 14 days from time this function runs.
  }
  api.rest.job.list(function(err, jobs){
    if(!err && jobs.length>0){
      var jobsToDelete = [];
      _.each(jobs,function(job){
        if(moment(job.EndTime).isBefore(until)){
          jobsToDelete.push(job);
        }
      });
      (function recursiveDelete(count){
        if(count<jobsToDelete.length){
          sails.log.verbose('Removing job '+jobsToDelete[count].Name+' with Id '+jobsToDelete[count].Id);
          api.rest.job.delete(jobsToDelete[count].Id, function(err){
            if(!err){
              count++;
              recursiveDelete(count);
            }
          })
        } else {
          sails.log.verbose('Purged '+jobsToDelete.length+' jobs'); //maybe log them in some file?
          return callback(null,'Old jobs deleted. Removed '+jobsToDelete.length+' entries.');
        }
      }(0));
    } else {
      return callback(err || "Could not get list of jobs. Check that jobs exist on the account.");
    }
  });
};
AMS.checkThumbnails = function(inputAssets, done_cb) {
  var api = this;
  var outputAssets = [];
  async.forEachOf(inputAssets, function(current, index, oneVerified){
    if(current.manifest){
      async.waterfall([
          function(cb){
            if(current.thumbnail && current.thumbnail != 'images/nothumbnail.jpg') {
              request(current.thumbnail, function(err, response){ //manually handle request responses, since we aren't interested in the body - just headers
                if(err){
                  cb(err);
                } else if(response){
                  if (_.includes(Azure.AMS.errorResponses, response.statusCode)) {
                    sails.log.info('Problem detected with thumbnail for '+ current.title+'. Response code: '+response.statusCode+' Attempting fix...');
                    cb(null);
                  } else {
                    sails.log.info(current.title+' has passed thumbnail check.');
                    cb('ok'); //pass 'ok' as the 'error' to trigger the verification complete immediately
                  }
                } else cb('Empty response');
              });
            } else {
              cb(null); //if we failed last time, skip checking again and recreate urls.
            }
          }.bind(this),
          function(cb){
            sails.log.verbose('Getting thumbnails for '+current.title);
            api.media.getThumbnails(current.manifest, cb);
          }.bind(this),
          function(thumbnails, cb){
            if(thumbnails.length > 0) {
              var result = _.cloneDeep(current);
              result.thumbnail = thumbnails[0];
              sails.log.info('Fixed thumbnail link for '+result.title);
              sails.log.verbose('New link: \n'+result.thumbnail);
              cb(null, result);
            } else {
              cb('No thumbnails found for this asset.');
            }
          }.bind(this)
        ],
        function thumbnailCheckComplete(err, result){
          if(err){
            var result = _.cloneDeep(current);
            if(err != 'ok'){
              sails.log.error('Error during thumbnails fix operation: '+err);
              result.thumbnail = 'images/nothumbnail.jpg';
            }
          }
          outputAssets[index] = _.cloneDeep(result); //continue regardless of failure
          oneVerified();
        });
    } else { //if the asset wasn't encoded, no point in doing all that, just skip
      outputAssets[index]= _.cloneDeep(current);
      oneVerified();
    }
  }, function allVerified(){
    if(outputAssets.length == inputAssets.length)
      return done_cb(null, outputAssets);
    else {
      sails.log.error('Thumbnail check error: output does not match input size');
      sails.log.verbose('Input:');
      sails.log.verbose(inputAssets);
      sails.log.verbose('Output:');
      sails.log.verbose(outputAssets);
      return done_cb('Thumbnail check error: output does not match input size');
    }
  });
};
//content identification type prefixes
AMS.cit = {
  asset: 'nb:cid:UUID:',
  accessPolicy: 'nb:pid:UUID:',
  locator: 'nb:lid:UUID:'
}
AMS.errorResponses = [400, 401, 403, 404, 409, 500, 503];
//encoding job states + local states before azure returns it's own
AMS.statemap = {
  0: 'Qued',
  1: 'Scheduled',
  2: 'Processing',
  3: 'Finished',
  4: 'Error',
  5: 'Cancelled',
  6: 'Canceling',
  7: 'Initialized',
  8: 'Not initialized'
};
//array containing words corresponding to failed job state codes
//note that from these states any user with edit rights can restart encoding. From other states only admins can.
AMS.failedEncodingStates = _.at(AMS.statemap, [4,5,7,8]); //states for which user can restart encoding
//array containing words corresponding to job state codes in progress
AMS.progressEncodingStates = _.at(AMS.statemap, [0,1,2,6,7]);

module.exports = {
  AMS: AMS, //make AMS available to controllers and policies
  BlobService: BlobStorage.createBlobService(sails.config.azure.MediaServicesConfig.storage, sails.config.azure.MediaServicesConfig.storageSecret)
};
