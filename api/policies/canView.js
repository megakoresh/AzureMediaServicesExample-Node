module.exports = function(req, res, next) {
  if(req.param('contentID')) {
    Asset.findOneById(req.param('contentID')).exec(function(err, asset){
      if(err) {
        console.log("Server error "+err+" when trying to execute canView policy on asset with id "+ req.param('contentID'));
        return res.serverError("Could not verify your eligibility to view this content");
      }
      if(asset) {
        switch(asset.permission) {
          case 0:
            next();
            break;
          case 1:
            User.findOneById(req.session.user.id).populate('courses').exec(function(err, user){
              if(!err){
                if(_.includes(user.courses, asset.category) || user.admin) { //user is in the course to which the asset was posted
                  next();
                } else {
                  return res.forbidden();
                }
              } else {
                console.log("Error finding the logged in user");
                return res.serverError();
              }
            });
            break;
          case 2:
            User.findOneById(req.session.user.id).populate('courses').exec(function(err, user){
              if(!err){
                if(user.id == asset.author || user.admin) {
                  next();
                } else {
                  return res.forbidden();
                }
              } else {
                console.log("Error finding the logged in user");
                return res.serverError();
              }
            });
            break;
        }
      }
    });
    console.log("canView policy finished with no result");
    return res.send("<script>alert('Could not verify eligibility');</script>");
  }
}
