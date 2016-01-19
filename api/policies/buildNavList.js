/**
 * Created by HauskaNimi on 27.11.2015.
 */
//Builds a sorted list of assets the user
module.exports = function(req, res, next){
  if(true){ //TODO req.session.user=GodOfMedia and so on
    Asset.find({author: 'GodOfMedia', sort: 'createdAt DESC'}).exec(function(err, assets){
      if(!err && assets.length>0){
        sails.log.verbose('Building navlist');
        var fullNames = utilService.fillFullNames(assets);
        req.options.locals = req.options.locals || {};
        req.options.locals.navlist = fullNames;
      }
      next();
    });
  }
}
