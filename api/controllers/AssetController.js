/**
* AssetController
*
* @description :: Server-side logic for managing Assets
* @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
*/
var request = require('request');
var moment = require('moment');
require('moment-duration-format');
module.exports = {
  getUploadUrl: function (req, res) {
      Azure.AMS.init(function(err){
        if(!err){
          var title = req.param('title') || 'Default title';
          var sanitizedTitle = title.replace(/[!*'();:@&=+$,\/?%#\[\]]/g,''); //remove illegal characters from user input
          async.waterfall(
              [
                //create an asset
                function (cb) {
                  Azure.AMS.rest.asset.create({Name: sanitizedTitle}, cb);
                }.bind(this),
                //create a policy
                function (asset, cb) {
                  Azure.AMS.rest.accesspolicy.findOrCreate(720, 2, function (err, policy) {
                    cb(err, {asset: asset, policy: policy});
                  }.bind(this));
                }.bind(this),
                //create a locator
                function (results, cb) {
                  Azure.AMS.rest.locator.create({
                    StartTime: moment.utc().subtract(5, 'minutes').format('M/D/YYYY hh:mm:ss A'),
                    AccessPolicyId: results.policy.Id,
                    AssetId: results.asset.Id,
                    Type: 1
                  }, function (err, locator) {
                    results.locator = locator;
                    cb(err, results);
                  }.bind(this));
                }.bind(this)
              ],
              function azureEntitiesCreated(err, results) {
                if(err){
                  return res.serverError('An error occurred')
                } else {
                  if(results){
                    async.waterfall(
                        [
                          function getStorageAccountProperties(cb){
                            Azure.BlobService.getServiceProperties(cb)
                          }.bind(this),
                          function setCORSRules(serviceProperties, response, cb){
                            serviceProperties.Cors = {
                              CorsRule: [
                                {
                                  AllowedOrigins: [sails.config.azure.AllowedHostNames],
                                  AllowedMethods: ['GET', 'PUT'],
                                  AllowedHeaders: ['*'],
                                  ExposedHeaders: ['*'],
                                  MaxAgeInSeconds: 5184000 //set this to 1 day
                                }
                              ]
                            };
                            Azure.BlobService.setServiceProperties(serviceProperties, cb);
                          }.bind(this)
                        ],
                        function finishedPreparingForUpload(err, setProperties, response){
                          if(!err){
                            Asset.create({title: title, assetId: results.asset.Id}).exec(function(err, created){
                              if(!err && created){
                                return res.json(results); //return the results object containing various metadata and the upload url
                              } else {
                                sails.log.error(err || 'Unidentified error occurred');
                                Azure.AMS.rest.asset.delete(results.asset.Id, function(err){});
                                res.serverError('Failed to index asset');
                              }
                            });
                          } else {
                            return res.serverError(err);
                          }
                        }
                    )
                  } else {
                    return res.serverError("Azure entities have been created, but could not retrieve them from the service.");
                  }
                }
              }
          );
        }
      });
    },
  register: function(req, res){
    Azure.AMS.init(function(err){
      async.waterfall([
        //delete upload location
        function (cb) {
          sails.log.info('Files have been uploaded for '+req.param('asset').Name+'. Cleaning up...');
          Azure.AMS.rest.locator.delete(req.param('locator').Id, cb);
        }.bind(this),
        //generate file metadata
        function (cb) {
          sails.log.info('Generating metadata');
          Azure.AMS.media.generateMetadata(req.param('asset').Id, cb);
        }.bind(this)
      ], function (err, metadata) { //continue here
        if(err){
          console.log(err);
        }
        Asset.update({assetId:req.param('asset').Id},{registered: true}).exec(function(err, updatedRecords){
          if(!err && updatedRecords.length>0){
            sails.log.info('Asset created and files have been uploaded. '+updatedRecords[0].title+
                ' should be available for the author to view. Beginning encoding process...');
            if(updatedRecords[0].metadata.encodingStatus == 'Not initialized'){
              Asset.update({assetId:req.param('asset').Id}, {metadata: {encodingStatus:"Initialized"}}).exec(function (err, updatedRecords) {
                if (!err && updatedRecords.length>0) {
                  var settings = {
                    asset: req.param('asset'),
                    assetIndex: updatedRecords[0]
                  };
                  if(req.param('edit')){
                    var startms = parseFloat(req.param('edit').startsAt).toFixed(3)*1000;
                    var endms = (parseFloat(req.param('edit').endsAt).toFixed(3)*1000) - startms;
                    var start = moment.duration(startms, 'milliseconds').format('hh:mm:ss.SSS', {trim: false});
                    var end = moment.duration(endms, 'milliseconds').format('hh:mm:ss.SSS', {trim: false});
                    sails.log.verbose(start);
                    sails.log.verbose(end);
                    if((start && end) && (startms < endms)){
                      var customPreset = sails.config.encodingpreset; //load the static preset from config folder as basis for custom preset
                      customPreset["Sources"] = [
                        {
                          'StartTime': start,
                          'Duration': end
                        }
                      ];
                      settings.encodingPreset = customPreset;
                    } else {
                      sails.log.error('Edit parameters were passed but something went wrong during conversion!');
                      sails.log.error('Start was parsed to: '+start);
                      sails.log.error('End was parsed to: '+end);
                      sails.log.error('Passed parameters:');
                      sails.log.error(req.param('edit'));
                    }
                  }
                  Azure.AMS.encode(settings, function (err, job) {
                    if (!err && job) { //we need to record the status in the index to inform the user of the state
                      var meta = { //for that construct the meta json
                        encodingStatus: _.get(Azure.AMS.statemap, job.State), //interpret job state according to the map
                        job: job.toJSON()
                      };
                      Asset.update({assetId:req.param('asset').Id}, {metadata: meta}).exec(function(err, updatedRecords){
                        if(!err && updatedRecords.length>0){
                          var fullNames = utilService.fillFullNames(updatedRecords[0]);
                          if(req.xhr){
                            return res.json(fullNames);
                          } else {
                            return res.redirect('play?assetId='+fullNames.assetId);
                          }
                        } else {
                          sails.log.error(err || 'Update after job creation failed!');
                          return res.serverError(err || 'Update after job creation failed!');
                        }
                      });
                    } else {
                      sails.log.error(err || 'Unidentified error');
                      return res.serverError(err || 'An error has occurred while trying to encode your asset');
                    }
                  });
                } else {
                  sails.log.error(err || 'No records found to update!');
                  return res.serverError(err || 'No records found to update!');
                }
              });
            } else {
              //asset already registered and is encoding
              sails.log.info('Tried to register an already registered asset "'+updatedRecords[0].title+'"!');
              res.forbidden('You can not register an asset twice.');
            }
          } else {
            sails.log.error('Could not register asset! The content will not be available for view. Please inspect '+req.param('asset').Name);
            sails.log.error(err);
            return res.serverError('Could not register your asset!');
          }
        })
      });
    });
  },
	//purge is a development function - NEVER USE THIS IN PRODUCTION!!! It removes ALL content, while leaving storage account intact.
	purge: function(req, res){
		Azure.AMS.init(function(err){
			if(!err) {
				Azure.AMS.rest.asset.list(function(err, assets){
					if(!err && assets.length>0){
            async.each(assets, function(asset, cb){
              Azure.AMS.rest.asset.delete(asset.Id, function(err){if(!err){ cb()} else cb(err)});
            }, function(err){
              if(err){
                sails.log.error(err);
                return res.serverError('Azure storage purge failed. Aborting...');
              } else {
                Asset.find({}).exec(function(err, allRecords){
                  Asset.destroy({id: _.map(allRecords, 'id')}).exec(function(err, destroyed){
                    if(!err && destroyed.length>0)
                      res.send('Purge complete. Removed '+assets.length+' assets and '+destroyed.length+' indexes');
                    else
                      res.send(err || 'No assets to remove');
                  });
                });
              }
            });
          } else {
            Asset.find({}).exec(function(err, allRecords){
              Asset.destroy({id: _.map(allRecords, 'id')}).exec(function(err, destroyed){
                if(!err && destroyed.length>0)
                  res.send('Purge complete. Removed '+assets.length+' assets and '+destroyed.length+' indexes');
                else
                  res.send(err || 'No assets to remove');
              });
            });
          }
				});
			} else {
				return res.serverError('Failed to initialize Azure Media Services api. Please refer to your imaginary user manual for solutions to this problem.');
			}
		});
	},
	listIssues: function(req, res){
		/*
		@params		 ::	leniency - tolerance for the suggestion search
		@response	 :: A list of issues or an ok message if nothing was found
		Note: fill will not upload any videos - they must be uploaded later manually in the edit view for the asset
		*/
    var local, remote, remoteIds;
    var issues = {
      count: 0,
      discrepancies: []
    };
    Azure.AMS.init(function(err){
      Azure.AMS.rest.asset.list(function(err, assets){
        if(!err){
          if(assets.length > 0){
            remote = assets;
            remoteIds = _.map(assets, 'Id');
            //got the azure stuff, now get local ones
            var query = {
              or: [
                {assetId: {'!': remoteIds}},
                {manifest: {'!': remoteIds}} //really friggin need that refactor
              ]
            };
            /*
            * The following might see stupid: why search twice? But in reality we actually save memory because if we only fetched once
            * all the indexes and then deteremined which ones are malformed, we'd be iterating over ALL entries 2 times (first to compare,
            * then to split) whereas here we are not iterating through all entries at all, only the parts we are interested in. We'll let the
            * more efficient database engine iterate for us.
            * */
            Asset.find(query).exec(function(err, assets){ //first find all invalid entries. We'll let sails do the comparison
              if(!err){
                Asset.find((assets.length>0) ? {'!':assets} : {}).exec(function(err, cleanAssets){ //do the inverse of the previous search to get the clean assets
                  var cleanIds = _.map(cleanAssets, 'assetId');
                  cleanAssets.forEach(function(cleanAsset){
                    if(cleanAsset.manifest) cleanIds.push(cleanAsset.manifest);
                  });
                  remote = _.filter(remote, function(asset){ //now we only have malformed entries
                    return !_.contains(cleanIds, asset.Id); //return true if entry's Id is not in clean assets
                  });
                  remote.forEach(function(r){ console.log(r.toJSON()); });
                  if(remote.length>0){
                    issues.count = remote.length;
                    for(var i=0; i<issues.count; i++) { //go through all unindexed assets on azure
                      var discrepancy = {
                        asset: remote[i],
                        suggestions: utilService.suggestAssets(local, remote, req.param('leniency') || 120) //refer to services.utilService.suggestAssets
                      }
                      issues.discrepancies.push(discrepancy);
                    }
                    issues.invalidIndexes = assets;
                    return res.view('adminPages/indexlist', {issues: issues}); //return the faulty data to the admin view so they can try to fix it.
                  } else { //all good, no errors
                    return res.ok({
                      msg: 'All cool, son. No problems.',
                      data: {
                        azureAssets: remote,
                        remoteIds: remoteIds,
                      }
                    }); //inform the user that everything is fine
                  }
                });
              } else {
                return res.serverError({
                  error: err || 'Error performing diagnostic query.',
                  query: query
                });
              }
            })
          } else {
            return res.notFound('No assets found');
          }
        }
      });
    });
	},
  fixIssues: function(req, res) {
    //TODO: fix action.
    /*
    * This can get messy. We receive a bunch of JSON data from the admin when they press save. A clientside script has to
    * associate this data. Looping through each entry we have to perform a corresponding action. After that we do listIssues
    * again and if no errors were left we print a happy message. If there are still issues, return to listIndex view.
    * */
    return res.send(['TODO!', req.allParams()]);
  },
  upload: function(req, res) { //this just displays the view, nothing fancy
    return res.view('upload');
  },
  list: function(req, res) {
    /*
     @description	::	displays all assets the user can view according to request parameters
     @parameters		::	user - user id to list for
                        category - category id to list for
     @output				::	json array passed as data to the appropriate listing view
     */
    var params;
    if(req.param('user') || req.param('category')){
      params = {
        or: [
          {'author': req.param('user') || ''},
          {'category': req.param('category') || ''}
        ],
        sort: 'createdAt DESC'
      };
    } else { //TODO: make sure this is removed when deploying to production
      params = {
        sort: 'createdAt DESC'
      };
    }
    Asset.find(params).exec(function(err, assets){ //add .populateAll() between find and exec to populate associated records like, say, comments and such
      if(!err) {
        var user = {};
        user.id = req.session.user || 'GodOfMedia';
        user.categories = []; //TODO: Get user categories in here using ServiceController or something else;
        var verified = filterAssets.byUser(user, assets);
        verified = utilService.fillFullNames(verified);
        //Check thumbnail locators
        Azure.AMS.init(function(err){
          if(!err) {
            //NOTE: this function is a "best effort", it won't keep running until a satisfactory result is reached, it will just run one and try to fix the picture links
            Azure.AMS.checkThumbnails(verified, function(err, checked){
              if(!err){
                var thumbpairs = [];
                checked.forEach(function(a){
                  var obj = {};
                  obj.id = a.id;
                  obj.thumbnail = a.thumbnail;
                  thumbpairs.push(obj);
                });
                var oldThumbnails = _.map(assets, 'thumbnail');
                thumbpairs.forEach(function(pair){
                  if(!_.includes(oldThumbnails, pair.thumbnail)){ //if we got a new thumbnail url, update the index so we don't have to recreate it every time
                    Asset.update({id: pair.id}, {thumbnail: pair.thumbnail}).exec(function(err, updated){
                      if(!err && updated.length > 0)
                        sails.log.verbose('New thumbnails updated for '+updated[0].title);
                      else
                        sails.log.error(err);
                    });
                  } else {
                    sails.log.verbose('Asset index under '+pair.id+' already has up to date thumbnails');
                  }
                });
                var sorted = utilService.sortByProperty(checked, 'categoryFullName');
                if(req.xhr)
                  return res.json({videos: sorted});
                else
                  return res.view('homepage', {videos: sorted});
              } else {
                res.serverError(err);
              }
            });
          } else {
            sails.log.error(err);
            res.serverError();
          }
        });
      } else {
        return res.serverError(err);
      }
    });
  },
	play: function(req, res) {
		/*
		This makes a call to Azure Media Services when a particular item on the listing view is clicked.
		The user sends a request to the authorization server to view the item. A policy checks whether user's
		session has expired and if not, sends a request to Azure Media Services. Or at least that's the design.

		This function requires a session check. For embedding purposes we have to check if the user has an valid session
		and if they do, proceed with the same flow, but only return the media player, without the view. I am not yet sure
		how to do this.
		@inputs				::	assetID - id of the asset user wants to access
		@output				::	redirect to play view with URI from azure, or just responds with the player depending on whether it's embedded or not
		*/
		Asset.findOneByAssetId(req.param('assetId')).exec(function(err, foundAsset){
			if(!err && foundAsset){
				Azure.AMS.init(function(err){
					if(!err){
						var id = foundAsset.assetId;
            if(foundAsset.manifest) var mid = foundAsset.manifest;
            function deliver(err,path){
              if(!err){
                sails.log.verbose('Obtained deliverable URL: '+path);
                Asset.update({id: foundAsset.id}, {playbackUrl: path}).exec(function(err, updatedRecords){

                });
                var playersettings = { //let's send the player settings in case we want to save those in a db too.
                  "techOrder": ["azureHtml5JS", "html5", "flashSS", "silverlightSS"],
                  "nativeControlsForTouch": false
                };
                if(req.xhr){ //might want to differentiate between ajax and html request types
                  return res.json({url:path, settings: playersettings, media: foundAsset});
                } else {
                  return res.view("player",{url: path, settings: playersettings, media: foundAsset});
                }
              } else {
                sails.log.verbose('Could not get download URL');
                res.notFound('Error: '+err);
              }
            }
            (mid) ? Azure.AMS.media.getOriginURL(mid, deliver): //if we have encoded the asset, deliver the manifest
            Azure.AMS.media.getDownloadURL(id, deliver); //if not, try to deliver progressive download
					} else  {
						return res.serverError('Failed to initialize Azure Media Services api. Please refer to your imaginary user manual for solutions to this problem.');
					}
				});
			}	else {
				return res.notFound('Server error or no record found. Error code if exists: '+err);
			}
		});
	},
  download: function(req, res) {
    if(req.param('assetId')){
      Azure.AMS.init(function(err){
        if(!err){
          Azure.AMS.media.getDownloadURL(req.param('assetId'), 180, function(err, path){
            if(!err && path){
              return res.ok(path);
            } else {
              return res.serverError(err);
            }
          })
        } else {
          return res.serverError(err);
        }
      })
    } else {
      return res.serverError('No asset ID provided');
    }
  },
	save: function(req,res) {
		/*
		If the policy determines the person has editing rights, it will save the passed parameters to the
		currently edited asset.
		*/
		if(req.param('assetId')){
      Asset.findOneByAssetId(req.param('assetId')).exec(function(err, assetIndex){
        if(!err && assetIndex) {
          Azure.AMS.init(function(err){
            if(!err) {
              var data = {};
              var params = req.allParams();
              var index = {};
              _.each(params, function (value, field) { //map request parameters to model attributes
                if (value) {
                  switch (field) {
                    case 'title':
                      data.Name = value;
                      index.title = value;
                      break;
                    case 'category':
                      index.category = value;
                      break;
                    case 'privacy':
                      index.permisson = value;
                      break;
                    case 'description':
                      index.description = value;
                      break;
                  }
                }
              });
              Asset.update({assetId: req.param('assetId')}, index).exec(function(err, updatedIndex){
                if(!err){
                  if(updatedIndex.length>0){
                    //index updated successfully
                    sails.log.verbose('Asset metadata updated');
                    res.redirect('/');
                  } else {
                    sails.log.info('Could not find target to update');
                    res.send();
                  }
                } else {
                  sails.log.verbose('Failed to update index: '+err);
                  return res.serverError(err);
                }
              });
            } else {
              return res.serverError('Failed to initialize Azure Media Services api. Please refer to your imaginary user manual for solutions to this problem.');
            }
          });
        }
      });
		} else {
      return res.send("OI! WTF u editing there m8? Fokin' tell us!");
    }
	},
  delete: function(req, res) {
    if(req.param('assetId')){
      Asset.findOneByAssetId(req.param('assetId')).exec(function(err, asset){
        if(!err && asset){
          Azure.AMS.init(function(err){
            if(!err){
              async.parallel([
                function deleteIndexes(deletedIndex){
                  Asset.destroy(asset.id, deletedIndex);
                }.bind(this),
                function deleteAssets(deletedAssets){
                  if(asset.manifest){
                    async.parallel([
                      function deleteOriginalAsset(removedOriginalAsset){
                        sails.log.verbose('Removing original asset '+asset.title+' with ID '+asset.assetId);
                        Azure.AMS.rest.asset.get(asset.assetId, function(err, originalAsset){
                          if(!err && originalAsset){
                            Azure.AMS.rest.asset.delete(originalAsset.Id, function(err){
                              removedOriginalAsset(err, originalAsset);
                            });
                          } else {
                            sails.log.error('Could not find azure asset for '+asset.title);
                            removedOriginalAsset(err, originalAsset);
                          }
                        });
                      }.bind(this),
                      function cancelEncodingJobs(cancelledJobs){
                        Azure.AMS.rest.job.list(function(err, jobs){
                          if(!err && jobs.length>0){
                            //sails.log.verbose(results);
                            var jobsIfExists = _.filter(jobs, function(job){
                              return _.includes(job.InputMediaAssets, asset.assetId);
                            });
                            if(jobsIfExists.length>0){
                              async.each(jobsIfExists, function cancelJob(job, cb){
                                Azure.AMS.rest.job.cancel(job.toJSON().Id, function(err){
                                  if(!err){
                                    sails.log.info('Cancelled encoding job for deleted asset: '+asset.title);
                                  } else {
                                    sails.log.info('Could not cancel encoding job for deleted asset: '+asset.title);
                                    sails.log.error(err);
                                  }
                                  cb(err);
                                }, cancelledJobs(err));
                              });
                            } else {
                              sails.log.info('Encoding jobs not found for deleted asset: '+asset.title);
                              cancelledJobs(err);
                            }
                          }
                        });
                      }.bind(this)
                    ], function deleteEncodedAsset(err, results){
                      sails.log.verbose('Removing manifest for '+asset.title+' with ID '+asset.manifest);
                      Azure.AMS.rest.asset.get(asset.manifest, function(err, encodedAsset){
                        if(!err && encodedAsset){
                          Azure.AMS.rest.asset.delete(encodedAsset.Id, function(err){
                            results.push(encodedAsset);
                            deletedAssets(err, results);
                          });
                        } else {
                          sails.log.error('Could not find manifest asset for '+asset.title);
                          deletedAssets(err, results);
                        }
                      });
                    }.bind(this));
                  } else {
                    Azure.AMS.rest.asset.delete(asset.assetId, deletedAssets);
                  }
                }.bind(this)
              ], function removalComplete(err, results){ //results = [deletedIndex, [originalAsset, ]]
                if(!err){
                  res.redirect('/');
                } else {
                  sails.log.error('Error during removal of asset operation on '+asset.title+' Err: \n'+err);
                  return res.serverError('An error occurred during removal of the video');
                }
              }.bind(this));
            } else {
              sails.log.error(err || 'Failed to initialize Azure Media Services API.');
            }
          });
        } else {
          sails.log.info(err || 'Called delete on '+req.param('assetId')+', but failed, or the id did not match a single valid index entry.');
          res.serverError('Invalid input.'); //do not output any error to the user for this operation, just in case
        }
      });
    }
  },
  //this will re-encode the asset forcefully (even if it was encoded properly before).
  //since it's a separate action, we can put it behind a policy to only be used by admins
  reEncodeAsset: function(req, res) {
    if(req.param('assetId')) {
      Asset.findOneByAssetId(req.param('assetId')).exec(function(err, assetIndex){
        if(!err && assetIndex){
          Azure.AMS.init(function(err){
            if(err) res.serverError(err);
            if(assetIndex.manifest){
              Azure.AMS.rest.asset.delete(assetIndex.manifest, function(err){
                if(err) sails.log.error('Re-endocing asset '+assetIndex.title+', but failed to remove it\'s old encoded version!');
              });
            }
            Azure.AMS.rest.asset.get(assetIndex.assetId, function(err, asset){
              if(!err && asset) {
                var settings = {
                  assetIndex: assetIndex,
                  asset: asset
                };
                if (req.param('edit')) {
                  if ((start && end) && (startms < endms)) {
                    var customPreset = sails.config.encodingpreset; //load the static preset from config folder as basis for custom preset
                    customPreset["Sources"] = [
                      {
                        'StartTime': start,
                        'Duration': end
                      }
                    ];
                    settings.encodingPreset = customPreset;
                  } else {
                    sails.log.error('Edit parameters were passed but something went wrong during conversion!');
                    sails.log.error('Start was parsed to: ' + start);
                    sails.log.error('End was parsed to: ' + end);
                    sails.log.error('Passed parameters:');
                    sails.log.error(req.param('edit'));
                  }
                }
                Azure.AMS.encode(settings, function(err,job){
                  if(!err && job) {
                    if (!err && job) { //we need to record the status in the index to inform the user of the state
                      var meta = { //for that construct the meta json
                        encodingStatus: _.get(Azure.AMS.statemap, job.State), //interpret job state according to the map
                        job: job.toJSON()
                      };
                      Asset.update({assetId:req.param('assetId')}, {metadata: meta}).exec(function(err, updatedRecords){
                        if(!err && updatedRecords.length>0){
                          var fullNames = utilService.fillFullNames(updatedRecords[0]);
                          if(req.xhr){
                            return res.json(fullNames);
                          } else {
                            return res.redirect('asset/play?assetId='+fullNames.assetId);
                          }
                        } else {
                          sails.log.error(err || 'Update after job creation failed!');
                          return res.serverError(err || 'Update after job creation failed!');
                        }
                      });
                    } else {
                      sails.log.error(err || 'Unidentified error');
                      return res.serverError(err || 'An error has occurred while trying to encode your asset');
                    }
                  } else {
                    return res.serverError(err || 'Unrecognized error when creating encoding job.');
                  }
                });
              } else {
                return res.serverError(err || 'Unrecognized error when getting Azure asset');
              }
            });
          });
        } else {
          return res.serverError(err || 'Could not find the asset.');
        }
      });
    }
  },
  // development function again - this can be used in production (because the system can fix broken links)
  // if you start to see a lot of permission errors
  purgeAccessEntities: function(req, res){
    Azure.AMS.init(function (err) {
      Azure.AMS.rest.asset.list(function (err, assets) {
        async.each(assets, function (asset, cb) {
          Azure.AMS.rest.asset.listLocators(asset.Id, function (err, locators) {
            if (!err && locators.length > 0) {
              async.each(locators, function (locator, cb1) {
                Azure.AMS.rest.locator.delete(locator.Id, function(err){ cb1() });
              }, function locatorsForAssetDeleted(err) {
                if(err) sails.log.error(err);
                cb();
              });
            } else {
              if(err) sails.log.error(err);
              cb();
            }
          });
        }, function allLocatorsDeleted(err) {
          if (!err) {
            Azure.AMS.rest.accesspolicy.list(function (err, policies) {
              if (policies.length > 0) {
                async.each(policies, function (policy, cb2) {
                  policy = policy.toJSON();
                  Azure.AMS.rest.accesspolicy.delete(policy.Id, cb2);
                }, function allPoliciesDeleted(err) {
                  if (!err) {
                    res.send('Removed all access entities');
                  } else {
                    sails.log.error(err);
                    res.serverError('Error purging policies');
                  }
                });
              } else {
                res.send('Nothing to purge');
              }
            });
          } else {
            sails.log.error('Error purging locators: ' + err);
            res.serverError('Error purging locators');
          }
        });
      });
    });
  },
  removeOldJobs: function(req, res) {
    Azure.AMS.init(function(err){
      if(!err){
        Azure.AMS.purgeOldJobs(function(err, msg){
          if(!err && msg){
            res.send(msg);
          }
        }, req.param('until') || null);
      }
    })
  },
  fillLocalDatabase: function(req, res){
    // this is a development function. it creates indexes for all azure assets if some are missing.
    // it can be used in production, e.g. to clean up after a messy database migration
    Azure.AMS.init(function(err){
      if(!err){
        Azure.AMS.rest.asset.list(function(err, assets){
          if(assets.length>0){
            var remote = []; //remote ids
            var encoded = []; //encoded assets
            var local = []; //local ids
            var manifests = []; //local manifest ids
            assets.forEach(function(asset){
              asset = asset.toJSON();
              if(asset.Name.slice(0,17) == "JobOutputAsset(0)")
                encoded.push(asset)
              else
                remote.push(asset.Id)
            });
            Asset.find({}).exec(function(err,assetIndexes){
              if(assetIndexes.length>0){
                assetIndexes.forEach(function(index){
                  local.push(index.assetId);
                  if(index.manifest) manifests.push(index.manifest);
                });
              }
              var unindexed = _.difference(remote, local.concat(manifests)); //exclude locally registered assets from the list
              encoded = _.filter(encoded,function(e){ //exclude indexed manifests from the remote encoded list
                return !_.contains(manifests, e.Id);
              });
              if(unindexed.length>0){
                var unindexedAssets = _.filter(assets, function(asset){ //get the full asset objects in here
                  if(_.includes(unindexed, asset.Id)){ //
                    encoded.forEach(function(easset){
                      var rawname = easset.Name.substr(30);
                      if(asset.Name == rawname) //if names match, means it's an encoded version, link the two
                        asset.manifest = easset.Id;
                    });
                    return true;
                  } else {
                    return false;
                  }
                });
                async.each(unindexedAssets, function(asset, cb){ //parallel fill the database
                  Asset.create({
                    title: asset.Name,
                    permission: 2,
                    assetId: asset.Id,
                    registered: (asset.manifest)? true : false,
                    manifest: (asset.manifest)? asset.manifest : null,
                    metadata: {
                      encodingStatus: (asset.manifest)? 'Finished' : 'Not initialized'
                    }
                  }).exec(function(err, created){
                    if(!err && created){
                      sails.log.info('Filled index for '+asset.Name);
                      if(created.manifest)
                        sails.log.info('Manifest also detected for '+asset.Name);
                      cb();
                    }
                  });
                }, function(err){
                  if(!err)
                    res.send('Filled local database with media services assets')
                  else
                    res.send('Error occurred during fill operation: '+err);
                });
              } else {
                res.send('Everything is indexed.');
              }
            });
          } else {
            res.send('No assets on the azure service');
          }
        })
      }
    })
  },
  removeNullIndexes : function(req, res){
    Azure.AMS.init(function(err){
      if(!err) {
        Azure.AMS.rest.asset.list(function(err, assets){
          if(!err && assets.length>0) {
            Asset.destroy({assetId: {'!': _.map(assets, 'Id')}}).exec(function (err, destroyed) {
              if (!err && destroyed.length > 0)
                res.send('Purge complete. Removed ' + assets.length + ' null indexes');
              else
                res.send(err || 'No assets to remove');
            });
          }
        });
      } else {
        return res.serverError('Failed to initialize Azure Media Services api. Please refer to your imaginary user manual for solutions to this problem.');
      }
    });
  },
  test: function (req, res) { //don't mind this, just for testing
    //var start = moment.duration(req.param('startsAt'), 'seconds').format('hh:mm:ss', {trim: false});
    res.send(JSON.stringify(sails.config.encodingpreset));
    /*Azure.AMS.init(function(err){
      Azure.AMS.media.generateMetadata('nb:cid:UUID:d244b03a-0d00-80c4-d06f-f1e58bf05adc', function(err){
        if(!err){
          sails.log.info('Done');
          res.ok('Generated');
        } else {
          sails.log.error(err);
          res.serverError();
        }
      })
    })*/
    /*Azure.BlobService.startCopyBlob(
      'https://mediasvchfhm05lprhss5.blob.core.windows.net/asset-d244b03a-0d00-80c4-d06f-f1e58bf05adc/Smite',
      'asset-d244b03a-0d00-80c4-d06f-f1e58bf05adc',
      'Smite.mp4', function(err){
      if(!err){
        sails.log.info('Copied');
        res.ok('Done.');
      }
    });*/
  }
};
