String.prototype.matchPos = function(str, start, end) { //this will check if characters in a string between start and end are qual to str
  //for example 'Peruna'.matchPos('Pe', 0, 2) will return true
  //'Peruna'.matchPos('na', -2) will also return true.
  return this.slice(start, end) == str;
}
Date.prototype.addHours= function(h){
  this.setHours(this.getHours()+h);
  return this;
}
Date.prototype.addMinutes= function(m){
  this.setMinutes(this.getMinutes()+m);
  return this;
}
var ServiceController = require("../controllers/ServiceController");
module.exports = {
  suggestAssets: function(localAssets, remoteAsset, score){
    /*we can suggest based on mainly 2 parameters - date and title, since author information isn't recorded on azure.
     first we look at dates of creation. We'll use a 'leniency score' that the user can adjust to narrow down the suggestions -
     the higher the score, the more loose the suggestions. That's a lot of 'the's. But anyway 1 minute further from the remote entry
     registration timestamp will add 1 score. 1 word match will remove 60 score. 2 word matches will remove 33% of the score.
     3 will remove 66%. More or an exact match will set the score to 0. If timestamp score exceeds a month, words won't affect it.
     Big date discrepancies will have to be recreated on at least one of the ends or deleted on both. If an asset update timestamp matches
     the a local asset update timestamp within 30 seconds, 33% of score points are removed.
     */
    _.each(localAssets, function(asset){
      asset.score = score; //by default all assets will have the maximum score
      if(asset.createdAt == remoteAsset.Created){ //if asset dates are an exact match (should never be the case due to network delay), consider them matched
        asset.score = 0;
      } else {
        asset.score = Math.abs((asset.createdAt - remoteAsset.Created)/60000); //get difference in milliseconds between dates and convert to minutes
      }
      if((asset.updatedAt - remoteAsset.LastModified) <= 30000){ //if update times match closely
        asset.score = asset.score*0.66; //remove a third from the score
      }
      if (asset.score < 43200) { //if the base time score is less than a month
        // split names and titles into keywords (i.e. tags) and convert to lowercase
        var keywords = _.words(remoteAsset.Name).forEach(function (word) {
          word.toLowerCase()
        });
        var assetKeywords = _.words(asset.title).forEach(function (word) {
          word.toLowerCase()
        });
        // see if there are any matches
        var matches = _.intersection(keywords, assetKeywords);
        if (matches.length > 0) { //if found some
          if (matches.length > 3) { //if more than 3 matches
            asset.score = 0; //consider this an accurate suggestion
          } else { //otherwise modify the score according to spec
            switch (matches.length) {
              case 1:
                asset.score = asset.score - 60;
                break;
              case 2:
                asset.score = asset.score*0.66;
                break;
              case 3:
                asset.score = asset.score*0.33;
                break;
            }
          }
        }
      } else { //if time score is longer than a month, don't allow it.
        asset.score = score+1; //just set it above the permitted
      }
    });
    var suggestions = _.filter(localAssets, function(asset){return asset.score < score;}); //filter those below the maximum score
    return suggestions; //be smart
  },
  fillFullNames: function(assets) {
    if(assets.length > 0){ //if we have several to work with
      _.forEach(assets, function(video){
        video.authorFullName = ServiceController.getUserFullName(video.author);
        video.categoryFullName = ServiceController.getCourseInfo(video.category);
      });
    } else { //only 1 asset passed
      var video = assets;
      video.authorFullName = ServiceController.getUserFullName(video.author);
      video.categoryFullName = ServiceController.getCourseInfo(video.category);
      assets = video;
    }
    return assets;
  },
  sortByProperty: function(collection, propName){
    var sorted = _.groupBy(collection, propName);
    return sorted;
  },
  sendEmail: function(email) {

  }
}
